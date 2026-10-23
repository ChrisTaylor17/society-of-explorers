import { NextRequest } from 'next/server';
import { getAddress, isAddress } from 'viem';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const ARTIFACT_MINT_SELECT =
  'id, member_id, title, description, image_url, thinker_id, philosophical_note, created_at, theme';
const DEFAULT_CONTRACT_ADDRESS = '0x299DB7571c93fa42633df7A720ba3Af86e81fD1C';
const MAX_ID_LENGTH = 80;
const MAX_TEXT_LENGTH = 240;
const MINT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;
const TOKEN_ID_PATTERN = /^\d{1,78}$/;
const TRANSACTION_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;

type ArtifactMintRequestBody = {
  artifactId?: unknown;
  walletAddress?: unknown;
  mintId?: unknown;
  transactionHash?: unknown;
  tokenId?: unknown;
};

type ArtifactMintRow = {
  id: string;
  member_id: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  thinker_id: string | null;
  philosophical_note: string | null;
  created_at: string | null;
  theme: unknown;
};

type PendingMintRecordRow = {
  id: string;
};

type MintRecordRow = {
  id: string;
  artifact_id: string | null;
  member_id: string | null;
  transaction_hash: string | null;
  token_id: string | number | null;
  status: string | null;
  minted_at: string | null;
  opensea_url: string | null;
};

type ArtifactMintMetadata = {
  name: string;
  description: string;
  image: string;
  external_url: string;
  attributes: Array<{ trait_type: string; value: string }>;
  provenance: { platform: string; thinker: string; co_created: boolean };
};

async function safeRequestJson(req: NextRequest): Promise<ArtifactMintRequestBody | null> {
  try {
    return (await req.json()) as ArtifactMintRequestBody;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedText(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : null;
}

function normalizeMintId(value: unknown): string | null {
  const mintId = boundedText(value, MAX_ID_LENGTH);
  return mintId && MINT_ID_PATTERN.test(mintId) ? mintId : null;
}

function normalizeTokenId(value: unknown): string | null {
  const tokenId = typeof value === 'number' && Number.isInteger(value) ? `${value}` : boundedText(value, 78);
  return tokenId && TOKEN_ID_PATTERN.test(tokenId) ? tokenId : null;
}

function normalizeTransactionHash(value: unknown): string | null {
  const hash = boundedText(value, 66);
  return hash && TRANSACTION_HASH_PATTERN.test(hash) ? hash.toLowerCase() : null;
}

function normalizeWalletAddress(value: unknown): string | null {
  const walletAddress = boundedText(value, 64);
  return walletAddress && isAddress(walletAddress) ? getAddress(walletAddress) : null;
}

function artifactNftMintRecordingEnabled() {
  return process.env.ARTIFACT_NFT_MINT_RECORDING_ENABLED === 'true';
}

function resolveContractAddress(): string | null {
  const configuredAddress = process.env.NEXT_PUBLIC_SOCIETY_NFT_CONTRACT || DEFAULT_CONTRACT_ADDRESS;
  return isAddress(configuredAddress) ? getAddress(configuredAddress) : null;
}

function artifactExternalUrl(artifactId: string) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.societyofexplorers.com';
  try {
    return new URL(`/hall/${artifactId}`, baseUrl).toString();
  } catch {
    return `https://www.societyofexplorers.com/hall/${artifactId}`;
  }
}

function displayThinker(value: string | null) {
  const thinker = boundedText(value, 80) || 'explorer';
  return thinker.charAt(0).toUpperCase() + thinker.slice(1);
}

function createdDate(value: string | null) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
}

function themeTags(theme: unknown) {
  if (!isRecord(theme) || !Array.isArray(theme.tags)) return [];

  return theme.tags
    .filter((tag): tag is string => typeof tag === 'string' && Boolean(tag.trim()))
    .map((tag) => tag.trim().slice(0, 80))
    .slice(0, 8);
}

function buildMetadata(artifact: ArtifactMintRow): ArtifactMintMetadata | null {
  if (!artifact.image_url) return null;

  const thinker = displayThinker(artifact.thinker_id);
  const description = boundedText(artifact.description, MAX_TEXT_LENGTH) || 'Co-created Society of Explorers artifact.';

  return {
    name: boundedText(artifact.title, MAX_TEXT_LENGTH) || 'Society of Explorers Artifact',
    description,
    image: artifact.image_url,
    external_url: artifactExternalUrl(artifact.id),
    attributes: [
      { trait_type: 'Thinker', value: thinker },
      { trait_type: 'Philosophical Note', value: boundedText(artifact.philosophical_note, MAX_TEXT_LENGTH) || 'Withheld' },
      { trait_type: 'Created', value: createdDate(artifact.created_at) },
      { trait_type: 'Society', value: 'Society of Explorers' },
      ...themeTags(artifact.theme).map((tag) => ({ trait_type: 'Theme', value: tag })),
    ],
    provenance: { platform: 'Society of Explorers', thinker, co_created: true },
  };
}

function metadataUri(metadata: ArtifactMintMetadata) {
  return `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString('base64')}`;
}

function publicMintRow(row: MintRecordRow) {
  return {
    id: row.id,
    artifact_id: row.artifact_id,
    transaction_hash: row.transaction_hash,
    token_id: row.token_id === null ? null : `${row.token_id}`,
    status: row.status,
    minted_at: row.minted_at,
    opensea_url: row.opensea_url,
  };
}

export async function POST(req: NextRequest) {
  const body = await safeRequestJson(req);
  if (!body) return privateJson({ error: 'Invalid body' }, { status: 400 });

  const artifactId = boundedText(body.artifactId, MAX_ID_LENGTH);
  const walletAddress = normalizeWalletAddress(body.walletAddress);
  if (!artifactId) return privateJson({ error: 'artifactId required' }, { status: 400 });
  if (!walletAddress) return privateJson({ error: 'Valid walletAddress required' }, { status: 400 });

  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  if (!artifactNftMintRecordingEnabled()) {
    return privateJson({ error: 'Artifact NFT mint recording is not enabled' }, { status: 403 });
  }

  const contractAddress = resolveContractAddress();
  if (!contractAddress) return privateJson({ error: 'Artifact NFT contract is not configured' }, { status: 503 });

  const supabaseAdmin = getSupabaseAdmin();
  const { data: artifact, error: artifactError } = await supabaseAdmin
    .from('artifacts')
    .select(ARTIFACT_MINT_SELECT)
    .eq('id', artifactId)
    .single<ArtifactMintRow>();

  if (artifactError || !artifact) return privateJson({ error: 'Artifact not found' }, { status: 404 });
  if (artifact.member_id !== auth.memberId) {
    return privateJson({ error: 'Cannot prepare mint for another member artifact' }, { status: 403 });
  }

  const metadata = buildMetadata(artifact);
  if (!metadata) return privateJson({ error: 'Artifact image required before minting' }, { status: 400 });

  const metadataUriValue = metadataUri(metadata);
  const { data: mintRecord, error: mintError } = await supabaseAdmin
    .from('nft_mints')
    .insert({
      artifact_id: artifact.id,
      member_id: auth.memberId,
      chain: 'base',
      contract_address: contractAddress,
      status: 'pending',
      metadata_uri: metadataUriValue,
    })
    .select('id')
    .single<PendingMintRecordRow>();

  if (mintError || !mintRecord) return privateJson({ error: 'Failed to record mint preparation' }, { status: 500 });

  return privateJson({
    success: true,
    mintId: mintRecord.id,
    metadata,
    contractAddress,
    mintCalldata: { to: walletAddress, metadataUri: metadataUriValue },
  });
}

export async function PATCH(req: NextRequest) {
  const body = await safeRequestJson(req);
  if (!body) return privateJson({ error: 'Invalid body' }, { status: 400 });

  const mintId = normalizeMintId(body.mintId);
  const transactionHash = normalizeTransactionHash(body.transactionHash);
  const tokenId = normalizeTokenId(body.tokenId);
  if (!mintId) return privateJson({ error: 'Valid mintId required' }, { status: 400 });
  if (!transactionHash) return privateJson({ error: 'Valid transactionHash required' }, { status: 400 });
  if (!tokenId) return privateJson({ error: 'Valid tokenId required' }, { status: 400 });

  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  if (!artifactNftMintRecordingEnabled()) {
    return privateJson({ error: 'Artifact NFT mint recording is not enabled' }, { status: 403 });
  }

  const contractAddress = resolveContractAddress();
  if (!contractAddress) return privateJson({ error: 'Artifact NFT contract is not configured' }, { status: 503 });

  const openseaUrl = `https://opensea.io/assets/base/${contractAddress}/${tokenId}`;
  const supabaseAdmin = getSupabaseAdmin();
  const { data: mint, error: mintError } = await supabaseAdmin
    .from('nft_mints')
    .update({
      transaction_hash: transactionHash,
      token_id: tokenId,
      status: 'minted',
      minted_at: new Date().toISOString(),
      opensea_url: openseaUrl,
    })
    .eq('id', mintId)
    .eq('member_id', auth.memberId)
    .select('id, artifact_id, member_id, transaction_hash, token_id, status, minted_at, opensea_url')
    .single<MintRecordRow>();

  if (mintError || !mint) return privateJson({ error: 'Mint record not found' }, { status: 404 });

  return privateJson({ success: true, mint: publicMintRow(mint) });
}
