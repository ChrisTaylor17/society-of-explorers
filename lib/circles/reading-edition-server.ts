import { createHash } from 'node:crypto';
import { EditionUnavailable, readBookEdition } from '@/lib/books/editions';
import { getScriptureStudy } from '@/lib/root-kernel/scripture-studies';
import type { CircleReadingEditionResponse } from './reading-program';

export async function readCircleReadingEdition(bookId: string): Promise<CircleReadingEditionResponse | null> {
  const scripture = getScriptureStudy(bookId);
  if (!scripture) return readBookEdition(bookId);
  const sourceSha256 = createHash('sha256').update(JSON.stringify(scripture.source)).digest('hex');
  if (sourceSha256 !== scripture.metadata.sourceSha256) throw new EditionUnavailable();
  return scripture.metadata;
}
