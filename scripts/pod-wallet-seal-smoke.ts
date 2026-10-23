import { Wallet, getBytes } from 'ethers';
import {
  getOrCreateWalletPodDeviceId,
  sealPayloadWithWalletPodKey,
  type EthereumProvider,
} from '../lib/movement/walletPodCrypto';
import { verifyPodExportEnvelope } from '../lib/movement/podExportVerification';
import { buildPodSealReceipt } from '../lib/movement/podReceipt';

const TEST_MEMBER_ID = '00000000-0000-4000-8000-000000000001';
const TEST_ORIGIN = 'http://localhost:3000';
const TEST_CLIENT_UPDATED_AT = '2026-05-26T00:00:00.000Z';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const wallet = Wallet.createRandom();
  const address = await wallet.getAddress();
  const provider: EthereumProvider = {
    async request<T = unknown>(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<T> {
      if (args.method === 'eth_requestAccounts') return [address] as T;

      if (args.method === 'personal_sign') {
        const params = Array.isArray(args.params) ? args.params : [];
        const messageHex = String(params[0] || '');
        const signature = await wallet.signMessage(getBytes(messageHex));
        return signature as T;
      }

      throw new Error(`Unexpected mock wallet method: ${args.method}`);
    },
  };

  Object.defineProperty(globalThis, 'window', {
    value: {
      ethereum: provider,
      localStorage: new MemoryStorage(),
    },
    configurable: true,
  });

  const deviceId = getOrCreateWalletPodDeviceId();
  const sealed = await sealPayloadWithWalletPodKey({
    payload: {
      version: 1,
      generated_at: TEST_CLIENT_UPDATED_AT,
      member: { id: TEST_MEMBER_ID },
      practice_responses: [{ id: 'response-1', response_text: 'A private thought.' }],
    },
    memberId: TEST_MEMBER_ID,
    baseSyncVersion: 0,
    deviceId,
    clientUpdatedAt: TEST_CLIENT_UPDATED_AT,
    origin: TEST_ORIGIN,
  });

  assert(sealed.address.toLowerCase() === address.toLowerCase(), 'sealed address should match mock wallet');
  assert(sealed.envelope.metadata?.key_mode === 'client_wallet_derived', 'key mode should be wallet-derived');
  assert(sealed.envelope.metadata?.wallet_signature_stored === false, 'raw wallet signature must not be marked stored');
  assert(!('wallet_signature' in (sealed.envelope.metadata || {})), 'raw wallet signature must not be stored in metadata');
  assert(typeof sealed.envelope.metadata?.wallet_signature_hash === 'string', 'wallet signature hash must be recorded');
  assert(sealed.envelope.metadata?.base_sync_version === 0, 'base sync version must be exported for verification');

  const exportEnvelope = {
    kind: 'society-of-explorers.encrypted-pod',
    member_id: TEST_MEMBER_ID,
    version: sealed.envelope.version,
    algorithm: 'AES-256-GCM',
    key_mode: 'client_wallet_derived',
    custody_status: 'Wallet-derived client key',
    sovereignty_status: 'Client-attested wallet custody',
    custody_verification: 'wallet_signature_attested',
    ciphertext_encoding: sealed.envelope.ciphertext_encoding,
    ciphertext: sealed.envelope.ciphertext,
    iv: sealed.envelope.iv,
    last_commitment_hash: sealed.envelope.commitment_hash,
    last_committed_at: TEST_CLIENT_UPDATED_AT,
    updated_at: TEST_CLIENT_UPDATED_AT,
    sync_version: 1,
    sync_device_id: sealed.envelope.device_id,
    sync_client_updated_at: sealed.envelope.client_updated_at,
    sync_status: 'accepted',
    sync_conflict_count: 0,
    sync_metadata: sealed.envelope.metadata,
  };

  const verification = await verifyPodExportEnvelope(exportEnvelope);
  assert(verification.status === 'valid', `pod export verification should be valid, got ${verification.status}`);

  const receipt = buildPodSealReceipt({
    memberId: TEST_MEMBER_ID,
    issuedAt: TEST_CLIENT_UPDATED_AT,
    pod: {
      ciphertext: sealed.envelope.ciphertext,
      version: sealed.envelope.version,
      last_commitment_hash: sealed.envelope.commitment_hash,
      last_committed_at: TEST_CLIENT_UPDATED_AT,
      updated_at: TEST_CLIENT_UPDATED_AT,
      sync_version: 1,
      sync_device_id: sealed.envelope.device_id,
      sync_client_updated_at: sealed.envelope.client_updated_at,
      sync_status: 'accepted',
      sync_conflict_count: 0,
      sync_metadata: sealed.envelope.metadata,
    },
  });
  const receiptVerification = await verifyPodExportEnvelope(receipt);
  assert(
    receiptVerification.status === 'valid',
    `pod seal receipt verification should be valid, got ${receiptVerification.status}`,
  );

  console.log(JSON.stringify({
    ok: true,
    address_hash: sealed.addressHash,
    device_id: deviceId,
    commitment_hash: sealed.envelope.commitment_hash,
    receipt_hash: receipt.receipt_hash,
    verification: verification.status,
    receipt_verification: receiptVerification.status,
    custody: verification.custody,
    attestation: verification.attestation,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
