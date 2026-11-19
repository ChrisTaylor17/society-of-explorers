import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type ReadingProgressRow = {
  completed: boolean | null;
};

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  const supabaseAdmin = getSupabaseAdmin();
  const memberId = auth.memberId;
  const [conversations, highlights, waddles, artifacts, member, progress] = await Promise.all([
    supabaseAdmin
      .from('salon_messages')
      .select('id', { count: 'exact', head: true })
      .eq('sender_type', 'member')
      .or(`salon_id.eq.general,salon_id.eq.private-${memberId}`),
    supabaseAdmin.from('book_highlights').select('id', { count: 'exact', head: true }).eq('member_id', memberId),
    supabaseAdmin.from('waddles').select('id', { count: 'exact', head: true }).eq('member_id', memberId),
    supabaseAdmin.from('artifacts').select('id', { count: 'exact', head: true }).eq('member_id', memberId),
    supabaseAdmin.from('members').select('exp_tokens').eq('id', memberId).single(),
    supabaseAdmin.from('reading_progress').select('id, completed', { count: 'exact' }).eq('member_id', memberId),
  ]);

  const progressRows = (progress.data || []) as ReadingProgressRow[];
  const booksCompleted = progressRows.filter((row) => row.completed).length;

  return privateJson({
    conversations: conversations.count || 0,
    highlights: highlights.count || 0,
    waddles: waddles.count || 0,
    artifacts: artifacts.count || 0,
    exp: member.data?.exp_tokens || 0,
    booksStarted: progress.count || 0,
    booksCompleted,
  });
}
