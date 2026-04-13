import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateSessionSchedule } from '@/lib/salons';
import { emitActivity } from '@/lib/feed/activityFeed';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const TRACKS = ['singularity', 'blockchain', 'consciousness'];

export async function GET(req: NextRequest) {
  const communityId = req.nextUrl.searchParams.get('community_id');
  const status = req.nextUrl.searchParams.get('status') || 'recruiting,active';
  const statuses = status.split(',');

  let query = supabase.from('salons').select('*, members!salons_guide_member_id_fkey(display_name)')
    .in('status', statuses).order('created_at', { ascending: false }).limit(20);

  if (communityId) query = query.eq('community_id', communityId);
  const { data } = await query;

  // Add member counts
  const enriched = await Promise.all((data || []).map(async (s: any) => {
    const { count } = await supabase.from('salon_members').select('*', { count: 'exact', head: true }).eq('salon_id', s.id);
    return { ...s, member_count: count || 0, guide_name: s.members?.display_name };
  }));

  return NextResponse.json({ salons: enriched });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { title, description, community_id, topic_rotation } = await req.json();
  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });

  const { data: salon, error } = await supabase.from('salons').insert({
    title: title.trim(),
    description: description?.trim() || null,
    community_id: community_id || null,
    guide_member_id: (auth.member as any).is_guide ? auth.memberId : null,
    topic_rotation: topic_rotation || TRACKS,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Add creator as guide or member
  await supabase.from('salon_members').insert({
    salon_id: salon.id,
    member_id: auth.memberId,
    role: (auth.member as any).is_guide ? 'guide' : 'member',
  });

  // Generate 35 sessions
  const dates = generateSessionSchedule(new Date(), 7);
  const sessions = dates.map((d, i) => ({
    salon_id: salon.id,
    session_date: d.toISOString().slice(0, 10),
    session_number: i + 1,
    track: TRACKS[Math.floor(i / 5) % TRACKS.length],
    topic: `${TRACKS[Math.floor(i / 5) % TRACKS.length]} — Session ${(i % 5) + 1}`,
    led_by_member_id: auth.memberId, // initially all led by creator
  }));
  await supabase.from('salon_sessions').insert(sessions);

  emitActivity({ communityId: community_id, memberId: auth.memberId, eventType: 'salon_created', title: `New salon: "${title}"`, metadata: { salonId: salon.id } }).catch(() => {});

  return NextResponse.json({ salon });
}
