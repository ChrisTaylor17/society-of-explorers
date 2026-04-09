import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const body = await req.json();
  const { action, memberId, content, speakerName } = body;

  if (action === 'join') {
    await supabase.from('room_participants').upsert({ room_id: roomId, member_id: memberId, joined_at: new Date().toISOString() }, { onConflict: 'room_id,member_id' });
    return NextResponse.json({ success: true });
  }
  if (action === 'leave') {
    await supabase.from('room_participants').update({ left_at: new Date().toISOString() }).eq('room_id', roomId).eq('member_id', memberId);
    return NextResponse.json({ success: true });
  }
  if (action === 'end') {
    await supabase.from('video_rooms').update({ is_live: false, ended_at: new Date().toISOString() }).eq('id', roomId);
    return NextResponse.json({ success: true });
  }
  if (action === 'transcript') {
    await supabase.from('room_transcripts').insert({ room_id: roomId, member_id: memberId || null, speaker_name: speakerName || 'Unknown', content });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
