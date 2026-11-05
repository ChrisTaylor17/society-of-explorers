import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { EditionMismatch, EditionUnavailable, readEditionDocument } from './editions';
import { getSourceReaderEdition, SOURCE_READER_DOCUMENT_MAX } from './source-reader';

/** Both the original and its separate presentation derivative remain pinned. */
export async function readSourceReaderDocument(bookId: string, editionId: string): Promise<{ bytes: Buffer; sha256: string; editionId: string } | null> {
  const entry = getSourceReaderEdition(bookId);
  if (!entry) return null;
  if (editionId !== entry.editionId) throw new EditionMismatch();
  const source = await readEditionDocument(bookId, editionId);
  if (!source || source.sha256 !== entry.sourceDocumentSha256) throw new EditionUnavailable();
  try {
    const root = await realpath(path.resolve(process.cwd(), 'content/great-books'));
    const book = await realpath(path.join(root, bookId));
    const target = path.join(book, 'native-reader.html');
    const info = await lstat(target);
    if (!book.startsWith(root + path.sep) || !info.isFile() || info.isSymbolicLink() || info.size !== entry.documentBytes
      || info.size < 1 || info.size > SOURCE_READER_DOCUMENT_MAX) throw new EditionUnavailable();
    const bytes = await readFile(target);
    if (bytes.length !== entry.documentBytes || createHash('sha256').update(bytes).digest('hex') !== entry.documentSha256) throw new EditionUnavailable();
    return { bytes, sha256: entry.documentSha256, editionId: entry.editionId };
  } catch { throw new EditionUnavailable(); }
}
