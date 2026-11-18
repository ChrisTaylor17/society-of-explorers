export const BASE_MAINNET_CHAIN_ID = 8453;
export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const DEFAULT_BASE_MAINNET_RPC_URL = 'https://mainnet.base.org';
export const DEFAULT_BASE_SEPOLIA_RPC_URL = 'https://sepolia.base.org';
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

export type HexAddress = `0x${string}`;
export type LiveBaseChainId = typeof BASE_MAINNET_CHAIN_ID | typeof BASE_SEPOLIA_CHAIN_ID;

export interface LiveBaseChainConfig {
  chainId: LiveBaseChainId;
  chainName: string;
  nativeCurrency: {
    name: 'Ether';
    symbol: 'ETH';
    decimals: 18;
  };
  rpcUrls: string[];
  blockExplorerUrls: string[];
}

export interface LiveBaseRpcOverrides {
  baseMainnetRpcUrl?: string | null;
  baseSepoliaRpcUrl?: string | null;
}

export interface LiveBaseWalletConnectionProfile {
  defaultChainId: LiveBaseChainId;
  chainConfigs: Record<LiveBaseChainId, LiveBaseChainConfig>;
  confirmations: number;
  receiptPollingIntervalMs: number;
  receiptTimeoutMs: number;
}

export interface LiveMultisigConfig {
  chain_id: number;
  multisig_address: string;
  threshold: number;
  signers: string[];
}

export interface LiveMultisigValidation {
  ok: boolean;
  chain_id: LiveBaseChainId;
  network: 'base-mainnet' | 'base-sepolia';
  multisig_address: HexAddress;
  threshold: number;
  signers: HexAddress[];
  required_confirmations: number;
  rpc_url: string;
  explorer_url: string;
  errors: string[];
}

const HEX_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export function getLiveBaseChainConfigs(
  overrides: LiveBaseRpcOverrides = {},
): Record<LiveBaseChainId, LiveBaseChainConfig> {
  return {
    [BASE_MAINNET_CHAIN_ID]: {
      chainId: BASE_MAINNET_CHAIN_ID,
      chainName: 'Base',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: [resolveLiveBaseRpcUrl(BASE_MAINNET_CHAIN_ID, overrides)],
      blockExplorerUrls: ['https://basescan.org'],
    },
    [BASE_SEPOLIA_CHAIN_ID]: {
      chainId: BASE_SEPOLIA_CHAIN_ID,
      chainName: 'Base Sepolia',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: [resolveLiveBaseRpcUrl(BASE_SEPOLIA_CHAIN_ID, overrides)],
      blockExplorerUrls: ['https://sepolia.basescan.org'],
    },
  };
}

export function createLiveBaseWalletConnectionProfile(
  options: {
    defaultChainId?: number | string | null;
    confirmations?: number | null;
    receiptPollingIntervalMs?: number | null;
    receiptTimeoutMs?: number | null;
    rpcOverrides?: LiveBaseRpcOverrides;
  } = {},
): LiveBaseWalletConnectionProfile {
  return {
    defaultChainId: resolveLiveBaseChainId(options.defaultChainId, getDefaultLiveBaseChainId()),
    chainConfigs: getLiveBaseChainConfigs(options.rpcOverrides),
    confirmations: positiveInteger(options.confirmations, 2),
    receiptPollingIntervalMs: positiveInteger(options.receiptPollingIntervalMs, 2_000),
    receiptTimeoutMs: positiveInteger(options.receiptTimeoutMs, 180_000),
  };
}

export function getDefaultLiveBaseChainId(): LiveBaseChainId {
  return resolveLiveBaseChainId(process.env.NEXT_PUBLIC_SOE_DEFAULT_CHAIN_ID, BASE_SEPOLIA_CHAIN_ID);
}

export function resolveLiveBaseChainId(
  value: number | string | null | undefined,
  fallback: LiveBaseChainId = BASE_SEPOLIA_CHAIN_ID,
): LiveBaseChainId {
  const numeric = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  return isLiveBaseChainId(numeric) ? numeric : fallback;
}

export function isLiveBaseChainId(value: unknown): value is LiveBaseChainId {
  return value === BASE_MAINNET_CHAIN_ID || value === BASE_SEPOLIA_CHAIN_ID;
}

export function resolveLiveBaseRpcUrl(
  chainId: LiveBaseChainId,
  overrides: LiveBaseRpcOverrides = {},
): string {
  if (chainId === BASE_MAINNET_CHAIN_ID) {
    return firstNonEmpty(
      overrides.baseMainnetRpcUrl,
      process.env.NEXT_PUBLIC_BASE_MAINNET_RPC_URL,
      process.env.NEXT_PUBLIC_BASE_RPC_URL,
      DEFAULT_BASE_MAINNET_RPC_URL,
    );
  }

  return firstNonEmpty(
    overrides.baseSepoliaRpcUrl,
    process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL,
    DEFAULT_BASE_SEPOLIA_RPC_URL,
  );
}

export function validateLiveMultisigConfig(
  config: Partial<LiveMultisigConfig> | null | undefined,
  options: {
    fallbackChainId?: LiveBaseChainId;
    confirmations?: number | null;
    rpcOverrides?: LiveBaseRpcOverrides;
    requireConfiguredAddress?: boolean;
  } = {},
): LiveMultisigValidation {
  const fallbackChainId = options.fallbackChainId ?? getDefaultLiveBaseChainId();
  const chainId = resolveLiveBaseChainId(config?.chain_id, fallbackChainId);
  const chainConfigs = getLiveBaseChainConfigs(options.rpcOverrides);
  const chainConfig = chainConfigs[chainId];
  const errors: string[] = [];
  const multisigAddress = normalizeHexAddress(config?.multisig_address) || ZERO_ADDRESS;
  const signers = normalizeSignerList(config?.signers);
  const threshold = normalizeThreshold(config?.threshold, signers.length);

  if (!isLiveBaseChainId(config?.chain_id)) {
    errors.push('multisig_config.chain_id must be Base Mainnet (8453) or Base Sepolia (84532).');
  }

  if (options.requireConfiguredAddress && multisigAddress === ZERO_ADDRESS) {
    errors.push('multisig_config.multisig_address must be configured before validation.');
  }

  if (signers.length === 0) {
    errors.push('multisig_config.signers must include at least one valid EVM address.');
  }

  if (threshold < 1 || threshold > Math.max(signers.length, 1)) {
    errors.push('multisig_config.threshold must be between 1 and the signer count.');
  }

  return {
    ok: errors.length === 0,
    chain_id: chainId,
    network: chainId === BASE_MAINNET_CHAIN_ID ? 'base-mainnet' : 'base-sepolia',
    multisig_address: multisigAddress,
    threshold,
    signers,
    required_confirmations: positiveInteger(options.confirmations, chainId === BASE_MAINNET_CHAIN_ID ? 3 : 2),
    rpc_url: chainConfig.rpcUrls[0],
    explorer_url: chainConfig.blockExplorerUrls[0],
    errors,
  };
}

export function normalizeHexAddress(value: unknown): HexAddress | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return HEX_ADDRESS_PATTERN.test(trimmed) ? (trimmed as HexAddress) : null;
}

function normalizeSignerList(value: unknown): HexAddress[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const signers: HexAddress[] = [];
  for (const entry of value) {
    const address = normalizeHexAddress(entry);
    if (!address) continue;

    const key = address.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    signers.push(address);
  }

  return signers;
}

function normalizeThreshold(value: unknown, signerCount: number): number {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return Math.min(value, Math.max(signerCount, 1));
  }

  return Math.min(2, Math.max(signerCount, 1));
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return DEFAULT_BASE_SEPOLIA_RPC_URL;
}
