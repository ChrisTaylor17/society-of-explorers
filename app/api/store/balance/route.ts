import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type ExpAmountRow = {
  amount: number | string | null;
};

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('exp_events')
      .select('amount')
      .eq('member_id', auth.memberId);

    if (error) {
      return privateJson({ balance: 0, error: 'Failed to load balance' }, { status: 500 });
    }

    const rows = (data || []) as ExpAmountRow[];
    const balance = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    return privateJson({ balance });
  } catch {
    return privateJson({ balance: 0, error: 'Failed to load balance' }, { status: 500 });
  }
}
