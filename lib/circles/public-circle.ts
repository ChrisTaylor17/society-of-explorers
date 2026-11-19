// Public Circle projection and type shared by server and native clients.
import { CIRCLE_PATH, getReading } from './path';
import { FORMAT_LABELS, VENUE_LABELS, formatMeeting, firstMeeting, pathWeek, upcomingProgramMeetings, type CircleFormat, type VenueType } from './schedule';
import { parseReadingProgram } from './reading-program';

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
