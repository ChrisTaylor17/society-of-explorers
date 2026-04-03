import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const memberId = req.nextUrl.searchParams.get('memberId');
  if (!memberId) return NextResponse.json({ error: 'memberId required' }, { status: 400 });

  const [conversations, highlights, waddles, artifacts, member, progress] = await Promise.all([
    supabaseAdmin.from('salon_messages').select('id', { count: 'exact', head: true }).eq('sender_type', 'member').or(`salon_id.eq.general,salon_id.eq.private-${memberId}`),
    supabaseAdmin.from('book_highlights').select('id', { count: 'exact', head: true }).eq('member_id', memberId),
    supabaseAdmin.from('waddles').select('id', { count: 'exact', head: true }).eq('member_id', memberId),
    supabaseAdmin.from('artifacts').select('id', { count: 'exact', head: true }).eq('member_id', memberId),
    supabaseAdmin.from('members').select('exp_tokens').eq('id', memberId).single(),
    supabaseAdmin.from('reading_progress').select('id, completed', { count: 'exact' }).eq('member_id', memberId),
  ]);

  const booksCompleted = (progress.data || []).filter((p: any) => p.completed).length;

  return NextResponse.json({
    conversations: conversations.count || 0,
    highlights: highlights.count || 0,
    waddles: waddles.count || 0,
    artifacts: artifacts.count || 0,
    exp: member.data?.exp_tokens || 0,
    booksStarted: progress.count || 0,
    booksCompleted,
  });
}
