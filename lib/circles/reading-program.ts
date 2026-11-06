import { getBook } from '@/lib/books/catalog';
import { parseBookEditionResponse, type BookEditionResponse, type EditionContents } from '@/lib/books/bookmarks';
import { isPhilemonReading, PHILEMON_EDITION_METADATA, PHILEMON_READING, PHILEMON_STUDY_HREF, PHILEMON_WORK } from '@/lib/root-kernel/philemon-edition';
import pinnedEditions from './reading-program-editions.json';

/** Inclusive, zero-based positions in the exact complete source edition. */
export type ReadingSession = { from: number; to: number };
export type ReadingProgram = { version: 1; bookId: string; editionId: string; sessions: ReadingSession[] };
export type ReadingContext = { bookId: string; editionId: string; from: number; to: number };
export type ReadingEdition = {
  bookId: string; editionId: string; blockCount: number; contents: EditionContents[];
  sourceTitle: string; translators: Array<{ name: string; appliesTo: string }>; editors: string[]; illustrators: string[];
};
export const READING_PROGRAM_MAX_SESSIONS = 12;
export type CircleReadingEditionResponse = BookEditionResponse | typeof PHILEMON_EDITION_METADATA;
export const READING_EDITIONS: readonly ReadingEdition[] = [
  ...pinnedEditions, { ...PHILEMON_EDITION_METADATA.edition, bookId: PHILEMON_READING.bookId },
];
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const position = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

export function getReadingWork(bookId: string) {
  return bookId === PHILEMON_WORK.id ? PHILEMON_WORK : getBook(bookId);
}

export function parseCircleReadingEditionResponse(value: unknown): CircleReadingEditionResponse | null {
  if (!record(value) || value.bookId !== PHILEMON_WORK.id) return parseBookEditionResponse(value);
  const edition = value.edition;
  const pinned = PHILEMON_EDITION_METADATA.edition;
  if (value.sourceSha256 !== PHILEMON_EDITION_METADATA.sourceSha256 || !record(edition) || edition.editionId !== pinned.editionId
    || edition.blockCount !== pinned.blockCount || JSON.stringify(edition.contents) !== JSON.stringify(pinned.contents)) return null;
  // Project from the bundled edition. The response attests to the source pin.
  return PHILEMON_EDITION_METADATA;
}

export function getReadingEdition(bookId: string, editionId?: string): ReadingEdition | undefined {
  return READING_EDITIONS.find(e => e.bookId === bookId && (editionId === undefined || e.editionId === editionId));
}

/** No best-effort conversion: a changed edition cannot inherit old positions. */
export function parseReadingProgram(value: unknown): ReadingProgram | null {
  if (!record(value) || !exact(value, ['version', 'bookId', 'editionId', 'sessions']) || value.version !== 1
    || typeof value.bookId !== 'string' || typeof value.editionId !== 'string' || !Array.isArray(value.sessions)
    || value.sessions.length < 1 || value.sessions.length > READING_PROGRAM_MAX_SESSIONS) return null;
  const edition = getReadingEdition(value.bookId, value.editionId);
  if (!edition) return null;
  const sessions: ReadingSession[] = [];
  for (const s of value.sessions) {
    if (!record(s) || !exact(s, ['from', 'to']) || !position(s.from) || !position(s.to) || s.from > s.to || s.to >= edition.blockCount) return null;
    sessions.push({ from: s.from, to: s.to });
  }
  return { version: 1, bookId: value.bookId, editionId: value.editionId, sessions };
}

export function matchesReadingEdition(metadata: CircleReadingEditionResponse, program: Pick<ReadingProgram, 'bookId' | 'editionId'>): boolean {
  const pinned = getReadingEdition(program.bookId, program.editionId);
  return Boolean(pinned && metadata.bookId === program.bookId && metadata.edition.editionId === program.editionId
    && metadata.edition.blockCount === pinned.blockCount && JSON.stringify(metadata.edition.contents) === JSON.stringify(pinned.contents));
}

/** Literal heading labels remain source labels; ranges never acquire invented chapters. */
export function readingSessionLabel(program: Pick<ReadingProgram, 'bookId' | 'editionId'>, session: ReadingSession): string {
  const edition = getReadingEdition(program.bookId, program.editionId);
  if (!edition || !position(session.from) || !position(session.to) || session.from > session.to || session.to >= edition.blockCount) return 'Reading selection unavailable';
  if (session.from === 0 && session.to === edition.blockCount - 1) return 'Complete source edition';
  const start = edition.contents.find(c => c.readingIndex === session.from);
  const after = edition.contents.find(c => c.readingIndex === session.to + 1);
  const beginning = session.from === 0 ? 'Opening pages' : start?.label || `Reading position ${session.from + 1}`;
  return `${beginning} — ${session.to === edition.blockCount - 1 ? 'end of edition' : after ? `before ${after.label}` : `through reading position ${session.to + 1}`}`;
}

export function readingEditionLabel(program: Pick<ReadingProgram, 'bookId' | 'editionId'>): string {
  const edition = getReadingEdition(program.bookId, program.editionId);
  if (!edition) return 'Edition unavailable';
  if (program.bookId === PHILEMON_WORK.id) return PHILEMON_EDITION_METADATA.edition.attribution;
  const credits = edition.translators.map(t => `${t.name} (${t.appliesTo})`);
  return [edition.sourceTitle, ...credits, `Project Gutenberg ${getBook(program.bookId)?.gutenberg_id || ''}`].join(' · ');
}

/** Every context field is public. It never carries identity or a private URL. */
export function parseReadingContext(params: URLSearchParams): { context: ReadingContext | null; invalid: boolean } {
  const keys = ['book', 'edition', 'from', 'to'];
  if (!keys.some(k => params.has(k))) return { context: null, invalid: false };
  if (keys.some(k => params.getAll(k).length !== 1)) return { context: null, invalid: true };
  const bookId = params.get('book')!, editionId = params.get('edition')!;
  const from = params.get('from')!, to = params.get('to')!;
  if (!/^(0|[1-9]\d{0,5})$/.test(from) || !/^(0|[1-9]\d{0,5})$/.test(to)) return { context: null, invalid: true };
  const program = parseReadingProgram({ version: 1, bookId, editionId, sessions: [{ from: Number(from), to: Number(to) }] });
  return program ? { context: { bookId, editionId, ...program.sessions[0] }, invalid: false } : { context: null, invalid: true };
}

export function readingContextParams(context: ReadingContext): URLSearchParams {
  const parsed = parseReadingProgram({ version: 1, bookId: context.bookId, editionId: context.editionId, sessions: [{ from: context.from, to: context.to }] });
  if (!parsed) throw new Error('Invalid reading context');
  return new URLSearchParams({ book: context.bookId, edition: context.editionId, from: String(context.from), to: String(context.to) });
}
export function readingDiscoveryHref(context: ReadingContext): string { return `/circles?${readingContextParams(context)}`; }
export function readingStartHref(context: ReadingContext): string { return `/circles/start?${readingContextParams(context)}`; }
export function readingReaderHref(program: Pick<ReadingProgram, 'bookId' | 'editionId'>, session: ReadingSession, circleId?: string): string {
  const params = readingContextParams({ ...program, ...session });
  params.delete('book');
  if (circleId !== undefined) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(circleId)) throw new Error('Invalid Circle identifier');
    params.set('circle', circleId.toLowerCase());
  }
  if (isPhilemonReading({ ...program, ...session })) {
    const circle = params.get('circle');
    return `${PHILEMON_STUDY_HREF}${circle ? `?circle=${circle}` : ''}#scripture`;
  }
  return `/great-books/${encodeURIComponent(program.bookId)}?${params}`;
}

/** A real source heading containing this position; the source document stays complete. */
export function readingSelectionAt(program: Pick<ReadingProgram, 'bookId' | 'editionId'>, index: number): ReadingSession | null {
  const edition = getReadingEdition(program.bookId, program.editionId);
  if (!edition || !position(index) || index >= edition.blockCount) return null;
  const boundaries = [...new Set([0, ...edition.contents.flatMap(c => c.readingIndex === null ? [] : [c.readingIndex]), edition.blockCount])].sort((a, b) => a - b);
  const next = boundaries.findIndex(boundary => boundary > index);
  return next > 0 ? { from: boundaries[next - 1], to: boundaries[next] - 1 } : null;
}

export function parseReaderContext(bookId: string, params: URLSearchParams): { context: ReadingContext | null; circleId: string | null; invalid: boolean } {
  const copy = new URLSearchParams(params);
  if (copy.has('book')) return { context: null, circleId: null, invalid: true };
  const hasSelection = ['edition', 'from', 'to'].some(k => copy.has(k));
  const circles = copy.getAll('circle');
  if (circles.length > 1 || (circles.length === 1 && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(circles[0]))) return { context: null, circleId: null, invalid: true };
  if (!hasSelection) return { context: null, circleId: circles[0]?.toLowerCase() ?? null, invalid: false };
  copy.set('book', bookId);
  const parsed = parseReadingContext(copy);
  return { ...parsed, circleId: circles[0]?.toLowerCase() ?? null };
}

export function readingReturnHref(bookId: string, search: string): string {
  if (!getBook(bookId)) return '/great-books';
  const parsed = parseReaderContext(bookId, new URLSearchParams(search));
  if (!parsed.invalid && parsed.context) return readingReaderHref(parsed.context, parsed.context, parsed.circleId ?? undefined);
  return `/great-books/${encodeURIComponent(bookId)}${!parsed.invalid && parsed.circleId ? `?circle=${parsed.circleId}` : ''}`;
}

/** Only these starter readings share the already verified local source editions.
 * Labels are exact source headings, never a translation inferred from the title. */
export function starterReadingContext(week: number): ReadingContext | null {
  const binding = week === 2 ? { bookId: 'apology', start: 'APOLOGY', before: null }
    : week === 5 ? { bookId: 'meditations', start: 'THE FIRST BOOK', before: 'THE THIRD BOOK' } : null;
  if (!binding) return null;
  const edition = getReadingEdition(binding.bookId)!;
  const from = edition.contents.find(c => c.label === binding.start)?.readingIndex;
  const end = binding.before ? edition.contents.find(c => c.label === binding.before)?.readingIndex : edition.blockCount;
  if (from == null || end == null || end <= from) return null;
  return { bookId: binding.bookId, editionId: edition.editionId, from, to: end - 1 };
}
