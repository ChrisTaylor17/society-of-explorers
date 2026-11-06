import { createHash } from 'node:crypto';
import { EditionUnavailable, readBookEdition } from '@/lib/books/editions';
import { philemonEdition, PHILEMON_EDITION_METADATA, PHILEMON_READING, PHILEMON_SOURCE_SHA256 } from '@/lib/root-kernel/philemon-edition';
import type { CircleReadingEditionResponse } from './reading-program';

export async function readCircleReadingEdition(bookId: string): Promise<CircleReadingEditionResponse | null> {
  if (bookId !== PHILEMON_READING.bookId) return readBookEdition(bookId);
  const sourceSha256 = createHash('sha256').update(JSON.stringify(philemonEdition)).digest('hex');
  if (sourceSha256 !== PHILEMON_SOURCE_SHA256) throw new EditionUnavailable();
  return PHILEMON_EDITION_METADATA;
}
