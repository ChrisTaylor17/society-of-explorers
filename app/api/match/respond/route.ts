import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { matchId, action, rating, feedback } = await req.json();
  if (!matchId || !action) return NextResponse.json({ error: 'matchId and action required' }, { status: 400 });

  const { data: match } = await supabase.from('matched_conversations').select('*').eq('id', matchId).single();
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

  const isA = match.member_a === auth.memberId;
  const isB = match.member_b === auth.memberId;
  if (!isA && !isB) return NextResponse.json({ error: 'Not your match' }, { status: 403 });

  if (action === 'accept') {
    await supabase.from('matched_conversations').update({ status: 'accepted' }).eq('id', matchId);
    return NextResponse.json({ success: true });
  }

  if (action === 'decline') {
    await supabase.from('matched_conversations').update({ status: 'declined' }).eq('id', matchId);
    return NextResponse.json({ success: true });
  }

  if (action === 'complete') {
    const updates: any = {};
    if (isA) { updates.rating_a = rating; updates.feedback_a = feedback; }
    if (isB) { updates.rating_b = rating; updates.feedback_b = feedback; }

    await supabase.from('matched_conversations').update(updates).eq('id', matchId);

    // Check if both rated
    const { data: updated } = await supabase.from('matched_conversations').select('rating_a, rating_b').eq('id', matchId).single();
    if (updated?.rating_a && updated?.rating_b) {
      await supabase.from('matched_conversations').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', matchId);
      // Award EXP to both
      for (const mid of [match.member_a, match.member_b]) {
        await supabase.from('exp_events').insert({ member_id: mid, amount: 10, reason: 'Completed matched conversation' });
        const { data: m } = await supabase.from('members').select('exp_tokens').eq('id', mid).single();
        if (m) await supabase.from('members').update({ exp_tokens: (m.exp_tokens || 0) + 10 }).eq('id', mid);
      }
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
