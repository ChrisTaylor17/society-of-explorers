import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const memberId = auth.memberId;

  // Check eligibility: need 7+ responses
  const { data: member } = await supabase.from('members').select('total_responses, display_name').eq('id', memberId).single();
  if ((member?.total_responses || 0) < 7) {
    return NextResponse.json({ match: null, reason: 'not_enough_responses', needed: 7, current: member?.total_responses || 0 });
  }

  // Find candidates: members who answered same questions in last 14 days
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data: myResponses } = await supabase.from('question_responses')
    .select('question_id, response_text').eq('member_id', memberId).gte('created_at', twoWeeksAgo);

  if (!myResponses || myResponses.length < 3) {
    return NextResponse.json({ match: null, reason: 'not_enough_recent_responses' });
  }

  const myQuestionIds = myResponses.map(r => r.question_id);

  // Find other members who answered the same questions
  const { data: candidates } = await supabase.from('question_responses')
    .select('member_id, question_id, response_text')
    .in('question_id', myQuestionIds)
    .neq('member_id', memberId)
    .gte('created_at', twoWeeksAgo);

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ match: null, reason: 'not_enough_members' });
  }

  // Exclude already matched
  const { data: existingMatches } = await supabase.from('matched_conversations')
    .select('member_a, member_b').or(`member_a.eq.${memberId},member_b.eq.${memberId}`)
    .in('status', ['pending', 'accepted']);

  const excludeIds = new Set<string>();
  excludeIds.add(memberId);
  for (const m of existingMatches || []) {
    excludeIds.add(m.member_a === memberId ? m.member_b : m.member_a);
  }

  // Score candidates by overlap count
  const scores = new Map<string, { overlap: number; responses: string[] }>();
  for (const c of candidates) {
    if (excludeIds.has(c.member_id)) continue;
    const existing = scores.get(c.member_id) || { overlap: 0, responses: [] };
    existing.overlap++;
    existing.responses.push(c.response_text);
    scores.set(c.member_id, existing);
  }

  if (scores.size === 0) {
    return NextResponse.json({ match: null, reason: 'not_enough_members' });
  }

  // Pick best candidate
  const sorted = [...scores.entries()].sort((a, b) => b[1].overlap - a[1].overlap);
  const [bestMemberId, bestData] = sorted[0];

  // Get partner name
  const { data: partner } = await supabase.from('members').select('display_name').eq('id', bestMemberId).single();

  // Pick facilitating thinker
  const { data: sharedQ } = await supabase.from('daily_questions')
    .select('thinker_id').in('id', myQuestionIds).limit(1).single();
  const thinkerId = sharedQ?.thinker_id || 'socrates';

  // Generate prompts
  const THINKER_NAMES: Record<string, string> = { socrates: 'Socrates', plato: 'Plato', aurelius: 'Marcus Aurelius', nietzsche: 'Nietzsche', einstein: 'Einstein', jobs: 'Steve Jobs' };
  let prompts: any[] = [];
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const myRecent = myResponses.slice(-3).map(r => r.response_text).join('\n');
    const theirRecent = bestData.responses.slice(-3).join('\n');

    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 300,
      system: `You are ${THINKER_NAMES[thinkerId] || thinkerId}. Two members have been matched. Generate 3 discussion prompts that escalate in depth. Respond with ONLY a JSON array: [{"prompt":"...","depth":1},{"prompt":"...","depth":2},{"prompt":"...","depth":3}]`,
      messages: [{ role: 'user', content: `Member A recent responses:\n${myRecent}\n\nMember B recent responses:\n${theirRecent}` }],
    });
    const text = res.content.find(b => b.type === 'text')?.text || '';
    try { prompts = JSON.parse(text.replace(/```json\n?|```/g, '').trim()); } catch {}
  } catch {}

  const matchReason = `You both responded to ${bestData.overlap} of the same daily questions.`;

  const { data: match } = await supabase.from('matched_conversations').insert({
    member_a: memberId, member_b: bestMemberId, thinker_id: thinkerId,
    match_reason: matchReason, prompts, status: 'pending',
  }).select().single();

  return NextResponse.json({
    match: { id: match?.id, partner_display_name: partner?.display_name || 'Explorer', thinker_id: thinkerId, prompts, match_reason: matchReason },
  });
}
