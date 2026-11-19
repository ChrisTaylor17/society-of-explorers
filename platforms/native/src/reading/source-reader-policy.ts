import { getSourceReaderEdition, sourceReaderAnchor, sourceReaderDocumentPath } from '../../../../lib/books/source-reader';

export type SourceReaderSelection = Readonly<{ bookId: string; editionId: string; blockIndex: number; requestKey: string }>;
export function validSourceReaderSelection(value: SourceReaderSelection): boolean {
  if (!value || typeof value.bookId !== 'string' || typeof value.editionId !== 'string') return false;
  const edition = getSourceReaderEdition(value.bookId, value.editionId);
  return !!edition && Number.isSafeInteger(value.blockIndex) && value.blockIndex >= 0 && value.blockIndex < edition.blockCount
    && typeof value.requestKey === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value.requestKey);
}
/** Executable reference policy for the two independent native implementations.
 * No generic fetch is exported to application code. Native reads packaged pins. */
export function sourceReaderResource(bookId: string, editionId: string, path: string) {
  if (typeof bookId !== 'string' || typeof editionId !== 'string') return null;
  const edition = getSourceReaderEdition(bookId, editionId);
  if (!edition || typeof path !== 'string') return null;
  if (path === sourceReaderDocumentPath(bookId, editionId)) return {
    path, sha256: edition.documentSha256, bytes: edition.documentBytes, mime: 'text/html',
  };
  for (const asset of edition.assets) {
    const expected = `/api/great-books/edition/${bookId}/assets/${asset.path}?sha=${asset.sha256}`;
    if (path === expected) return { path, sha256: asset.sha256, bytes: asset.bytes, mime: asset.mime };
  }
  return null;
}
export function sourceReaderFragment(value: SourceReaderSelection): string | null {
  if (!validSourceReaderSelection(value)) return null;
  const anchor = sourceReaderAnchor(value.bookId, value.editionId, value.blockIndex);
  return anchor === null ? null : '#' + encodeURIComponent(anchor);
}
