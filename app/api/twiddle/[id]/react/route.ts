import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const VALID_REACTIONS = ['illuminate', 'challenge', 'extend', 'question', 'mint_worthy'];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { reaction_type, memberId } = await req.json();

  if (!reaction_type || !VALID_REACTIONS.includes(reaction_type)) {
    return NextResponse.json({ error: 'Invalid reaction_type' }, { status: 400 });
  }
  if (!memberId) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

  // Get auth user id
  const { data: member } = await supabaseAdmin.from('members').select('supabase_auth_id').eq('id', memberId).single();
  if (!member?.supabase_auth_id) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

  // Toggle: if reaction exists, delete it. Otherwise insert.
  const { data: existing } = await supabaseAdmin
    .from('twiddle_reactions')
    .select('id')
    .eq('twiddle_id', id)
    .eq('user_id', member.supabase_auth_id)
    .eq('reaction_type', reaction_type)
    .single();

  if (existing) {
    await supabaseAdmin.from('twiddle_reactions').delete().eq('id', existing.id);
    return NextResponse.json({ toggled: 'removed' });
  }

  const { error } = await supabaseAdmin.from('twiddle_reactions').insert({
    twiddle_id: id,
    user_id: member.supabase_auth_id,
    reaction_type,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ toggled: 'added' });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data } = await supabaseAdmin
    .from('twiddle_reactions')
    .select('reaction_type')
    .eq('twiddle_id', id);

  const counts: Record<string, number> = {};
  (data || []).forEach((r: any) => { counts[r.reaction_type] = (counts[r.reaction_type] || 0) + 1; });

  return NextResponse.json({ counts });
}
