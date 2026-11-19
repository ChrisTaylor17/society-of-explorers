import {
  SYNC_CIPHERTEXT_ENCODING,
  SYNC_ENVELOPE_KIND,
  SYNC_ENVELOPE_VERSION,
  canonicalSyncCommitmentInput,
  stableStringify,
  type PodSyncEnvelope,
} from '@/lib/movement/podSync';

export interface EthereumProvider {
  request<T = unknown>(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<T>;
}

export interface WalletPodSealInput {
  payload: unknown;
  memberId: string;
  baseSyncVersion: number;
  deviceId: string;
  clientUpdatedAt: string;
  origin: string;
}

export interface WalletPodSealResult {
  envelope: PodSyncEnvelope;
  address: string;
  addressHash: string;
}

function getEthereumProvider(): EthereumProvider {
  const provider = typeof window === 'undefined'
    ? null
    : (window as Window & { ethereum?: unknown }).ethereum;

  if (!provider || typeof provider !== 'object' || typeof (provider as EthereumProvider).request !== 'function') {
    throw new Error('No browser wallet provider found.');
  }
  return provider as EthereumProvider;
}

export function walletPodProviderAvailable(): boolean {
  try {
    getEthereumProvider();
    return true;
  } catch {
    return false;
  }
}

export function getOrCreateWalletPodDeviceId(): string {
  const storageKey = 'soe:wallet-pod-device:v1';
  if (typeof window === 'undefined') return 'wallet-pod-serverless';

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored) return stored;

    const deviceId = `wallet-pod-${crypto.randomUUID()}`;
    window.localStorage.setItem(storageKey, deviceId);
    return deviceId;
  } catch {
    return `wallet-pod-${Date.now().toString(36)}`;
  }
}

async function requestWalletAddress(provider: EthereumProvider): Promise<string> {
  const accounts = await provider.request<string[]>({ method: 'eth_requestAccounts' });
  const address = accounts?.[0]?.trim();
  if (!address) throw new Error('No wallet account selected.');
  return address.toLowerCase();
}

function walletKeyMessage(input: { memberId: string; address: string; origin: string }): string {
  return [
    'Society of Explorers data pod key',
    '',
    'This signature creates a local encryption key for your private data pod.',
    'It does not authorize a transaction, payment, token transfer, or account change.',
    '',
    `Origin: ${input.origin}`,
    `Member: ${input.memberId}`,
    `Wallet: ${input.address.toLowerCase()}`,
    'Key version: wallet-pod-v1',
  ].join('\n');
}

function hexToBytes(value: string): Uint8Array {
  const hex = value.startsWith('0x') ? value.slice(2) : value;
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) {
    throw new Error('Wallet signature was not valid hex.');
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.byteLength; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.byteLength; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary);
}

function stringToHex(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function deriveWalletAesKey(input: {
  signature: string;
  memberId: string;
  address: string;
  origin: string;
}): Promise<CryptoKey> {
  const signatureBytes = hexToBytes(input.signature);
  const keyMaterial = await crypto.subtle.importKey('raw', toArrayBuffer(signatureBytes), 'HKDF', false, ['deriveKey']);
  const encoder = new TextEncoder();

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode(`soe:wallet-pod:v1:${input.origin}:${input.memberId}:${input.address.toLowerCase()}`),
      info: encoder.encode('Society of Explorers wallet-derived AES-GCM pod key'),
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function sealPayloadWithWalletPodKey(input: WalletPodSealInput): Promise<WalletPodSealResult> {
  const provider = getEthereumProvider();
  const address = await requestWalletAddress(provider);
  const message = walletKeyMessage({
    memberId: input.memberId,
    address,
    origin: input.origin,
  });
  const signature = await provider.request<string>({
    method: 'personal_sign',
    params: [stringToHex(message), address],
  });
  const key = await deriveWalletAesKey({
    signature,
    memberId: input.memberId,
    address,
    origin: input.origin,
  });

  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const encodedPayload = new TextEncoder().encode(stableStringify(input.payload));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, toArrayBuffer(encodedPayload));
  const ciphertext = bytesToBase64(new Uint8Array(encrypted));
  const ivBase64 = bytesToBase64(iv);
  const encoder = new TextEncoder();
  const addressHash = await sha256Hex(encoder.encode(address));
  const messageHash = await sha256Hex(encoder.encode(message));
  const signatureHash = await sha256Hex(hexToBytes(signature));

  const envelopeWithoutCommitment: Omit<PodSyncEnvelope, 'commitment_hash'> = {
    kind: SYNC_ENVELOPE_KIND,
    version: SYNC_ENVELOPE_VERSION,
    ciphertext_encoding: SYNC_CIPHERTEXT_ENCODING,
    ciphertext,
    iv: ivBase64,
    client_updated_at: input.clientUpdatedAt,
    device_id: input.deviceId,
    base_sync_version: input.baseSyncVersion,
    metadata: {
      source: 'wallet-refresh',
      surface: 'movement-pod',
      key_mode: 'client_wallet_derived',
      custody: 'wallet_signature_webcrypto',
      key_derivation: 'wallet_signature_hkdf_sha256_v1',
      sovereignty_level: 'member_keyed_ciphertext',
      wallet_address_hash: addressHash,
      wallet_key_message_hash: messageHash,
      wallet_signature_hash: signatureHash,
      wallet_signature_stored: false,
      key_exportable: false,
      server_can_decrypt_pod: false,
      attestation: 'wallet_signature_hashes_only',
      wallet_message_version: 'wallet-pod-v1',
      payload_encoding: 'stable-json',
      base_sync_version: input.baseSyncVersion,
    },
  };
  const commitmentHash = await sha256Hex(
    new TextEncoder().encode(canonicalSyncCommitmentInput(envelopeWithoutCommitment)),
  );

  return {
    address,
    addressHash,
    envelope: {
      ...envelopeWithoutCommitment,
      commitment_hash: commitmentHash,
    },
  };
}
