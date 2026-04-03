import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { cohortId, memberId } = await req.json();
    if (!cohortId || !memberId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    // Check cohort exists and has room
    const { data: cohort } = await supabaseAdmin.from('book_cohorts').select('id, max_members, status').eq('id', cohortId).single();
    if (!cohort) return NextResponse.json({ error: 'Cohort not found' }, { status: 404 });
    if (cohort.status === 'completed') return NextResponse.json({ error: 'Cohort is completed' }, { status: 400 });

    const { count } = await supabaseAdmin.from('book_cohort_members').select('id', { count: 'exact', head: true }).eq('cohort_id', cohortId);
    if ((count || 0) >= cohort.max_members) return NextResponse.json({ error: 'Cohort is full' }, { status: 400 });

    // Check not already a member
    const { data: existing } = await supabaseAdmin.from('book_cohort_members').select('id').eq('cohort_id', cohortId).eq('member_id', memberId).single();
    if (existing) return NextResponse.json({ error: 'Already a member' }, { status: 400 });

    const { error } = await supabaseAdmin.from('book_cohort_members').insert({ cohort_id: cohortId, member_id: memberId });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ joined: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
