import { DEFAULT_DISCOVERY_QUERY, discoverySearchParams, parseDiscoveryQuery, type DiscoveryQuery } from './discovery';
import { parseReadingProgram } from './reading-program';
import { firstMeeting, pathWeek, TIMEZONES } from './schedule';
import { isUuid } from '@/lib/ids/uuid';
import type { PublicCircle } from './server';

export const DISCOVERY_PAGE_LIMIT = 25;
export const DISCOVERY_CURSOR_LIMIT = 4096;
export type DiscoveryPageRequest = { query: DiscoveryQuery; limit: number; cursor: string | null };
export type PublicDiscoveryCircle = PublicCircle & { phase: 'upcoming' | 'in_progress' };
export type DiscoveryPageReply = { ready: true; circles: PublicDiscoveryCircle[]; page: { limit: number; nextCursor: string | null; asOf: string } };
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const plain = (value: unknown, maximum: number): value is string => typeof value === 'string' && value.length <= maximum
  && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
const nullableText = (value: unknown, maximum: number): value is string | null => value === null || plain(value, maximum);
const integer = (value: unknown, low: number, high: number): value is number => Number.isSafeInteger(value) && Number(value) >= low && Number(value) <= high;
export const isDiscoveryCursor = (value: unknown): value is string => typeof value === 'string' && value.length >= 1
  && value.length <= DISCOVERY_CURSOR_LIMIT && /^[A-Za-z0-9_-]+$/u.test(value);
export function isDiscoveryDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value) && value.slice(0, 4) !== '0000'
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function isDiscoveryTimestamp(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/u.test(value)
    && isDiscoveryDay(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}

/** A malformed public URL never silently chooses one duplicate filter/cursor. */
export function parseDiscoveryPageRequest(params: URLSearchParams): Result<DiscoveryPageRequest> {
  const allowed = ['q', 'city', 'format', 'open', 'sort', 'book', 'edition', 'from', 'to', 'limit', 'cursor'];
  if (Array.from(params.keys()).some(key => !allowed.includes(key) || params.getAll(key).length !== 1)) return { ok: false, error: 'Use a valid Circle search link.' };
  if (params.has('q') && !plain(params.get('q'), 160) || params.has('city') && !plain(params.get('city'), 80)
    || params.has('format') && !['', 'in_person', 'online'].includes(params.get('format')!)
    || params.has('open') && !['0', '1'].includes(params.get('open')!)
    || params.has('sort') && !['next', 'title'].includes(params.get('sort')!)) return { ok: false, error: 'Use valid search filters.' };
  const query = parseDiscoveryQuery(params);
  if (query.invalidContext) return { ok: false, error: 'Use a valid book and source edition selection.' };
  const raw = params.get('limit'), limit = raw === null ? DISCOVERY_PAGE_LIMIT : /^[1-9][0-9]*$/u.test(raw) ? Number(raw) : NaN;
  if (!integer(limit, 1, DISCOVERY_PAGE_LIMIT)) return { ok: false, error: 'Use a valid result page size.' };
  const cursor = params.get('cursor');
  if (cursor !== null && !isDiscoveryCursor(cursor)) return { ok: false, error: 'Use a valid result page link.' };
  return { ok: true, value: { query, limit, cursor } };
}

export function discoveryPageSearchParams(request: DiscoveryPageRequest): URLSearchParams {
  const params = discoverySearchParams(request.query);
  if (request.limit !== DISCOVERY_PAGE_LIMIT) params.set('limit', String(request.limit));
  if (request.cursor !== null) params.set('cursor', request.cursor);
  if (!parseDiscoveryPageRequest(params).ok) throw Error('Invalid Circle discovery page');
  return params;
}
export const defaultDiscoveryPageRequest = (): DiscoveryPageRequest => ({ query: { ...DEFAULT_DISCOVERY_QUERY }, limit: DISCOVERY_PAGE_LIMIT, cursor: null });

/** Whitelist public display fields; raw service rows and authority never pass through. */
export function parsePublicDiscoveryCircle(value: unknown): PublicDiscoveryCircle | null {
  if (!record(value) || !isUuid(value.id) || !plain(value.title, 400) || !value.title.trim()
    || !nullableText(value.description, 4000) || !['in_person', 'online', 'hybrid'].includes(String(value.format))
    || !plain(value.format_label, 80) || !nullableText(value.city, 400) || !nullableText(value.region, 400)
    || !nullableText(value.venue_name, 400) || !plain(value.venue_label, 100) || !plain(value.meeting_label, 200)
    || !integer(value.weekday, 0, 6) || typeof value.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/u.test(value.time)
    || typeof value.timezone !== 'string' || !Object.hasOwn(TIMEZONES, value.timezone)
    || !isDiscoveryDay(value.start_date) || !isDiscoveryDay(value.first_meeting) || !isDiscoveryDay(value.next_meeting)
    || !integer(value.week, 1, 12) || !integer(value.program_length, 1, 12) || value.week > value.program_length
    || !integer(value.member_count, 0, 100000) || !integer(value.max_members, 3, 12)
    || !integer(value.spots_left, 0, 12) || value.spots_left !== Math.max(0, value.max_members - value.member_count)
    || !['forming', 'active'].includes(String(value.status)) || !plain(value.host_name, 40) || !value.host_name.trim()
    || value.host_name.includes('@') || /[\r\n\t]/u.test(value.host_name) || value.going_next !== null
    || !['upcoming', 'in_progress'].includes(String(value.phase))) return null;
  const program = value.reading_program === null ? null : parseReadingProgram(value.reading_program);
  if (value.reading_program !== null && !program || (program ? value.program_length !== program.sessions.length || value.reading !== null : value.program_length !== 12)) return null;
  let reading: PublicCircle['reading'] = null;
  if (value.reading !== null) {
    const item = value.reading;
    if (!record(item) || item.week !== value.week || !plain(item.title, 400) || !plain(item.slug, 160)
      || !plain(item.author, 600) || !plain(item.selection, 2000)) return null;
    reading = { week: value.week, title: item.title, slug: item.slug, author: item.author, selection: item.selection };
  }
  if (!program && !reading || value.format === 'online' && value.venue_name !== null
    || firstMeeting(value.start_date, value.weekday) !== value.first_meeting || pathWeek(value.start_date, value.weekday, value.next_meeting) !== value.week
    || value.next_meeting < value.first_meeting || new Date(value.next_meeting).getUTCDay() !== value.weekday) return null;
  return { id: value.id.toLowerCase(), title: value.title, description: value.description,
    format: value.format as PublicCircle['format'], format_label: value.format_label, city: value.city, region: value.region,
    venue_name: value.venue_name, venue_label: value.venue_label, meeting_label: value.meeting_label,
    weekday: value.weekday, time: value.time, timezone: value.timezone, start_date: value.start_date,
    first_meeting: value.first_meeting, next_meeting: value.next_meeting, week: value.week, reading,
    reading_program: program, program_length: value.program_length, member_count: value.member_count,
    max_members: value.max_members, spots_left: value.spots_left, status: value.status as string,
    host_name: value.host_name, going_next: null, phase: value.phase as PublicDiscoveryCircle['phase'] };
}

export function parseDiscoveryPage(value: unknown, expected?: { limit?: number; cursor?: string | null }): DiscoveryPageReply | null {
  if (!record(value) || value.ready !== true || !Array.isArray(value.circles) || !record(value.page)
    || !integer(value.page.limit, 1, DISCOVERY_PAGE_LIMIT) || value.circles.length > value.page.limit
    || expected?.limit !== undefined && expected.limit !== value.page.limit || !isDiscoveryTimestamp(value.page.asOf)
    || value.page.nextCursor !== null && !isDiscoveryCursor(value.page.nextCursor)
    || value.page.nextCursor !== null && (value.circles.length !== value.page.limit || value.page.nextCursor === expected?.cursor)) return null;
  const circles: PublicDiscoveryCircle[] = [], seen = new Set<string>();
  for (const raw of value.circles) {
    const circle = parsePublicDiscoveryCircle(raw);
    if (!circle || seen.has(circle.id)) return null;
    seen.add(circle.id); circles.push(circle);
  }
  return { ready: true, circles, page: { limit: value.page.limit, nextCursor: value.page.nextCursor as string | null, asOf: value.page.asOf } };
}

export function isDiscoveryRestart(value: unknown): boolean {
  return record(value) && value.restart_required === true;
}
