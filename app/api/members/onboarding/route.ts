import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const THINKER_IDS = ['socrates', 'plato', 'aurelius', 'nietzsche', 'einstein', 'jobs'];

export async function POST(req: NextRequest) {
  const { memberId, answers } = await req.json();
  if (!memberId || !answers) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  // Store onboarding answers on member profile
  await supabaseAdmin.from('members')
    .update({ onboarding_answers: answers })
    .eq('id', memberId);

  // Seed thinker_memory life_facts for all 6 thinkers
  const lifeFacts: Record<string, string> = {};
  if (answers.building) lifeFacts.current_project = answers.building;
  if (answers.challenge) lifeFacts.biggest_challenge = answers.challenge;
  if (answers.success) lifeFacts.ninety_day_goal = answers.success;
  if (answers.background) lifeFacts.background = answers.background;

  for (const thinkerId of THINKER_IDS) {
    const { data: existing } = await supabaseAdmin
      .from('thinker_memory')
      .select('id, life_facts')
      .eq('member_id', memberId)
      .eq('thinker_id', thinkerId)
      .single();

    if (existing) {
      await supabaseAdmin.from('thinker_memory')
        .update({ life_facts: { ...(existing.life_facts || {}), ...lifeFacts }, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      await supabaseAdmin.from('thinker_memory')
        .insert({ member_id: memberId, thinker_id: thinkerId, summary: '', message_count: 0, life_facts: lifeFacts });
    }
  }

  return NextResponse.json({ success: true });
}
