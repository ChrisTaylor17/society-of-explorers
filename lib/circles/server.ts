// Server-side helpers for SoE Circles. Circles are book_cohorts rows with
// book_id = CIRCLE_BOOK_ID plus the circle_* columns from
// supabase/migrations/20261027_soe_circles.sql. Until that migration is applied the
// routes report { ready: false } and the UI shows an honest "opening soon" state.
import { createHash } from 'node:crypto';
import { CIRCLE_BOOK_ID, CIRCLE_PATH, getReading } from './path';
import { FORMAT_LABELS, VENUE_LABELS, formatMeeting, firstMeeting, pathWeek, upcomingProgramMeetings, type CircleFormat, type VenueType } from './schedule';
import { parseReadingProgram } from './reading-program';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export const CIRCLE_SELECT =
  'id,title,description,max_members,start_date,status,created_by,created_at,circle_format,circle_city,circle_region,circle_venue_name,circle_venue_type,circle_weekday,circle_time,circle_timezone,circle_hidden,circle_path_id,circle_reading_program';

export type CircleRow = {
  id: string;
  title: string;
  description: string | null;
  max_members: number | null;
  start_date: string | null;
  status: string | null;
  created_by: string | null;
  created_at: string | null;
  circle_format: string | null;
  circle_city: string | null;
  circle_region: string | null;
  circle_venue_name: string | null;
  circle_venue_type: string | null;
  circle_weekday: number | null;
  circle_time: string | null;
  circle_timezone: string | null;
  circle_hidden: boolean | null;
  circle_reading_program?: unknown;
  circle_path_id?: string | null;
};

let schemaCache: { ready: boolean; at: number } | null = null;

export function resetCircleSchemaCache() {
  schemaCache = null;
}

/** True once the circles migration has been applied. Cached per instance. */
export async function circlesSchemaReady(db: Db, now = Date.now()): Promise<boolean> {
  if (schemaCache && now - schemaCache.at < (schemaCache.ready ? 5 * 60_000 : 60_000)) return schemaCache.ready;
  let ready = false;
  try {
    const checks = await Promise.all([
      db.from('book_cohorts').select('id,circle_hidden,circle_weekday,circle_reading_program').limit(1),
      db.from('circle_rsvps').select('id').limit(1),
      db.from('circle_reports').select('id').limit(1),
      db.from('circle_private').select('cohort_id').limit(1),
    ]);
    ready = checks.every((r: { error?: unknown }) => !r?.error);
  } catch {
    ready = false;
  }
  schemaCache = { ready, at: now };
  return ready;
}

export function hashKey(value: string): string {
  return createHash('sha256').update(`soe-circles:${value}`).digest('hex').slice(0, 32);
}

export function toPublicCircle(row: CircleRow, extra: { memberCount: number; hostName: string | null; goingNext?: number }, now: Date = new Date()) {
  const format = (row.circle_format || 'in_person') as CircleFormat;
  const tz = row.circle_timezone || 'UTC';
  const weekday = row.circle_weekday ?? 0;
  const start = (row.start_date || row.created_at || new Date().toISOString()).slice(0, 10);
  const program = row.circle_reading_program == null ? null : parseReadingProgram(row.circle_reading_program);
  if (row.circle_reading_program != null && !program) throw new Error('Invalid Circle reading program');
  if (row.circle_path_id !== undefined && row.circle_path_id !== (program ? 'book-v1' : 'starter-12')) throw new Error('Invalid Circle reading path');
  const programLength = program?.sessions.length ?? CIRCLE_PATH.length;
  const next = upcomingProgramMeetings(start, weekday, tz, programLength, 1, now)[0] ?? null;
  const week = next ? pathWeek(start, weekday, next) : programLength + 1;
  const reading = !program && week <= CIRCLE_PATH.length ? getReading(week) : undefined;
  const max = row.max_members || 8;
  // The starter program has twelve meetings. A stale forming row must not
  // advertise new seats after its final local meeting date has passed.
  const completed = row.status === 'completed' || next === null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    format,
    format_label: FORMAT_LABELS[format] || 'In person',
    city: row.circle_city,
    region: row.circle_region,
    venue_name: format === 'online' ? null : row.circle_venue_name,
    venue_label: VENUE_LABELS[(row.circle_venue_type || 'other_public') as VenueType] || 'Public place',
    meeting_label: formatMeeting(row.circle_weekday, row.circle_time, row.circle_timezone),
    weekday,
    time: row.circle_time,
    timezone: tz,
    start_date: start,
    first_meeting: firstMeeting(start, weekday),
    next_meeting: next,
    week,
    reading: reading ? { week: reading.week, title: reading.title, slug: reading.slug, author: reading.author, selection: reading.selection } : null,
    reading_program: program,
    program_length: programLength,
    member_count: extra.memberCount,
    max_members: max,
    spots_left: completed ? 0 : Math.max(0, max - extra.memberCount),
    status: completed ? 'completed' : row.status || 'forming',
    host_name: extra.hostName || 'An explorer',
    going_next: extra.goingNext ?? null,
  };
}

export type PublicCircle = ReturnType<typeof toPublicCircle>;

/** Display names for host ids (display_name only; nothing else about members leaves the server). */
export async function hostNames(db: Db, ids: string[], strict = false): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const { data, count, error } = await db.from('members').select('id,display_name', strict ? { count: 'exact' } : undefined).in('id', unique);
  // Discovery searches host names, so a partial read must not be mistaken for
  // proof that no host matches. Missing/deleted host rows still use the normal
  // anonymous label; count describes returned matching rows, not requested ids.
  if (strict && (error || !Array.isArray(data) || typeof count !== 'number' || !Number.isSafeInteger(count)
    || count < 0 || count !== data.length || count > unique.length
    || data.some((member: unknown) => {
      if (!member || typeof member !== 'object') return true;
      const row = member as Record<string, unknown>;
      return typeof row.id !== 'string' || !unique.includes(row.id)
        || (row.display_name !== null && typeof row.display_name !== 'string');
    }) || new Set(data.map((member: { id: string }) => member.id)).size !== data.length)) {
    throw new Error('Failed to load circle hosts');
  }
  const out: Record<string, string> = {};
  for (const m of (data || []) as Array<{ id: string; display_name: string | null }>) {
    const name = (m.display_name || '').trim();
    out[m.id] = name && !name.includes('@') ? name.slice(0, 40) : 'An explorer';
  }
  return out;
}

export async function loadCircle(db: Db, id: string): Promise<CircleRow | null> {
  const { data, error } = await db.from('book_cohorts').select(CIRCLE_SELECT).eq('id', id).eq('book_id', CIRCLE_BOOK_ID).maybeSingle();
  if (error || !data || data.circle_hidden) return null;
  return data as CircleRow;
}
