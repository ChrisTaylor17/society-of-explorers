// Shared, side-effect-free discovery rules for the public circle directory.
// Search only the public projection: meeting links and private member data never
// enter this helper or its shareable URL parameters.
import type { PublicCircle } from './server';
import { getReadingWork, getReadingEdition, parseReadingContext, readingSessionLabel } from './reading-program';

export const ONLINE_CIRCLES_HREF = '/circles?format=online';

export function circleDetailHref(circleId: string, fromOnline: boolean): string {
  return `/circles/${encodeURIComponent(circleId)}${fromOnline ? '?from=online' : ''}`;
}

export type DiscoveryQuery = {
  q: string;
  city: string;
  format: '' | 'in_person' | 'online';
  open: boolean;
  sort: 'next' | 'title';
  book?: string;
  edition?: string;
  from?: number;
  to?: number;
  invalidContext?: boolean;
};

export const DEFAULT_DISCOVERY_QUERY: DiscoveryQuery = Object.freeze({
  q: '', city: '', format: '', open: false, sort: 'next',
});

function text(value: string | null, max: number): string {
  return (value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function parseDiscoveryQuery(params: URLSearchParams): DiscoveryQuery {
  const format = params.get('format');
  const keys = ['book', 'edition', 'from', 'to'];
  let context: Pick<DiscoveryQuery, 'book' | 'edition' | 'from' | 'to' | 'invalidContext'> = {};
  if (keys.some(key => params.has(key))) {
    if (params.has('from') || params.has('to')) {
      const parsed = parseReadingContext(params);
      context = parsed.invalid || !parsed.context ? { invalidContext: true } : {
        book: parsed.context.bookId, edition: parsed.context.editionId, from: parsed.context.from, to: parsed.context.to,
      };
    } else if (params.getAll('book').length !== 1 || params.getAll('edition').length !== 1
      || !getReadingEdition(params.get('book')!, params.get('edition')!)) context = { invalidContext: true };
    else context = { book: params.get('book')!, edition: params.get('edition')! };
  }
  return {
    q: text(params.get('q'), 160),
    city: text(params.get('city'), 80),
    format: format === 'in_person' || format === 'online' ? format : '',
    open: params.get('open') === '1',
    sort: params.get('sort') === 'title' ? 'title' : 'next',
    ...context,
  };
}

/** A canonical search URL: defaults and unrelated parameters are omitted. */
export function discoverySearchParams(query: DiscoveryQuery): URLSearchParams {
  if (query.invalidContext) throw new Error('Invalid reading context');
  const params = new URLSearchParams();
  if (query.book !== undefined || query.edition !== undefined || query.from !== undefined || query.to !== undefined) {
    const raw = new URLSearchParams();
    if (query.book !== undefined) raw.set('book', query.book);
    if (query.edition !== undefined) raw.set('edition', query.edition);
    if (query.from !== undefined) raw.set('from', String(query.from));
    if (query.to !== undefined) raw.set('to', String(query.to));
    if (parseDiscoveryQuery(raw).invalidContext) throw new Error('Invalid reading context');
    for (const [key, value] of raw) params.set(key, value);
  }
  const q = text(query.q, 160);
  const city = text(query.city, 80);
  if (q) params.set('q', q);
  if (city) params.set('city', city);
  if (query.format === 'in_person' || query.format === 'online') params.set('format', query.format);
  if (query.open) params.set('open', '1');
  if (query.sort === 'title') params.set('sort', 'title');
  return params;
}

function folded(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en-US');
}

function termsMatch(haystack: string, query: string): boolean {
  const searchable = folded(haystack);
  // Literal terms, not regular expressions or SQL patterns. Every term must
  // match, in any order, so "Plato Tuesday" can span the reading and title.
  return folded(query).split(/\s+/).filter(Boolean).every((term) => searchable.includes(term));
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Filter an already bounded public inventory without changing its objects. */
export function discoverCircles(circles: PublicCircle[], query: DiscoveryQuery): PublicCircle[] {
  if (query.invalidContext) return [];
  // This also rejects callers constructing a partial or stale query by hand.
  try { discoverySearchParams(query); } catch { return []; }
  return circles.filter((circle) => {
    const program = circle.reading_program;
    if (query.book && (!program || program.bookId !== query.book || program.editionId !== query.edition)) return false;
    // A hybrid circle welcomes both in-person and online participation.
    if (query.format === 'in_person' && circle.format === 'online') return false;
    if (query.format === 'online' && circle.format === 'in_person') return false;
    if (query.open && circle.spots_left <= 0) return false;
    if (!termsMatch(`${circle.city || ''} ${circle.region || ''}`, query.city)) return false;
    const reading = circle.reading;
    const book = program ? getReadingWork(program.bookId) : undefined;
    const edition = program ? getReadingEdition(program.bookId, program.editionId) : undefined;
    const session = program?.sessions[circle.week - 1];
    return termsMatch([
      circle.title, circle.description, circle.host_name,
      reading?.title, reading?.author, reading?.selection,
      book?.title, book?.author, edition?.sourceTitle,
      program && session ? readingSessionLabel(program, session) : null,
    ].filter(Boolean).join(' '), query.q);
  }).sort((a, b) => (
    (query.sort === 'next' ? compare(a.next_meeting ?? '9999-12-31', b.next_meeting ?? '9999-12-31') : 0)
    || compare(folded(a.title), folded(b.title))
    || compare(a.id, b.id)
  ));
}
