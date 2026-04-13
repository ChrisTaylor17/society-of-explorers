import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const AXES = ['epistemology', 'ethics', 'metaphysics', 'aesthetics', 'politics'] as const;

export function computePhilosophicalVector(answers: Record<string, any>, questions: any[]): Record<string, number> {
  const vector: Record<string, number> = {};
  for (const axis of AXES) vector[axis] = 0;

  let counts: Record<string, number> = {};
  for (const axis of AXES) counts[axis] = 0;

  for (const q of questions) {
    const answer = answers[q.id];
    if (answer === undefined || answer === null) continue;
    const axis = q.philosophical_axis || 'epistemology';
    if (!(axis in vector)) continue;
    const val = typeof answer === 'number' ? answer : (typeof answer === 'string' ? answer.length % 7 + 1 : 4);
    vector[axis] += val;
    counts[axis]++;
  }

  for (const axis of AXES) {
    vector[axis] = counts[axis] > 0 ? vector[axis] / counts[axis] : 4; // normalize to ~1-7 scale
  }

  return vector;
}

function cosineSimilarity(a: Record<string, number>, b: Record<string, number>): number {
  let dot = 0, magA = 0, magB = 0;
  for (const key of AXES) {
    const va = a[key] || 0, vb = b[key] || 0;
    dot += va * vb;
    magA += va * va;
    magB += vb * vb;
  }
  const mag = Math.sqrt(magA) * Math.sqrt(magB);
  return mag === 0 ? 0 : dot / mag;
}

function findTensionAxes(a: Record<string, number>, b: Record<string, number>): string[] {
  return AXES
    .map(axis => ({ axis, diff: Math.abs((a[axis] || 0) - (b[axis] || 0)) }))
    .sort((x, y) => y.diff - x.diff)
    .filter(x => x.diff > 1.5)
    .slice(0, 3)
    .map(x => x.axis);
}

export async function runMatching(communityId: string, memberId: string): Promise<void> {
  const { data: myProfile } = await supabase
    .from('community_match_profiles')
    .select('philosophical_vector')
    .eq('community_id', communityId)
    .eq('member_id', memberId)
    .single();

  if (!myProfile?.philosophical_vector) return;
  const myVec = myProfile.philosophical_vector as Record<string, number>;

  const { data: others } = await supabase
    .from('community_match_profiles')
    .select('member_id, philosophical_vector')
    .eq('community_id', communityId)
    .neq('member_id', memberId);

  if (!others || others.length === 0) return;

  const scored = others.map(o => {
    const vec = o.philosophical_vector as Record<string, number>;
    return {
      member_id: o.member_id,
      compatibility: cosineSimilarity(myVec, vec),
      tensions: findTensionAxes(myVec, vec),
    };
  });

  // Top 3 compatible
  const topCompatible = [...scored].sort((a, b) => b.compatibility - a.compatibility).slice(0, 3);
  // Top 1 productive tension (lowest compatibility but some overlap)
  const tensionMatch = [...scored].sort((a, b) => a.compatibility - b.compatibility).find(s => s.compatibility > 0.3 && s.tensions.length > 0);

  const matches = [...topCompatible];
  if (tensionMatch && !matches.find(m => m.member_id === tensionMatch.member_id)) {
    matches.push(tensionMatch);
  }

  for (const match of matches) {
    // Check if match already exists
    const { data: existing } = await supabase.from('community_matches')
      .select('id')
      .eq('community_id', communityId)
      .or(`and(member_a.eq.${memberId},member_b.eq.${match.member_id}),and(member_a.eq.${match.member_id},member_b.eq.${memberId})`)
      .single();

    if (!existing) {
      await supabase.from('community_matches').insert({
        community_id: communityId,
        member_a: memberId,
        member_b: match.member_id,
        compatibility_score: Math.round(match.compatibility * 100),
        tension_axes: match.tensions,
      });
    }
  }

  await supabase.from('community_match_profiles')
    .update({ matched_at: new Date().toISOString() })
    .eq('community_id', communityId)
    .eq('member_id', memberId);
}
