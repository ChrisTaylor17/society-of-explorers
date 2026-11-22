import { NextRequest } from 'next/server';
import { createAnthropicClient, logClaudeUsage, resolveClaudeModel } from '@/lib/ai/anthropic';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { limitModelCall } from '@/lib/rateLimit';
import { rewriteSelfReference, stripLeadingDisclaimer } from '@/lib/claude/guideTextStream';
import { COMPANIONS, COMPANION_IDS, getLibrarySession, type CompanionId, type LibrarySession } from '@/lib/library/sessions';
import { findQuotes, normalizeForMatch, trimToSentence, type SessionBlock } from '@/lib/library/text';
import { loadSessionBlocks } from '@/lib/library/text-server';

export const runtime = 'nodejs';

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);
const label = (block: SessionBlock, max: number) => `[¶${block.n}] ${clip(block.text, max)}`;

function voiceRules(session: LibrarySession, thinker: CompanionId) {
  const { name, voice } = COMPANIONS[thinker];
  return `You are the AI voice of ${name} in the Society of Explorers reading room. You are drawn from the text, not the real person. Speak in the first person; your manner is ${voice}.
The member is reading ${session.author}, ${session.work}, in the public-domain ${session.translator} translation.
Rules:
- At most 3 sentences and under 90 words, in plain modern English.
- Quote a few exact words from the passage in double quotes and build your point on them. Copy them exactly; never invent a quotation.
- If the text does not answer the question, say plainly that the text doesn't say, then offer what it does show.
- No lists, headings, greetings or disclaimers. Do not refer to yourself by name. Never judge the member's beliefs; you may question their reasoning.`;
}

type Body = { session?: unknown; mode?: unknown; thinker?: unknown; block?: unknown; excerpt?: unknown; question?: unknown; part?: unknown; answer?: unknown };

export async function POST(req: NextRequest) {
  try {
    let body: Body;
    try { body = await req.json(); } catch { return privateJson({ error: 'Invalid JSON body' }, { status: 400 }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return privateJson({ error: 'Invalid request' }, { status: 400 });
    const session = typeof body.session === 'string' ? getLibrarySession(body.session) : null;
    if (!session) return privateJson({ error: 'Reading not found' }, { status: 404 });
    const mode = body.mode === 'guide' ? 'guide' : body.mode === 'margin' ? 'margin' : null;
    const thinker = (typeof body.thinker === 'string' && (COMPANION_IDS as string[]).includes(body.thinker) ? body.thinker : session.companion) as CompanionId;
    if (!mode) return privateJson({ error: 'Invalid request' }, { status: 400 });

    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Sign in to ask' }, { status: 401 });

    const blocks = await loadSessionBlocks(session);
    let system: string, user: string, context: SessionBlock[];

    if (mode === 'margin') {
      const n = Number(body.block);
      const position = blocks.findIndex(block => block.n === n);
      const question = typeof body.question === 'string' ? body.question.trim() : '';
      if (position < 0 || question.length > 500) return privateJson({ error: 'Invalid request' }, { status: 400 });
      const chosen = blocks[position];
      // Only words that really are in the chosen paragraph may narrow it.
      let excerpt = typeof body.excerpt === 'string' ? body.excerpt.trim() : '';
      if (excerpt.length > 700 || (excerpt && !normalizeForMatch(chosen.text).includes(normalizeForMatch(excerpt)))) excerpt = '';
      context = blocks.slice(Math.max(0, position - 3), Math.min(blocks.length, position + 3));
      system = voiceRules(session, thinker);
      user = `Nearby text, for context:\n${context.filter(block => block !== chosen).map(block => label(block, 1200)).join('\n')}\n\nThe paragraph the member is reading:\n${label(chosen, 4000)}\n${excerpt ? `\nThe words they marked: "${excerpt}"\n` : ''}\n${question ? `Their question: ${question}` : 'They did not type a question. Tell them the one thing in this paragraph most worth noticing, and why.'}`;
    } else {
      const index = Number(body.part);
      const part = Number.isInteger(index) ? session.parts[index] : undefined;
      const answer = typeof body.answer === 'string' ? body.answer.trim() : '';
      if (!part || !answer || answer.length > 1500) return privateJson({ error: 'Invalid request' }, { status: 400 });
      const inPart = blocks.filter(block => block.index >= part.from && block.index <= part.to);
      const hit = inPart.findIndex(block => normalizeForMatch(block.text).includes(normalizeForMatch(part.quote)));
      const center = hit < 0 ? 0 : hit;
      context = inPart.slice(Math.max(0, center - 2), center + 3);
      system = `${voiceRules(session, thinker)}
You are guiding a member who is preparing for a salon on this reading. Reply in exactly two sentences: first, name the strongest point or the hidden assumption in their answer, tied to a few quoted words from the passage; second, ask one follow-up question that tests their reasoning. Do not tell them whether they are right.`;
      user = `The passage:\n${context.map(block => label(block, 1500)).join('\n')}\n\nThe salon question: ${part.question}\n\nThe member's answer: ${answer}`;
    }

    const limited = limitModelCall(req, auth.memberId, 'library');
    if (limited) return privateJson({ error: 'Too many requests, please slow down' }, { status: 429, headers: { 'Retry-After': limited.headers.get('Retry-After') || '1' } });

    const model = resolveClaudeModel('content');
    const started = Date.now();
    const message = await createAnthropicClient().messages.create({ model, max_tokens: 320, system, messages: [{ role: 'user', content: user }] });
    logClaudeUsage({ purpose: 'content', model, operation: `library-${mode}`, latencyMs: Date.now() - started, usage: message.usage });
    let reply = message.content.map(part => (part.type === 'text' ? part.text : '')).join('').trim();
    if (message.stop_reason === 'max_tokens') reply = trimToSentence(reply);
    reply = stripLeadingDisclaimer(rewriteSelfReference(reply, thinker)).trim();
    if (!reply) return privateJson({ error: 'No reply' }, { status: 502 });
    return privateJson({ reply, thinker, quotes: findQuotes(reply, blocks) });
  } catch {
    return privateJson({ error: 'The reading companion is unavailable' }, { status: 503 });
  }
}
