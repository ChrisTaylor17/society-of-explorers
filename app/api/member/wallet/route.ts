import { NextRequest } from 'next/server';
import { getAddress, isAddress } from 'viem';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

type MemberWalletBody = {
  memberId?: string;
  walletAddress?: string;
};

type PendingMintRow = {
  id: string;
  tier: number | string | null;
};

const TIER_NAMES: Record<number, string> = { 1: 'explorer', 2: 'seeker', 3: 'scholar', 4: 'philosopher' };

async function safeRequestJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function POST(req: NextRequest) {
  try {
    const body = await safeRequestJson(req);
    if (body === null) {
      return privateJson({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!isRecord(body)) {
      return privateJson({ error: 'Invalid body' }, { status: 400 });
    }

    const { memberId, walletAddress } = body as MemberWalletBody;

    if (!walletAddress) {
      return privateJson({ error: 'walletAddress required' }, { status: 400 });
    }

    if (!isAddress(walletAddress)) {
      return privateJson({ error: 'Invalid Ethereum address' }, { status: 400 });
    }

    const auth = await getAuthenticatedMember(req);
    if (!auth) {
      return privateJson({ error: 'Unauthorized' }, { status: 401 });
    }

    if (memberId && memberId !== auth.memberId) {
      return privateJson({ error: 'Cannot attach wallet to another member' }, { status: 403 });
    }

    const normalizedWalletAddress = getAddress(walletAddress);
    const supabaseAdmin = getSupabaseAdmin();
    const { data: existingWalletOwner, error: existingError } = await supabaseAdmin
      .from('members')
      .select('id')
      .eq('wallet_address', normalizedWalletAddress)
      .maybeSingle();

    if (existingError) {
      return privateJson({ error: 'Failed to verify wallet ownership' }, { status: 500 });
    }

    if (existingWalletOwner && existingWalletOwner.id !== auth.memberId) {
      return privateJson({ error: 'Wallet is already attached to another member' }, { status: 409 });
    }

    // Update member's wallet address
    const { error: updateError } = await supabaseAdmin
      .from('members')
      .update({ wallet_address: normalizedWalletAddress })
      .eq('id', auth.memberId);

    if (updateError) {
      return privateJson({ error: 'Failed to update wallet' }, { status: 500 });
    }

    // Check for pending mints
    const { data: pendingMints } = await supabaseAdmin
      .from('pending_mints')
      .select('id, tier')
      .eq('member_id', auth.memberId)
      .eq('minted', false);

    let mintResult = null;
    const pendingMint = (pendingMints?.[0] || null) as PendingMintRow | null;
    const autoMintEnabled = process.env.MEMBERSHIP_NFT_AUTO_MINT_ENABLED === 'true';

    if (autoMintEnabled && pendingMint) {
      const tierNumber = Number(pendingMint.tier) || 1;
      const tierName = TIER_NAMES[tierNumber] || 'explorer';

      try {
        const { mintMembershipNFT } = await import('@/lib/blockchain/membership');
        const metadataURI = `https://www.societyofexplorers.com/api/nft/membership/${auth.memberId}.json`;
        const result = await mintMembershipNFT({ walletAddress: normalizedWalletAddress, tier: tierName, metadataURI });

        // Update pending mint
        await supabaseAdmin
          .from('pending_mints')
          .update({ minted: true })
          .eq('id', pendingMint.id)
          .eq('member_id', auth.memberId);

        // Update member with NFT info
        await supabaseAdmin.from('members').update({
          membership_nft_token_id: result.tokenId ? Number(result.tokenId) : null,
          membership_nft_tx_hash: result.txHash,
        }).eq('id', auth.memberId);

        mintResult = { txHash: result.txHash, tokenId: result.tokenId?.toString() };
      } catch {
        // Don't fail the whole request — wallet was updated successfully
      }
    }

    return privateJson({
      success: true,
      walletAddress: normalizedWalletAddress,
      pendingMintCount: pendingMints?.length || 0,
      minting: {
        enabled: autoMintEnabled,
        status: mintResult ? 'minted' : pendingMint ? 'pending' : 'none',
      },
      mintResult,
    });
  } catch {
    return privateJson({ error: 'Internal error' }, { status: 500 });
  }
}
