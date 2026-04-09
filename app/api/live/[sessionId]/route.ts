import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateSessionSummary } from '@/lib/live/scheduler';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const { action, memberId } = await req.json();

  if (action === 'join') {
    await supabase.from('room_participants').upsert(
      { room_id: sessionId, member_id: memberId, joined_at: new Date().toISOString() },
      { onConflict: 'room_id,member_id' }
    );
    const { data: room } = await supabase.from('video_rooms').select('daily_room_url').eq('id', sessionId).single();
    return NextResponse.json({ success: true, dailyUrl: room?.daily_room_url });
  }
  if (action === 'end') {
    await supabase.from('video_rooms').update({ is_live: false, ended_at: new Date().toISOString() }).eq('id', sessionId);
    generateSessionSummary(sessionId).catch(console.error);
    return NextResponse.json({ success: true });
  }
  if (action === 'summarize') {
    const summary = await generateSessionSummary(sessionId);
    return NextResponse.json({ summary });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
