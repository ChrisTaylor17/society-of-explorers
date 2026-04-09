import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export function getNextSessionDate(): Date {
  const now = new Date();
  const day = now.getUTCDay();
  let daysUntilWed = (3 - day + 7) % 7;
  if (daysUntilWed === 0 && now.getUTCHours() >= 24) daysUntilWed = 7; // past Wednesday
  const nextWed = new Date(now);
  nextWed.setUTCDate(nextWed.getUTCDate() + daysUntilWed);
  // 8pm ET = midnight UTC (EDT, UTC-4)
  nextWed.setUTCHours(0, 0, 0, 0);
  return nextWed;
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

export async function createLiveSession(): Promise<any> {
  const sessionDate = getNextSessionDate();
  const sessionKey = `live-${sessionDate.toISOString().slice(0, 10)}`;

  const { data: existing } = await supabase.from('video_rooms').select('id').eq('room_name', sessionKey).single();
  if (existing) return existing;

  let dailyRoomUrl = null;
  if (process.env.DAILY_API_KEY) {
    try {
      const res = await fetch('https://api.daily.co/v1/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.DAILY_API_KEY}` },
        body: JSON.stringify({ name: sessionKey, properties: { max_participants: 50, enable_chat: true, enable_screenshare: true, exp: Math.floor(sessionDate.getTime() / 1000) + 7200 } }),
      });
      const d = await res.json();
      dailyRoomUrl = d.url;
    } catch {}
  }

  const { data: community } = await supabase.from('communities').select('id').eq('slug', 'society-of-explorers').single();

  const { data: room } = await supabase.from('video_rooms').insert({
    community_id: community?.id, room_name: sessionKey, daily_room_url: dailyRoomUrl,
    title: `Live Council — ${sessionDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`,
    room_type: 'live_session', active_thinkers: ['socrates', 'plato', 'aurelius', 'nietzsche', 'einstein', 'jobs'],
    is_live: false, scheduled_for: sessionDate.toISOString(),
  }).select().single();

  return room;
}

export async function generateSessionSummary(roomId: string): Promise<any> {
  const { data: transcripts } = await supabase.from('room_transcripts')
    .select('speaker_name, content').eq('room_id', roomId).order('created_at', { ascending: true });

  if (!transcripts || transcripts.length === 0) return null;

  const transcript = transcripts.map(t => `${t.speaker_name}: ${t.content}`).join('\n');

  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514', max_tokens: 500,
    system: 'Summarize this live council session. Return JSON: {"title":"5 word theme","summary":"3-4 sentences","key_moments":[{"speaker":"name","insight":"one sentence"}],"question_of_the_week":"most provocative question"}',
    messages: [{ role: 'user', content: `TRANSCRIPT:\n${transcript.slice(0, 8000)}` }],
  });

  const text = response.content.find(b => b.type === 'text')?.text || '';
  let parsed: any;
  try { parsed = JSON.parse(text.replace(/```json\n?|```/g, '').trim()); }
  catch { const m = text.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : { title: 'Live Council', summary: '' }; }

  await supabase.from('video_rooms').update({ metadata: { summary: parsed } }).eq('id', roomId);
  return parsed;
}
