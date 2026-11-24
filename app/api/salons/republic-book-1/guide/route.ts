import { NextRequest } from 'next/server';
import { createAnthropicClient, logClaudeUsage, resolveClaudeModel } from '@/lib/ai/anthropic';
import { privateJson } from '@/lib/http/routeError';
import { limitModelCall } from '@/lib/rateLimit';
import { createSentenceCap, rewriteSelfReference } from '@/lib/claude/guideTextStream';
import { SOCRATES_BOOK1_PROMPT } from '@/lib/claude/socratesBook1';
import { getLibrarySession } from '@/lib/library/sessions';
import { findQuotes, trimToSentence } from '@/lib/library/text';
import { loadSessionBlocks } from '@/lib/library/text-server';

export const runtime = 'nodejs';

// The AI Socrates for the Dec 3 salon on Republic, Book I.
// The host sends the evening so far as alternating turns: what was typed in
// (host lines and "Name: what they said"), then the guide's earlier replies.
type Turn = { role: 'user' | 'assistant'; content: string };

const MAX_TURNS = 60;
const MAX_CHARS = 2000;
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

// The app turns a guide's talk about itself in the third person into "I".
// Quotations are left exactly as written, so a line from the book that names
// Socrates is never changed.
function rewriteOutsideQuotes(text: string): string {
  return text
    .split(/([“"][^“”"]*[”"])/)
    .map((part, i) => (i % 2 === 1 ? part : rewriteSelfReference(part, 'socrates')))
    .join('');
}

export async function POST(req: NextRequest) {
  try {
    let body: { turns?: unknown };
    try { body = await req.json(); } catch { return privateJson({ error: 'Invalid JSON body' }, { status: 400 }); }
    const turns = readTurns(body?.turns);
    if (!turns) return privateJson({ error: 'Invalid request' }, { status: 400 });

    const limited = limitModelCall(req, null, 'salon-guide');
    if (limited) return privateJson({ error: 'Too many requests, please slow down' }, { status: 429, headers: { 'Retry-After': limited.headers.get('Retry-After') || '1' } });

    const model = resolveClaudeModel('content');
    const started = Date.now();
    const message = await createAnthropicClient().messages.create({ model, max_tokens: 320, system: SOCRATES_BOOK1_PROMPT, messages: turns });
    logClaudeUsage({ purpose: 'content', model, operation: 'salon-republic-1-guide', latencyMs: Date.now() - started, usage: message.usage });

    const raw = message.content.map(part => (part.type === 'text' ? part.text : '')).join('').trim();
    let reply = message.stop_reason === 'max_tokens' ? trimToSentence(raw) : raw;
    const cap = createSentenceCap(SENTENCE_LIMIT);
    cap.push(reply);
    const capped = cap.done;
    reply = rewriteOutsideQuotes(cap.text.trim());
    if (!reply) return privateJson({ error: 'No reply' }, { status: 502 });

    // Every quotation is checked against the Book I text the site serves; a
    // quote with no match comes back with n: null so the host can catch it.
    const session = getLibrarySession('republic-book-1');
    const quotes = session ? findQuotes(reply, await loadSessionBlocks(session)) : [];
    return privateJson({ reply, quotes, capped, raw: capped ? raw : undefined, model });
  } catch {
    return privateJson({ error: 'The guide is unavailable' }, { status: 503 });
  }
}
