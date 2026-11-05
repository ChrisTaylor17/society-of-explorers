import { GREAT_BOOKS, getBook } from './catalog';
import { interpretBookmark, isEditionId, type BookmarkInterpretation } from './bookmarks';

export type ReadingProgressEdition = { editionId: string; blockCount: number };
export type ReadingProgressState = {
  bookId: string; revision: number; status: 'absent' | 'saved' | 'removed';
  sectionId: string | null; paragraphIndex: number | null; completed: boolean | null; updatedAt: string | null;
  edition: ReadingProgressEdition; bookmark: BookmarkInterpretation | null;
};
export type ReadingProgressResponse = { memberId: string; progress: ReadingProgressState[] };
type Authority = { expectedMemberId: string; expectedRevision: number; bookId: string };
export type ReadingProgressMutation = Authority & ({ action: 'remove' } |
  { action: 'save'; editionId: string; blockIndex: number; completed: boolean });
export const READING_PROGRESS_BODY_MAX_BYTES = 4096;
export const READING_PROGRESS_SELECT = 'member_id,book_id,section_id,paragraph_index,completed,updated_at,progress_revision,progress_removed';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
const revision = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const member = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export function parseReadingProgressMutation(value: unknown): ReadingProgressMutation | null {
  if (!record(value) || !member(value.expectedMemberId) || !revision(value.expectedRevision) || typeof value.bookId !== 'string' || !getBook(value.bookId)) return null;
  const authority = { expectedMemberId: value.expectedMemberId.toLowerCase(), expectedRevision: value.expectedRevision, bookId: value.bookId };
  if (value.action === 'remove') return exact(value, ['expectedMemberId', 'expectedRevision', 'bookId', 'action']) ? { ...authority, action: 'remove' } : null;
  if (value.action !== 'save' || !exact(value, ['expectedMemberId', 'expectedRevision', 'bookId', 'action', 'editionId', 'blockIndex', 'completed'])
    || !isEditionId(value.editionId) || !revision(value.blockIndex) || value.blockIndex >= 100_000 || typeof value.completed !== 'boolean') return null;
  return { ...authority, action: 'save', editionId: value.editionId, blockIndex: value.blockIndex, completed: value.completed };
}

/** Fixed compact key order is also enforced by the native transport. */
export function readingProgressMutationBody(value: ReadingProgressMutation): string {
  const parsed = parseReadingProgressMutation(value);
  if (!parsed) throw Error('A current reviewed saved-place action is required');
  return JSON.stringify(parsed);
}

export function parseReadingProgressState(value: unknown): ReadingProgressState | null {
  if (!record(value) || !exact(value, ['bookId', 'revision', 'status', 'sectionId', 'paragraphIndex', 'completed', 'updatedAt', 'edition', 'bookmark'])
    || typeof value.bookId !== 'string' || !getBook(value.bookId) || !revision(value.revision)
    || !record(value.edition) || !exact(value.edition, ['editionId', 'blockCount']) || !isEditionId(value.edition.editionId)
    || !revision(value.edition.blockCount) || value.edition.blockCount < 1 || value.edition.blockCount > 100_000
    || value.sectionId !== null && (typeof value.sectionId !== 'string' || value.sectionId.length > 150)
    || value.paragraphIndex !== null && (!revision(value.paragraphIndex) || value.paragraphIndex > 2147483647)
    || value.completed !== null && typeof value.completed !== 'boolean' || value.updatedAt !== null && !date(value.updatedAt)) return null;
  const edition = { editionId: value.edition.editionId, blockCount: value.edition.blockCount };
  let bookmark: BookmarkInterpretation | null;
  if (value.status === 'absent' || value.status === 'removed') {
    if (value.sectionId !== null || value.paragraphIndex !== null || value.completed !== null || value.bookmark !== null
      || (value.status === 'absent' ? value.revision !== 0 || value.updatedAt !== null : value.revision < 1 || value.updatedAt === null)) return null;
    bookmark = null;
  } else if (value.status === 'saved') {
    bookmark = interpretBookmark(value.sectionId, edition.editionId, edition.blockCount);
    if (!record(value.bookmark) || !exact(value.bookmark, Object.keys(bookmark))
      || !Object.entries(bookmark).every(([key, entry]) => (value.bookmark as Record<string, unknown>)[key] === entry)) return null;
  } else return null;
  return { bookId: value.bookId, revision: value.revision, status: value.status, sectionId: value.sectionId as string | null,
    paragraphIndex: value.paragraphIndex as number | null, completed: value.completed as boolean | null, updatedAt: value.updatedAt as string | null,
    edition, bookmark };
}

/** An all-books response includes every canonical book in catalog order. A
 * selected-book response always contains one explicit absent/saved/removed state.
 * Clients must also bind memberId and the edition to their checked owner/pin. */
export function parseReadingProgressResponse(value: unknown, bookId?: string): ReadingProgressResponse | null {
  if (!record(value) || !exact(value, ['memberId', 'progress']) || !member(value.memberId) || !Array.isArray(value.progress)) return null;
  const books = bookId === undefined ? GREAT_BOOKS.map(book => book.id) : getBook(bookId) ? [bookId] : [];
  if (!books.length || value.progress.length !== books.length) return null;
  const progress: ReadingProgressState[] = [];
  for (let index = 0; index < books.length; index++) {
    const state = parseReadingProgressState(value.progress[index]);
    if (!state || state.bookId !== books[index]) return null;
    progress.push(state);
  }
  return { memberId: value.memberId.toLowerCase(), progress };
}

/** Pure projection for the server's explicit owner-filtered SQL result. A
 * missing row is not a removed row; the tombstone revision must remain visible. */
export function readingProgressFromRow(value: unknown, bookId: string, edition: ReadingProgressEdition): ReadingProgressState | null {
  if (value === null) return parseReadingProgressState({ bookId, revision: 0, status: 'absent', sectionId: null, paragraphIndex: null, completed: null, updatedAt: null, edition, bookmark: null });
  if (!record(value) || value.book_id !== bookId || typeof value.progress_removed !== 'boolean') return null;
  const version = typeof value.progress_revision === 'string' && /^\d{1,16}$/.test(value.progress_revision) ? Number(value.progress_revision) : value.progress_revision;
  let updatedAt: string | null = null;
  if (value.updated_at !== null) {
    if (typeof value.updated_at !== 'string' || value.updated_at.length > 50 || !Number.isFinite(Date.parse(value.updated_at))) return null;
    updatedAt = new Date(value.updated_at).toISOString();
  }
  return parseReadingProgressState({ bookId, revision: version, status: value.progress_removed ? 'removed' : 'saved',
    sectionId: value.section_id, paragraphIndex: value.paragraph_index, completed: value.completed, updatedAt, edition,
    bookmark: value.progress_removed ? null : interpretBookmark(value.section_id, edition.editionId, edition.blockCount) });
}
