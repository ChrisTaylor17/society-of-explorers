import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getNextSessionDate, generateGoogleCalendarUrl, generateICSContent, createLiveSession } from '@/lib/live/scheduler';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET() {
  const { data: community } = await supabase.from('communities').select('id').eq('slug', 'society-of-explorers').single();

  const { data: upcoming } = await supabase.from('video_rooms').select('*')
    .eq('community_id', community?.id).eq('room_type', 'live_session')
    .gte('scheduled_for', new Date(Date.now() - 3600000).toISOString())
    .order('scheduled_for', { ascending: true }).limit(1).single();

  const { data: past } = await supabase.from('video_rooms').select('*')
    .eq('community_id', community?.id).eq('room_type', 'live_session').eq('is_live', false)
    .lt('scheduled_for', new Date().toISOString()).order('scheduled_for', { ascending: false }).limit(10);

  const nextDate = getNextSessionDate();
  return NextResponse.json({
    upcoming, past: past || [], nextSessionDate: nextDate.toISOString(),
    calendarLinks: { google: generateGoogleCalendarUrl(nextDate), ics: 'data:text/calendar;charset=utf-8,' + encodeURIComponent(generateICSContent(nextDate)) },
  });
}

export async function POST(req: NextRequest) {
  const { action } = await req.json();
  if (action === 'create_next') { const session = await createLiveSession(); return NextResponse.json({ session }); }
  if (action === 'go_live') {
    const { data: community } = await supabase.from('communities').select('id').eq('slug', 'society-of-explorers').single();
    const { data: session } = await supabase.from('video_rooms').select('*')
      .eq('community_id', community?.id).eq('room_type', 'live_session').eq('is_live', false)
      .gte('scheduled_for', new Date(Date.now() - 3600000).toISOString())
      .order('scheduled_for', { ascending: true }).limit(1).single();
    if (!session) return NextResponse.json({ error: 'No upcoming session' }, { status: 404 });
    await supabase.from('video_rooms').update({ is_live: true, started_at: new Date().toISOString() }).eq('id', session.id);
    return NextResponse.json({ session: { ...session, is_live: true } });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
