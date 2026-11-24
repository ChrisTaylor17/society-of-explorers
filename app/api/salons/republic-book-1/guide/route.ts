import { NextRequest } from 'next/server';
import type Anthropic from '@anthropic-ai/sdk';
import { createAnthropicClient, isAIGatewayEnabled, logClaudeUsage } from '@/lib/ai/anthropic';
import { privateJson } from '@/lib/http/routeError';
import { limitModelCall } from '@/lib/rateLimit';
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

// Split into sentences: an end mark (with any closing quote or bracket) then space.
function sentences(text: string): string[] {
  return text.match(/[^.!?]+(?:[.!?]+["'\u201d\u2019)\]]*)(?=\s|$)|[^.!?]+$/g)?.map(s => s.trim()).filter(Boolean) ?? [];
}

// Keep at most `limit` sentences, but never drop the closing question: Socrates
// ends each turn by asking the room something, and that is the point of the turn.
function capKeepingQuestion(text: string, limit: number): { text: string; capped: boolean } {
  const parts = sentences(text);
  if (parts.length <= limit) return { text: text.trim(), capped: false };
  const last = parts[parts.length - 1];
  const kept = last.endsWith('?') || /\?["'\u201d\u2019)\]]*$/.test(last)
    ? [...parts.slice(0, limit - 1), last]
    : parts.slice(0, limit);
  return { text: kept.join(' '), capped: true };
}

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

    const limited = limitModelCall(req, null, 'salon-guide');
    if (limited) return privateJson({ error: 'Too many requests, please slow down' }, { status: 429, headers: { 'Retry-After': limited.headers.get('Retry-After') || '1' } });

    // The small default model ran past three sentences in 11 of 26 test replies,
    // so the cap cut off the closing question. This one evening uses a larger model.
    const model = process.env.SALON_GUIDE_MODEL || (isAIGatewayEnabled() ? 'anthropic/claude-sonnet-5.5' : 'claude-sonnet-5-5');
    const started = Date.now();
    // Sonnet 5.5 thinks by default and that thinking counts against max_tokens:
    // with a 320 cap, 18 of 19 test replies came back empty. Thinking stays off
    // for a short spoken turn (Sonnet 5.5 refuses `disabled`; `between_tools`
    // is its off switch), and the cap leaves room in case a model thinks anyway.
    const thinkingOff = /sonnet-5/.test(model) ? { thinking: { type: 'between_tools' } } : /haiku-5/.test(model) ? { thinking: { type: 'disabled' } } : {};
    const client = createAnthropicClient();
    const params = { model, max_tokens: 1024, system: SOCRATES_BOOK1_PROMPT, messages: turns, ...thinkingOff };
    const message = (await client.messages.create(params as Parameters<typeof client.messages.create>[0])) as Anthropic.Message;
    logClaudeUsage({ purpose: 'content', model, operation: 'salon-republic-1-guide', latencyMs: Date.now() - started, usage: message.usage });

    const raw = message.content.map(part => (part.type === 'text' ? part.text : '')).join('').trim();
    if (message.stop_reason === 'refusal') return privateJson({ error: 'No reply', stop: 'refusal', model }, { status: 502 });
    let reply = message.stop_reason === 'max_tokens' ? trimToSentence(raw) : raw;
    const cap = capKeepingQuestion(reply, SENTENCE_LIMIT);
    const capped = cap.capped;
    // No self-name rewrite here: the prompt already speaks in the first person,
    // and the rewrite turned "as Socrates says he knows nothing" into "as I say
    // he knows nothing" in testing.
    reply = cap.text.trim();
    // Say why a reply is empty, so the host page (and testing) can tell a
    // used-up token budget from a blank answer.
    if (!reply) return privateJson({ error: 'No reply', stop: message.stop_reason, blocks: message.content.map(p => p.type), model }, { status: 502 });

    // Every quotation is checked against the Book I text the site serves; a
    // quote with no match comes back with n: null so the host can catch it.
    const session = getLibrarySession('republic-book-1');
    const quotes = session ? findQuotes(reply, await loadSessionBlocks(session)) : [];
    return privateJson({ reply, quotes, capped, raw: capped ? raw : undefined, model });
  } catch {
    return privateJson({ error: 'The guide is unavailable' }, { status: 503 });
  }
}
