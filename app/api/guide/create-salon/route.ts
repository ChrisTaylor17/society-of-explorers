import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { generateSessionSchedule } from '@/lib/salons';
import { emitActivity } from '@/lib/feed/activityFeed';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const TRACKS = ['singularity', 'blockchain', 'consciousness'];

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(auth.member as any).is_guide) return NextResponse.json({ error: 'Must be a Guide' }, { status: 403 });

  const { title, description, community_id, parent_salon_id } = await req.json();
  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });

  const { data: salon, error } = await supabase.from('salons').insert({
    title: title.trim(), description: description?.trim() || null,
    community_id: community_id || null, guide_member_id: auth.memberId,
    parent_salon_id: parent_salon_id || null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Add guide as member
  await supabase.from('salon_members').insert({ salon_id: salon.id, member_id: auth.memberId, role: 'guide' });

  // Generate sessions
  const dates = generateSessionSchedule(new Date(), 7);
  const sessions = dates.map((d, i) => ({
    salon_id: salon.id, session_date: d.toISOString().slice(0, 10), session_number: i + 1,
    track: TRACKS[Math.floor(i / 5) % TRACKS.length],
    topic: `${TRACKS[Math.floor(i / 5) % TRACKS.length]} — Session ${(i % 5) + 1}`,
    led_by_member_id: auth.memberId,
  }));
  await supabase.from('salon_sessions').insert(sessions);

  // Increment salons_led
  const { data: m } = await supabase.from('members').select('salons_led').eq('id', auth.memberId).single();
  await supabase.from('members').update({ salons_led: (m?.salons_led || 0) + 1 }).eq('id', auth.memberId);

  emitActivity({ communityId: community_id, memberId: auth.memberId, eventType: 'salon_created', title: `Guide ${auth.member.display_name} opened: "${title}"`, metadata: { salonId: salon.id, parent_salon_id } }).catch(() => {});

  return NextResponse.json({ salon });
}
