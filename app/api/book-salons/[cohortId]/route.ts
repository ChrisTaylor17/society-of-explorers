import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest, { params }: { params: Promise<{ cohortId: string }> }) {
  const { cohortId } = await params;

  const [cohortRes, membersRes, messagesRes] = await Promise.all([
    supabaseAdmin.from('book_cohorts').select('*').eq('id', cohortId).single(),
    supabaseAdmin.from('book_cohort_members').select('*, members(display_name)').eq('cohort_id', cohortId),
    supabaseAdmin.from('seminar_messages').select('*').eq('cohort_id', cohortId).order('created_at', { ascending: true }).limit(100),
  ]);

  if (!cohortRes.data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    cohort: cohortRes.data,
    members: membersRes.data || [],
    messages: messagesRes.data || [],
  });
}

// Post a message to the cohort discussion
export async function POST(req: NextRequest, { params }: { params: Promise<{ cohortId: string }> }) {
  const { cohortId } = await params;
  const { memberId, content, memberName } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: 'Empty message' }, { status: 400 });

  const { data, error } = await supabaseAdmin.from('seminar_messages').insert({
    cohort_id: cohortId,
    member_id: memberId || null,
    member_name: memberName || 'Explorer',
    content: content.trim(),
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: data });
}
