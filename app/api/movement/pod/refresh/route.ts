import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { writePodCommitment } from '@/lib/movement/commitment';
import { buildPodPayload, bufferToBytea, derivePodKey, encryptPod, getPodStats } from '@/lib/movement/pod';
import {
  SYNC_CIPHERTEXT_ENCODING,
  SYNC_ENVELOPE_KIND,
  SYNC_ENVELOPE_VERSION,
  canonicalSyncCommitmentInput,
} from '@/lib/movement/podSync';

export const runtime = 'nodejs';
export const maxDuration = 120;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await buildPodPayload(auth.memberId);
    const key = derivePodKey(auth.memberId);
    const encrypted = encryptPod(payload, key);
    const now = new Date().toISOString();

    const { data: currentPod, error: currentError } = await supabaseAdmin
      .from('data_pods')
      .select('sync_version')
      .eq('member_id', auth.memberId)
      .maybeSingle();

    if (currentError) throw currentError;

    const baseSyncVersion = currentPod?.sync_version ?? 0;
    const metadata = {
      source: 'server-refresh',
      generated_at: payload.generated_at,
      response_count: payload.practice_responses.length,
    };
    const commitmentHash = createHash('sha256')
      .update(
        canonicalSyncCommitmentInput({
          kind: SYNC_ENVELOPE_KIND,
          version: SYNC_ENVELOPE_VERSION,
          ciphertext_encoding: SYNC_CIPHERTEXT_ENCODING,
          ciphertext: encrypted.ciphertext.toString('base64'),
          iv: encrypted.iv.toString('base64'),
          client_updated_at: now,
          device_id: 'server-refresh',
          base_sync_version: baseSyncVersion,
          metadata,
        }),
      )
      .digest('hex');

    await writePodCommitment(auth.memberId, commitmentHash);

    const { data: syncResult, error } = await supabaseAdmin.rpc(
      'sync_data_pod_v2',
      {
        p_member_id: auth.memberId,
        p_ciphertext: bufferToBytea(encrypted.ciphertext),
        p_iv: bufferToBytea(encrypted.iv),
        p_commitment_hash: commitmentHash,
        p_client_updated_at: now,
        p_device_id: 'server-refresh',
        p_base_sync_version: baseSyncVersion,
        p_payload_bytes: encrypted.ciphertext.byteLength,
        p_metadata: metadata,
        p_pod_version: SYNC_ENVELOPE_VERSION,
      },
    );

    if (error) throw error;

    const stats = await getPodStats(auth.memberId);
    const accepted = syncResult?.accepted !== false;
    return NextResponse.json(
      { ok: accepted, sync: syncResult, stats },
      { status: accepted ? 200 : 409 },
    );
  } catch (err) {
    console.error('[movement/pod/refresh] failed', err);
    return NextResponse.json({ error: 'Pod refresh failed', details: String(err) }, { status: 500 });
  }
}
