import { isUuid } from '../ids/uuid';
import { CIRCLE_BOOK_ID } from '../circles/path';

export const BOOK_SALON_PAGE_SIZE = 50;
export type BookSalonListing = {
  id: string; book_id: string; title: string; description: string | null;
  max_members: number | null; member_count: number; status: string | null;
  thinker_id: string | null; start_date: string | null;
};
export type BookSalonPage = { cohorts: BookSalonListing[]; page: { offset: number; limit: number; total: number; nextOffset: number | null } };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const nullableText = (v: unknown, max: number) => v === null || text(v, max);
const day = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;

export function parseBookSalonOffset(value: string | null): number | null {
  if (value === null) return 0;
  if (!/^(0|[1-9]\d{0,15})$/.test(value)) return null;
  const offset = Number(value);
  return integer(offset) && offset <= Number.MAX_SAFE_INTEGER - BOOK_SALON_PAGE_SIZE ? offset : null;
}

export function parseBookSalonPage(value: unknown, offset: number): BookSalonPage | null {
  if (!record(value) || !Array.isArray(value.cohorts) || value.cohorts.length > BOOK_SALON_PAGE_SIZE || !record(value.page)
    || value.page.offset !== offset || value.page.limit !== BOOK_SALON_PAGE_SIZE || !integer(value.page.total)
    || !(value.page.nextOffset === null || integer(value.page.nextOffset))) return null;
  const expectedNext = offset + value.cohorts.length < value.page.total ? offset + value.cohorts.length : null;
  if (value.page.nextOffset !== expectedNext || (expectedNext !== null && !value.cohorts.length)
    || (value.cohorts.length > 0 && offset + value.cohorts.length > value.page.total)) return null;
  const ids = new Set<string>(); const rows: BookSalonListing[] = [];
  for (const r of value.cohorts) {
    if (!record(r) || !isUuid(r.id) || ids.has(r.id) || !text(r.book_id, 80) || r.book_id === CIRCLE_BOOK_ID
      || !text(r.title, 160) || !nullableText(r.description, 1000) || !(r.max_members === null || (integer(r.max_members) && r.max_members >= 1))
      || !integer(r.member_count) || !nullableText(r.status, 32) || !nullableText(r.thinker_id, 80) || !(r.start_date === null || day(r.start_date))) return null;
    ids.add(r.id); rows.push({ id: r.id, book_id: r.book_id, title: r.title, description: r.description as string | null,
      max_members: r.max_members, member_count: r.member_count, status: r.status as string | null,
      thinker_id: r.thinker_id as string | null, start_date: r.start_date });
  }
  return { cohorts: rows, page: { offset, limit: BOOK_SALON_PAGE_SIZE, total: value.page.total, nextOffset: value.page.nextOffset } };
}

/** The source is public, but only this intentional projection goes to a card.
 * A failed/missing aggregate is unavailable, never a zero-members assertion. */
export function bookSalonListing(value: unknown): BookSalonListing | null {
  if (!record(value) || !isUuid(value.id) || !text(value.book_id, 80) || value.book_id === CIRCLE_BOOK_ID
    || !Array.isArray(value.book_cohort_members) || value.book_cohort_members.length !== 1
    || !record(value.book_cohort_members[0]) || !integer(value.book_cohort_members[0].count)) return null;
  const bounded = (v: unknown, max: number) => typeof v === 'string' ? v.trim().slice(0, max) || null : null;
  const date = typeof value.start_date === 'string' ? value.start_date.slice(0, 10) : null;
  return { id: value.id, book_id: value.book_id, title: bounded(value.title, 160) ?? 'Untitled book salon',
    description: bounded(value.description, 1000), max_members: integer(value.max_members) && value.max_members >= 1 ? value.max_members : null,
    member_count: value.book_cohort_members[0].count, status: bounded(value.status, 32), thinker_id: bounded(value.thinker_id, 80),
    start_date: date !== null && day(date) ? date : null };
}
