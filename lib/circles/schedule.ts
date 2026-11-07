// Pure helpers for SoE Circles: input validation, meeting times and RSVP dates.
// No I/O here, so it is easy to test.
import { parseReadingProgram, type ReadingProgram } from './reading-program';

export const CIRCLE_FORMATS = ['in_person', 'online', 'hybrid'] as const;
export type CircleFormat = (typeof CIRCLE_FORMATS)[number];

// Public places only. Homes are deliberately not an option (see /circles/norms).
export const VENUE_TYPES = ['library', 'cafe', 'community_center', 'campus', 'place_of_worship', 'other_public', 'online'] as const;
export type VenueType = (typeof VENUE_TYPES)[number];

export const VENUE_LABELS: Record<VenueType, string> = {
  library: 'Public library',
  cafe: 'Café',
  community_center: 'Community center',
  campus: 'Campus',
  place_of_worship: 'Place of worship (public room)',
  other_public: 'Other public place',
  online: 'Online',
};

export const FORMAT_LABELS: Record<CircleFormat, string> = {
  in_person: 'In person',
  online: 'Online',
  hybrid: 'In person + online',
};

export const TIMEZONES: Record<string, string> = {
  'America/New_York': 'ET',
  'America/Chicago': 'CT',
  'America/Denver': 'MT',
  'America/Phoenix': 'MST',
  'America/Los_Angeles': 'PT',
  'America/Anchorage': 'AKT',
  'Pacific/Honolulu': 'HT',
  'Europe/London': 'UK time',
  UTC: 'UTC',
};

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const CIRCLE_MIN_MEMBERS = 3;
export const CIRCLE_MAX_MEMBERS = 12;

export interface CircleInput {
  title: string;
  description: string | null;
  format: CircleFormat;
  city: string | null;
  region: string | null;
  venueName: string | null;
  venueType: VenueType;
  weekday: number;
  time: string; // HH:MM, 24h
  timezone: string;
  startDate: string; // YYYY-MM-DD
  maxMembers: number;
  onlineUrl: string | null;
  readingProgram?: ReadingProgram;
  admissionMode?: 'open' | 'host_approval';
}

type Result = { ok: true; value: CircleInput } | { ok: false; error: string };

function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today's date (YYYY-MM-DD) in the given IANA zone. */
export function todayIn(timezone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function parseDay(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || isoDay(d) !== s ? null : d;
}

function addDays(s: string, n: number): string {
  const d = parseDay(s)!;
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
}

export function safeHttpsUrl(v: unknown): string | null {
  const s = text(v, 300);
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' || !u.hostname.includes('.') || u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function validateCircleInput(body: Record<string, unknown>, now: Date = new Date()): Result {
  const title = text(body.title, 120);
  if (!title || title.length < 4) return { ok: false, error: 'Give the circle a name (at least 4 characters).' };

  const format = body.format as CircleFormat;
  if (!CIRCLE_FORMATS.includes(format)) return { ok: false, error: 'Choose in person, online, or both.' };

  const venueType = (format === 'online' ? 'online' : body.venueType) as VenueType;
  if (!VENUE_TYPES.includes(venueType) || (format !== 'online' && venueType === 'online')) {
    return { ok: false, error: 'Choose a public meeting place.' };
  }

  const city = text(body.city, 80);
  const venueName = text(body.venueName, 120);
  if (format !== 'online' && (!city || !venueName)) return { ok: false, error: 'In-person circles need a city and a public venue.' };

  const onlineUrl = safeHttpsUrl(body.onlineUrl);
  if (format !== 'in_person' && !onlineUrl) return { ok: false, error: 'Online circles need an https video link (shared only with members).' };

  const weekday = typeof body.weekday === 'number' ? body.weekday : Number(body.weekday);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return { ok: false, error: 'Choose a meeting day.' };

  const time = typeof body.time === 'string' ? body.time.trim() : '';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { ok: false, error: 'Choose a meeting time.' };

  const timezone = typeof body.timezone === 'string' && body.timezone in TIMEZONES ? body.timezone : null;
  if (!timezone) return { ok: false, error: 'Choose a time zone.' };

  const startDate = typeof body.startDate === 'string' ? body.startDate : '';
  const today = todayIn(timezone, now);
  if (!parseDay(startDate) || startDate < today || startDate > addDays(today, 180)) {
    return { ok: false, error: 'Start date must be between today and six months from now.' };
  }

  const rawMax = typeof body.maxMembers === 'number' ? body.maxMembers : Number(body.maxMembers);
  const maxMembers = Number.isFinite(rawMax) ? Math.max(CIRCLE_MIN_MEMBERS, Math.min(CIRCLE_MAX_MEMBERS, Math.round(rawMax))) : 8;
  const hasProgram = Object.hasOwn(body, 'readingProgram');
  const hasAdmission = Object.hasOwn(body, 'admissionMode');
  if (hasAdmission && body.admissionMode !== 'open' && body.admissionMode !== 'host_approval') {
    return { ok: false, error: 'Choose open membership or host-approved invitations.' };
  }
  const readingProgram = hasProgram ? parseReadingProgram(body.readingProgram) : null;
  if (hasProgram && !readingProgram) return { ok: false, error: 'Choose a supported source edition and valid reading positions.' };

  return {
    ok: true,
    value: {
      title,
      description: text(body.description, 600),
      format,
      city: format === 'online' ? text(body.city, 80) : city,
      region: text(body.region, 40),
      venueName: format === 'online' ? null : venueName,
      venueType,
      weekday,
      time,
      timezone,
      startDate,
      maxMembers,
      onlineUrl: format === 'in_person' ? null : onlineUrl,
      ...(readingProgram ? { readingProgram } : {}),
      ...(hasAdmission ? { admissionMode: body.admissionMode as 'open' | 'host_approval' } : {}),
    },
  };
}

/** "Tuesdays · 7:00 PM ET" */
export function formatMeeting(weekday: number | null | undefined, time: string | null | undefined, timezone: string | null | undefined): string {
  if (weekday == null || !time) return 'Time to be set';
  const [h, m] = time.split(':').map(Number);
  const hour12 = ((h + 11) % 12) + 1;
  const label = timezone && TIMEZONES[timezone] ? ` ${TIMEZONES[timezone]}` : '';
  return `${WEEKDAYS[weekday]}s · ${hour12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}${label}`;
}

/** First date on or after `from` that falls on `weekday`. */
export function onOrAfter(from: string, weekday: number): string {
  const d = parseDay(from);
  if (!d) return from;
  const diff = (weekday - d.getUTCDay() + 7) % 7;
  return addDays(from, diff);
}

/** The first meeting date of a circle. */
export function firstMeeting(startDate: string, weekday: number): string {
  return onOrAfter(startDate.slice(0, 10), weekday);
}

/** Next `count` meeting dates, from today (in the circle's zone) or the first meeting, whichever is later. */
export function upcomingMeetings(startDate: string, weekday: number, timezone: string, count = 4, now: Date = new Date()): string[] {
  const first = firstMeeting(startDate, weekday);
  const today = todayIn(timezone in TIMEZONES ? timezone : 'UTC', now);
  const from = first > today ? first : onOrAfter(today, weekday);
  return Array.from({ length: count }, (_, i) => addDays(from, i * 7));
}

/** Upcoming dates within this finite program, never an invented later week. */
export function upcomingProgramMeetings(startDate: string, weekday: number, timezone: string, programLength: number, count = 4, now: Date = new Date()): string[] {
  if (!parseDay(startDate.slice(0, 10)) || !Number.isInteger(programLength) || programLength < 1 || programLength > 12) return [];
  const first = firstMeeting(startDate, weekday);
  const today = todayIn(timezone in TIMEZONES ? timezone : 'UTC', now);
  return Array.from({ length: programLength }, (_, i) => addDays(first, i * 7)).filter(day => day >= today).slice(0, count);
}

/** Week number on the 12-week path for a meeting date (1-based). Values above 12 mean the path is finished. */
export function pathWeek(startDate: string, weekday: number, meetingDate: string): number {
  const first = parseDay(firstMeeting(startDate, weekday));
  const d = parseDay(meetingDate);
  if (!first || !d) return 1;
  return Math.max(1, Math.floor((d.getTime() - first.getTime()) / (7 * 86_400_000)) + 1);
}

export function formatDay(day: string): string {
  const d = parseDay(day);
  if (!d) return day;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
