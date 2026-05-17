// scripts/stress-test-sync.ts
// Run: source .env.local && npx tsx scripts/stress-test-sync.ts

import { createCipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  BASELINE_POD_CIPHERTEXT_BYTES,
  PodSyncEnvelope,
  SYNC_CIPHERTEXT_ENCODING,
  SYNC_ENVELOPE_KIND,
  SYNC_ENVELOPE_VERSION,
  canonicalSyncCommitmentInput,
} from '../lib/movement/podSync';

interface PodStatsResponse {
  stats: {
    exists: boolean;
    size_bytes: number;
    last_commitment_hash: string | null;
    sync_version: number | null;
    sync_device_id: string | null;
    sync_client_updated_at: string | null;
    sync_status: string | null;
    sync_conflict_count: number;
  };
}

interface PodExportEnvelope {
  kind: string;
  member_id: string;
  version: number;
  ciphertext_encoding: string;
  ciphertext: string;
  iv: string;
  last_commitment_hash: string | null;
  sync_version: number | null;
  sync_device_id: string | null;
  sync_client_updated_at: string | null;
  sync_status: string | null;
  sync_conflict_count: number;
}

interface PlannedUpdate {
  seq: number;
  instanceId: string;
  deviceId: string;
  clientUpdatedAt: string;
  payloadBytes: number;
  envelope: PodSyncEnvelope;
}

interface SyncAttemptResult {
  update: PlannedUpdate;
  status: number;
  ok: boolean;
  body: unknown;
}

const baseUrl = (process.env.SYNC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
let memberId = process.env.SOE_STRESS_MEMBER_ID;
const totalUpdates = Number.parseInt(process.env.SOE_STRESS_TOTAL || '50', 10);
const targetCiphertextBytes = Number.parseInt(
  process.env.SOE_STRESS_CIPHERTEXT_BYTES || '4096',
  10,
);
const deviceA = process.env.SOE_STRESS_DEVICE_A || 'workstation-a';
const deviceB = process.env.SOE_STRESS_DEVICE_B || 'background-server-b';
const keepEphemeralMember = process.env.SOE_STRESS_KEEP_MEMBER === '1';

if (!Number.isSafeInteger(totalUpdates) || totalUpdates < 2) {
  throw new Error('SOE_STRESS_TOTAL must be an integer of at least 2.');
}

if (
  !Number.isSafeInteger(targetCiphertextBytes) ||
  targetCiphertextBytes < 256 ||
  targetCiphertextBytes > BASELINE_POD_CIPHERTEXT_BYTES
) {
  throw new Error(
    `SOE_STRESS_CIPHERTEXT_BYTES must be between 256 and ${BASELINE_POD_CIPHERTEXT_BYTES}.`,
  );
}

async function main() {
  const stressMember = await ensureStressMember();

  try {
    const before = await getStats();
    const baseSyncVersion = before.stats.sync_version ?? 0;
    const updates = planUpdates(baseSyncVersion);
    const expectedWinner = updates[updates.length - 1];

    console.log(
      JSON.stringify(
        {
          phase: 'start',
          base_url: baseUrl,
          member_id: memberId,
          ephemeral_member: stressMember.ephemeral,
          base_sync_version: baseSyncVersion,
          total_updates: updates.length,
          target_ciphertext_bytes: targetCiphertextBytes,
        },
        null,
        2,
      ),
    );

    const results = await Promise.all(updates.map((update) => postSync(update)));
    const hardFailures = results.filter((result) => result.status !== 200 && result.status !== 409);
    const accepted = results.filter((result) => result.status === 200 && result.ok);
    const conflicts = results.filter((result) => result.status === 409);

    if (hardFailures.length > 0) {
      throw new Error(
        `Unexpected sync failures: ${JSON.stringify(
          hardFailures.map((failure) => ({
            seq: failure.update.seq,
            status: failure.status,
            body: failure.body,
          })),
          null,
          2,
        )}`,
      );
    }

    if (accepted.length === 0) {
      throw new Error('No sync update was accepted.');
    }

    const after = await getStats();
    const exported = await getExport();

    if (after.stats.last_commitment_hash !== expectedWinner.envelope.commitment_hash) {
      throw new Error(
        `Final stats commitment mismatch. expected=${expectedWinner.envelope.commitment_hash} actual=${after.stats.last_commitment_hash}`,
      );
    }

    if (exported.last_commitment_hash !== expectedWinner.envelope.commitment_hash) {
      throw new Error(
        `Final export commitment mismatch. expected=${expectedWinner.envelope.commitment_hash} actual=${exported.last_commitment_hash}`,
      );
    }

    if (after.stats.size_bytes !== expectedWinner.payloadBytes) {
      throw new Error(
        `Final pod size mismatch. expected=${expectedWinner.payloadBytes} actual=${after.stats.size_bytes}`,
      );
    }

    if (exported.ciphertext !== expectedWinner.envelope.ciphertext) {
      throw new Error('Final export ciphertext does not match the winning encrypted payload.');
    }

    if ((after.stats.sync_version ?? 0) < baseSyncVersion + accepted.length) {
      throw new Error(
        `sync_version did not advance for every accepted write. base=${baseSyncVersion} accepted=${accepted.length} final=${after.stats.sync_version}`,
      );
    }

    console.log(
      JSON.stringify(
        {
          phase: 'complete',
          accepted: accepted.length,
          conflicts: conflicts.length,
          final_sync_version: after.stats.sync_version,
          final_sync_status: after.stats.sync_status,
          final_device_id: after.stats.sync_device_id,
          final_client_updated_at: after.stats.sync_client_updated_at,
          final_commitment_hash: after.stats.last_commitment_hash,
          final_size_bytes: after.stats.size_bytes,
        },
        null,
        2,
      ),
    );
  } finally {
    if (stressMember.ephemeral && !keepEphemeralMember) {
      await cleanupStressMember(stressMember.id);
    }
  }
}

async function ensureStressMember(): Promise<{ id: string; ephemeral: boolean }> {
  if (memberId) return { id: memberId, ephemeral: false };

  const supabase = getSupabaseAdmin();
  const id = randomUUID();
  const { error } = await supabase.from('members').insert({
    id,
    display_name: 'Pod Sync Stress Test',
    tier: 'free',
    wallet_address: `stress-test-sync-${Date.now()}`,
  });

  if (error) throw new Error(`Failed to create stress member: ${error.message}`);

  memberId = id;
  return { id, ephemeral: true };
}

async function cleanupStressMember(id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('members').delete().eq('id', id);
  if (error) throw new Error(`Failed to clean up stress member ${id}: ${error.message}`);
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing SOE_STRESS_MEMBER_ID, or NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for ephemeral stress member setup.',
    );
  }
  return createClient(url, key);
}

function currentMemberId(): string {
  if (!memberId) throw new Error('Stress member was not initialized.');
  return memberId;
}

function planUpdates(baseSyncVersion: number): PlannedUpdate[] {
  const startTime = Date.now() - totalUpdates * 1000;

  return Array.from({ length: totalUpdates }, (_, index) => {
    const instanceId = index % 2 === 0 ? 'local-workstation' : 'background-server';
    const deviceId = index % 2 === 0 ? deviceA : deviceB;
    const clientUpdatedAt = new Date(startTime + index * 1000).toISOString();
    const encrypted = encryptSyntheticPayload({
      seq: index,
      instanceId,
      deviceId,
      clientUpdatedAt,
    });
    const metadata = {
      instance_id: instanceId,
      sync_reason: 'stress-test',
      sequence: index,
      vector: {
        [deviceId]: index + 1,
      },
      payload_bytes: encrypted.ciphertext.byteLength,
      baseline_bytes: BASELINE_POD_CIPHERTEXT_BYTES,
    };
    const envelopeWithoutCommitment: Omit<PodSyncEnvelope, 'commitment_hash'> = {
      kind: SYNC_ENVELOPE_KIND,
      version: SYNC_ENVELOPE_VERSION,
      ciphertext_encoding: SYNC_CIPHERTEXT_ENCODING,
      ciphertext: encrypted.ciphertext.toString('base64'),
      iv: encrypted.iv.toString('base64'),
      client_updated_at: clientUpdatedAt,
      device_id: deviceId,
      base_sync_version: baseSyncVersion,
      metadata,
    };
    const commitmentHash = createHash('sha256')
      .update(canonicalSyncCommitmentInput(envelopeWithoutCommitment))
      .digest('hex');

    return {
      seq: index,
      instanceId,
      deviceId,
      clientUpdatedAt,
      payloadBytes: encrypted.ciphertext.byteLength,
      envelope: {
        ...envelopeWithoutCommitment,
        commitment_hash: commitmentHash,
      },
    };
  });
}

function encryptSyntheticPayload(input: {
  seq: number;
  instanceId: string;
  deviceId: string;
  clientUpdatedAt: string;
}): { ciphertext: Buffer; iv: Buffer } {
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const plaintextBytes = targetCiphertextBytes - 16;
  const header = Buffer.from(`${JSON.stringify(input)}\n`, 'utf8');
  const plaintext = randomBytes(plaintextBytes);
  header.copy(plaintext, 0, 0, Math.min(header.byteLength, plaintext.byteLength));
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

  if (encrypted.byteLength !== targetCiphertextBytes) {
    throw new Error(
      `Synthetic ciphertext size mismatch. expected=${targetCiphertextBytes} actual=${encrypted.byteLength}`,
    );
  }

  return { ciphertext: encrypted, iv };
}

async function postSync(update: PlannedUpdate): Promise<SyncAttemptResult> {
  const res = await fetch(`${baseUrl}/api/movement/pod/sync`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      cookie: `soe_wallet_id=${currentMemberId()}`,
    },
    body: JSON.stringify(update.envelope),
  });
  const body = await readJson(res);

  return {
    update,
    status: res.status,
    ok: isRecord(body) && body.ok === true,
    body,
  };
}

async function getStats(): Promise<PodStatsResponse> {
  const res = await fetch(`${baseUrl}/api/movement/pod/stats`, {
    headers: {
      accept: 'application/json',
      cookie: `soe_wallet_id=${currentMemberId()}`,
    },
  });
  const body = await readJson(res);
  if (!res.ok) throw new Error(`Stats failed: ${JSON.stringify(body)}`);
  return body as PodStatsResponse;
}

async function getExport(): Promise<PodExportEnvelope> {
  const res = await fetch(`${baseUrl}/api/movement/pod/export`, {
    headers: {
      accept: 'application/json',
      cookie: `soe_wallet_id=${currentMemberId()}`,
    },
  });
  const body = await readJson(res);
  if (!res.ok) throw new Error(`Export failed: ${JSON.stringify(body)}`);
  return body as PodExportEnvelope;
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
