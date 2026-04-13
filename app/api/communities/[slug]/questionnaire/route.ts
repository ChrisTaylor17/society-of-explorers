import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { computePhilosophicalVector, runMatching } from '@/lib/matching';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data: community } = await supabase.from('communities').select('id').eq('slug', slug).single();
  if (!community) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data } = await supabase.from('community_questionnaire').select('questions').eq('community_id', community.id).single();
  return NextResponse.json({ questions: data?.questions || [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { memberId, answers } = await req.json();
  if (!memberId || !answers) return NextResponse.json({ error: 'memberId and answers required' }, { status: 400 });

  const { data: community } = await supabase.from('communities').select('id').eq('slug', slug).single();
  if (!community) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: questionnaire } = await supabase.from('community_questionnaire').select('questions').eq('community_id', community.id).single();
  const questions = questionnaire?.questions || [];
  const vector = computePhilosophicalVector(answers, questions);

  await supabase.from('community_match_profiles').upsert({
    community_id: community.id, member_id: memberId, answers, philosophical_vector: vector,
  }, { onConflict: 'community_id,member_id' });

  // Run matching async
  runMatching(community.id, memberId).catch(err => console.error('[matching] error:', err));

  return NextResponse.json({ success: true, vector });
}
