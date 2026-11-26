import { NextRequest } from 'next/server';
import type Anthropic from '@anthropic-ai/sdk';
import { createAnthropicClient, isAIGatewayEnabled, logClaudeUsage } from '@/lib/ai/anthropic';
import { privateJson } from '@/lib/http/routeError';
import { limitModelCall } from '@/lib/rateLimit';
import { MIRA_TUTOR_PROMPT } from '@/lib/claude/miraTutor';
import { capKeepingQuestion } from '@/lib/salon/guideReply';
import { fixLastWord, roomIsStopped, WAITING_FOR_CHRIS } from '@/lib/salon/miraHold';
import { getLibrarySession } from '@/lib/library/sessions';
import { findQuotes, trimToSentence } from '@/lib/library/text';
import { loadSessionBlocks } from '@/lib/library/text-server';

export const runtime = 'nodejs';

// Mira Vale, the AI tutor who runs the Dec 3 salon on Republic, Book I.
// The host page sends the evening so far as alternating turns: what Chris typed
// ("[room] ..." notes and "Name: what they said"), then Mira's earlier replies.
type Turn = { role: 'user' | 'assistant'; content: string };

// A 90-minute evening is about 50 exchanges (welcome, three rounds, breaks,
// wraps, close). The page drops the oldest pairs past this; [room] resume
// exists for a lost evening.
const MAX_TURNS = 161;
const MAX_CHARS = 2000;
// The screen shows three sentences. Mira's replies are built as two, so a cut
// can only remove a stray third; the closing question is always kept.
const SENTENCE_LIMIT = 3;

function readTurns(value: unknown): Turn[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_TURNS) return null;
  const turns: Turn[] = [];
  for (const [i, item] of value.entries()) {
    if (!item || typeof item !== 'object') return null;
    const { role, content } = item as { role?: unknown; content?: unknown };
    const expected = i % 2 === 0 ? 'user' : 'assistant';
    if (role !== expected || typeof content !== 'string') return null;
    const text = content.trim();
    if (!text || text.length > MAX_CHARS) return null;
    turns.push({ role: expected, content: text });
  }
  return turns[turns.length - 1].role === 'user' ? turns : null;
}

export async function POST(req: NextRequest) {
  try {
    let body: { turns?: unknown };
    try { body = await req.json(); } catch { return privateJson({ error: 'Invalid JSON body' }, { status: 400 }); }
    const turns = readTurns(body?.turns);
    if (!turns) return privateJson({ error: 'Invalid request' }, { status: 400 });

    // While the room is stopped for a guest in trouble, only a [room] note from
    // Chris restarts it: no model call, and no rate limit to trip over.
    if (roomIsStopped(turns)) return privateJson({ reply: WAITING_FOR_CHRIS, quotes: [], capped: false, held: true });

    const limited = limitModelCall(req, null, 'salon-mira');
    if (limited) return privateJson({ error: 'Too many requests, please slow down' }, { status: 429, headers: { 'Retry-After': limited.headers.get('Retry-After') || '1' } });

    const model = process.env.SALON_MIRA_MODEL || process.env.SALON_GUIDE_MODEL || (isAIGatewayEnabled() ? 'anthropic/claude-sonnet-5.5' : 'claude-sonnet-5-5');
    const started = Date.now();
    // Thinking counts against max_tokens, and on the Socrates route it used up
    // the budget: 18 of 19 test replies came back empty. Thinking stays off for
    // a short spoken turn (Sonnet 5.5 refuses `disabled`; `between_tools` at the
    // default effort is its off switch). The longest reply is about 60 words,
    // well under 320 tokens; the higher ceiling is only headroom so that a model
    // which thinks anyway still has room to write.
    const thinkingOff = /sonnet-5/.test(model) ? { thinking: { type: 'between_tools' } } : /haiku-5/.test(model) ? { thinking: { type: 'disabled' } } : {};
    const client = createAnthropicClient();
    const params = { model, max_tokens: 1024, system: MIRA_TUTOR_PROMPT, messages: turns, ...thinkingOff };
    const message = (await client.messages.create(params as Parameters<typeof client.messages.create>[0])) as Anthropic.Message;
    logClaudeUsage({ purpose: 'content', model, operation: 'salon-republic-1-mira', latencyMs: Date.now() - started, usage: message.usage });

    const blocks = message.content.map(part => part.type);
    if (message.stop_reason === 'refusal') return privateJson({ error: 'Mira did not answer (the model refused).', stop: 'refusal', blocks, model }, { status: 502 });
    const raw = message.content.map(part => (part.type === 'text' ? part.text : '')).join('').trim();
    const cap = capKeepingQuestion(message.stop_reason === 'max_tokens' ? trimToSentence(raw) : raw, SENTENCE_LIMIT);
    // No name rewrite on this route, ever: Mira names Socrates and Thrasymachus
    // in nearly every reply and labels voices with their names, so turning a
    // name into "I" would make her claim to be them.
    const reply = fixLastWord(cap.text.trim());
    // An empty reply says why, so the host page shows an error instead of a blank
    // and testing can tell a used-up budget from a blank answer.
    if (!reply) return privateJson({ error: `Mira did not answer (${message.stop_reason === 'max_tokens' ? 'she ran out of room' : 'the reply was empty'}).`, stop: message.stop_reason, blocks, model }, { status: 502 });

    // Every quotation is checked against the Book I text the site serves; a
    // quote with no match comes back with n: null.
    const session = getLibrarySession('republic-book-1');
    const quotes = session ? findQuotes(reply, await loadSessionBlocks(session)) : [];
    return privateJson({ reply, quotes, capped: cap.capped, raw: cap.capped ? raw : undefined, model });
  } catch {
    return privateJson({ error: 'Mira is unavailable right now.' }, { status: 503 });
  }
}
