'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BASE_SEPOLIA_CHAIN_ID,
  createLiveBaseWalletConnectionProfile,
  getDefaultLiveBaseChainId,
  getLiveBaseChainConfigs,
} from '../blockchain/liveBaseProfile';
import type { MilestoneDefinition } from '../movement/explorerGraph';

type HexAddress = `0x${string}`;
type HexValue = `0x${string}`;

interface EthereumRpcError extends Error {
  code?: number;
  data?: unknown;
}

interface EthereumProvider {
  request<T = unknown>(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<T>;
  on?(event: 'accountsChanged', listener: (accounts: string[]) => void): void;
  on?(event: 'chainChanged', listener: (chainId: string) => void): void;
  on?(event: 'disconnect', listener: (error: EthereumRpcError) => void): void;
  removeListener?(event: 'accountsChanged', listener: (accounts: string[]) => void): void;
  removeListener?(event: 'chainChanged', listener: (chainId: string) => void): void;
  removeListener?(event: 'disconnect', listener: (error: EthereumRpcError) => void): void;
}

interface TransactionReceipt {
  transactionHash: HexValue;
  blockHash: HexValue;
  blockNumber: HexValue;
  status?: HexValue;
}

export interface ChainConfig {
  chainId: number;
  chainName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorerUrls: string[];
}

export interface MilestoneFundingResult {
  project_id: string;
  milestone_id: number;
  chain_id: number;
  escrow_address: HexAddress;
  amount_wei: string;
  tx_hash: HexValue;
  receipt: TransactionReceipt;
  funded_milestone_patch: Pick<MilestoneDefinition, 'milestone_id' | 'status' | 'tx_hash_attachment'>;
}

export interface UseWalletConnectionOptions {
  provider?: EthereumProvider | null;
  defaultChainId?: number;
  chainConfigs?: Record<number, ChainConfig>;
  confirmations?: number;
  receiptPollingIntervalMs?: number;
  receiptTimeoutMs?: number;
  onMilestoneFunded?: (result: MilestoneFundingResult) => void;
}

export interface UseWalletConnectionResult {
  account: HexAddress | null;
  chain_id: number | null;
  is_connecting: boolean;
  wallet_error: string | null;
  is_connected: boolean;
  provider_available: boolean;
  eagerConnect: () => Promise<void>;
  connect: () => Promise<HexAddress | null>;
  disconnect: () => void;
  ensureNetwork: (targetChainId: number) => Promise<void>;
  triggerMilestoneFunding: (
    projectId: string,
    milestoneId: number,
    escrowAddress: string,
    amountWei: string,
    targetChainId?: number,
  ) => Promise<MilestoneFundingResult>;
  clearWalletError: () => void;
}

const DEFAULT_CHAIN_CONFIGS: Record<number, ChainConfig> = {
  1: {
    chainId: 1,
    chainName: 'Ethereum Mainnet',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://ethereum.publicnode.com'],
    blockExplorerUrls: ['https://etherscan.io'],
  },
  10: {
    chainId: 10,
    chainName: 'OP Mainnet',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://mainnet.optimism.io'],
    blockExplorerUrls: ['https://optimistic.etherscan.io'],
  },
  8453: {
    chainId: 8453,
    chainName: 'Base',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://mainnet.base.org'],
    blockExplorerUrls: ['https://basescan.org'],
  },
  [BASE_SEPOLIA_CHAIN_ID]: {
    chainId: BASE_SEPOLIA_CHAIN_ID,
    chainName: 'Base Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://sepolia.base.org'],
    blockExplorerUrls: ['https://sepolia.basescan.org'],
  },
  42161: {
    chainId: 42161,
    chainName: 'Arbitrum One',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://arb1.arbitrum.io/rpc'],
    blockExplorerUrls: ['https://arbiscan.io'],
  },
};

export function useWalletConnection(
  options: UseWalletConnectionOptions = {},
): UseWalletConnectionResult {
  const [account, setAccount] = useState<HexAddress | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [providerAvailable, setProviderAvailable] = useState(false);

  const optionsRef = useRef(options);
  optionsRef.current = options;
  const liveBaseProfile = useMemo(
    () =>
      createLiveBaseWalletConnectionProfile({
        defaultChainId: options.defaultChainId,
        confirmations: options.confirmations,
        receiptPollingIntervalMs: options.receiptPollingIntervalMs,
        receiptTimeoutMs: options.receiptTimeoutMs,
      }),
    [
      options.confirmations,
      options.defaultChainId,
      options.receiptPollingIntervalMs,
      options.receiptTimeoutMs,
    ],
  );

  const chainConfigs = useMemo<Record<number, ChainConfig>>(
    () => ({ ...DEFAULT_CHAIN_CONFIGS, ...getLiveBaseChainConfigs(), ...options.chainConfigs }),
    [options.chainConfigs],
  );

  const getProvider = useCallback((): EthereumProvider | null => {
    if (optionsRef.current.provider) return optionsRef.current.provider;
    if (typeof window === 'undefined') return null;
    const ethereum = (window as Window & { ethereum?: EthereumProvider }).ethereum;
    return ethereum || null;
  }, []);

  const refreshChainId = useCallback(async (provider: EthereumProvider): Promise<number | null> => {
    const chainHex = await provider.request<string>({ method: 'eth_chainId' });
    const nextChainId = parseChainId(chainHex);
    setChainId(nextChainId);
    return nextChainId;
  }, []);

  const eagerConnect = useCallback(async () => {
    const provider = getProvider();
    setProviderAvailable(Boolean(provider));
    if (!provider) return;

    try {
      const accounts = await provider.request<string[]>({ method: 'eth_accounts' });
      await refreshChainId(provider);
      const nextAccount = normalizeAddress(accounts[0]);
      setAccount(nextAccount);
      setWalletError(null);
    } catch (error) {
      setWalletError(errorMessage(error));
    }
  }, [getProvider, refreshChainId]);

  const connect = useCallback(async (): Promise<HexAddress | null> => {
    const provider = getProvider();
    setProviderAvailable(Boolean(provider));
    if (!provider) {
      setWalletError('No EIP-1193 wallet provider was found in this browser.');
      return null;
    }

    setIsConnecting(true);
    try {
      const accounts = await provider.request<string[]>({ method: 'eth_requestAccounts' });
      await refreshChainId(provider);
      const nextAccount = normalizeAddress(accounts[0]);
      setAccount(nextAccount);
      setWalletError(null);
      return nextAccount;
    } catch (error) {
      setWalletError(errorMessage(error));
      return null;
    } finally {
      setIsConnecting(false);
    }
  }, [getProvider, refreshChainId]);

  const disconnect = useCallback(() => {
    setAccount(null);
    setWalletError(null);
  }, []);

  const ensureNetwork = useCallback(
    async (targetChainId: number) => {
      const provider = getProvider();
      if (!provider) throw new Error('No EIP-1193 wallet provider was found in this browser.');

      const targetConfig = chainConfigs[targetChainId];
      if (!targetConfig) throw new Error(`Unsupported chain_id ${targetChainId}.`);

      const currentChainId = await refreshChainId(provider);
      if (currentChainId === targetChainId) return;

      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: numberToHex(targetChainId) }],
        });
      } catch (error) {
        const rpcError = error as EthereumRpcError;
        if (rpcError.code !== 4902) throw error;

        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: numberToHex(targetConfig.chainId),
              chainName: targetConfig.chainName,
              nativeCurrency: targetConfig.nativeCurrency,
              rpcUrls: targetConfig.rpcUrls,
              blockExplorerUrls: targetConfig.blockExplorerUrls,
            },
          ],
        });

        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: numberToHex(targetChainId) }],
        });
      }

      setChainId(targetChainId);
    },
    [chainConfigs, getProvider, refreshChainId],
  );

  const triggerMilestoneFunding = useCallback(
    async (
      projectId: string,
      milestoneId: number,
      escrowAddress: string,
      amountWei: string,
      targetChainId?: number,
    ): Promise<MilestoneFundingResult> => {
      const provider = getProvider();
      if (!provider) throw new Error('No EIP-1193 wallet provider was found in this browser.');

      const activeAccount = account || (await connect());
      if (!activeAccount) throw new Error('Wallet connection is required before funding a milestone.');

      const target =
        targetChainId ??
        optionsRef.current.defaultChainId ??
        chainId ??
        liveBaseProfile.defaultChainId ??
        getDefaultLiveBaseChainId();
      if (!target) throw new Error('No target chain_id is available for milestone funding.');

      const normalizedEscrowAddress = normalizeAddress(escrowAddress);
      if (!normalizedEscrowAddress) throw new Error('escrowAddress must be a valid 20-byte hex address.');

      const normalizedAmountWei = normalizeWeiAmount(amountWei);
      await ensureNetwork(target);

      const txHash = await provider.request<HexValue>({
        method: 'eth_sendTransaction',
        params: [
          {
            from: activeAccount,
            to: normalizedEscrowAddress,
            value: bigintToHex(BigInt(normalizedAmountWei)),
            data: '0x',
          },
        ],
      });

      const receipt = await waitForTransactionReceipt(provider, txHash, {
        pollingIntervalMs:
          optionsRef.current.receiptPollingIntervalMs ?? liveBaseProfile.receiptPollingIntervalMs,
        timeoutMs: optionsRef.current.receiptTimeoutMs ?? liveBaseProfile.receiptTimeoutMs,
        confirmations: optionsRef.current.confirmations ?? liveBaseProfile.confirmations,
      });
      if (receipt.status && receipt.status !== '0x1') {
        throw new Error(`Transaction ${txHash} was mined but did not succeed.`);
      }

      const result: MilestoneFundingResult = {
        project_id: projectId,
        milestone_id: milestoneId,
        chain_id: target,
        escrow_address: normalizedEscrowAddress,
        amount_wei: normalizedAmountWei,
        tx_hash: txHash,
        receipt,
        funded_milestone_patch: {
          milestone_id: milestoneId,
          status: 'funded',
          tx_hash_attachment: txHash,
        },
      };

      optionsRef.current.onMilestoneFunded?.(result);
      setWalletError(null);
      return result;
    },
    [account, chainId, connect, ensureNetwork, getProvider, liveBaseProfile],
  );

  useEffect(() => {
    const provider = getProvider();
    setProviderAvailable(Boolean(provider));
    if (!provider) return undefined;

    const handleAccountsChanged = (accounts: string[]) => {
      const nextAccount = normalizeAddress(accounts[0]);
      setAccount(nextAccount);
      if (!nextAccount) setWalletError(null);
    };

    const handleChainChanged = (nextChainId: string) => {
      setChainId(parseChainId(nextChainId));
      setWalletError(null);
    };

    const handleDisconnect = (error: EthereumRpcError) => {
      setAccount(null);
      setWalletError(error?.message || 'Wallet disconnected.');
    };

    provider.on?.('accountsChanged', handleAccountsChanged);
    provider.on?.('chainChanged', handleChainChanged);
    provider.on?.('disconnect', handleDisconnect);
    void eagerConnect();

    return () => {
      provider.removeListener?.('accountsChanged', handleAccountsChanged);
      provider.removeListener?.('chainChanged', handleChainChanged);
      provider.removeListener?.('disconnect', handleDisconnect);
    };
  }, [eagerConnect, getProvider]);

  return {
    account,
    chain_id: chainId,
    is_connecting: isConnecting,
    wallet_error: walletError,
    is_connected: Boolean(account),
    provider_available: providerAvailable,
    eagerConnect,
    connect,
    disconnect,
    ensureNetwork,
    triggerMilestoneFunding,
    clearWalletError: () => setWalletError(null),
  };
}

async function waitForTransactionReceipt(
  provider: EthereumProvider,
  txHash: HexValue,
  options: {
    pollingIntervalMs: number;
    timeoutMs: number;
    confirmations: number;
  },
): Promise<TransactionReceipt> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < options.timeoutMs) {
    const receipt = await provider.request<TransactionReceipt | null>({
      method: 'eth_getTransactionReceipt',
      params: [txHash],
    });

    if (receipt?.blockNumber) {
      if (options.confirmations <= 1) return receipt;

      const latestBlock = await provider.request<HexValue>({ method: 'eth_blockNumber' });
      const latest = BigInt(latestBlock);
      const mined = BigInt(receipt.blockNumber);
      if (latest >= mined && latest - mined + 1n >= BigInt(options.confirmations)) {
        return receipt;
      }
    }

    await sleep(options.pollingIntervalMs);
  }

  throw new Error(`Timed out waiting for transaction receipt ${txHash}.`);
}

function normalizeAddress(value: unknown): HexAddress | null {
  if (typeof value !== 'string') return null;
  return /^0x[a-fA-F0-9]{40}$/.test(value) ? (value as HexAddress) : null;
}

function normalizeWeiAmount(value: string): string {
  if (!/^\d+$/.test(value)) throw new Error('amountWei must be a uint256 decimal string.');
  return value.replace(/^0+(?=\d)/, '');
}

function parseChainId(value: string): number {
  return Number.parseInt(value, value.startsWith('0x') ? 16 : 10);
}

function numberToHex(value: number): HexValue {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('chain_id must be a positive integer.');
  return `0x${value.toString(16)}`;
}

function bigintToHex(value: bigint): HexValue {
  if (value < 0n) throw new Error('Transaction value cannot be negative.');
  return `0x${value.toString(16)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown wallet error';
  }
}
