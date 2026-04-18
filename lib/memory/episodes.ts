import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function writeEpisodes(params: {
  memberId: string;
  thinkerId: string;
  sessionId: string;
  userContent: string;
  assistantContent: string;
  source?: string;
}): Promise<{ userEpisodeId: string | null; assistantEpisodeId: string | null }> {
  const { memberId, thinkerId, sessionId, userContent, assistantContent, source = 'practice' } = params;

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
    console.error('writeEpisodes failed:', error);
    return { userEpisodeId: null, assistantEpisodeId: null };
  }

  return {
    userEpisodeId: data.find(r => r.role === 'user')?.id ?? null,
    assistantEpisodeId: data.find(r => r.role === 'assistant')?.id ?? null,
  };
}
