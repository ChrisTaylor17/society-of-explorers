import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSalonStats, checkGraduationEligibility, calculateGuideLevel } from '@/lib/salons';
import { emitActivity } from '@/lib/feed/activityFeed';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ salonId: string }> }) {
  const { salonId } = await params;
  const { data: salon } = await supabase.from('salons').select('*').eq('id', salonId).single();
  if (!salon) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: members } = await supabase.from('salon_members')
    .select('*, members(display_name, tier, exp_tokens)').eq('salon_id', salonId);
  const { data: sessions } = await supabase.from('salon_sessions')
    .select('*').eq('salon_id', salonId).order('session_date', { ascending: true });
  const stats = await getSalonStats(salonId);

  let guide = null;
  if (salon.guide_member_id) {
    const { data: g } = await supabase.from('members').select('display_name, guide_level').eq('id', salon.guide_member_id).single();
    guide = g;
  }

  return NextResponse.json({ salon, members: members || [], sessions: sessions || [], stats, guide });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ salonId: string }> }) {
  const { salonId } = await params;
  const body = await req.json();
  const { action } = body;

  if (action === 'join') {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: salon } = await supabase.from('salons').select('status, max_members, title, community_id').eq('id', salonId).single();
    if (!salon || !['recruiting', 'active'].includes(salon.status)) return NextResponse.json({ error: 'Salon not accepting members' }, { status: 400 });

    const { count } = await supabase.from('salon_members').select('*', { count: 'exact', head: true }).eq('salon_id', salonId);
    if ((count || 0) >= salon.max_members) return NextResponse.json({ error: 'Salon full' }, { status: 400 });

    const { data: existing } = await supabase.from('salon_members').select('id').eq('salon_id', salonId).eq('member_id', auth.memberId).single();
    if (existing) return NextResponse.json({ error: 'Already a member' }, { status: 400 });

    await supabase.from('salon_members').insert({ salon_id: salonId, member_id: auth.memberId, role: 'member' });

    if ((count || 0) + 1 >= salon.max_members) {
      await supabase.from('salons').update({ status: 'active', started_at: new Date().toISOString() }).eq('id', salonId);
    }

    emitActivity({ communityId: salon.community_id, memberId: auth.memberId, eventType: 'member_joined', title: `${auth.member.display_name} joined ${salon.title}`, metadata: { salonId } }).catch(() => {});
    return NextResponse.json({ success: true });
  }

  if (action === 'attend') {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { session_id } = body;

    const { data: session } = await supabase.from('salon_sessions').select('attendance').eq('id', session_id).single();
    const attendance = [...(session?.attendance || []), auth.memberId];
    await supabase.from('salon_sessions').update({ attendance }).eq('id', session_id);
    // Increment handled below

    // Manual increment
    const { data: sm } = await supabase.from('salon_members').select('sessions_attended').eq('salon_id', salonId).eq('member_id', auth.memberId).single();
    if (sm) await supabase.from('salon_members').update({ sessions_attended: (sm.sessions_attended || 0) + 1 }).eq('salon_id', salonId).eq('member_id', auth.memberId);

    return NextResponse.json({ success: true });
  }

  if (action === 'complete_session') {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { session_id, transcript_summary, exp_awarded_total } = body;

    await supabase.from('salon_sessions').update({
      status: 'completed', transcript_summary: transcript_summary || null,
      exp_awarded_total: exp_awarded_total || 0,
    }).eq('id', session_id);

    const { data: session } = await supabase.from('salon_sessions').select('led_by_member_id, session_number').eq('id', session_id).single();
    if (session?.led_by_member_id === auth.memberId) {
      const { data: sm } = await supabase.from('salon_members').select('sessions_led').eq('salon_id', salonId).eq('member_id', auth.memberId).single();
      if (sm) await supabase.from('salon_members').update({ sessions_led: (sm.sessions_led || 0) + 1 }).eq('salon_id', salonId).eq('member_id', auth.memberId);
    }

    // Advance week if needed
    const weekNum = session?.session_number ? Math.ceil(session.session_number / 5) : 1;
    await supabase.from('salons').update({ week_number: weekNum, updated_at: new Date().toISOString() }).eq('id', salonId);

    return NextResponse.json({ success: true });
  }

  if (action === 'graduate') {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { member_ids } = body;
    if (!member_ids?.length) return NextResponse.json({ error: 'No members specified' }, { status: 400 });

    const { data: salon } = await supabase.from('salons').select('title, community_id').eq('id', salonId).single();
    const { count: totalSessions } = await supabase.from('salon_sessions').select('*', { count: 'exact', head: true }).eq('salon_id', salonId);

    const results: any[] = [];
    for (const mid of member_ids) {
      const { data: sm } = await supabase.from('salon_members').select('*').eq('salon_id', salonId).eq('member_id', mid).single();
      if (!sm) { results.push({ member_id: mid, graduated: false, reason: 'Not found' }); continue; }

      const eligibility = checkGraduationEligibility(sm.sessions_led, sm.sessions_attended, totalSessions || 35, sm.absences_unexcused);
      if (!eligibility.eligible) { results.push({ member_id: mid, graduated: false, reason: eligibility.reason }); continue; }

      await supabase.from('salon_members').update({ role: 'graduating', graduated_at: new Date().toISOString() }).eq('id', sm.id);

      // Promote to guide
      const { data: completedSalons } = await supabase.from('salon_members').select('id').eq('member_id', mid).eq('role', 'graduating');
      const level = calculateGuideLevel(completedSalons?.length || 1);
      await supabase.from('members').update({ is_guide: true, guide_since: new Date().toISOString(), guide_level: level }).eq('id', mid);

      // Update guide stats
      const { data: guideMember } = await supabase.from('members').select('members_graduated').eq('id', auth.memberId).single();
      await supabase.from('members').update({ members_graduated: (guideMember?.members_graduated || 0) + 1 }).eq('id', auth.memberId);

      emitActivity({ communityId: salon?.community_id, memberId: mid, eventType: 'member_joined', title: `Graduated from ${salon?.title}!`, metadata: { salonId, guide_level: level } }).catch(() => {});
      results.push({ member_id: mid, graduated: true, guide_level: level });
    }

    // Check if all eligible graduated → complete salon
    const { data: remaining } = await supabase.from('salon_members').select('id').eq('salon_id', salonId).eq('role', 'member');
    if (!remaining || remaining.length === 0) {
      await supabase.from('salons').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', salonId);
    }

    return NextResponse.json({ results });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
