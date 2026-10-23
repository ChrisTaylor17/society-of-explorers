import {
  SYNC_CIPHERTEXT_ENCODING,
  SYNC_ENVELOPE_KIND,
  SYNC_ENVELOPE_VERSION,
  canonicalSyncCommitmentInput,
} from '@/lib/movement/podSync';
import {
  POD_SEAL_RECEIPT_KIND,
  canonicalPodSealReceiptInput,
  type PodSealReceipt,
} from '@/lib/movement/podReceiptShared';

export type PodExportVerificationStatus = 'idle' | 'valid' | 'mismatch' | 'incomplete' | 'invalid';

export interface PodExportEnvelope {
  kind?: unknown;
  ciphertext?: unknown;
  iv?: unknown;
  last_commitment_hash?: unknown;
  sync_client_updated_at?: unknown;
  sync_device_id?: unknown;
  sync_metadata?: unknown;
  key_mode?: unknown;
  custody_verification?: unknown;
}

export interface PodExportVerificationResult {
  status: PodExportVerificationStatus;
  title: string;
  detail: string;
  computedHash?: string;
  expectedHash?: string;
  custody?: string;
  attestation?: string;
}

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

export async function verifyPodExportText(rawJson: string): Promise<PodExportVerificationResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return {
      status: 'invalid',
      title: 'Invalid JSON',
      detail: 'The pasted pod export could not be parsed as JSON.',
    };
  }

  return verifyPodExportEnvelope(parsed);
}

export async function verifyPodExportEnvelope(value: unknown): Promise<PodExportVerificationResult> {
  if (!isRecord(value)) {
    return {
      status: 'invalid',
      title: 'Invalid pod',
      detail: 'The export must be a JSON object.',
    };
  }

  const parsed = value as PodExportEnvelope;
  if (value.kind === POD_SEAL_RECEIPT_KIND) {
    return verifyPodSealReceipt(value);
  }

  if (parsed.kind !== 'society-of-explorers.encrypted-pod') {
    return {
      status: 'invalid',
      title: 'Unknown export',
      detail: 'This does not look like a Society of Explorers encrypted pod export.',
    };
  }

  const metadata = isRecord(parsed.sync_metadata) ? parsed.sync_metadata : {};
  const ciphertext = stringValue(parsed.ciphertext);
  const iv = stringValue(parsed.iv);
  const clientUpdatedAt = normalizeIsoTimestamp(parsed.sync_client_updated_at);
  const deviceId = stringValue(parsed.sync_device_id);
  const expectedHash = normalizeHash(parsed.last_commitment_hash);
  const baseSyncVersion = numberValue(metadata.base_sync_version);
  const custody = stringValue(parsed.key_mode) || stringValue(metadata.key_mode) || 'unknown';
  const attestation = stringValue(parsed.custody_verification) || stringValue(metadata.attestation) || 'none';

  if (!ciphertext || !iv || !clientUpdatedAt || !deviceId || !expectedHash || baseSyncVersion === null) {
    return {
      status: 'incomplete',
      title: 'Verification incomplete',
      detail:
        'This export is missing one of the canonical sync fields needed to recompute the commitment. Refresh or wallet-seal the pod again, then export a newer file.',
      expectedHash: expectedHash || undefined,
      custody,
      attestation,
    };
  }

  const commitmentInput = canonicalSyncCommitmentInput({
    kind: SYNC_ENVELOPE_KIND,
    version: SYNC_ENVELOPE_VERSION,
    ciphertext_encoding: SYNC_CIPHERTEXT_ENCODING,
    ciphertext,
    iv,
    client_updated_at: clientUpdatedAt,
    device_id: deviceId,
    base_sync_version: baseSyncVersion,
    metadata,
  });
  const computedHash = await sha256Hex(commitmentInput);

  if (computedHash === expectedHash) {
    return {
      status: 'valid',
      title: 'Commitment matched',
      detail:
        'The export ciphertext, sync metadata, device id, timestamp, and base version reproduce the saved commitment hash.',
      computedHash,
      expectedHash,
      custody,
      attestation,
    };
  }

  return {
    status: 'mismatch',
    title: 'Commitment mismatch',
    detail: 'The exported fields do not reproduce the saved commitment. Treat this pod export as changed or incomplete.',
    computedHash,
    expectedHash,
    custody,
    attestation,
  };
}

async function verifyPodSealReceipt(value: Record<string, unknown>): Promise<PodExportVerificationResult> {
  const expectedHash = normalizeHash(value.receipt_hash);
  const custody = isRecord(value.custody) ? stringValue(value.custody.key_mode) || 'unknown' : 'unknown';
  const attestation = isRecord(value.custody) ? stringValue(value.custody.attestation) || 'none' : 'none';

  if (!expectedHash) {
    return {
      status: 'incomplete',
      title: 'Receipt incomplete',
      detail: 'This pod seal receipt is missing a valid receipt_hash.',
      custody,
      attestation,
    };
  }

  const receiptWithoutHash = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== 'receipt_hash'),
  );
  const computedHash = await sha256Hex(
    canonicalPodSealReceiptInput(receiptWithoutHash as Omit<PodSealReceipt, 'receipt_hash'>),
  );

  if (computedHash === expectedHash) {
    return {
      status: 'valid',
      title: 'Receipt matched',
      detail:
        'The receipt fields reproduce the saved receipt hash. This confirms the seal receipt was not changed; use a full pod export to verify ciphertext commitment.',
      computedHash,
      expectedHash,
      custody,
      attestation,
    };
  }

  return {
    status: 'mismatch',
    title: 'Receipt mismatch',
    detail: 'The receipt fields do not reproduce the saved receipt hash. Treat this receipt as changed or incomplete.',
    computedHash,
    expectedHash,
    custody,
    attestation,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function normalizeHash(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return SHA256_HEX_PATTERN.test(normalized) ? normalized : null;
}

function normalizeIsoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
