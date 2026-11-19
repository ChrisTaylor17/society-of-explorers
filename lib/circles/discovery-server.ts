import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { isUuid } from '@/lib/ids/uuid';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { discoverySearchParams, discoverCircles, type DiscoveryQuery } from './discovery';
import { assertDiscoveryUnicodeRuntime, DISCOVERY_CATALOG_HASH, DISCOVERY_SEARCH_CATALOG, toDiscoverySqlQuery } from './discovery-catalog';
import { isDiscoveryDay, isDiscoveryTimestamp, parseDiscoveryPage, parseDiscoveryPageRequest, parsePublicDiscoveryCircle,
  type DiscoveryPageRequest, type PublicDiscoveryCircle } from './discovery-page';
import { CIRCLE_FORMATS, TIMEZONES, VENUE_TYPES, todayIn } from './schedule';
import { toPublicCircle, type CircleRow } from './server';

// This identifies the reviewed generated SQL profile, not a signing secret.
export const DISCOVERY_PROFILE_HASH = '1a5d9e993d454b38d9ccf926de50aed56cf885d813df1a203566dea1839b0ebf';
type After = { nextMeeting: string; title: string; id: string };
type Cursor = { version: 1; queryHash: string; catalogHash: string; profileHash: string; calendarKey: string; after: After };
const hash = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]): boolean => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const integer = (value: unknown, low: number, high: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= low && value <= high;
const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const plain = (value: unknown, maximum: number): value is string => typeof value === 'string' && value.length <= maximum
  && !/[\u0000-\u001f\u007f]/u.test(value)
  && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
const nullableText = (value: unknown, maximum: number): value is string | null => value === null || typeof value === 'string'
  && value.length <= maximum && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
const unavailable = (): Response => privateJson({ ready: true, circles: [], error: 'Failed to load circles' }, { status: 503 });
const invalid = (): Response => privateJson({ ready: true, circles: [], error: 'Use a valid Circle search link.' }, { status: 400 });
const restart = (): Response => privateJson({ ready: true, circles: [], restart_required: true,
  error: 'Circle search context changed. Restart this search for current results.' }, { status: 409 });

function queryHash(request: DiscoveryPageRequest): string {
  return hash(JSON.stringify({ version: 1, filters: discoverySearchParams(request.query).toString(), limit: request.limit }));
}
function afterValue(value: unknown): After | null {
  if (!record(value) || !exact(value, ['nextMeeting', 'title', 'id']) || !isDiscoveryDay(value.nextMeeting)
    || !plain(value.title, 400) || !value.title.trim() || !isUuid(value.id) || value.id !== value.id.toLowerCase()) return null;
  return { nextMeeting: value.nextMeeting, title: value.title, id: value.id };
}
function decodeCursor(value: string): Cursor | null {
  try {
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.toString('base64url') !== value) return null;
    // Preserve a leading BOM so JSON parsing rejects noncanonical cursor bytes.
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    const parsed: unknown = JSON.parse(text);
    if (!record(parsed) || !exact(parsed, ['version', 'queryHash', 'catalogHash', 'profileHash', 'calendarKey', 'after'])
      || parsed.version !== 1 || !digest(parsed.queryHash) || !digest(parsed.catalogHash) || !digest(parsed.profileHash) || !digest(parsed.calendarKey)) return null;
    const after = afterValue(parsed.after);
    if (!after) return null;
    const cursor: Cursor = { version: 1, queryHash: parsed.queryHash, catalogHash: parsed.catalogHash,
      profileHash: parsed.profileHash, calendarKey: parsed.calendarKey, after };
    return JSON.stringify(cursor) === text ? cursor : null;
  } catch { return null; }
}
function encodeCursor(request: DiscoveryPageRequest, calendarKey: string, after: After): string {
  return Buffer.from(JSON.stringify({ version: 1, queryHash: queryHash(request), catalogHash: DISCOVERY_CATALOG_HASH,
    profileHash: DISCOVERY_PROFILE_HASH, calendarKey, after }), 'utf8').toString('base64url');
}
function folded(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en-US');
}
const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
function compareAfter(circle: PublicDiscoveryCircle, after: After, query: DiscoveryQuery): number {
  return (query.sort === 'next' ? compare(circle.next_meeting!, after.nextMeeting) : 0)
    || compare(folded(circle.title), folded(after.title)) || compare(circle.id, after.id);
}

function projectItem(value: unknown, asOf: Date): PublicDiscoveryCircle | null {
  if (!record(value) || !record(value.circle) || !integer(value.memberCount, 0, 100000)
    || !plain(value.hostName, 40) || !value.hostName.trim() || value.hostName.includes('@')
    || !isDiscoveryDay(value.firstMeeting) || !isDiscoveryDay(value.nextMeeting)
    || !integer(value.week, 1, 12) || !integer(value.programLength, 1, 12)
    || !['upcoming', 'in_progress'].includes(String(value.phase))) return null;
  const c = value.circle;
  if (!isUuid(c.id) || !plain(c.title, 400) || !c.title.trim() || !nullableText(c.description, 4000)
    || !integer(c.max_members, 3, 12) || !isDiscoveryDay(c.start_date)
    || !['forming', 'active'].includes(String(c.status)) || !CIRCLE_FORMATS.includes(c.circle_format as never)
    || !['circle_city', 'circle_region', 'circle_venue_name'].every(key => nullableText(c[key], 400))
    || !VENUE_TYPES.includes(c.circle_venue_type as never) || !integer(c.circle_weekday, 0, 6)
    || typeof c.circle_time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/u.test(c.circle_time)
    || typeof c.circle_timezone !== 'string' || !Object.hasOwn(TIMEZONES, c.circle_timezone)
    || !Object.hasOwn(c, 'circle_reading_program') || !['starter-12', 'book-v1'].includes(String(c.circle_path_id))) return null;
  // These internal defaults are fixed authority omissions, never guessed
  // calendar/configuration values. No creator identifier reaches the projector.
  const row: CircleRow = { id: c.id.toLowerCase(), title: c.title, description: c.description,
    max_members: c.max_members, start_date: c.start_date, status: c.status as string,
    created_by: null, created_at: null, circle_format: c.circle_format as string,
    circle_city: c.circle_city as string | null, circle_region: c.circle_region as string | null,
    circle_venue_name: c.circle_venue_name as string | null, circle_venue_type: c.circle_venue_type as string,
    circle_weekday: c.circle_weekday, circle_time: c.circle_time, circle_timezone: c.circle_timezone,
    circle_hidden: false, circle_path_id: c.circle_path_id as string, circle_reading_program: c.circle_reading_program };
  const circle = toPublicCircle(row, { memberCount: value.memberCount, hostName: value.hostName }, asOf);
  const phase = circle.first_meeting > todayIn(circle.timezone, asOf) ? 'upcoming' : 'in_progress';
  if (circle.status === 'completed' || circle.next_meeting !== value.nextMeeting || circle.first_meeting !== value.firstMeeting
    || circle.week !== value.week || circle.program_length !== value.programLength || phase !== value.phase) return null;
  return parsePublicDiscoveryCircle({ ...circle, phase });
}

/** One current service-RPC statement supplies eligibility, matching and seats.
 * Public cursors bind consistency; they confer no identity or Circle authority. */
export async function discoverPublicCircles(req: NextRequest): Promise<Response> {
  const parsed = parseDiscoveryPageRequest((req.nextUrl ?? new URL(req.url)).searchParams);
  if (!parsed.ok) return invalid();
  const request = parsed.value;
  try {
    assertDiscoveryUnicodeRuntime();
    const cursor = request.cursor === null ? null : decodeCursor(request.cursor);
    if (request.cursor !== null && !cursor || cursor && cursor.queryHash !== queryHash(request)) return invalid();
    if (cursor && (cursor.catalogHash !== DISCOVERY_CATALOG_HASH || cursor.profileHash !== DISCOVERY_PROFILE_HASH)) return restart();
    const { data, error } = await getSupabaseAdmin().rpc('soe_circle_discovery_search', {
      p_query: toDiscoverySqlQuery(request.query), p_catalog: DISCOVERY_SEARCH_CATALOG,
      p_after: cursor?.after ?? null, p_calendar_key: cursor?.calendarKey ?? null, p_limit: request.limit,
    });
    if (error) {
      const code = record(error) ? error.code : null;
      if (code === 'PT409') return restart();
      if (code === 'PT400') return invalid();
      if (['PGRST202', '42883', '42P01', '42703'].includes(String(code))) return privateJson({ ready: false, circles: [] });
      return unavailable();
    }
    if (!record(data) || !isDiscoveryTimestamp(data.asOf) || !digest(data.calendarKey) || data.limit !== request.limit
      || !Array.isArray(data.items) || data.items.length > request.limit) return unavailable();
    const asOf = new Date(data.asOf);
    const calendarKey = hash(JSON.stringify(Object.keys(TIMEZONES).map(zone => [zone, todayIn(zone, asOf)])));
    if (calendarKey !== data.calendarKey || cursor && cursor.calendarKey !== data.calendarKey) return unavailable();
    const circles: PublicDiscoveryCircle[] = [];
    for (const item of data.items) {
      const circle = projectItem(item, asOf);
      if (!circle || cursor && compareAfter(circle, cursor.after, request.query) <= 0) return unavailable();
      circles.push(circle);
    }
    // Check the SQL public-search/sort contract independently on the returned
    // page. This cannot prove missing rows; the actual SQL tests cover inventory.
    const matched = discoverCircles(circles, request.query);
    if (matched.length !== circles.length || matched.some((circle, index) => circle.id !== circles[index].id)) return unavailable();
    const next = data.next === null ? null : afterValue(data.next);
    if (data.next !== null && !next) return unavailable();
    if (next && (circles.length !== request.limit || next.id !== circles.at(-1)?.id
      || next.title !== circles.at(-1)?.title || next.nextMeeting !== circles.at(-1)?.next_meeting)) return unavailable();
    const value = parseDiscoveryPage({ ready: true, circles,
      page: { limit: request.limit, nextCursor: next ? encodeCursor(request, data.calendarKey, next) : null, asOf: data.asOf } }, request);
    return value ? privateJson(value) : unavailable();
  } catch { return unavailable(); }
}
