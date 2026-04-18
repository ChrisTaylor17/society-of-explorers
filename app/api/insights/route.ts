import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const memberId = auth.memberId;

  // Semantic facts — active only, ordered for grouping
  const { data: factRows } = await supabaseAdmin
    .from('user_semantic_memory')
    .select('id, category, key, value, confidence, created_at, source_episode_id')
    .eq('member_id', memberId)
    .is('valid_until', null)
    .order('confidence', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200);

  // Episodes — last 20 rows, then group into threads by session_id
  const { data: episodeRows } = await supabaseAdmin
    .from('user_episodes')
    .select('id, thinker_id, role, content, created_at, source, session_id')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(30);

  // Group by session_id, preserving newest-first order (first encounter = newest)
  const threadsMap = new Map<string, any>();
  for (const ep of episodeRows || []) {
    const key = ep.session_id || `solo_${ep.id}`;
    if (!threadsMap.has(key)) {
      threadsMap.set(key, {
        session_id: ep.session_id,
        thinker_id: ep.thinker_id,
        source: ep.source,
        created_at: ep.created_at,
        user: null,
        assistant: null,
      });
    }
    const thread = threadsMap.get(key);
    if (ep.role === 'user') thread.user = { content: ep.content, created_at: ep.created_at };
    else if (ep.role === 'assistant') thread.assistant = { content: ep.content, created_at: ep.created_at };
    // Use the earliest/user timestamp as the thread timestamp when available
    if (ep.role === 'user') thread.created_at = ep.created_at;
  }

  const threads = Array.from(threadsMap.values())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8);

  return NextResponse.json({
    member: { id: auth.member.id, display_name: auth.member.display_name },
    semanticFacts: factRows || [],
    threads,
  });
}
