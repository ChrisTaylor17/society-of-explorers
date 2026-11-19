import type { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { internalRouteError, privateAttachmentJson, privateJson } from '@/lib/http/routeError';
import { buildPodSealReceipt } from '@/lib/movement/podReceipt';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('data_pods')
      .select('ciphertext, version, last_commitment_hash, last_committed_at, updated_at, sync_version, sync_device_id, sync_client_updated_at, sync_status, sync_conflict_count, sync_metadata')
      .eq('member_id', auth.memberId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return privateJson({ error: 'No pod found. Seal or refresh your pod first.' }, { status: 404 });

    const receipt = buildPodSealReceipt({
      memberId: auth.memberId,
      pod: data,
      issuedAt: data.last_committed_at || data.updated_at || undefined,
    });

    return privateAttachmentJson(receipt, {
      filename: `soe-pod-seal-receipt-${receipt.subject.member_id_hash.slice(0, 12)}.json`,
    });
  } catch {
    return internalRouteError('Pod receipt export failed');
  }
}
