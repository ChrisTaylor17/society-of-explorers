import { createHash } from 'crypto';
import {
  byteaToBuffer,
  describePodCustody,
  normalizePodMetadata,
  resolvePodKeyMode,
} from '@/lib/movement/pod';
import {
  POD_SEAL_RECEIPT_KIND,
  POD_SEAL_RECEIPT_VERSION,
  canonicalPodSealReceiptInput,
  type PodSealReceipt,
} from '@/lib/movement/podReceiptShared';

export {
  POD_SEAL_RECEIPT_KIND,
  POD_SEAL_RECEIPT_VERSION,
  type PodSealReceipt,
} from '@/lib/movement/podReceiptShared';

interface DataPodReceiptRow {
  ciphertext?: unknown;
  version?: number | null;
  last_commitment_hash?: string | null;
  last_committed_at?: string | null;
  updated_at?: string | null;
  sync_version?: number | null;
  sync_device_id?: string | null;
  sync_client_updated_at?: string | null;
  sync_status?: string | null;
  sync_conflict_count?: number | null;
  sync_metadata?: unknown;
}

export function buildPodSealReceipt(input: {
  memberId: string;
  pod: DataPodReceiptRow;
  issuedAt?: string;
}): PodSealReceipt {
  const syncMetadata = normalizePodMetadata(input.pod.sync_metadata);
  const keyMode = resolvePodKeyMode(input.pod);
  const custody = describePodCustody(keyMode, syncMetadata);
  const syncDeviceId = stringValue(input.pod.sync_device_id);
  const receiptWithoutHash: Omit<PodSealReceipt, 'receipt_hash'> = {
    kind: POD_SEAL_RECEIPT_KIND,
    receipt_version: POD_SEAL_RECEIPT_VERSION,
    issued_at: input.issuedAt || new Date().toISOString(),
    subject: {
      member_id_hash: sha256Hex(input.memberId),
      wallet_address_hash: sha256OrNull(syncMetadata.wallet_address_hash),
    },
    pod: {
      commitment_hash: sha256OrNull(input.pod.last_commitment_hash),
      committed_at: stringValue(input.pod.last_committed_at),
      updated_at: stringValue(input.pod.updated_at),
      pod_version: numberOrNull(input.pod.version),
      sync_version: numberOrNull(input.pod.sync_version),
      sync_status: stringValue(input.pod.sync_status),
      sync_client_updated_at: stringValue(input.pod.sync_client_updated_at),
      sync_device_id_hash: syncDeviceId ? sha256Hex(syncDeviceId) : null,
      sync_conflict_count: numberOrNull(input.pod.sync_conflict_count) ?? 0,
      ciphertext_bytes: ciphertextBytes(input.pod.ciphertext),
    },
    custody: {
      key_mode: keyMode,
      custody_status: custody.custody_status,
      sovereignty_status: custody.sovereignty_status,
      custody_verification: custody.custody_verification,
      attestation: stringValue(syncMetadata.attestation),
      key_derivation: stringValue(syncMetadata.key_derivation),
      key_exportable: booleanOrNull(syncMetadata.key_exportable),
      server_can_decrypt_pod: booleanOrNull(syncMetadata.server_can_decrypt_pod),
      wallet_signature_stored: booleanOrNull(syncMetadata.wallet_signature_stored),
    },
    hashes: {
      wallet_key_message_hash: sha256OrNull(syncMetadata.wallet_key_message_hash),
      wallet_signature_hash: sha256OrNull(syncMetadata.wallet_signature_hash),
    },
    privacy: {
      includes_ciphertext: false,
      includes_plaintext: false,
      includes_raw_wallet_address: false,
      includes_raw_wallet_signature: false,
      includes_raw_member_identifier: false,
      note:
        'This receipt proves the pod seal metadata without including encrypted pod bytes, plaintext memory, raw wallet address, raw signature, or raw member identifier.',
    },
    verification: {
      receipt_hash_format: 'sha256:pod-seal-receipt-v1-canonical-json' as const,
      full_pod_verifier_route: '/movement/pod/verify' as const,
      full_pod_export_route: '/api/movement/pod/export' as const,
      receipt_can_verify_ciphertext: false,
      full_pod_export_required_for_ciphertext_verification: true,
    },
  };

  return {
    ...receiptWithoutHash,
    receipt_hash: hashPodSealReceipt(receiptWithoutHash),
  };
}

export function hashPodSealReceipt(receipt: Omit<PodSealReceipt, 'receipt_hash'>): string {
  return sha256Hex(canonicalPodSealReceiptInput(receipt));
}

function ciphertextBytes(value: unknown): number {
  if (!value) return 0;
  try {
    return byteaToBuffer(value).byteLength;
  } catch {
    return 0;
  }
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256OrNull(value: unknown): string | null {
  const normalized = stringValue(value)?.toLowerCase() || null;
  return normalized && /^[0-9a-f]{64}$/.test(normalized) ? normalized : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}
