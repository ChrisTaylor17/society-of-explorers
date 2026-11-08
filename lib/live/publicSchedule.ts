export type PublicLiveSession = {
  id: string;
  title: string;
  scheduled_for: string | null;
  started_at: string | null;
  ended_at: string | null;
  is_live: boolean;
  room_type: 'live_session';
};

export type PublicLiveSchedule = {
  upcoming: PublicLiveSession | null;
  past: PublicLiveSession[];
  nextSessionDate: string | null;
  calendarLinks: { google: string; ics: string } | null;
};

const publicLiveUrl = 'https://www.societyofexplorers.com/live';
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function timestamp(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

function session(value: unknown): PublicLiveSession | null {
  if (!record(value) || typeof value.id !== 'string'
      || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value.id)
      || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 500
      || typeof value.is_live !== 'boolean' || value.room_type !== 'live_session') return null;
  const scheduled_for = timestamp(value.scheduled_for);
  const started_at = timestamp(value.started_at);
  const ended_at = timestamp(value.ended_at);
  if (scheduled_for === undefined || started_at === undefined || ended_at === undefined) return null;
  return { id: value.id, title: value.title, scheduled_for, started_at, ended_at,
    is_live: value.is_live, room_type: 'live_session' };
}

const calendarTime = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const calendarText = (text: string) => text.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n')
  .replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');

function foldCalendarLine(text: string): string {
  const encoder = new TextEncoder();
  let line = '', bytes = 0, result = '';
  for (const character of text) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) { result += line + '\r\n'; line = ' '; bytes = 1; }
    line += character;
    bytes += size;
  }
  return result + line;
}

function eventCalendar(event: PublicLiveSession) {
  if (!event.scheduled_for || event.is_live) return null;
  const start = calendarTime(new Date(event.scheduled_for));
  const description = 'One scheduled session. End time is not confirmed. Check the session page for updates; calendar copies do not update automatically.';
  const parameters = new URLSearchParams({ action: 'TEMPLATE', text: event.title,
    dates: `${start}/${start}`, details: `${description}\n${publicLiveUrl}`, location: publicLiveUrl });
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Society of Explorers//Sessions//EN',
    'BEGIN:VEVENT', `UID:soe-live-${event.id}@societyofexplorers.com`,
    `DTSTAMP:${calendarTime(new Date())}`, `DTSTART:${start}`,
    `SUMMARY:${calendarText(event.title)}`, `DESCRIPTION:${calendarText(description)}`,
    `URL:${publicLiveUrl}`, 'END:VEVENT', 'END:VCALENDAR'];
  return {
    google: 'https://calendar.google.com/calendar/render?' + parameters.toString(),
    ics: 'data:text/calendar;charset=utf-8,' + encodeURIComponent(lines.map(foldCalendarLine).join('\r\n') + '\r\n'),
  };
}

// Calendar values are derived from the actual selected row. Ignore older synthetic dates or links.
export function readPublicLiveSchedule(value: unknown): PublicLiveSchedule | null {
  if (!record(value) || !Array.isArray(value.past) || value.past.length > 10) return null;
  const upcoming = value.upcoming === null ? null : session(value.upcoming);
  if (value.upcoming !== null && (!upcoming || upcoming.ended_at !== null
      || (!upcoming.is_live && !upcoming.scheduled_for))) return null;
  const past: PublicLiveSession[] = [];
  for (const item of value.past) {
    const parsed = session(item);
    if (!parsed || parsed.is_live || !parsed.ended_at) return null;
    past.push(parsed);
  }
  return { upcoming, past,
    nextSessionDate: upcoming && !upcoming.is_live ? upcoming.scheduled_for : null,
    calendarLinks: upcoming ? eventCalendar(upcoming) : null };
}

export function liveSessionTime(value: string | null): string {
  if (!value) return 'Time to be confirmed';
  return new Date(value).toLocaleString('en-US', {
    timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });
}
