import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { emitActivity } from '@/lib/feed/activityFeed';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const communitySlug = req.nextUrl.searchParams.get('community') || 'society-of-explorers';
  const { data: community } = await supabase.from('communities').select('id').eq('slug', communitySlug).single();
  if (!community) return NextResponse.json({ rooms: [] });

  const { data: rooms } = await supabase.from('video_rooms').select('*')
    .eq('community_id', community.id).eq('is_live', true).order('started_at', { ascending: false });

  return NextResponse.json({ rooms: rooms || [] });
}

export async function POST(req: NextRequest) {
  const { title, roomType, projectId, communitySlug, memberId, thinkers } = await req.json();
  if (!memberId) return NextResponse.json({ error: 'Login required' }, { status: 401 });

  const { data: community } = await supabase.from('communities').select('id').eq('slug', communitySlug || 'society-of-explorers').single();
  const roomName = `soe-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  let dailyRoomUrl = null;
  if (process.env.DAILY_API_KEY) {
    try {
      const res = await fetch('https://api.daily.co/v1/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.DAILY_API_KEY}` },
        body: JSON.stringify({ name: roomName, properties: { max_participants: 8, enable_chat: true, exp: Math.floor(Date.now() / 1000) + 7200 } }),
      });
      const d = await res.json();
      dailyRoomUrl = d.url;
    } catch {}
  }

  const { data: room, error } = await supabase.from('video_rooms').insert({
    community_id: community?.id, created_by: memberId, room_name: roomName,
    daily_room_url: dailyRoomUrl, title: title || 'Council Room', room_type: roomType || 'open',
    project_id: projectId || null, active_thinkers: thinkers || [], is_live: true, started_at: new Date().toISOString(),
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from('room_participants').insert({ room_id: room.id, member_id: memberId });
  emitActivity({ communityId: community?.id, memberId, eventType: 'room_started', title: `${title || 'Council Room'} is live`, metadata: { roomId: room.id } }).catch(() => {});

  return NextResponse.json({ room });
}
