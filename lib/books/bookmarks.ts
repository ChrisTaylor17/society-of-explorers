import { getBook } from './catalog';

export type EditionContents = { id: string; label: string; level: number; readingIndex: number | null };
export type BookEditionResponse = {
  bookId: string; title: string; author: string;
  edition: {
    editionId: string; documentUrl: string; downloadUrl: string;
    sourceCatalogUrl: string; sourceArchiveUrl: string; sourceTitle: string; sourceAuthor: string;
    attribution: string; translators: Array<{ name: string; appliesTo: string }>;
    editors: string[]; illustrators: string[]; licenseUrl: string; licenseNotice: string; editionNotes: string[];
    rights: { jurisdiction: 'US'; status: 'public-domain'; authority: 'Project Gutenberg'; outsideUS: 'not-assessed'; reviewedAt: string };
    blockCount: number; contents: EditionContents[];
  };
};
export type BookmarkLocator = { editionId: string; blockIndex: number };
export type BookmarkInterpretation = { status: 'current' | 'legacy' | 'edition_changed' | 'invalid'; editionId?: string; blockIndex?: number };
export const isEditionId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(v);

export function encodeBookmarkLocator(editionId: string, blockIndex: number): string {
  if (!isEditionId(editionId) || !Number.isSafeInteger(blockIndex) || blockIndex < 0) throw new Error('Invalid reading bookmark');
  return `soe-reading:v1:${editionId}:${blockIndex}`;
}
export function parseBookmarkLocator(value: unknown): BookmarkLocator | null {
  if (typeof value !== 'string' || value.length > 150) return null;
  const match = /^soe-reading:v1:([A-Za-z0-9][A-Za-z0-9._-]{0,99}):(0|[1-9][0-9]*)$/.exec(value);
  if (!match || !Number.isSafeInteger(Number(match[2]))) return null;
  return { editionId: match[1], blockIndex: Number(match[2]) };
}
export function interpretBookmark(sectionId: unknown, editionId: string, blockCount: number): BookmarkInterpretation {
  const locator = parseBookmarkLocator(sectionId);
  if (!locator) return { status: sectionId == null || (typeof sectionId === 'string' && /^\d+$/.test(sectionId)) ? 'legacy' : 'invalid' };
  if (locator.editionId !== editionId) return { status: 'edition_changed', ...locator };
  if (!Number.isSafeInteger(blockCount) || blockCount < 1 || locator.blockIndex >= blockCount) return { status: 'invalid' };
  return { status: 'current', ...locator };
}

const record = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);
const texts = (v: unknown, max: number): v is string[] => Array.isArray(v) && v.length <= 100 && v.every(x => text(x, max));

/** Public DTO validation shared with the browser: no fs, credentials or auth. */
export function parseBookEditionResponse(value: unknown): BookEditionResponse | null {
  if (!record(value) || typeof value.bookId !== 'string') return null;
  const book = getBook(value.bookId);
  if (!book || value.title !== book.title || value.author !== book.author || !record(value.edition)) return null;
  const e = value.edition;
  if (!isEditionId(e.editionId) || e.documentUrl !== `/api/great-books/edition/${book.id}?edition=${e.editionId}` || e.downloadUrl !== `/api/great-books/edition/${book.id}/download?edition=${e.editionId}`
    || e.sourceCatalogUrl !== `https://www.gutenberg.org/ebooks/${book.gutenberg_id}` || !text(e.sourceArchiveUrl, 500)
    || !text(e.sourceTitle, 1000) || !text(e.sourceAuthor, 500) || !text(e.attribution, 4000)
    || e.licenseUrl !== 'https://www.gutenberg.org/policy/license.html' || !text(e.licenseNotice, 4000) || !texts(e.editors, 300) || !texts(e.illustrators, 300) || !texts(e.editionNotes, 3000)
    || !Array.isArray(e.translators) || e.translators.length > 30 || !e.translators.every(t => record(t) && text(t.name, 300) && text(t.appliesTo, 1000))
    || !record(e.rights) || e.rights.jurisdiction !== 'US' || e.rights.status !== 'public-domain' || e.rights.authority !== 'Project Gutenberg'
    || e.rights.outsideUS !== 'not-assessed' || !text(e.rights.reviewedAt, 50)
    || !Number.isSafeInteger(e.blockCount) || Number(e.blockCount) < 1 || Number(e.blockCount) > 100_000
    || !Array.isArray(e.contents) || e.contents.length > 5000) return null;
  try {
    const u = new URL(e.sourceArchiveUrl);
    if (u.href !== `https://www.gutenberg.org/cache/epub/${book.gutenberg_id}/pg${book.gutenberg_id}-h.zip`) return null;
  } catch { return null; }
  if (!e.contents.every(c => record(c) && text(c.id, 200) && /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(c.id) && text(c.label, 1000)
    && Number.isInteger(c.level) && Number(c.level) >= 1 && Number(c.level) <= 6
    && (c.readingIndex === null || (Number.isSafeInteger(c.readingIndex) && Number(c.readingIndex) >= 0 && Number(c.readingIndex) < Number(e.blockCount))))) return null;
  if (new Set(e.contents.map(c => (c as Record<string, unknown>).id)).size !== e.contents.length) return null;
  return {
    bookId: book.id, title: book.title, author: book.author,
    edition: { editionId: e.editionId, documentUrl: e.documentUrl, downloadUrl: e.downloadUrl,
      sourceCatalogUrl: e.sourceCatalogUrl, sourceArchiveUrl: e.sourceArchiveUrl, sourceTitle: e.sourceTitle, sourceAuthor: e.sourceAuthor, attribution: e.attribution,
      translators: e.translators.map(t => ({ name: t.name, appliesTo: t.appliesTo })), editors: [...e.editors], illustrators: [...e.illustrators],
      licenseUrl: e.licenseUrl, licenseNotice: e.licenseNotice, editionNotes: [...e.editionNotes],
      rights: { jurisdiction: 'US', status: 'public-domain', authority: 'Project Gutenberg', outsideUS: 'not-assessed', reviewedAt: e.rights.reviewedAt },
      blockCount: Number(e.blockCount), contents: e.contents.map(c => ({ id: c.id, label: c.label, level: c.level, readingIndex: c.readingIndex })),
    },
  } as BookEditionResponse;
}
