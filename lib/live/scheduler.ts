import { safePrivateMeetingUrl } from '@/lib/circles/discussion-reader';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const LIVE_COUNCIL_TYPE = 'live_session';
export const LIVE_SESSION_SELECT = 'id,title,scheduled_for,started_at,ended_at,is_live,room_type';

export function liveCouncilRoomUrl(value: unknown, roomName: unknown): string | null {
  const normalized = safePrivateMeetingUrl(value);
  if (!normalized || typeof roomName !== 'string') return null;
  const url = new URL(normalized);
  if (!/^[a-z0-9-]+\.daily\.co$/.test(url.hostname) || url.port
      || url.pathname !== '/' + roomName || url.search || url.hash) return null;
  return normalized;
}

export async function liveCouncilCommunityId(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data, error } = await supabase.from('communities')
    .select('id').eq('slug', 'society-of-explorers').maybeSingle();
  return !error && typeof data?.id === 'string' ? data.id : null;
}

export function getNextSessionDate(): Date {
  const now = new Date();
  // Get current day/time in ET
  const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const etNow = new Date(etStr);
  const day = etNow.getDay(); // 0=Sun, 3=Wed
  let daysUntilWed = (3 - day + 7) % 7;

  // If it's Wednesday past 9pm ET, push to next week
  if (daysUntilWed === 0 && etNow.getHours() >= 21) daysUntilWed = 7;

  // Build target: next Wednesday 8pm ET
  const target = new Date(etNow);
  target.setDate(target.getDate() + daysUntilWed);
  target.setHours(20, 0, 0, 0);

  // Convert ET back to UTC
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, '0');
  const dateStr = String(target.getDate()).padStart(2, '0');
  // Simpler: April is always EDT (-04:00)
  const offset = (target.getMonth() >= 2 && target.getMonth() <= 10) ? '-04:00' : '-05:00';

  return new Date(`${year}-${month}-${dateStr}T20:00:00${offset}`);
}

export function generateGoogleCalendarUrl(sessionDate: Date): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const start = fmt(sessionDate);
  const end = fmt(new Date(sessionDate.getTime() + 3600000));
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('Society of Explorers — Live Council')}&dates=${start}/${end}&details=${encodeURIComponent('Weekly live session with the Council.\nJoin: https://www.societyofexplorers.com/live')}&location=${encodeURIComponent('https://www.societyofexplorers.com/live')}`;
}

export function generateICSContent(sessionDate: Date): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART:${fmt(sessionDate)}\nDTEND:${fmt(new Date(sessionDate.getTime() + 3600000))}\nRRULE:FREQ=WEEKLY;BYDAY=WE\nSUMMARY:Society of Explorers — Live Council\nURL:https://www.societyofexplorers.com/live\nEND:VEVENT\nEND:VCALENDAR`;
}

export async function createLiveSession() {
  const supabase = getSupabaseAdmin();
  const communityId = await liveCouncilCommunityId(supabase);
  if (!communityId) return null;
  const sessionDate = getNextSessionDate();
  const sessionKey = `live-${sessionDate.toISOString().slice(0, 10)}`;
  const receiptFields = LIVE_SESSION_SELECT + ',room_name';

  const { data: existing, error: lookupError } = await supabase.from('video_rooms')
    .select(receiptFields).eq('room_name', sessionKey).eq('community_id', communityId)
    .eq('room_type', LIVE_COUNCIL_TYPE).maybeSingle();
  if (lookupError) return null;
  if (existing) return existing;

  let dailyRoomUrl = null;
  if (process.env.DAILY_API_KEY) {
    try {
      const res = await fetch('https://api.daily.co/v1/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.DAILY_API_KEY}` },
        body: JSON.stringify({ name: sessionKey, properties: { max_participants: 50, enable_chat: true, enable_screenshare: true, exp: Math.floor(sessionDate.getTime() / 1000) + 7200 } }),
      });
      if (!res.ok) return null;
      dailyRoomUrl = liveCouncilRoomUrl((await res.json()).url, sessionKey);
      if (!dailyRoomUrl) return null;
    } catch {
      return null;
    }
  }

  const { data: room } = await supabase.from('video_rooms').insert({
    community_id: communityId, room_name: sessionKey, daily_room_url: dailyRoomUrl,
    title: `Live Council — ${sessionDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`,
    room_type: LIVE_COUNCIL_TYPE, active_thinkers: ['socrates', 'plato', 'aurelius', 'nietzsche', 'einstein', 'jobs'],
    is_live: false, scheduled_for: sessionDate.toISOString(),
  }).select(receiptFields).single();

  return room;
}
