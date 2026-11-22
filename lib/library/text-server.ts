import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { LibrarySession } from './sessions';
import { selectSessionBlocks, type SessionBlock } from './text';

const cache = new Map<string, Promise<(string | null)[]>>();

async function readEditionTexts(bookId: string, editionId: string): Promise<(string | null)[]> {
  if (!/^[a-z0-9-]{1,80}$/.test(bookId)) throw new Error('Invalid book');
  const file = path.resolve(process.cwd(), 'content', 'great-books', bookId, 'passages.json');
  const value: unknown = JSON.parse(await readFile(file, 'utf8'));
  const data = value as { editionId?: unknown; blocks?: unknown };
  if (data.editionId !== editionId || !Array.isArray(data.blocks)) throw new Error('Edition mismatch');
  return data.blocks.map(block => (block && typeof block === 'object' && typeof (block as { text?: unknown }).text === 'string') ? (block as { text: string }).text : null);
}

/** The session's paragraphs from the reviewed local edition, read once per server. */
export async function loadSessionBlocks(session: LibrarySession): Promise<SessionBlock[]> {
  const key = `${session.bookId}:${session.editionId}`;
  let texts = cache.get(key);
  if (!texts) { texts = readEditionTexts(session.bookId, session.editionId); cache.set(key, texts); texts.catch(() => cache.delete(key)); }
  return selectSessionBlocks(session, await texts);
}
