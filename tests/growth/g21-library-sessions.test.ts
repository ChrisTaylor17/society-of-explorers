import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { LIBRARY_SESSIONS, COMPANIONS } from '../../lib/library/sessions';
import { findQuotes, normalizeForMatch, selectSessionBlocks, trimToSentence } from '../../lib/library/text';

function texts(bookId: string, editionId: string): (string | null)[] {
  const data = JSON.parse(readFileSync(`content/great-books/${bookId}/passages.json`, 'utf8'));
  expect(data.editionId).toBe(editionId);
  return data.blocks.map((block: { text: string | null }) => block.text);
}

test('G21 every Library session points at real text in its reviewed edition', () => {
  for (const session of LIBRARY_SESSIONS) {
    expect(COMPANIONS[session.companion]).toBeTruthy();
    const all = texts(session.bookId, session.editionId);
    const blocks = selectSessionBlocks(session, all);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.map(block => block.n)).toEqual(blocks.map((_, i) => i + 1));
    expect(blocks.some(block => /PROJECT GUTENBERG/i.test(block.text))).toBe(false);
    for (const part of session.parts) {
      const inPart = blocks.filter(block => block.index >= part.from && block.index <= part.to);
      expect(inPart.length).toBe(part.to - part.from + 1);
      const found = inPart.some(block => normalizeForMatch(block.text).includes(normalizeForMatch(part.quote)));
      if (!found) throw new Error(`${session.slug}: quote not in its part: ${part.quote}`);
    }
  }
});

test('G21 quotes in a reply link only to paragraphs that really contain them', () => {
  const session = LIBRARY_SESSIONS.find(item => item.slug === 'republic-book-1')!;
  const blocks = selectSessionBlocks(session, texts(session.bookId, session.editionId));
  const quotes = findQuotes('He says “justice is nothing else than the interest of the stronger.” Not “justice is a banana”.', blocks);
  expect(quotes[0].n).not.toBeNull();
  expect(quotes[1].n).toBeNull();
});

test('G21 a cut-off reply ends on its last full sentence', () => {
  expect(trimToSentence('I mean this. And I would ask whether you')).toBe('I mean this.');
});

test('G21 the margin route requires a signed-in member and rate-limits model calls', () => {
  const src = readFileSync('app/api/library/ask/route.ts', 'utf8');
  expect(src).toContain('getAuthenticatedMember(req)');
  expect(src).toContain("limitModelCall(req, auth.memberId, 'library')");
  expect(src.indexOf('getAuthenticatedMember(req)')).toBeLessThan(src.indexOf('messages.create'));
});
