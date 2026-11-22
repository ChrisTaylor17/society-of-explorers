// Pure helpers shared by the Library pages, the margin route and its tests.
import type { LibrarySession } from './sessions';

export type SessionBlock = { index: number; n: number; text: string };

/** Lowercases and folds quotes, dashes and spacing so a quote can be matched to the source. */
export function normalizeForMatch(text: string): string {
  return text.toLowerCase()
    .replace(/[‘’ʼ`]/g, "'").replace(/[“”«»]/g, '"').replace(/[–—―]/g, '-')
    .replace(/\s+/g, ' ').trim();
}

/** Picks the session's blocks, in order, numbered 1..N as paragraph numbers. */
export function selectSessionBlocks(session: LibrarySession, texts: (string | null)[]): SessionBlock[] {
  const out: SessionBlock[] = [];
  for (const range of session.ranges) {
    for (let index = range.from; index <= range.to; index++) {
      const text = texts[index];
      if (typeof text !== 'string') throw new Error(`Missing block ${index} for ${session.slug}`);
      out.push({ index, n: out.length + 1, text: text.trim() });
    }
  }
  return out;
}

/** Quoted words in a reply, each tied to the paragraph it came from when it is really there. */
export function findQuotes(reply: string, blocks: SessionBlock[]): { text: string; n: number | null }[] {
  const found: { text: string; n: number | null }[] = [];
  const pattern = /[“"]([^“”"]{4,240})[”"]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(reply)) && found.length < 4) {
    const quote = match[1].trim().replace(/[.,;:!?]+$/, '');
    const needle = normalizeForMatch(quote);
    if (needle.length < 4) continue;
    const hit = blocks.find(block => normalizeForMatch(block.text).includes(needle));
    found.push({ text: quote, n: hit ? hit.n : null });
  }
  return found;
}

/** Ends a reply on its last complete sentence (used when the model ran out of room). */
export function trimToSentence(text: string): string {
  const trimmed = text.trim();
  const last = Math.max(...['.', '?', '!'].map(mark => trimmed.lastIndexOf(mark)));
  if (last < 0) return trimmed;
  let end = last + 1;
  while (end < trimmed.length && /["”’')\]]/.test(trimmed[end])) end++;
  return trimmed.slice(0, end);
}
