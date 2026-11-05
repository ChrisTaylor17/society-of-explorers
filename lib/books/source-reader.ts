import catalog from './source-reader-catalog.json';
import { passageIndexPin } from './passages';

export const SOURCE_READER_VERSION = 'source-reader-v1';
export const SOURCE_READER_DOCUMENT_MAX = 2 * 1024 * 1024;
export const SOURCE_READER_ASSET_MAX = 512 * 1024;
export const SOURCE_READER_TOTAL_MAX = 32 * 1024 * 1024;
export const SOURCE_READER_ASSETS_MAX = 256;
export type SourceReaderAsset = Readonly<{ path: string; sha256: string; bytes: number; mime: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' }>;
export type SourceReaderEdition = Readonly<{
  bookId: string; editionId: string; sourceDocumentSha256: string; documentSha256: string;
  documentBytes: number; blockCount: number; anchorOverrides: Readonly<Record<string, string>>;
  assets: readonly SourceReaderAsset[];
}>;
const books = ['republic', 'meditations', 'genealogy-of-morals', 'apology', 'odyssey', 'divine-comedy', 'hamlet', 'relativity'];
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const count = (value: unknown, maximum: number): value is number => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= maximum;
const imageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/** Validate packaged data; no network response or caller URL can extend this registry. */
export function parseSourceReaderCatalog(value: unknown): readonly SourceReaderEdition[] | null {
  if (!object(value) || !exact(value, ['schemaVersion', 'derivativeVersion', 'editions']) || value.schemaVersion !== 1
    || value.derivativeVersion !== SOURCE_READER_VERSION || !Array.isArray(value.editions) || value.editions.length !== books.length) return null;
  const result: SourceReaderEdition[] = [];
  for (const [position, entry] of value.editions.entries()) {
    if (!object(entry) || !exact(entry, ['bookId', 'editionId', 'sourceDocumentSha256', 'documentSha256', 'documentBytes', 'blockCount', 'anchorOverrides', 'assets'])
      || entry.bookId !== books[position] || typeof entry.editionId !== 'string' || !hash(entry.sourceDocumentSha256) || !hash(entry.documentSha256)
      || entry.sourceDocumentSha256 === entry.documentSha256 || !count(entry.documentBytes, SOURCE_READER_DOCUMENT_MAX)
      || !object(entry.anchorOverrides) || !Array.isArray(entry.assets) || entry.assets.length > SOURCE_READER_ASSETS_MAX) return null;
    const pin = passageIndexPin(books[position]);
    if (!pin || entry.editionId !== pin.editionId || entry.sourceDocumentSha256 !== pin.documentSha256 || entry.blockCount !== pin.blockCount) return null;
    const anchors: Record<string, string> = {}, identities = new Set<string>();
    for (const [index, anchor] of Object.entries(entry.anchorOverrides)) {
      if (!/^(0|[1-9][0-9]*)$/.test(index) || !Number.isSafeInteger(Number(index)) || Number(index) >= pin.blockCount
        || typeof anchor !== 'string' || anchor.length > 200 || !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(anchor)
        || /^soe-reading-position-[0-9]+$/.test(anchor) || identities.has(anchor)) return null;
      anchors[index] = anchor; identities.add(anchor);
    }
    const paths = new Set<string>(), assets: SourceReaderAsset[] = [];
    let total = entry.documentBytes;
    for (const asset of entry.assets) {
      if (!object(asset) || !exact(asset, ['path', 'sha256', 'bytes', 'mime']) || typeof asset.path !== 'string' || asset.path.length > 300
        || !/^[A-Za-z0-9_./-]+$/.test(asset.path) || asset.path.split('/').some(part => !part || part === '.' || part === '..') || paths.has(asset.path)
        || !hash(asset.sha256) || !count(asset.bytes, SOURCE_READER_ASSET_MAX) || typeof asset.mime !== 'string' || !imageTypes.includes(asset.mime)) return null;
      total += asset.bytes; if (total > SOURCE_READER_TOTAL_MAX) return null;
      paths.add(asset.path); assets.push(Object.freeze({ path: asset.path, sha256: asset.sha256, bytes: asset.bytes, mime: asset.mime as SourceReaderAsset['mime'] }));
    }
    result.push(Object.freeze({ bookId: books[position], editionId: pin.editionId, sourceDocumentSha256: pin.documentSha256,
      documentSha256: entry.documentSha256, documentBytes: entry.documentBytes, blockCount: pin.blockCount,
      anchorOverrides: Object.freeze(anchors), assets: Object.freeze(assets) }));
  }
  return Object.freeze(result);
}
const editions = parseSourceReaderCatalog(catalog);
export function getSourceReaderEdition(bookId: string, editionId?: string): SourceReaderEdition | null {
  return editions?.find(entry => entry.bookId === bookId && (editionId === undefined || entry.editionId === editionId)) ?? null;
}
export function sourceReaderAnchor(bookId: string, editionId: string, index: number): string | null {
  const entry = getSourceReaderEdition(bookId, editionId);
  return entry && Number.isSafeInteger(index) && index >= 0 && index < entry.blockCount
    ? entry.anchorOverrides[String(index)] ?? `soe-reading-position-${index}` : null;
}
export function sourceReaderDocumentPath(bookId: string, editionId: string): string | null {
  const entry = getSourceReaderEdition(bookId, editionId);
  return entry ? `/api/great-books/edition/${entry.bookId}/reader?edition=${entry.editionId}` : null;
}
