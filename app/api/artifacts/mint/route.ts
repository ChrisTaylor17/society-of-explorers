import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { artifactId, walletAddress } = await req.json();
    const { data: artifact, error: artifError } = await supabaseAdmin.from('artifacts').select('*').eq('id', artifactId).single();
    if (artifError || !artifact) return NextResponse.json({ error: 'Artifact not found' }, { status: 404 });

    const metadata = {
      name: artifact.title,
      description: artifact.description,
      image: artifact.image_url,
      external_url: `https://www.societyofexplorers.com/hall/${artifactId}`,
      attributes: [
        { trait_type: 'Thinker', value: artifact.thinker_id.charAt(0).toUpperCase() + artifact.thinker_id.slice(1) },
        { trait_type: 'Philosophical Note', value: artifact.philosophical_note },
        { trait_type: 'Created', value: new Date(artifact.created_at).toLocaleDateString() },
        { trait_type: 'Society', value: 'Society of Explorers' },
        ...(artifact.theme?.tags || []).map((tag: string) => ({ trait_type: 'Theme', value: tag })),
      ],
      provenance: { platform: 'Society of Explorers', thinker: artifact.thinker_id, co_created: true },
    };

    const metadataUri = `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString('base64')}`;
    const contractAddress = process.env.NEXT_PUBLIC_SOCIETY_NFT_CONTRACT || '0x299DB7571c93fa42633df7A720ba3Af86e81fD1C';

    const { data: mintRecord } = await supabaseAdmin.from('nft_mints').insert({
      artifact_id: artifactId, member_id: artifact.member_id, chain: 'base',
      contract_address: contractAddress, status: 'pending', metadata_uri: metadataUri,
    }).select().single();

    return NextResponse.json({ success: true, mintId: mintRecord?.id, metadata, contractAddress, mintCalldata: { to: walletAddress, metadataUri } });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { mintId, transactionHash, tokenId } = await req.json();
    const contractAddress = process.env.NEXT_PUBLIC_SOCIETY_NFT_CONTRACT || '0x299DB7571c93fa42633df7A720ba3Af86e81fD1C';
    const { data } = await supabaseAdmin.from('nft_mints').update({
      transaction_hash: transactionHash, token_id: tokenId, status: 'minted',
      minted_at: new Date().toISOString(), opensea_url: `https://opensea.io/assets/base/${contractAddress}/${tokenId}`,
    }).eq('id', mintId).select().single();
    return NextResponse.json({ success: true, mint: data });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
