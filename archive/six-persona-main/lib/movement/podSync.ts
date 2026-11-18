export const SYNC_ENVELOPE_KIND = 'society-of-explorers.encrypted-pod-sync';
export const SYNC_ENVELOPE_VERSION = 2;
export const SYNC_CIPHERTEXT_ENCODING = 'base64';
export const MAX_SYNC_CIPHERTEXT_BYTES = 256 * 1024;
export const MAX_SYNC_JSON_BYTES = 1024 * 1024;
export const MAX_SYNC_METADATA_BYTES = 8 * 1024;
export const BASELINE_POD_CIPHERTEXT_BYTES = 5287;

export interface PodSyncEnvelope {
  kind: typeof SYNC_ENVELOPE_KIND;
  version: typeof SYNC_ENVELOPE_VERSION;
  ciphertext_encoding: typeof SYNC_CIPHERTEXT_ENCODING;
  ciphertext: string;
  iv: string;
  commitment_hash: string;
  client_updated_at: string;
  device_id: string;
  base_sync_version: number;
  metadata?: Record<string, unknown>;
}

export interface PodSyncRpcResult {
  accepted: boolean;
  status: string;
  sync_version: number;
  previous_sync_version: number;
  last_commitment_hash: string | null;
  previous_commitment_hash?: string | null;
  rejected_commitment_hash?: string;
  client_updated_at: string;
  server_updated_at: string;
  conflict: boolean;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));

  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(',')}}`;
}

export function canonicalSyncCommitmentInput(envelope: Omit<PodSyncEnvelope, 'commitment_hash'>): string {
  return stableStringify({
    base_sync_version: envelope.base_sync_version,
    ciphertext: envelope.ciphertext,
    ciphertext_encoding: envelope.ciphertext_encoding,
    client_updated_at: envelope.client_updated_at,
    device_id: envelope.device_id,
    iv: envelope.iv,
    kind: envelope.kind,
    metadata: envelope.metadata || {},
    version: envelope.version,
  });
}
