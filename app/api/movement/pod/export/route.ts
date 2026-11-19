import type { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { internalRouteError, privateAttachmentJson, privateJson } from '@/lib/http/routeError';
import { byteaToBuffer, describePodCustody, normalizePodMetadata, resolvePodKeyMode } from '@/lib/movement/pod';
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
      .select('ciphertext, iv, version, last_commitment_hash, last_committed_at, updated_at, sync_version, sync_device_id, sync_client_updated_at, sync_status, sync_conflict_count, sync_metadata')
      .eq('member_id', auth.memberId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return privateJson({ error: 'No pod found. Refresh your pod first.' }, { status: 404 });

    const syncMetadata = normalizePodMetadata(data.sync_metadata);
    const keyMode = resolvePodKeyMode(data);
    const custody = describePodCustody(keyMode, syncMetadata);
    const envelope = {
      kind: 'society-of-explorers.encrypted-pod',
      member_id: auth.memberId,
      version: data.version || 1,
      algorithm: 'AES-256-GCM',
      key_mode: keyMode,
      custody_status: custody.custody_status,
      sovereignty_status: custody.sovereignty_status,
      custody_verification: custody.custody_verification,
      custody_note: custody.custody_note,
      ciphertext_encoding: 'base64',
      ciphertext: byteaToBuffer(data.ciphertext).toString('base64'),
      iv: byteaToBuffer(data.iv).toString('base64'),
      last_commitment_hash: data.last_commitment_hash || null,
      last_committed_at: data.last_committed_at || null,
      updated_at: data.updated_at || null,
      sync_version: data.sync_version ?? null,
      sync_device_id: data.sync_device_id || null,
      sync_client_updated_at: data.sync_client_updated_at || null,
      sync_status: data.sync_status || null,
      sync_conflict_count: data.sync_conflict_count ?? 0,
      sync_metadata: syncMetadata,
      verification: {
        commitment_format: 'sha256:sync-v2-canonical-json',
        verifier_route: '/movement/pod/verify',
        can_recompute_commitment: typeof syncMetadata.base_sync_version === 'number',
        required_fields: [
          'ciphertext',
          'iv',
          'sync_client_updated_at',
          'sync_device_id',
          'sync_metadata.base_sync_version',
          'last_commitment_hash',
        ],
      },
    };

    return privateAttachmentJson(envelope, {
      filename: `soe-data-pod-${auth.memberId}.pod.json`,
    });
  } catch {
    return internalRouteError('Pod export failed');
  }
}
