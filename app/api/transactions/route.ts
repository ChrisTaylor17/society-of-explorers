import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { checkPermission } from '@/lib/governance/hats';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const ALLOWED_STATUSES = new Set(['pending', 'approved', 'executed', 'rejected']);

export async function GET(req: NextRequest) {
  try {
    const communitySlug = req.nextUrl.searchParams.get('community') || 'society-of-explorers';
    const status = req.nextUrl.searchParams.get('status');
    const requestedMemberId = req.nextUrl.searchParams.get('member');

    if (status && status !== 'all' && !ALLOWED_STATUSES.has(status)) {
      return privateJson({ error: 'Invalid transaction status' }, { status: 400 });
    }

    const auth = await getAuthenticatedMember(req);
    if (!auth) {
      return privateJson({ error: 'Unauthorized' }, { status: 401 });
    }

    const canManage = await checkPermission(auth.memberId, communitySlug, 'manage_governance');
    if (requestedMemberId && requestedMemberId !== auth.memberId && !canManage) {
      return privateJson({ error: 'Cannot view another member transactions' }, { status: 403 });
    }

    const supabase = getSupabaseAdmin();
    const { data: community } = await supabase.from('communities').select('id').eq('slug', communitySlug).single();
    if (!community) return privateJson({ transactions: [] });

    let query = supabase
      .from('agent_transactions')
      .select('*')
      .eq('community_id', community.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (status && status !== 'all') query = query.eq('status', status);
    if (canManage) {
      if (requestedMemberId) query = query.eq('to_member_id', requestedMemberId);
    } else {
      query = query.eq('to_member_id', auth.memberId);
    }

    const { data, error } = await query;
    if (error) {
      return privateJson({ error: 'Failed to load transactions' }, { status: 500 });
    }

    return privateJson({ transactions: data || [] });
  } catch {
    return privateJson({ error: 'Failed to load transactions' }, { status: 500 });
  }
}
