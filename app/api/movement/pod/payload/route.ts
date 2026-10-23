import type { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { internalRouteError, privateJson } from '@/lib/http/routeError';
import { buildPodPayload, getPodStats } from '@/lib/movement/pod';
import { MAX_SYNC_CIPHERTEXT_BYTES } from '@/lib/movement/podSync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    const [payload, stats] = await Promise.all([
      buildPodPayload(auth.memberId),
      getPodStats(auth.memberId),
    ]);

    return privateJson(
      {
        payload,
        stats,
        member: {
          id: auth.memberId,
          walletAddress: auth.member.wallet_address || null,
        },
        encryption: {
          preferredKeyMode: 'client_wallet_derived',
          serverStores: 'ciphertext_and_commitment_only',
          custodyAttestation: 'wallet_signature_hashes_only',
          serverCanDecryptWalletSealedPod: false,
          maxCiphertextBytes: MAX_SYNC_CIPHERTEXT_BYTES,
          sourceDataNotice:
            'Wallet sealing protects the exported pod snapshot. Source practice data still remains in app systems until local-first capture is implemented.',
        },
      },
    );
  } catch {
    return internalRouteError('Pod payload failed');
  }
}
