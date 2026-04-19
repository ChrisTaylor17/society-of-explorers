import { createClient } from '@supabase/supabase-js';

export interface OtherResponse {
  id: string;
  display_name: string;
  response_text: string;
  created_at: string;
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export async function fetchOtherExplorers(params: {
  questionId: string;
  excludeMemberId: string | null;
  limit?: number;
}): Promise<OtherResponse[]> {
  const { questionId, excludeMemberId, limit = 3 } = params;
  if (!questionId) return [];

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let query = supabase
    .from('question_responses')
    .select('id, response_text, created_at, member_id')
    .eq('question_id', questionId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (excludeMemberId) {
    query = query.neq('member_id', excludeMemberId);
  }

  const { data: rows } = await query;
  if (!rows || rows.length === 0) return [];

  const memberIds = Array.from(new Set(rows.map((r) => r.member_id)));
  const { data: members } = await supabase
    .from('members')
    .select('id, display_name')
    .in('id', memberIds);
  const nameById: Record<string, string> = Object.fromEntries(
    (members || []).map((m: { id: string; display_name: string | null }) => [
      m.id,
      m.display_name || 'Explorer',
    ]),
  );

  const sampled = shuffle(rows).slice(0, limit);
  return sampled.map((r) => ({
    id: r.id,
    display_name: nameById[r.member_id] || 'Explorer',
    response_text: r.response_text,
    created_at: r.created_at,
  }));
}
