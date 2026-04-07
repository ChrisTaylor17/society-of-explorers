// ── Deployed addresses (Base Mainnet) ─────────────────────────────────────────
// Update these after deploying with Foundry
export const SOE_MEMBERSHIP_ADDRESS = (process.env.NEXT_PUBLIC_SOE_MEMBERSHIP_ADDRESS ?? '0x0000000000000000000000000000000000000000') as `0x${string}`;
export const SOE_ACHIEVEMENTS_ADDRESS = (process.env.NEXT_PUBLIC_SOE_ACHIEVEMENTS_ADDRESS ?? '0x0000000000000000000000000000000000000000') as `0x${string}`;

// ── SoEMembership ABI (mint + read) ──────────────────────────────────────────
export const soeMembershipABI = [
  {
    name: 'mint',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'uri', type: 'string' },
      { name: 'tier', type: 'uint8' },
    ],
    outputs: [{ name: 'tokenId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    name: 'totalMinted',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'membershipTier',
    type: 'function',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'tokenURI',
    type: 'function',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    name: 'locked',
    type: 'function',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const;

// ── SoEAchievements ABI ─────────────────────────────────────────────────────
export const soeAchievementsABI = [
  {
    name: 'mint',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'id', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;
