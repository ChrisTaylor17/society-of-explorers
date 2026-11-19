import indexes from './passage-indexes.json';
import { getBook } from './catalog';
import { isEditionId, parseBookEditionResponse, type BookEditionResponse } from './bookmarks';
import { isUuid } from '@/lib/ids/uuid';

export const PASSAGE_QUOTE_LIMIT = 600;
export const PASSAGE_MESSAGE_LIMIT = 2000;
export type PassageReference = { version: 1; bookId: string; editionId: string; blockIndex: number; start: number | null; end: number | null };
export type PassageReason = 'non_text' | 'table' | 'empty' | null;
export type PassageIndexPin = { bookId: string; editionId: string; blockCount: number; documentSha256: string; metadataSha256: string; indexSha256: string; indexBytes: number };
export type BookPassage = {
  reference: PassageReference; quote: string | null; blockText: string | null; reason: PassageReason;
  metadata: BookEditionResponse; readerHref: string; contentSuffix: string; commentLimit: number; sourceHash: string;
};
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const plain = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max
  && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
const integer = (value: unknown, max = 100_000): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= max;
const numberParam = (value: string | null) => value !== null && /^(0|[1-9][0-9]*)$/u.test(value) && integer(Number(value)) ? Number(value) : null;
const pins = indexes as PassageIndexPin[];
export function passageCatalog(): PassageIndexPin[] { return pins.map(pin => ({ ...pin })); }
export function passageIndexPin(bookId: string): PassageIndexPin | null { const pin = pins.find(value => value.bookId === bookId); return pin ? { ...pin } : null; }

/** Structural parser; the server separately checks the exact current edition
 * and index bounds so a changed edition can produce an explicit conflict. */
export function parsePassageReference(value: unknown): PassageReference | null {
  if (!record(value) || Object.keys(value).sort().join(',') !== 'blockIndex,bookId,editionId,end,start,version'
    || value.version !== 1 || typeof value.bookId !== 'string' || !getBook(value.bookId) || !passageIndexPin(value.bookId)
    || !isEditionId(value.editionId) || !integer(value.blockIndex)) return null;
  const linked = value.start === null && value.end === null;
  if (!linked && (!integer(value.start) || !integer(value.end) || value.end <= value.start || value.end - value.start > PASSAGE_QUOTE_LIMIT)) return null;
  return { version: 1, bookId: value.bookId, editionId: value.editionId, blockIndex: value.blockIndex, start: value.start as number | null, end: value.end as number | null };
}
export function samePassageReference(a: PassageReference, b: PassageReference): boolean {
  return a.version === b.version && a.bookId === b.bookId && a.editionId === b.editionId && a.blockIndex === b.blockIndex && a.start === b.start && a.end === b.end;
}
export function passageReaderHref(reference: PassageReference): string {
  const r = parsePassageReference(reference); if (!r) throw Error('Invalid passage reference');
  const query = new URLSearchParams({ edition: r.editionId, passageBlock: String(r.blockIndex) });
  if (r.start !== null) { query.set('passageStart', String(r.start)); query.set('passageEnd', String(r.end)); }
  return `/great-books/${r.bookId}?${query}`;
}
export function passageComposeHref(reference?: PassageReference | null, circleId?: string | null): string {
  if (circleId && !isUuid(circleId)) throw Error('Invalid Circle');
  const query = new URLSearchParams();
  if (circleId) query.set('circle', circleId);
  if (reference) {
    const r = parsePassageReference(reference); if (!r) throw Error('Invalid passage reference');
    query.set('book', r.bookId); query.set('edition', r.editionId); query.set('block', String(r.blockIndex));
    if (r.start !== null) { query.set('start', String(r.start)); query.set('end', String(r.end)); }
  }
  return `/circles/passages${query.size ? `?${query}` : ''}`;
}
type ReaderIntent = { present: boolean; invalid: boolean; reference: PassageReference | null };
export function parsePassageReaderIntent(bookId: string, query: URLSearchParams): ReaderIntent {
  const present = ['passageBlock', 'passageStart', 'passageEnd'].some(key => query.has(key));
  if (!present) return { present: false, invalid: false, reference: null };
  const allowed = new Set(['edition', 'passageBlock', 'passageStart', 'passageEnd']);
  if (Array.from(query.keys()).some(key => !allowed.has(key) || query.getAll(key).length !== 1)) return { present, invalid: true, reference: null };
  const blockIndex = numberParam(query.get('passageBlock'));
  const hasOffsets = query.has('passageStart') || query.has('passageEnd');
  const start = numberParam(query.get('passageStart')), end = numberParam(query.get('passageEnd'));
  const reference = parsePassageReference({ version: 1, bookId, editionId: query.get('edition'), blockIndex,
    start: hasOffsets ? start : null, end: hasOffsets ? end : null });
  if (blockIndex === null || (hasOffsets && (start === null || end === null)) || !reference) return { present, invalid: true, reference: null };
  return { present, invalid: false, reference };
}
export function parsePassageComposeIntent(query: URLSearchParams): ReaderIntent & { circleId: string | null } {
  const allowed = new Set(['circle', 'book', 'edition', 'block', 'start', 'end']);
  const circleId = query.get('circle');
  const invalid = Array.from(query.keys()).some(key => !allowed.has(key) || query.getAll(key).length !== 1) || (circleId !== null && !isUuid(circleId));
  const present = ['book', 'edition', 'block', 'start', 'end'].some(key => query.has(key));
  if (invalid) return { present, invalid: true, reference: null, circleId: null };
  if (!present) return { present: false, invalid: false, reference: null, circleId };
  const mapped = new URLSearchParams();
  for (const [oldKey, newKey] of [['edition', 'edition'], ['block', 'passageBlock'], ['start', 'passageStart'], ['end', 'passageEnd']]) {
    if (query.has(oldKey)) mapped.set(newKey, query.get(oldKey)!);
  }
  const result = parsePassageReaderIntent(query.get('book') || '', mapped);
  return { ...result, present: true, invalid: result.invalid || !result.reference, circleId };
}

export function passageContentSuffix(source: Pick<BookPassage, 'reference' | 'quote' | 'metadata'>): string {
  const heading = source.quote === null ? 'Referenced source block (no quotation):' : `Referenced passage (edition text; line breaks retained):\n“${source.quote}”`;
  const credit = source.metadata.edition.attribution.replace(/\s+/gu, ' ').trim();
  return `${heading}\n\nSource edition: ${credit}\nReading block ${source.reference.blockIndex + 1}.\n${passageReaderHref(source.reference)}`;
}
export function formatPassageMessage(comment: string, source: BookPassage): string | null {
  if (!plain(comment, PASSAGE_MESSAGE_LIMIT)) return null;
  const text = comment.trim();
  if (!text || text.length > source.commentLimit) return null;
  const content = `${text}\n\n${source.contentSuffix}`;
  return plain(content, PASSAGE_MESSAGE_LIMIT) && content.length <= PASSAGE_MESSAGE_LIMIT ? content : null;
}
export const formatPassageContent = formatPassageMessage;

/** A locator in plain text is only a source hint. Verify its canonical suffix
 * against the public source response before labelling the quotation verified. */
export function passageReferenceFromMessage(content: string): PassageReference | null {
  if (!plain(content, PASSAGE_MESSAGE_LIMIT)) return null;
  const line = content.split('\n').at(-1) || '';
  const match = /^\/great-books\/([a-z0-9-]+)\?([^#]+)$/u.exec(line);
  if (!match) return null;
  const result = parsePassageReaderIntent(match[1], new URLSearchParams(match[2]));
  return result.reference && !result.invalid && passageReaderHref(result.reference) === line ? result.reference : null;
}
export function parseBookPassage(value: unknown): BookPassage | null {
  if (!record(value)) return null;
  const reference = parsePassageReference(value.reference), metadata = parseBookEditionResponse(value.metadata);
  if (!reference || !metadata) return null;
  const pin = passageIndexPin(reference.bookId);
  if (!pin || reference.editionId !== pin.editionId || reference.blockIndex >= pin.blockCount || metadata.bookId !== reference.bookId
    || metadata.edition.editionId !== reference.editionId || metadata.edition.blockCount !== pin.blockCount || value.sourceHash !== pin.documentSha256
    || ![null, 'non_text', 'table', 'empty'].includes(value.reason as PassageReason)
    || (value.blockText !== null && !plain(value.blockText, 100_000)) || (value.quote !== null && !plain(value.quote, PASSAGE_QUOTE_LIMIT))) return null;
  const quote = value.quote as string | null, blockText = value.blockText as string | null, reason = value.reason as PassageReason;
  if ((reason !== null && (blockText !== null || quote !== null)) || (reason === null && !blockText)
    || (reference.start === null ? quote !== null : !blockText || !quote || reason !== null || blockText.slice(reference.start, reference.end!) !== quote
      || quote.length !== reference.end! - reference.start || quote !== quote.trim()
      || (reference.start > 0 && /[\uDC00-\uDFFF]/u.test(blockText[reference.start]))
      || (reference.end! < blockText.length && /[\uDC00-\uDFFF]/u.test(blockText[reference.end!])))) return null;
  const projected = { reference, quote, blockText, reason, metadata, readerHref: passageReaderHref(reference), sourceHash: pin.documentSha256 };
  const contentSuffix = passageContentSuffix(projected), commentLimit = PASSAGE_MESSAGE_LIMIT - contentSuffix.length - 2;
  if (commentLimit < 1 || value.readerHref !== projected.readerHref || value.contentSuffix !== contentSuffix || value.commentLimit !== commentLimit) return null;
  return { ...projected, contentSuffix, commentLimit };
}
