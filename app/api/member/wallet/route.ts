import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAddress } from 'viem';
import { mintMembershipNFT } from '@/lib/blockchain/membership';

export const runtime = 'nodejs';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { memberId, walletAddress } = await req.json();

    if (!memberId || !walletAddress) {
      return NextResponse.json({ error: 'memberId and walletAddress required' }, { status: 400 });
    }

    if (!isAddress(walletAddress)) {
      return NextResponse.json({ error: 'Invalid Ethereum address' }, { status: 400 });
    }

    // Update member's wallet address
    const { error: updateError } = await supabaseAdmin
      .from('members')
      .update({ wallet_address: walletAddress })
      .eq('id', memberId);

    if (updateError) {
      console.error('Wallet update error:', updateError);
      return NextResponse.json({ error: 'Failed to update wallet' }, { status: 500 });
    }

    // Check for pending mints
    const { data: pendingMints } = await supabaseAdmin
      .from('pending_mints')
      .select('*')
      .eq('member_id', memberId)
      .eq('minted', false);

    let mintResult = null;

    if (pendingMints && pendingMints.length > 0) {
      const pending = pendingMints[0];
      const tierNames: Record<number, string> = { 1: 'explorer', 2: 'seeker', 3: 'scholar', 4: 'philosopher' };
      const tierName = tierNames[pending.tier] || 'explorer';

      try {
        const metadataURI = `https://www.societyofexplorers.com/api/nft/membership/${memberId}.json`;
        const result = await mintMembershipNFT({ walletAddress, tier: tierName, metadataURI });

        // Update pending mint
        await supabaseAdmin.from('pending_mints').update({ minted: true }).eq('id', pending.id);

        // Update member with NFT info
        await supabaseAdmin.from('members').update({
          membership_nft_token_id: result.tokenId ? Number(result.tokenId) : null,
          membership_nft_tx_hash: result.txHash,
        }).eq('id', memberId);

        mintResult = { txHash: result.txHash, tokenId: result.tokenId?.toString() };
      } catch (err) {
        console.error('Pending mint failed:', err);
        // Don't fail the whole request — wallet was updated successfully
      }
    }

    return NextResponse.json({ success: true, walletAddress, mintResult });
  } catch (err) {
    console.error('Wallet endpoint error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
