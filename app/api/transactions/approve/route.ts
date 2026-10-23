import { NextRequest } from 'next/server';
import { approveTx } from '@/lib/wallets/disburse';
import { checkPermission } from '@/lib/governance/hats';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type ApproveTransactionBody = {
  txId?: string;
  memberId?: string;
  communitySlug?: string;
};

export async function POST(req: NextRequest) {
  try {
    const { txId, memberId, communitySlug } = (await req.json()) as ApproveTransactionBody;
    if (!txId || !communitySlug) {
      return privateJson({ error: 'txId and communitySlug required' }, { status: 400 });
    }

    const auth = await getAuthenticatedMember(req);
    if (!auth) {
      return privateJson({ error: 'Unauthorized' }, { status: 401 });
    }

    if (memberId && memberId !== auth.memberId) {
      return privateJson({ error: 'Approver must match authenticated member' }, { status: 403 });
    }

    const canManage = await checkPermission(auth.memberId, communitySlug, 'manage_governance');
    if (!canManage) return privateJson({ error: 'Permission denied' }, { status: 403 });

    const supabase = getSupabaseAdmin();
    const { data: community } = await supabase.from('communities').select('id').eq('slug', communitySlug).single();
    if (!community) {
      return privateJson({ error: 'Community not found' }, { status: 404 });
    }

    const { data: tx } = await supabase
      .from('agent_transactions')
      .select('id, community_id')
      .eq('id', txId)
      .eq('status', 'pending')
      .single();

    if (!tx) {
      return privateJson({ error: 'Transaction not found or already processed' }, { status: 404 });
    }

    if (tx.community_id !== community.id) {
      return privateJson({ error: 'Transaction does not belong to this community' }, { status: 403 });
    }

    const result = await approveTx(txId, auth.memberId);
    return privateJson(result, { status: result.success ? 200 : 400 });
  } catch {
    return privateJson({ error: 'Failed to approve transaction' }, { status: 500 });
  }
}
