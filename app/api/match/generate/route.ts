import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const SHARED_PRACTICE_PROMPTS = [
  { prompt: 'Which shared question stayed with you, and why?', depth: 1 },
  { prompt: 'What assumption in your answer would you most like to test?', depth: 2 },
  { prompt: 'What would persuade you to see the question differently?', depth: 3 },
];

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  const memberId = auth.memberId;
  const supabase = getSupabaseAdmin();

  // Check eligibility: need 7+ responses
  const { data: member } = await supabase.from('members').select('total_responses, display_name').eq('id', memberId).single();
  if ((member?.total_responses || 0) < 7) {
    return privateJson({ match: null, reason: 'not_enough_responses', needed: 7, current: member?.total_responses || 0 });
  }

  // Find candidates: members who answered same questions in last 14 days
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data: myResponses } = await supabase.from('question_responses')
    .select('question_id').eq('member_id', memberId).gte('created_at', twoWeeksAgo);

  if (!myResponses || myResponses.length < 3) {
    return privateJson({ match: null, reason: 'not_enough_recent_responses' });
  }

  const myQuestionIds = myResponses.map(r => r.question_id);

  // Find other members who answered the same questions
  const { data: candidates } = await supabase.from('question_responses')
    .select('member_id')
    .in('question_id', myQuestionIds)
    .neq('member_id', memberId)
    .gte('created_at', twoWeeksAgo);

  if (!candidates || candidates.length === 0) {
    return privateJson({ match: null, reason: 'not_enough_members' });
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
  const scores = new Map<string, number>();
  for (const candidate of candidates) {
    if (excludeIds.has(candidate.member_id)) continue;
    scores.set(candidate.member_id, (scores.get(candidate.member_id) || 0) + 1);
  }

  if (scores.size === 0) {
    return privateJson({ match: null, reason: 'not_enough_members' });
  }

  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [bestMemberId, overlap] = sorted[0];

  // Get partner name
  const { data: partner } = await supabase.from('members').select('display_name').eq('id', bestMemberId).single();

  // Pick facilitating thinker
  const { data: sharedQ } = await supabase.from('daily_questions')
    .select('thinker_id').in('id', myQuestionIds).limit(1).single();
  const thinkerId = sharedQ?.thinker_id || 'socrates';

  const prompts = SHARED_PRACTICE_PROMPTS;
  const matchReason = 'You both responded to ' + overlap + ' of the same daily questions.';

  const { data: match, error: matchError } = await supabase.from('matched_conversations').insert({
    member_a: memberId, member_b: bestMemberId, thinker_id: thinkerId,
    match_reason: matchReason, prompts, status: 'pending',
  }).select().single();

  if (matchError || !match) {
    return privateJson({ error: 'Failed to create match' }, { status: 500 });
  }

  return privateJson({
    match: { id: match?.id, partner_display_name: partner?.display_name || 'Explorer', thinker_id: thinkerId, prompts, match_reason: matchReason },
  });
}
