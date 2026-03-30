// ── Deployed addresses (Base Sepolia) ─────────────────────────────────────────
export const RITUAL_MARKETPLACE_ADDRESS = "0x16d70AdbB2eE47Ed8bD7bb342ae08b9C048e7B10" as `0x${string}`;
export const MOCK_SOE_ADDRESS           = "0xa17CB63a572EBc20Ff2Ed8b9F2067eba80E12E7F" as `0x${string}`;
// Set by deploy-nft.sh after contract is deployed:
export const SOCIETY_NFT_ADDRESS        = (process.env.NEXT_PUBLIC_SOCIETY_NFT_ADDRESS ?? "0x299DB7571c93fa42633df7A720ba3Af86e81fD1C") as `0x${string}`;

// ── RitualMarketplace ABI ─────────────────────────────────────────────────────
export const ritualMarketplaceABI = [
  {
    name: "accessRitual",
    type: "function",
    inputs:  [{ name: "ritualId", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// ── ERC-20 ABI (approve / allowance / balanceOf) ──────────────────────────────
export const erc20ABI = [
  {
    name: "approve",
    type: "function",
    inputs:  [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    name: "allowance",
    type: "function",
    inputs:  [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "balanceOf",
    type: "function",
    inputs:  [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

// ── SocietyNFT ABI (ERC-721 Enumerable + custom) ─────────────────────────────
export const societyNFTABI = [
  // ── Mint ────────────────────────────────────────────────
  {
    name: "mint",
    type: "function",
    inputs:  [],
    outputs: [{ name: "tokenId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  // ── Price ────────────────────────────────────────────────
  {
    name: "mintPrice",
    type: "function",
    inputs:  [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  // ── Balance ─────────────────────────────────────────────
  {
    name: "balanceOf",
    type: "function",
    inputs:  [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  // ── Ownership ────────────────────────────────────────────
  {
    name: "ownerOf",
    type: "function",
    inputs:  [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  // ── Metadata ─────────────────────────────────────────────
  {
    name: "tokenURI",
    type: "function",
    inputs:  [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  // ── Events ───────────────────────────────────────────────
  {
    name: "ArtifactMinted",
    type: "event",
    inputs: [
      { name: "to",          type: "address", indexed: true },
      { name: "tokenId",     type: "uint256", indexed: true },
      { name: "name",        type: "string",  indexed: false },
      { name: "artifactType",type: "uint8",   indexed: false },
    ],
  },
  {
    name: "Transfer",
    type: "event",
    inputs: [
      { name: "from",    type: "address", indexed: true },
      { name: "to",      type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
    ],
  },
] as const;
