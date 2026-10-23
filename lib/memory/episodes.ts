import { getSupabaseAdmin } from '@/lib/supabase/admin';

function reportEpisodeWriteFailure() {
  console.warn('[memory/episodes] write failed');
}

export async function writeEpisodes(params: {
  memberId: string;
  thinkerId: string;
  sessionId: string;
  userContent: string;
  assistantContent: string;
  source?: string;
}): Promise<{ userEpisodeId: string | null; assistantEpisodeId: string | null }> {
  const { memberId, thinkerId, sessionId, userContent, assistantContent, source = 'practice' } = params;

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('user_episodes')
    .insert([
      { member_id: memberId, thinker_id: thinkerId, role: 'user',
        content: userContent, session_id: sessionId, source },
      { member_id: memberId, thinker_id: thinkerId, role: 'assistant',
        content: assistantContent, session_id: sessionId, source },
    ])
    .select('id, role');

  if (error || !data) {
    reportEpisodeWriteFailure();
    return { userEpisodeId: null, assistantEpisodeId: null };
  }

  return {
    userEpisodeId: data.find(r => r.role === 'user')?.id ?? null,
    assistantEpisodeId: data.find(r => r.role === 'assistant')?.id ?? null,
  };
}
