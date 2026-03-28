/**
 * contracts.ts — Society of Explorers
 *
 * ABI, address, and viem helper functions for RitualMarketplace.sol.
 * Replace RITUAL_MARKETPLACE_ADDRESS with the real deployed address
 * before going to production.
 */

import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  parseUnits,
  formatUnits,
  type Address,
  type PublicClient,
} from 'viem'
import { baseSepolia } from 'viem/chains'

// ─────────────────────────────────────────────────────────────
//  Contract addresses — Base Sepolia (chainId 84532)
// ─────────────────────────────────────────────────────────────

export const RITUAL_MARKETPLACE_ADDRESS: Address =
  (process.env.NEXT_PUBLIC_RITUAL_MARKETPLACE_ADDRESS ?? '0x16d70AdbB2eE47Ed8bD7bb342ae08b9C048e7B10') as Address

export const SOE_TOKEN_ADDRESS: Address =
  (process.env.NEXT_PUBLIC_MOCK_SOE_ADDRESS ?? '0xa17CB63a572EBc20Ff2Ed8b9F2067eba80E12E7F') as Address

// ─────────────────────────────────────────────────────────────
//  Minimal ABI — only the functions the frontend needs
// ─────────────────────────────────────────────────────────────

export const RITUAL_MARKETPLACE_ABI = [
  // ── Read ────────────────────────────────────────────────────
  {
    name: 'nextRitualId',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getRitual',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'ritualId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'creator',          type: 'address' },
          { name: 'priceSOE',         type: 'uint256' },
          { name: 'contentHash',      type: 'bytes32' },
          { name: 'creatorFeeBps',    type: 'uint256' },
          { name: 'totalRevenue',     type: 'uint256' },
          { name: 'accessCount',      type: 'uint256' },
          { name: 'active',           type: 'bool'    },
          { name: 'requiresTribekey', type: 'bool'    },
        ],
      },
    ],
  },
  {
    name: 'hasAccess',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'ritualId', type: 'uint256' },
      { name: 'member',   type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'estimateSplit',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'ritualId', type: 'uint256' }],
    outputs: [
      { name: 'creatorReward', type: 'uint256' },
      { name: 'protocolFee',   type: 'uint256' },
      { name: 'residual',      type: 'uint256' },
    ],
  },
  // ── Write ───────────────────────────────────────────────────
  {
    name: 'accessRitual',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'ritualId', type: 'uint256' },
      { name: 'member',   type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'listRitual',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'priceSOE',         type: 'uint256' },
      { name: 'contentHash',      type: 'bytes32' },
      { name: 'creatorFeeBps',    type: 'uint256' },
      { name: 'requiresTribekey', type: 'bool'    },
    ],
    outputs: [{ name: 'ritualId', type: 'uint256' }],
  },
  // ── Events ──────────────────────────────────────────────────
  {
    name: 'RitualAccessed',
    type: 'event',
    inputs: [
      { name: 'ritualId',     type: 'uint256', indexed: true  },
      { name: 'member',       type: 'address', indexed: true  },
      { name: 'initiator',    type: 'address', indexed: true  },
      { name: 'amountPaid',   type: 'uint256', indexed: false },
      { name: 'creatorReward',type: 'uint256', indexed: false },
      { name: 'protocolFee',  type: 'uint256', indexed: false },
    ],
  },
] as const

// ─────────────────────────────────────────────────────────────
//  ERC-20 ABI — minimal, for $SOE token approvals
// ─────────────────────────────────────────────────────────────

export const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount',  type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner',   type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

// ─────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────

export interface RitualInfo {
  id:               number
  creator:          Address
  priceSOE:         bigint
  priceDisplay:     string   // human-readable, e.g. "0.5"
  contentHash:      `0x${string}`
  creatorFeeBps:    bigint
  totalRevenue:     bigint
  accessCount:      bigint
  active:           boolean
  requiresTribekey: boolean
  // enriched by the catalogue below
  name?:    string
  thinker?: string
  tagline?: string
}

// ─────────────────────────────────────────────────────────────
//  Ritual catalogue (static metadata, matched by ID once
//  rituals are registered on-chain)
// ─────────────────────────────────────────────────────────────

export const RITUAL_CATALOGUE: Record<number, { name: string; thinker: string; tagline: string }> = {
  0: {
    name:    'The Socratic Examination',
    thinker: 'Socrates',
    tagline: 'Unlock a deep Socratic questioning session on any topic you choose.',
  },
  1: {
    name:    'The Einsteinian Thought Experiment',
    thinker: 'Einstein',
    tagline: 'Ride alongside Einstein through a guided imagination ritual.',
  },
  2: {
    name:    "Marcus's Morning Reflection",
    thinker: 'Marcus Aurelius',
    tagline: "Receive a personalised Stoic reflection for today's challenges.",
  },
  3: {
    name:    "Jobs's Creative Interrogation",
    thinker: 'Steve Jobs',
    tagline: 'Submit your idea for a ruthless simplicity critique.',
  },
  4: {
    name:    "Aristotle's First Principles",
    thinker: 'Aristotle',
    tagline: 'Deconstruct any problem to its foundational truths.',
  },
  5: {
    name:    "Nietzsche's Will to Power",
    thinker: 'Nietzsche',
    tagline: 'Confront your assumptions through a Nietzschean challenge ritual.',
  },
}

// ─────────────────────────────────────────────────────────────
//  Mock rituals — used while the contract is not yet deployed
// ─────────────────────────────────────────────────────────────

export const MOCK_RITUALS: RitualInfo[] = Object.entries(RITUAL_CATALOGUE).map(([id, meta]) => ({
  id:               Number(id),
  creator:          '0x0000000000000000000000000000000000000000',
  priceSOE:         parseUnits('1', 18),
  priceDisplay:     '1',
  contentHash:      '0x0000000000000000000000000000000000000000000000000000000000000000',
  creatorFeeBps:    BigInt(7000),
  totalRevenue:     BigInt(0),
  accessCount:      BigInt(0),
  active:           true,
  requiresTribekey: true,
  ...meta,
}))

// ─────────────────────────────────────────────────────────────
//  viem clients
// ─────────────────────────────────────────────────────────────

function getPublicClient(): PublicClient {
  return createPublicClient({ chain: baseSepolia, transport: http() })
}

function getWalletClient() {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('No wallet detected. Please connect MetaMask or a compatible wallet.')
  }
  return createWalletClient({
    chain: baseSepolia,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transport: custom(window.ethereum as any),
  })
}

// ─────────────────────────────────────────────────────────────
//  Helper: fetch all active rituals from the contract
//  Falls back to MOCK_RITUALS if the contract is not deployed.
// ─────────────────────────────────────────────────────────────

export async function fetchRituals(): Promise<RitualInfo[]> {
  const isDeployed = RITUAL_MARKETPLACE_ADDRESS !== '0x0000000000000000000000000000000000000000'
  if (!isDeployed) return MOCK_RITUALS

  try {
    const client = getPublicClient()
    const total = await client.readContract({
      address: RITUAL_MARKETPLACE_ADDRESS,
      abi:     RITUAL_MARKETPLACE_ABI,
      functionName: 'nextRitualId',
    })

    const ids = Array.from({ length: Number(total) }, (_, i) => i)
    const results = await Promise.all(
      ids.map(id =>
        client.readContract({
          address: RITUAL_MARKETPLACE_ADDRESS,
          abi:     RITUAL_MARKETPLACE_ABI,
          functionName: 'getRitual',
          args:    [BigInt(id)],
        })
      )
    )

    return results
      .map((r, id) => ({
        id,
        creator:          r.creator,
        priceSOE:         r.priceSOE,
        priceDisplay:     formatUnits(r.priceSOE, 18),
        contentHash:      r.contentHash,
        creatorFeeBps:    r.creatorFeeBps,
        totalRevenue:     r.totalRevenue,
        accessCount:      r.accessCount,
        active:           r.active,
        requiresTribekey: r.requiresTribekey,
        ...(RITUAL_CATALOGUE[id] ?? {}),
      }))
      .filter(r => r.active)
  } catch {
    // Contract not reachable — fall back to mock data
    return MOCK_RITUALS
  }
}

// ─────────────────────────────────────────────────────────────
//  Helper: check whether a member has access to a ritual
// ─────────────────────────────────────────────────────────────

export async function checkAccess(ritualId: number, memberAddress: Address): Promise<boolean> {
  const isDeployed = RITUAL_MARKETPLACE_ADDRESS !== '0x0000000000000000000000000000000000000000'
  if (!isDeployed) return false

  try {
    const client = getPublicClient()
    return await client.readContract({
      address: RITUAL_MARKETPLACE_ADDRESS,
      abi:     RITUAL_MARKETPLACE_ABI,
      functionName: 'hasAccess',
      args:    [BigInt(ritualId), memberAddress],
    })
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────────────────────
//  Helper: pay for and run a ritual
//
//  Flow:
//    1. Get connected wallet accounts
//    2. Approve the marketplace to spend the ritual's price in $SOE
//    3. Call accessRitual — triggers on-chain payment + reward split
//
//  Returns the transaction hash of the accessRitual call.
// ─────────────────────────────────────────────────────────────

export async function runRitual(
  ritual: RitualInfo,
  memberAddress: Address
): Promise<`0x${string}`> {
  const walletClient = getWalletClient()
  const publicClient = getPublicClient()

  const [account] = await walletClient.requestAddresses()

  // Step 1: approve marketplace to spend $SOE
  const isDeployed = SOE_TOKEN_ADDRESS !== '0x0000000000000000000000000000000000000000'
  if (isDeployed) {
    const currentAllowance = await publicClient.readContract({
      address: SOE_TOKEN_ADDRESS,
      abi:     ERC20_ABI,
      functionName: 'allowance',
      args:    [account, RITUAL_MARKETPLACE_ADDRESS],
    })

    if (currentAllowance < ritual.priceSOE) {
      const approveTx = await walletClient.writeContract({
        address: SOE_TOKEN_ADDRESS,
        abi:     ERC20_ABI,
        functionName: 'approve',
        args:    [RITUAL_MARKETPLACE_ADDRESS, ritual.priceSOE],
        account,
      })
      // Wait for approval to be mined
      await publicClient.waitForTransactionReceipt({ hash: approveTx })
    }
  }

  // Step 2: call accessRitual
  const hash = await walletClient.writeContract({
    address: RITUAL_MARKETPLACE_ADDRESS,
    abi:     RITUAL_MARKETPLACE_ABI,
    functionName: 'accessRitual',
    args:    [BigInt(ritual.id), memberAddress],
    account,
  })

  return hash
}
