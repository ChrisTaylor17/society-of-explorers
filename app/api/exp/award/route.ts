import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type AwardExpBody = {
  memberId?: string;
  amount?: number;
  reason?: string;
  bookId?: string;
  section?: number | string;
};

// Rate limit: 50 EXP per member per hour
const rateLimits = new Map<string, { total: number; resetAt: number }>();
const ALLOWED_REASONS = new Set(['great_books_section', 'great_books_annotation']);

export async function POST(req: NextRequest) {
  try {
    const { memberId, amount, reason, bookId, section } = (await req.json()) as AwardExpBody;
    if (!amount || !reason) return privateJson({ error: 'Missing fields' }, { status: 400 });
    if (amount <= 0 || amount > 50) return privateJson({ error: 'Invalid amount' }, { status: 400 });
    if (!ALLOWED_REASONS.has(reason)) return privateJson({ error: 'Invalid reason' }, { status: 400 });

    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });
    if (memberId && memberId !== auth.memberId) {
      return privateJson({ error: 'Cannot award EXP to another member' }, { status: 403 });
    }

    // Rate limit check
    const now = Date.now();
    const limit = rateLimits.get(auth.memberId);
    if (limit && now < limit.resetAt) {
      if (limit.total + amount > 50) {
        return privateJson({ error: 'Rate limited - max 50 EXP per hour' }, { status: 429 });
      }
      limit.total += amount;
    } else {
      rateLimits.set(auth.memberId, { total: amount, resetAt: now + 3600000 });
    }

    // Clean old entries
    if (rateLimits.size > 5000) {
      for (const [k, v] of rateLimits) { if (now > v.resetAt) rateLimits.delete(k); }
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Log event
    await supabaseAdmin.from('exp_events').insert({
      member_id: auth.memberId,
      amount,
      reason,
      metadata: JSON.stringify({ bookId, section }),
    });

    // Update member total
    const { data: member } = await supabaseAdmin.from('members').select('exp_tokens').eq('id', auth.memberId).single();
    const newTotal = (member?.exp_tokens || 0) + amount;
    await supabaseAdmin.from('members').update({ exp_tokens: newTotal }).eq('id', auth.memberId);

    return privateJson({ success: true, newTotal });
  } catch {
    return privateJson({ error: 'Failed to award EXP' }, { status: 500 });
  }
}
