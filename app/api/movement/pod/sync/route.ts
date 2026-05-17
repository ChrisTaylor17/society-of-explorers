import { NextRequest, NextResponse } from 'next/server';
import {
  MAX_SYNC_CIPHERTEXT_BYTES,
  MAX_SYNC_JSON_BYTES,
  MAX_SYNC_METADATA_BYTES,
  PodSyncEnvelope,
  PodSyncRpcResult,
  SYNC_CIPHERTEXT_ENCODING,
  SYNC_ENVELOPE_KIND,
  SYNC_ENVELOPE_VERSION,
  canonicalSyncCommitmentInput,
  isRecord,
  stableStringify,
} from '@/lib/movement/podSync';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'global';

const MEMBER_SELECT = 'id,tier,supabase_auth_id,wallet_address';
const DEVICE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface EdgeMember {
  id: string;
  tier: string | null;
  supabase_auth_id: string | null;
  wallet_address: string | null;
}

interface SupabaseEnv {
  url: string;
  anonKey: string | null;
  serviceRoleKey: string;
}

interface PreparedSyncEnvelope {
  envelope: PodSyncEnvelope;
  ciphertextBytes: Uint8Array;
  ivBytes: Uint8Array;
  ciphertextBytea: string;
  ivBytea: string;
  payloadBytes: number;
}

interface SyncResponseBody {
  ok: boolean;
  member_id: string;
  sync: PodSyncRpcResult;
  commitment: {
    verified: true;
    format: 'sha256:sync-v2-canonical-json';
  };
  limits: {
    payload_bytes: number;
    max_payload_bytes: number;
  };
}

class SyncHttpError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'SyncHttpError';
    this.status = status;
    this.details = details;
  }
}

type EmitSyncEvent = (event: string, data?: Record<string, unknown>) => Promise<void> | void;

export async function POST(req: NextRequest) {
  if (wantsEventStream(req)) {
    return streamSyncResponse(req);
  }

  try {
    const result = await runSync(req, async () => {});
    return NextResponse.json(result.body, {
      status: result.status,
      headers: { 'cache-control': 'no-store' },
    });
  } catch (err) {
    const normalized = normalizeError(err);
    return NextResponse.json(normalized.body, {
      status: normalized.status,
      headers: { 'cache-control': 'no-store' },
    });
  }
}

async function runSync(
  req: NextRequest,
  emit: EmitSyncEvent,
): Promise<{ status: number; body: SyncResponseBody }> {
  await emit('received', { route: '/api/movement/pod/sync' });

  const env = getSupabaseEnv();
  const auth = await authenticateMember(req, env);
  if (!auth) throw new SyncHttpError(401, 'Unauthorized');

  await emit('authenticated', { member_id: auth.id, tier: auth.tier });

  const prepared = await parseAndVerifyEnvelope(req);
  await emit('verified', {
    device_id: prepared.envelope.device_id,
    base_sync_version: prepared.envelope.base_sync_version,
    payload_bytes: prepared.payloadBytes,
  });

  await emit('locking', {
    member_id: auth.id,
    base_sync_version: prepared.envelope.base_sync_version,
  });

  const sync = await callSyncRpc(env, {
    p_member_id: auth.id,
    p_ciphertext: prepared.ciphertextBytea,
    p_iv: prepared.ivBytea,
    p_commitment_hash: prepared.envelope.commitment_hash,
    p_client_updated_at: prepared.envelope.client_updated_at,
    p_device_id: prepared.envelope.device_id,
    p_base_sync_version: prepared.envelope.base_sync_version,
    p_payload_bytes: prepared.payloadBytes,
    p_metadata: prepared.envelope.metadata || {},
    p_pod_version: prepared.envelope.version,
  });

  await emit(sync.accepted ? 'committed' : 'conflict', {
    status: sync.status,
    sync_version: sync.sync_version,
    last_commitment_hash: sync.last_commitment_hash,
  });

  const body: SyncResponseBody = {
    ok: sync.accepted,
    member_id: auth.id,
    sync,
    commitment: {
      verified: true,
      format: 'sha256:sync-v2-canonical-json',
    },
    limits: {
      payload_bytes: prepared.payloadBytes,
      max_payload_bytes: MAX_SYNC_CIPHERTEXT_BYTES,
    },
  };

  return {
    status: sync.accepted ? 200 : 409,
    body,
  };
}

function streamSyncResponse(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit: EmitSyncEvent = async (event, data = {}) => {
        controller.enqueue(
          encoder.encode(
            `event: ${event}\ndata: ${JSON.stringify({
              ...data,
              at: new Date().toISOString(),
            })}\n\n`,
          ),
        );
      };

      try {
        const result = await runSync(req, emit);
        await emit('complete', {
          ok: result.body.ok,
          http_status: result.status,
          sync_version: result.body.sync.sync_version,
        });
      } catch (err) {
        const normalized = normalizeError(err);
        await emit('error', normalized.body);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive',
    },
  });
}

async function parseAndVerifyEnvelope(req: NextRequest): Promise<PreparedSyncEnvelope> {
  const contentLength = req.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_SYNC_JSON_BYTES) {
    throw new SyncHttpError(413, 'Sync request body exceeds the JSON size limit');
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new SyncHttpError(400, 'Request body must be valid JSON');
  }

  if (!isRecord(body)) {
    throw new SyncHttpError(400, 'Request body must be a JSON object');
  }

  const metadata = normalizeMetadata(body.metadata);
  const envelope = normalizeEnvelope(body, metadata);
  const ciphertextBytes = base64ToBytes(envelope.ciphertext, 'ciphertext');
  const ivBytes = base64ToBytes(envelope.iv, 'iv');

  if (ciphertextBytes.byteLength < 17) {
    throw new SyncHttpError(400, 'ciphertext must include AES-GCM payload and auth tag');
  }

  if (ciphertextBytes.byteLength > MAX_SYNC_CIPHERTEXT_BYTES) {
    throw new SyncHttpError(413, 'ciphertext exceeds maximum sync payload size', {
      payload_bytes: ciphertextBytes.byteLength,
      max_payload_bytes: MAX_SYNC_CIPHERTEXT_BYTES,
    });
  }

  if (ivBytes.byteLength !== 12) {
    throw new SyncHttpError(400, 'iv must be 12 bytes for AES-256-GCM');
  }

  const commitmentInput = canonicalSyncCommitmentInput({
    kind: envelope.kind,
    version: envelope.version,
    ciphertext_encoding: envelope.ciphertext_encoding,
    ciphertext: envelope.ciphertext,
    iv: envelope.iv,
    client_updated_at: envelope.client_updated_at,
    device_id: envelope.device_id,
    base_sync_version: envelope.base_sync_version,
    metadata: envelope.metadata,
  });
  const expectedCommitment = await sha256Hex(new TextEncoder().encode(commitmentInput));

  if (envelope.commitment_hash !== expectedCommitment) {
    throw new SyncHttpError(400, 'commitment_hash does not match sync payload', {
      expected_commitment_hash: expectedCommitment,
    });
  }

  return {
    envelope,
    ciphertextBytes,
    ivBytes,
    ciphertextBytea: bytesToBytea(ciphertextBytes),
    ivBytea: bytesToBytea(ivBytes),
    payloadBytes: ciphertextBytes.byteLength,
  };
}

function normalizeEnvelope(body: Record<string, unknown>, metadata: Record<string, unknown>): PodSyncEnvelope {
  if (body.kind !== SYNC_ENVELOPE_KIND) {
    throw new SyncHttpError(400, `kind must be ${SYNC_ENVELOPE_KIND}`);
  }

  if (body.version !== SYNC_ENVELOPE_VERSION) {
    throw new SyncHttpError(400, `version must be ${SYNC_ENVELOPE_VERSION}`);
  }

  if (body.ciphertext_encoding !== SYNC_CIPHERTEXT_ENCODING) {
    throw new SyncHttpError(400, `ciphertext_encoding must be ${SYNC_CIPHERTEXT_ENCODING}`);
  }

  const ciphertext = requiredString(body.ciphertext, 'ciphertext').trim();
  const iv = requiredString(body.iv, 'iv').trim();
  const commitmentHash = requiredString(body.commitment_hash, 'commitment_hash').trim().toLowerCase();
  const clientUpdatedAt = requiredString(body.client_updated_at, 'client_updated_at').trim();
  const deviceId = requiredString(body.device_id, 'device_id').trim();
  const baseSyncVersion = requiredInteger(body.base_sync_version, 'base_sync_version');

  if (!SHA256_HEX_PATTERN.test(commitmentHash)) {
    throw new SyncHttpError(400, 'commitment_hash must be a 64-character sha256 hex digest');
  }

  if (!DEVICE_ID_PATTERN.test(deviceId)) {
    throw new SyncHttpError(400, 'device_id must be 1-128 URL-safe identifier characters');
  }

  const timestamp = Date.parse(clientUpdatedAt);
  if (!Number.isFinite(timestamp)) {
    throw new SyncHttpError(400, 'client_updated_at must be a valid ISO timestamp');
  }

  if (timestamp > Date.now() + 15 * 60 * 1000) {
    throw new SyncHttpError(400, 'client_updated_at is too far in the future');
  }

  if (baseSyncVersion < 0) {
    throw new SyncHttpError(400, 'base_sync_version must be non-negative');
  }

  return {
    kind: SYNC_ENVELOPE_KIND,
    version: SYNC_ENVELOPE_VERSION,
    ciphertext_encoding: SYNC_CIPHERTEXT_ENCODING,
    ciphertext,
    iv,
    commitment_hash: commitmentHash,
    client_updated_at: new Date(timestamp).toISOString(),
    device_id: deviceId,
    base_sync_version: baseSyncVersion,
    metadata,
  };
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) throw new SyncHttpError(400, 'metadata must be a JSON object');

  const serialized = stableStringify(value);
  if (serialized.length > MAX_SYNC_METADATA_BYTES) {
    throw new SyncHttpError(413, 'metadata exceeds maximum sync metadata size');
  }

  return value;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new SyncHttpError(400, `${field} is required`);
  }
  return value;
}

function requiredInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new SyncHttpError(400, `${field} must be an integer`);
  }
  return value;
}

function base64ToBytes(value: string, field: string): Uint8Array {
  if (value.length === 0 || value.length % 4 !== 0 || !BASE64_PATTERN.test(value)) {
    throw new SyncHttpError(400, `${field} must be valid base64`);
  }

  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToBytea(bytes: Uint8Array): string {
  const hex = new Array<string>(bytes.byteLength);
  for (let index = 0; index < bytes.byteLength; index += 1) {
    hex[index] = bytes[index].toString(16).padStart(2, '0');
  }
  return `\\x${hex.join('')}`;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digestInput = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const digest = await crypto.subtle.digest('SHA-256', digestInput);
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes: Uint8Array): string {
  const hex = new Array<string>(bytes.byteLength);
  for (let index = 0; index < bytes.byteLength; index += 1) {
    hex[index] = bytes[index].toString(16).padStart(2, '0');
  }
  return hex.join('');
}

function getSupabaseEnv(): SupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null;

  if (!url || !serviceRoleKey) {
    throw new SyncHttpError(500, 'Supabase environment is not configured');
  }

  return { url, anonKey, serviceRoleKey };
}

async function authenticateMember(req: NextRequest, env: SupabaseEnv): Promise<EdgeMember | null> {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    if (!env.anonKey) throw new SyncHttpError(500, 'Supabase anonymous key is not configured');

    const token = authHeader.slice('Bearer '.length).trim();
    const user = await getSupabaseUser(env, token);
    if (user?.id) {
      const member = await lookupMember(env, 'supabase_auth_id', user.id);
      if (member) return member;
    }
  }

  const walletId = parseCookies(req.headers.get('cookie')).get('soe_wallet_id');
  if (walletId && UUID_PATTERN.test(walletId)) {
    const member = await lookupMember(env, 'id', walletId);
    if (member) return member;
  }

  return null;
}

async function getSupabaseUser(env: SupabaseEnv, token: string): Promise<{ id: string } | null> {
  const res = await fetch(`${env.url}/auth/v1/user`, {
    headers: {
      apikey: env.anonKey!,
      authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  });

  if (res.status === 401) return null;
  if (!res.ok) {
    throw new SyncHttpError(res.status, 'Supabase auth lookup failed', await safeJson(res));
  }

  const body = await res.json();
  return isRecord(body) && typeof body.id === 'string' ? { id: body.id } : null;
}

async function lookupMember(
  env: SupabaseEnv,
  field: 'id' | 'supabase_auth_id',
  value: string,
): Promise<EdgeMember | null> {
  const url = new URL(`${env.url}/rest/v1/members`);
  url.searchParams.set('select', MEMBER_SELECT);
  url.searchParams.set(field, `eq.${value}`);
  url.searchParams.set('limit', '1');

  const res = await fetch(url, {
    headers: serviceHeaders(env),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new SyncHttpError(res.status, 'Member lookup failed', await safeJson(res));
  }

  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? (rows[0] as EdgeMember) : null;
}

async function callSyncRpc(
  env: SupabaseEnv,
  params: Record<string, unknown>,
): Promise<PodSyncRpcResult> {
  const res = await fetch(`${env.url}/rest/v1/rpc/sync_data_pod_v2`, {
    method: 'POST',
    headers: {
      ...serviceHeaders(env),
      'content-type': 'application/json',
    },
    body: JSON.stringify(params),
    cache: 'no-store',
  });

  const body = await safeJson(res);
  if (!res.ok) {
    throw new SyncHttpError(res.status, 'Pod sync transaction failed', body);
  }

  if (!isRecord(body) || typeof body.accepted !== 'boolean') {
    throw new SyncHttpError(502, 'Pod sync transaction returned an invalid response', body);
  }

  return body as unknown as PodSyncRpcResult;
}

function serviceHeaders(env: SupabaseEnv): HeadersInit {
  return {
    apikey: env.serviceRoleKey,
    authorization: `Bearer ${env.serviceRoleKey}`,
  };
}

async function safeJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function parseCookies(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) return cookies;

  for (const segment of header.split(';')) {
    const [rawKey, ...rawValue] = segment.trim().split('=');
    if (!rawKey || rawValue.length === 0) continue;

    try {
      cookies.set(rawKey, decodeURIComponent(rawValue.join('=')));
    } catch {
      cookies.set(rawKey, rawValue.join('='));
    }
  }

  return cookies;
}

function wantsEventStream(req: NextRequest): boolean {
  const url = new URL(req.url);
  return req.headers.get('accept')?.includes('text/event-stream') || url.searchParams.get('stream') === '1';
}

function normalizeError(err: unknown): { status: number; body: Record<string, unknown> } {
  if (err instanceof SyncHttpError) {
    return {
      status: err.status,
      body: {
        error: err.message,
        details: err.details,
      },
    };
  }

  console.error('[movement/pod/sync] failed', err);
  return {
    status: 500,
    body: {
      error: 'Pod sync failed',
      details: String(err),
    },
  };
}
