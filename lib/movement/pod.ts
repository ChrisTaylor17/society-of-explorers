import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';

const POD_VERSION = 1;
const AUTH_TAG_BYTES = 16;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export interface PodPayload {
  version: number;
  generated_at: string;
  member: {
    id: string;
    display_name: string | null;
    email: string | null;
    tier: string | null;
    wallet_address: string | null;
    created_at: string | null;
    current_streak: number | null;
    longest_streak: number | null;
    total_responses: number | null;
  } | null;
  practice_responses: unknown[];
  practice_reflections: unknown[];
  thinker_conversation_summaries: unknown[];
  semantic_memory: unknown[];
  life_facts: Record<string, string>;
  intellectual_interests: string[];
}

export interface EncryptedPod {
  ciphertext: Buffer;
  iv: Buffer;
  version: number;
}

export interface PodStats {
  exists: boolean;
  size_bytes: number;
  response_count: number;
  last_commitment_hash: string | null;
  last_committed_at: string | null;
  updated_at: string | null;
  version: number | null;
  sync_version: number | null;
  sync_device_id: string | null;
  sync_client_updated_at: string | null;
  sync_status: string | null;
  sync_conflict_count: number;
}

function asArray<T>(value: T[] | null): T[] {
  return Array.isArray(value) ? value : [];
}

async function safeSelect<T>(
  label: string,
  query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  try {
    const { data, error } = await query;
    if (error) {
      console.error(`[movement/pod] ${label} failed`, error.message);
      return [];
    }
    return asArray(data);
  } catch (err) {
    console.error(`[movement/pod] ${label} threw`, err);
    return [];
  }
}

function normalizeStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => typeof v === 'string' && v.trim())
    .map(([k, v]) => [k, (v as string).trim()]);
  return Object.fromEntries(entries);
}

function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) seen.add(value.trim());
  }
  return Array.from(seen);
}

export function bufferToBytea(buffer: Buffer): string {
  return `\\x${buffer.toString('hex')}`;
}

export function byteaToBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === 'string') {
    if (value.startsWith('\\x')) return Buffer.from(value.slice(2), 'hex');
    return Buffer.from(value, 'base64');
  }
  if (Array.isArray(value)) return Buffer.from(value);
  throw new Error('Unsupported bytea value');
}

export function derivePodKey(memberId: string, material?: string | Buffer): Buffer {
  // TODO: migrate to client-side key derivation from a wallet signature so the server never sees pod keys.
  const base =
    material ||
    process.env.MOVEMENT_POD_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'movement-pod-development-key';
  return createHash('sha256').update(base).update(':').update(memberId).digest();
}

export async function buildPodPayload(memberId: string): Promise<PodPayload> {
  const [
    memberResult,
    practiceResponses,
    practiceReflections,
    episodes,
    semanticMemory,
    thinkerMemory,
  ] = await Promise.all([
    supabaseAdmin
      .from('members')
      .select('id, display_name, email, tier, wallet_address, created_at, current_streak, longest_streak, total_responses')
      .eq('id', memberId)
      .maybeSingle(),
    safeSelect(
      'practice responses',
      supabaseAdmin
        .from('question_responses')
        .select('id, response_text, created_at, question_id, daily_questions(id, question_text, question_context, thinker_id, date)')
        .eq('member_id', memberId)
        .order('created_at', { ascending: true }),
    ),
    safeSelect(
      'practice reflections',
      supabaseAdmin
        .from('practice_reflections')
        .select('id, response_id, question_id, thinker_id, reflection_text, created_at')
        .eq('member_id', memberId)
        .order('created_at', { ascending: true }),
    ),
    safeSelect(
      'user episodes',
      supabaseAdmin
        .from('user_episodes')
        .select('id, thinker_id, role, summary, topic_tags, emotional_tone, significance_score, session_id, source, created_at')
        .eq('member_id', memberId)
        .order('created_at', { ascending: true }),
    ),
    safeSelect(
      'semantic memory',
      supabaseAdmin
        .from('user_semantic_memory')
        .select('id, category, key, value, confidence, valid_from, created_at, updated_at')
        .eq('member_id', memberId)
        .is('valid_until', null)
        .order('confidence', { ascending: false }),
    ),
    safeSelect(
      'thinker memory',
      supabaseAdmin
        .from('thinker_memory')
        .select('thinker_id, summary, life_facts, intellectual_interests, emotional_patterns, commitments, updated_at')
        .eq('member_id', memberId),
    ),
  ]);

  if (memberResult.error) {
    throw new Error(`Member lookup failed: ${memberResult.error.message}`);
  }

  const lifeFacts: Record<string, string> = {};
  for (const row of thinkerMemory as Array<{ life_facts?: unknown }>) {
    Object.assign(lifeFacts, normalizeStringMap(row.life_facts));
  }
  for (const row of semanticMemory as Array<{ category?: string; key?: string; value?: string }>) {
    if (
      typeof row.key === 'string' &&
      typeof row.value === 'string' &&
      ['identity', 'relationship', 'milestone', 'goal', 'challenge'].includes(row.category || '')
    ) {
      lifeFacts[row.key] = row.value;
    }
  }

  const interests = uniqueStrings([
    ...(thinkerMemory as Array<{ intellectual_interests?: unknown[] }>).flatMap((row) =>
      Array.isArray(row.intellectual_interests) ? row.intellectual_interests : [],
    ),
    ...(semanticMemory as Array<{ category?: string; value?: string }>).flatMap((row) =>
      ['value', 'preference'].includes(row.category || '') && row.value ? [row.value] : [],
    ),
  ]);

  return {
    version: POD_VERSION,
    generated_at: new Date().toISOString(),
    member: memberResult.data || null,
    practice_responses: practiceResponses,
    practice_reflections: practiceReflections,
    thinker_conversation_summaries: thinkerMemory.length > 0 ? thinkerMemory : episodes,
    semantic_memory: semanticMemory,
    life_facts: lifeFacts,
    intellectual_interests: interests,
  };
}

export function encryptPod(payload: unknown, key: Buffer | string): EncryptedPod {
  const iv = randomBytes(12);
  const normalizedKey = Buffer.isBuffer(key) ? key : createHash('sha256').update(key).digest();
  const cipher = createCipheriv('aes-256-gcm', normalizedKey, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([encrypted, authTag]), iv, version: POD_VERSION };
}

export function decryptPod(ciphertext: Buffer | string, iv: Buffer | string, key: Buffer | string): PodPayload {
  const ciphertextBuffer = typeof ciphertext === 'string' ? byteaToBuffer(ciphertext) : ciphertext;
  const ivBuffer = typeof iv === 'string' ? byteaToBuffer(iv) : iv;
  const normalizedKey = Buffer.isBuffer(key) ? key : createHash('sha256').update(key).digest();
  const encrypted = ciphertextBuffer.subarray(0, ciphertextBuffer.length - AUTH_TAG_BYTES);
  const authTag = ciphertextBuffer.subarray(ciphertextBuffer.length - AUTH_TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', normalizedKey, ivBuffer);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  return JSON.parse(plaintext) as PodPayload;
}

export async function getPodStats(memberId: string): Promise<PodStats> {
  const [podResult, responseCountResult] = await Promise.all([
    supabaseAdmin
      .from('data_pods')
      .select('ciphertext, version, last_commitment_hash, last_committed_at, updated_at, sync_version, sync_device_id, sync_client_updated_at, sync_status, sync_conflict_count')
      .eq('member_id', memberId)
      .maybeSingle(),
    supabaseAdmin
      .from('question_responses')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', memberId),
  ]);

  if (podResult.error) {
    console.error('[movement/pod] stats lookup failed', podResult.error.message);
  }

  const row = podResult.data;
  const size = row?.ciphertext ? byteaToBuffer(row.ciphertext).byteLength : 0;
  return {
    exists: Boolean(row),
    size_bytes: size,
    response_count: responseCountResult.count ?? 0,
    last_commitment_hash: row?.last_commitment_hash || null,
    last_committed_at: row?.last_committed_at || null,
    updated_at: row?.updated_at || null,
    version: row?.version || null,
    sync_version: row?.sync_version ?? null,
    sync_device_id: row?.sync_device_id || null,
    sync_client_updated_at: row?.sync_client_updated_at || null,
    sync_status: row?.sync_status || null,
    sync_conflict_count: row?.sync_conflict_count ?? 0,
  };
}
