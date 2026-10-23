import { createHash } from 'crypto';
import type { AuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { buildMemoryConsentReadiness, type MemoryConsentReadiness } from '@/lib/memory/consentActions';
import { getPodStats, normalizePodMetadata, type PodStats } from '@/lib/movement/pod';
import { buildPodSealReceipt } from '@/lib/movement/podReceipt';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type QueryResult<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;
type CountResult = PromiseLike<{ count: number | null; error: { message: string } | null }>;

function reportSovereigntyFailure(label: string) {
  console.warn(`[movement/sovereignty] ${label} failed`);
}

interface DataPodPassportRow {
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

interface MemoryFactCategoryRow {
  category?: string | null;
}

interface ProfileSummaryRow {
  updated_at?: string | null;
  last_session_at?: string | null;
  active_goals?: unknown;
  pending_commitments?: unknown;
}

interface PersonalAiProfileRow {
  response_count_at_build?: number | null;
  last_built_at?: string | null;
  version?: number | null;
}

interface TriggerRow {
  status?: string | null;
}

export interface SovereigntyPassportAction {
  label: string;
  href: string;
  status: 'ready' | 'recommended' | 'complete' | 'needs_review';
  detail: string;
}

export interface SovereigntyPassport {
  generated_at: string;
  member: {
    display_name: string | null;
    tier: string | null;
    member_id_hash: string;
    wallet_connected: boolean;
    wallet_address_hash: string | null;
  };
  score: {
    value: number;
    label: string;
    summary: string;
  };
  pod: Pick<
    PodStats,
    | 'exists'
    | 'size_bytes'
    | 'response_count'
    | 'last_commitment_hash'
    | 'last_committed_at'
    | 'updated_at'
    | 'version'
    | 'sync_version'
    | 'sync_status'
    | 'sync_conflict_count'
    | 'key_mode'
    | 'custody_status'
    | 'sovereignty_status'
    | 'custody_verification'
    | 'custody_note'
  > & {
    attestation: string | null;
    key_derivation: string | null;
    server_can_decrypt_pod: boolean | null;
    wallet_signature_stored: boolean | null;
  };
  receipt: {
    available: boolean;
    receipt_hash: string | null;
    issued_at: string | null;
    member_id_hash: string | null;
    wallet_address_hash: string | null;
    privacy_flags: Record<string, boolean> | null;
  };
  memory: {
    active_fact_count: number;
    episode_count: number;
    category_counts: Record<string, number>;
    profile_updated_at: string | null;
    last_session_at: string | null;
    active_goal_count: number;
    pending_commitment_count: number;
    consent: MemoryConsentReadiness & {
      active_facts_included: boolean;
      suppressed_or_expired_facts_included: boolean;
      raw_memory_content_included: boolean;
    };
  };
  mirror: {
    built: boolean;
    version: number | null;
    last_built_at: string | null;
    response_count_at_build: number | null;
  };
  workflows: {
    proactive_trigger_count: number;
    pending_trigger_count: number;
  };
  custody_chain: Array<{
    label: string;
    value: string;
    state: 'complete' | 'ready' | 'needs_review' | 'missing';
  }>;
  actions: SovereigntyPassportAction[];
  privacy_notes: string[];
}

export async function buildSovereigntyPassport(input: {
  memberId: string;
  member: AuthenticatedMember;
}): Promise<SovereigntyPassport> {
  const generatedAt = new Date().toISOString();
  const supabaseAdmin = getSupabaseAdmin();
  const [
    podStats,
    podRow,
    factCategories,
    episodeCount,
    profile,
    personalAi,
    triggers,
  ] = await Promise.all([
    getPodStats(input.memberId),
    safeData<DataPodPassportRow | null>(
      'pod receipt source',
      supabaseAdmin
        .from('data_pods')
        .select('ciphertext, version, last_commitment_hash, last_committed_at, updated_at, sync_version, sync_device_id, sync_client_updated_at, sync_status, sync_conflict_count, sync_metadata')
        .eq('member_id', input.memberId)
        .maybeSingle(),
      null,
    ),
    safeData<MemoryFactCategoryRow[]>(
      'semantic fact categories',
      supabaseAdmin
        .from('user_semantic_memory')
        .select('category')
        .eq('member_id', input.memberId)
        .is('valid_until', null)
        .limit(500),
      [],
    ),
    safeCount(
      'episode count',
      supabaseAdmin
        .from('user_episodes')
        .select('id', { count: 'exact', head: true })
        .eq('member_id', input.memberId),
    ),
    safeData<ProfileSummaryRow | null>(
      'profile summary',
      supabaseAdmin
        .from('user_profile_summary')
        .select('updated_at, last_session_at, active_goals, pending_commitments')
        .eq('member_id', input.memberId)
        .maybeSingle(),
      null,
    ),
    safeData<PersonalAiProfileRow | null>(
      'personal ai profile',
      supabaseAdmin
        .from('personal_ai_profiles')
        .select('response_count_at_build, last_built_at, version')
        .eq('member_id', input.memberId)
        .maybeSingle(),
      null,
    ),
    safeData<TriggerRow[]>(
      'proactive triggers',
      supabaseAdmin
        .from('proactive_triggers')
        .select('status')
        .eq('member_id', input.memberId)
        .limit(80),
      [],
    ),
  ]);

  const syncMetadata = normalizePodMetadata(podRow?.sync_metadata);
  const receipt = podRow
    ? buildPodSealReceipt({
        memberId: input.memberId,
        issuedAt: podRow.last_committed_at || podRow.updated_at || generatedAt,
        pod: podRow,
      })
    : null;
  const walletAddressHash =
    stringValue(syncMetadata.wallet_address_hash) ||
    (input.member.wallet_address ? sha256Hex(input.member.wallet_address.toLowerCase()) : null);
  const categoryCounts = countCategories(factCategories);
  const activeGoalCount = Array.isArray(profile?.active_goals) ? profile.active_goals.length : 0;
  const pendingCommitmentCount = Array.isArray(profile?.pending_commitments)
    ? profile.pending_commitments.length
    : 0;
  const pendingTriggerCount = triggers.filter((trigger) => trigger.status === 'pending').length;
  const memoryConsent = buildMemoryConsentReadiness();
  const score = scorePassport({
    podStats,
    receiptAvailable: Boolean(receipt),
    activeFactCount: factCategories.length,
    mirrorBuilt: Boolean(personalAi?.last_built_at),
  });

  return {
    generated_at: generatedAt,
    member: {
      display_name: input.member.display_name || null,
      tier: input.member.tier || null,
      member_id_hash: sha256Hex(input.memberId),
      wallet_connected: Boolean(input.member.wallet_address || walletAddressHash),
      wallet_address_hash: walletAddressHash,
    },
    score,
    pod: {
      exists: podStats.exists,
      size_bytes: podStats.size_bytes,
      response_count: podStats.response_count,
      last_commitment_hash: podStats.last_commitment_hash,
      last_committed_at: podStats.last_committed_at,
      updated_at: podStats.updated_at,
      version: podStats.version,
      sync_version: podStats.sync_version,
      sync_status: podStats.sync_status,
      sync_conflict_count: podStats.sync_conflict_count,
      key_mode: podStats.key_mode,
      custody_status: podStats.custody_status,
      sovereignty_status: podStats.sovereignty_status,
      custody_verification: podStats.custody_verification,
      custody_note: podStats.custody_note,
      attestation: stringValue(syncMetadata.attestation),
      key_derivation: stringValue(syncMetadata.key_derivation),
      server_can_decrypt_pod: booleanOrNull(syncMetadata.server_can_decrypt_pod),
      wallet_signature_stored: booleanOrNull(syncMetadata.wallet_signature_stored),
    },
    receipt: {
      available: Boolean(receipt),
      receipt_hash: receipt?.receipt_hash || null,
      issued_at: receipt?.issued_at || null,
      member_id_hash: receipt?.subject.member_id_hash || null,
      wallet_address_hash: receipt?.subject.wallet_address_hash || walletAddressHash,
      privacy_flags: receipt
        ? {
            includes_ciphertext: receipt.privacy.includes_ciphertext,
            includes_plaintext: receipt.privacy.includes_plaintext,
            includes_raw_wallet_address: receipt.privacy.includes_raw_wallet_address,
            includes_raw_wallet_signature: receipt.privacy.includes_raw_wallet_signature,
            includes_raw_member_identifier: receipt.privacy.includes_raw_member_identifier,
          }
        : null,
    },
    memory: {
      active_fact_count: factCategories.length,
      episode_count: episodeCount,
      category_counts: categoryCounts,
      profile_updated_at: profile?.updated_at || null,
      last_session_at: profile?.last_session_at || null,
      active_goal_count: activeGoalCount,
      pending_commitment_count: pendingCommitmentCount,
      consent: {
        ...memoryConsent,
        active_facts_included: true,
        suppressed_or_expired_facts_included: false,
        raw_memory_content_included: false,
      },
    },
    mirror: {
      built: Boolean(personalAi?.last_built_at),
      version: personalAi?.version ?? null,
      last_built_at: personalAi?.last_built_at || null,
      response_count_at_build: personalAi?.response_count_at_build ?? null,
    },
    workflows: {
      proactive_trigger_count: triggers.length,
      pending_trigger_count: pendingTriggerCount,
    },
    custody_chain: buildCustodyChain(podStats, receipt, syncMetadata),
    actions: buildActions({ podStats, receiptAvailable: Boolean(receipt), personalAi }),
    privacy_notes: [
      'Passport data is private to the signed-in member.',
      'Raw wallet signatures, raw wallet addresses, raw member identifiers, plaintext memory, and ciphertext bytes are not returned in the passport response.',
      'Memory consent status is reported as mode and counts only; suppressed or expired memory facts are not returned here.',
      'The pod remains a snapshot: source practice data still lives in app systems until local-first capture is implemented.',
    ],
  };
}

async function safeData<T>(label: string, query: QueryResult<T>, fallback: T): Promise<T> {
  try {
    const { data, error } = await query;
    if (error) {
      reportSovereigntyFailure(label);
      return fallback;
    }
    return data ?? fallback;
  } catch {
    reportSovereigntyFailure(label);
    return fallback;
  }
}

async function safeCount(label: string, query: CountResult): Promise<number> {
  try {
    const { count, error } = await query;
    if (error) {
      reportSovereigntyFailure(label);
      return 0;
    }
    return count ?? 0;
  } catch {
    reportSovereigntyFailure(label);
    return 0;
  }
}

function countCategories(rows: MemoryFactCategoryRow[]): Record<string, number> {
  return rows.reduce<Record<string, number>>((counts, row) => {
    const category = row.category || 'uncategorized';
    counts[category] = (counts[category] || 0) + 1;
    return counts;
  }, {});
}

function buildCustodyChain(
  podStats: PodStats,
  receipt: ReturnType<typeof buildPodSealReceipt> | null,
  syncMetadata: Record<string, unknown>,
): SovereigntyPassport['custody_chain'] {
  return [
    {
      label: 'Pod snapshot',
      value: podStats.exists ? `${podStats.size_bytes} encrypted bytes` : 'Not built',
      state: podStats.exists ? 'complete' : 'missing',
    },
    {
      label: 'Commitment hash',
      value: podStats.last_commitment_hash ? shortHash(podStats.last_commitment_hash) : 'Not committed',
      state: podStats.last_commitment_hash ? 'complete' : 'missing',
    },
    {
      label: 'Wallet custody',
      value:
        podStats.custody_verification === 'wallet_signature_attested'
          ? 'Hash-only wallet attestation'
          : podStats.custody_status,
      state: podStats.custody_verification === 'wallet_signature_attested' ? 'complete' : 'needs_review',
    },
    {
      label: 'Receipt',
      value: receipt?.receipt_hash ? shortHash(receipt.receipt_hash) : 'No receipt yet',
      state: receipt ? 'complete' : 'ready',
    },
    {
      label: 'Server decryption',
      value: syncMetadata.server_can_decrypt_pod === false ? 'Marked false' : 'Needs review',
      state: syncMetadata.server_can_decrypt_pod === false ? 'complete' : 'needs_review',
    },
  ];
}

function buildActions(input: {
  podStats: PodStats;
  receiptAvailable: boolean;
  personalAi: PersonalAiProfileRow | null;
}): SovereigntyPassportAction[] {
  const actions: SovereigntyPassportAction[] = [];

  actions.push({
    label: input.podStats.custody_verification === 'wallet_signature_attested' ? 'Wallet seal current pod' : 'Seal pod with wallet',
    href: '/movement/pod',
    status: input.podStats.custody_verification === 'wallet_signature_attested' ? 'complete' : 'recommended',
    detail:
      input.podStats.custody_verification === 'wallet_signature_attested'
        ? 'Latest pod has a hash-only wallet custody attestation.'
        : 'Upgrade the pod from migration custody to member-held wallet-derived custody.',
  });

  actions.push({
    label: 'Export seal receipt',
    href: '/api/movement/pod/receipt',
    status: input.receiptAvailable ? 'ready' : 'needs_review',
    detail: input.receiptAvailable
      ? 'Download a portable proof artifact without plaintext, ciphertext, raw wallet address, or raw signature.'
      : 'Create or refresh a pod before exporting a receipt.',
  });

  actions.push({
    label: 'Verify artifact',
    href: '/movement/pod/verify',
    status: input.receiptAvailable ? 'ready' : 'needs_review',
    detail: 'Recompute the pod export or receipt hash locally in the browser.',
  });

  actions.push({
    label: 'Review memory consent',
    href: '/movement/memory',
    status: 'ready',
    detail: 'Inspect active recall and revoke facts that no longer belong.',
  });

  actions.push({
    label: input.personalAi?.last_built_at ? 'Review personal mirror' : 'Build personal mirror',
    href: '/movement/personal-ai',
    status: input.personalAi?.last_built_at ? 'complete' : 'recommended',
    detail: input.personalAi?.last_built_at
      ? 'Mirror profile exists and can be checked against current memory.'
      : 'Build the first personal AI profile from consenting practice history.',
  });

  return actions;
}

function scorePassport(input: {
  podStats: PodStats;
  receiptAvailable: boolean;
  activeFactCount: number;
  mirrorBuilt: boolean;
}): SovereigntyPassport['score'] {
  let value = 20;
  if (input.podStats.exists) value += 15;
  if (input.podStats.last_commitment_hash) value += 15;
  if (input.podStats.custody_verification === 'wallet_signature_attested') value += 25;
  else if (input.podStats.custody_verification === 'client_attested') value += 14;
  else if (input.podStats.custody_verification === 'server_generated') value += 6;
  if (input.receiptAvailable) value += 10;
  if (input.activeFactCount > 0) value += 5;
  if (input.mirrorBuilt) value += 5;
  if (input.podStats.sync_conflict_count === 0) value += 5;
  value = Math.min(100, value);

  if (value >= 90) {
    return {
      value,
      label: 'Sovereign-ready',
      summary: 'The member has wallet-attested pod custody, a commitment trail, and exportable proof.',
    };
  }
  if (value >= 70) {
    return {
      value,
      label: 'Strong custody',
      summary: 'The core pod trail is in place; the next step is keeping proofs and consent reviews current.',
    };
  }
  if (value >= 45) {
    return {
      value,
      label: 'In progress',
      summary: 'The member has useful memory infrastructure, but custody should be upgraded.',
    };
  }
  return {
    value,
    label: 'Needs setup',
    summary: 'Build or seal the pod to create a durable sovereignty trail.',
  };
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function shortHash(value: string): string {
  return value.length > 16 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}
