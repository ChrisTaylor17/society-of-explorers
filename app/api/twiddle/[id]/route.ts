import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Fetch the twiddle
  const { data: twiddle, error } = await supabaseAdmin
    .from('twiddles')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !twiddle) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Fetch thread — all twiddles sharing the same root_id (or this id as root)
  const rootId = twiddle.root_id || id;
  const { data: thread } = await supabaseAdmin
    .from('twiddles')
    .select('*')
    .or(`root_id.eq.${rootId},id.eq.${rootId}`)
    .order('created_at', { ascending: true });

  // Fetch reactions for all thread twiddles
  const threadIds = (thread || []).map((t: any) => t.id);
  const { data: reactions } = await supabaseAdmin
    .from('twiddle_reactions')
    .select('twiddle_id, reaction_type')
    .in('twiddle_id', threadIds.length ? threadIds : ['none']);

  // Build reaction counts per twiddle
  const reactionMap: Record<string, Record<string, number>> = {};
  (reactions || []).forEach((r: any) => {
    if (!reactionMap[r.twiddle_id]) reactionMap[r.twiddle_id] = {};
    reactionMap[r.twiddle_id][r.reaction_type] = (reactionMap[r.twiddle_id][r.reaction_type] || 0) + 1;
  });

  const enriched = (thread || []).map((t: any) => ({
    ...t,
    reaction_counts: reactionMap[t.id] || {},
  }));

  return NextResponse.json({ twiddle: { ...twiddle, reaction_counts: reactionMap[id] || {} }, thread: enriched });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { memberId, ...updates } = body;

  if (!memberId) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

  // Verify ownership
  const { data: m } = await supabaseAdmin.from('members').select('supabase_auth_id').eq('id', memberId).single();
  const { data: twiddle } = await supabaseAdmin.from('twiddles').select('author_id').eq('id', id).single();
  if (!twiddle || twiddle.author_id !== m?.supabase_auth_id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  // Only allow safe fields
  const allowed: Record<string, any> = {};
  if ('is_woven' in updates) allowed.is_woven = updates.is_woven;
  if ('woven_from' in updates) allowed.woven_from = updates.woven_from;
  if ('minted' in updates) allowed.minted = updates.minted;
  if ('nft_token_id' in updates) allowed.nft_token_id = updates.nft_token_id;
  if ('content' in updates) allowed.content = updates.content;

  const { data, error } = await supabaseAdmin.from('twiddles').update(allowed).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ twiddle: data });
}
