import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { readBookEdition, readEditionDocument } from './editions';
import { matchesReadingEdition } from '@/lib/circles/reading-program';
import { PASSAGE_EXTRACTION_VERSION } from './passage-text';
import { parseBookPassage, parsePassageReference, passageContentSuffix, passageIndexPin, passageReaderHref,
  PASSAGE_MESSAGE_LIMIT, type BookPassage, type PassageReference, type PassageReason } from './passages';

export class PassageSourceError extends Error {
  constructor(public readonly status: 400 | 409 | 503) { super('The requested source passage could not be verified'); }
}
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const plain = (value: unknown): value is string => typeof value === 'string' && value.length <= 100_000
  && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);

async function readIndex(bookId: string, expectedBytes: number, expectedSha: string): Promise<unknown> {
  const root = await realpath(path.resolve(process.cwd(), 'content/great-books'));
  const bookRoot = await realpath(path.join(root, bookId));
  const target = await realpath(path.join(bookRoot, 'passages.json'));
  if (!bookRoot.startsWith(root + path.sep) || !target.startsWith(bookRoot + path.sep)) throw new PassageSourceError(503);
  const info = await stat(target);
  if (!info.isFile() || info.size !== expectedBytes || info.size > 30_000_000) throw new PassageSourceError(503);
  const bytes = await readFile(target);
  if (bytes.length !== expectedBytes || createHash('sha256').update(bytes).digest('hex') !== expectedSha) throw new PassageSourceError(503);
  return JSON.parse(bytes.toString('utf8'));
}

/** Resolve public coordinates from a hash-pinned derivative and independently
 * verified current reader bytes. No caller quotation, URL or credit is trusted. */
export async function resolvePassage(value: unknown): Promise<BookPassage> {
  const reference = parsePassageReference(value);
  if (!reference) throw new PassageSourceError(400);
  const pin = passageIndexPin(reference.bookId);
  if (!pin) throw new PassageSourceError(400);
  if (reference.editionId !== pin.editionId) throw new PassageSourceError(409);
  if (reference.blockIndex >= pin.blockCount) throw new PassageSourceError(400);
  try {
    const [metadata, document, raw] = await Promise.all([
      readBookEdition(reference.bookId), readEditionDocument(reference.bookId, reference.editionId),
      readIndex(reference.bookId, pin.indexBytes, pin.indexSha256),
    ]);
    if (!metadata || !document || document.sha256 !== pin.documentSha256 || document.editionId !== reference.editionId
      || !matchesReadingEdition(metadata, reference) || !record(raw) || raw.version !== 1 || raw.bookId !== reference.bookId
      || raw.editionId !== reference.editionId || raw.documentSha256 !== pin.documentSha256 || raw.metadataSha256 !== pin.metadataSha256
      || raw.extractionVersion !== PASSAGE_EXTRACTION_VERSION || !Array.isArray(raw.blocks) || raw.blocks.length !== pin.blockCount) throw new PassageSourceError(503);
    const e = metadata.edition;
    const metadataHash = createHash('sha256').update(JSON.stringify([e.sourceTitle, e.sourceAuthor, e.translators, e.editors,
      e.illustrators, e.rights, e.licenseUrl, e.licenseNotice, e.editionNotes, e.sourceCatalogUrl, e.sourceArchiveUrl])).digest('hex');
    if (metadataHash !== pin.metadataSha256) throw new PassageSourceError(503);
    const block = raw.blocks[reference.blockIndex];
    if (!record(block) || ![null, 'non_text', 'table', 'empty'].includes(block.reason as PassageReason)
      || (block.text !== null && !plain(block.text)) || (block.reason === null && !block.text)
      || (block.reason !== null && block.text !== null)) throw new PassageSourceError(503);
    const reason = block.reason as PassageReason, blockText = block.text as string | null;
    let quote: string | null = null;
    if (reference.start !== null) {
      if (reason || blockText === null || reference.end! > blockText.length
        || (reference.start > 0 && /[\uDC00-\uDFFF]/u.test(blockText[reference.start]))
        || (reference.end! < blockText.length && /[\uDC00-\uDFFF]/u.test(blockText[reference.end!]))) throw new PassageSourceError(400);
      quote = blockText.slice(reference.start, reference.end!);
      if (!quote || quote !== quote.trim()) throw new PassageSourceError(400);
    }
    const partial = { reference, quote, blockText, reason, metadata };
    const contentSuffix = passageContentSuffix(partial);
    const source = parseBookPassage({ ...partial, readerHref: passageReaderHref(reference), contentSuffix,
      commentLimit: PASSAGE_MESSAGE_LIMIT - contentSuffix.length - 2, sourceHash: pin.documentSha256 });
    if (!source) throw new PassageSourceError(503);
    return source;
  } catch (error) {
    if (error instanceof PassageSourceError) throw error;
    throw new PassageSourceError(503);
  }
}

/** Strict public query: locators only, with no commentary, credentials or URL. */
export function passageReferenceFromQuery(query: URLSearchParams): PassageReference | null {
  const keys = new Set(['book', 'edition', 'block', 'start', 'end']);
  if (Array.from(query.keys()).some(key => !keys.has(key) || query.getAll(key).length !== 1)
    || ['book', 'edition', 'block'].some(key => query.getAll(key).length !== 1)) return null;
  const number = (key: string): number | null => {
    const raw = query.get(key); return raw !== null && /^(0|[1-9][0-9]*)$/u.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : null;
  };
  const offsets = query.has('start') || query.has('end'), start = number('start'), end = number('end');
  if (number('block') === null || (offsets && (start === null || end === null))) return null;
  return parsePassageReference({ version: 1, bookId: query.get('book'), editionId: query.get('edition'), blockIndex: number('block'),
    start: offsets ? start : null, end: offsets ? end : null });
}
