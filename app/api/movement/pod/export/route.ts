import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { byteaToBuffer } from '@/lib/movement/pod';

export const runtime = 'nodejs';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabaseAdmin
      .from('data_pods')
      .select('ciphertext, iv, version, last_commitment_hash, last_committed_at, updated_at')
      .eq('member_id', auth.memberId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'No pod found. Refresh your pod first.' }, { status: 404 });

    const envelope = {
      kind: 'society-of-explorers.encrypted-pod',
      member_id: auth.memberId,
      version: data.version || 1,
      algorithm: 'AES-256-GCM',
      ciphertext_encoding: 'base64',
      ciphertext: byteaToBuffer(data.ciphertext).toString('base64'),
      iv: byteaToBuffer(data.iv).toString('base64'),
      last_commitment_hash: data.last_commitment_hash || null,
      last_committed_at: data.last_committed_at || null,
      updated_at: data.updated_at || null,
    };

    return new NextResponse(JSON.stringify(envelope, null, 2), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="soe-data-pod-${auth.memberId}.pod.json"`,
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[movement/pod/export] failed', err);
    return NextResponse.json({ error: 'Pod export failed', details: String(err) }, { status: 500 });
  }
}
