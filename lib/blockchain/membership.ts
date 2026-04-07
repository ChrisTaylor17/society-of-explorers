import { createWalletClient, createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { SOE_MEMBERSHIP_ADDRESS, SOE_ACHIEVEMENTS_ADDRESS, soeMembershipABI, soeAchievementsABI } from './contracts';

const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';

function getAdminAccount() {
  const key = process.env.SOE_ADMIN_PRIVATE_KEY;
  if (!key) throw new Error('SOE_ADMIN_PRIVATE_KEY not set');
  return privateKeyToAccount(key as `0x${string}`);
}

function getWalletClient() {
  const account = getAdminAccount();
  return createWalletClient({
    account,
    chain: base,
    transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
  });
}

function getPublicClient() {
  return createPublicClient({
    chain: base,
    transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
  });
}

const TIER_MAP: Record<string, number> = { free: 1, explorer: 1, seeker: 2, scholar: 3, philosopher: 4 };

/**
 * Mint a soulbound membership NFT.
 */
export async function mintMembershipNFT({
  walletAddress,
  tier,
  metadataURI,
}: {
  walletAddress: string;
  tier: string;
  metadataURI: string;
}): Promise<{ txHash: string; tokenId: bigint | null }> {
  if (SOE_MEMBERSHIP_ADDRESS === NULL_ADDRESS) throw new Error('SoEMembership contract not deployed');

  const walletClient = getWalletClient();
  const publicClient = getPublicClient();
  const tierNum = TIER_MAP[tier.toLowerCase()] || 1;

  const txHash = await walletClient.writeContract({
    address: SOE_MEMBERSHIP_ADDRESS,
    abi: soeMembershipABI,
    functionName: 'mint',
    args: [walletAddress as `0x${string}`, metadataURI, tierNum],
  });

  // Wait for receipt to get token ID from event logs
  let tokenId: bigint | null = null;
  try {
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    // Token ID is the return value, but we can also read totalMinted
    const total = await publicClient.readContract({
      address: SOE_MEMBERSHIP_ADDRESS,
      abi: soeMembershipABI,
      functionName: 'totalMinted',
    });
    tokenId = total as bigint;
  } catch {}

  return { txHash, tokenId };
}

/**
 * Mint a soulbound achievement NFT.
 */
export async function mintAchievementNFT({
  walletAddress,
  achievementId,
}: {
  walletAddress: string;
  achievementId: number;
}): Promise<{ txHash: string }> {
  if (SOE_ACHIEVEMENTS_ADDRESS === NULL_ADDRESS) throw new Error('SoEAchievements contract not deployed');

  const walletClient = getWalletClient();

  const txHash = await walletClient.writeContract({
    address: SOE_ACHIEVEMENTS_ADDRESS,
    abi: soeAchievementsABI,
    functionName: 'mint',
    args: [walletAddress as `0x${string}`, BigInt(achievementId), 1n],
  });

  return { txHash };
}
