import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('book_cohorts')
    .select('*, book_cohort_members(id)')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ cohorts: [], error: error.message });

  const cohorts = (data || []).map((c: any) => ({
    ...c,
    member_count: c.book_cohort_members?.length || 0,
    book_cohort_members: undefined,
  }));

  return NextResponse.json({ cohorts });
}

export async function POST(req: NextRequest) {
  try {
    const { bookId, title, description, maxMembers, startDate, memberId, thinkerId } = await req.json();
    if (!bookId || !title || !memberId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    const { data: cohort, error } = await supabaseAdmin.from('book_cohorts').insert({
      book_id: bookId,
      title,
      description: description || null,
      max_members: maxMembers || 8,
      start_date: startDate || new Date().toISOString(),
      thinker_id: thinkerId || 'socrates',
      status: 'forming',
      created_by: memberId,
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Auto-add creator as first member
    await supabaseAdmin.from('book_cohort_members').insert({
      cohort_id: cohort.id,
      member_id: memberId,
    });

    return NextResponse.json({ cohort });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
