import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { writePodCommitment } from '@/lib/movement/commitment';
import { buildPodPayload, bufferToBytea, derivePodKey, encryptPod, getPodStats } from '@/lib/movement/pod';

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
    const commitmentHash = createHash('sha256').update(encrypted.ciphertext).digest('hex');
    await writePodCommitment(auth.memberId, commitmentHash);

    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from('data_pods').upsert(
      {
        member_id: auth.memberId,
        ciphertext: bufferToBytea(encrypted.ciphertext),
        iv: bufferToBytea(encrypted.iv),
        version: encrypted.version,
        last_commitment_hash: commitmentHash,
        last_committed_at: now,
        updated_at: now,
      },
      { onConflict: 'member_id' },
    );

    if (error) throw error;

    const stats = await getPodStats(auth.memberId);
    return NextResponse.json({ ok: true, stats });
  } catch (err) {
    console.error('[movement/pod/refresh] failed', err);
    return NextResponse.json({ error: 'Pod refresh failed', details: String(err) }, { status: 500 });
  }
}
