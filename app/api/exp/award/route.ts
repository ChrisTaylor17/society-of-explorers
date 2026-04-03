import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Rate limit: 50 EXP per member per hour
const rateLimits = new Map<string, { total: number; resetAt: number }>();

export async function POST(req: NextRequest) {
  try {
    const { memberId, amount, reason, bookId, section } = await req.json();
    if (!memberId || !amount || !reason) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    if (amount < 0 || amount > 50) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });

    // Rate limit check
    const now = Date.now();
    const limit = rateLimits.get(memberId);
    if (limit && now < limit.resetAt) {
      if (limit.total + amount > 50) {
        return NextResponse.json({ error: 'Rate limited — max 50 EXP per hour' }, { status: 429 });
      }
      limit.total += amount;
    } else {
      rateLimits.set(memberId, { total: amount, resetAt: now + 3600000 });
    }

    // Clean old entries
    if (rateLimits.size > 5000) {
      for (const [k, v] of rateLimits) { if (now > v.resetAt) rateLimits.delete(k); }
    }

    // Log event
    await supabaseAdmin.from('exp_events').insert({
      member_id: memberId,
      amount,
      reason,
      metadata: JSON.stringify({ bookId, section }),
    });

    // Update member total
    const { data: member } = await supabaseAdmin.from('members').select('exp_tokens').eq('id', memberId).single();
    const newTotal = (member?.exp_tokens || 0) + amount;
    await supabaseAdmin.from('members').update({ exp_tokens: newTotal }).eq('id', memberId);

    return NextResponse.json({ success: true, newTotal });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
