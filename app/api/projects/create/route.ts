import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  BASE_MAINNET_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
  getDefaultLiveBaseChainId,
} from '@/lib/blockchain/liveBaseProfile';
import type {
  ActiveCollaboration,
  EscrowSettlementPreferences,
  MilestoneDefinition,
  MultisigConfig,
} from '@/lib/movement/explorerGraph';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'global';

const MEMBER_SELECT = 'id,wallet_address,supabase_auth_id,tier';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ETH_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const SUPPORTED_CHAIN_IDS = new Set([1, 10, BASE_MAINNET_CHAIN_ID, BASE_SEPOLIA_CHAIN_ID, 42161]);

interface SupabaseEnv {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

interface EdgeMember {
  id: string;
  wallet_address: string | null;
  supabase_auth_id: string | null;
  tier: string | null;
}

interface CreateProjectRequest {
  creator_member_id: string;
  partner_member_id: string;
  title: string;
  description: string;
  multisig_config?: Partial<MultisigConfig>;
  escrow_settlement_preferences?: Partial<EscrowSettlementPreferences>;
  milestone_definitions?: Array<Partial<MilestoneDefinition>>;
}

interface ProjectAuditContext {
  auditId: string;
  startedAtMs: number;
  callerMemberId?: string;
  projectId?: string;
}

export async function POST(req: NextRequest) {
  const audit: ProjectAuditContext = {
    auditId: crypto.randomUUID(),
    startedAtMs: performance.now(),
  };

  try {
    const env = getSupabaseEnv();
    const auth = await authenticateMember(req, env);
    if (!auth) {
      auditLog(audit, 'auth_rejected', 'warn', { http_status: 401 });
      return jsonWithAudit({ audit_id: audit.auditId, error: 'Unauthorized' }, audit.auditId, 401);
    }

    audit.callerMemberId = auth.id;

    const parsed = await parseCreateProjectRequest(req);
    if (!parsed.ok) {
      auditLog(audit, 'validation_rejected', 'warn', {
        http_status: 400,
        error: parsed.error,
      });
      return jsonWithAudit({ audit_id: audit.auditId, error: parsed.error }, audit.auditId, 400);
    }

    const request = parsed.value;
    if (auth.id !== request.creator_member_id && auth.id !== request.partner_member_id) {
      auditLog(audit, 'membership_rejected', 'warn', {
        http_status: 403,
        creator_member_id: request.creator_member_id,
        partner_member_id: request.partner_member_id,
      });
      return jsonWithAudit(
        { audit_id: audit.auditId, error: 'Caller must be one of the proposed project members.' },
        audit.auditId,
        403,
      );
    }

    const members = await lookupMembers(env, [request.creator_member_id, request.partner_member_id]);
    if (members.length !== 2) {
      auditLog(audit, 'member_lookup_failed', 'warn', {
        http_status: 404,
        found_members: members.length,
      });
      return jsonWithAudit(
        { audit_id: audit.auditId, error: 'Both project members must exist.' },
        audit.auditId,
        404,
      );
    }

    const now = new Date().toISOString();
    const projectId = crypto.randomUUID();
    audit.projectId = projectId;

    const settlementPreferences = normalizeSettlementPreferences(
      request.escrow_settlement_preferences,
    );
    const multisigConfig = normalizeMultisigConfig(
      request.multisig_config,
      settlementPreferences.preferred_chain_id,
      members,
    );
    const milestones = normalizeMilestones(request.milestone_definitions);

    const collaboration: ActiveCollaboration = {
      project_id: projectId,
      title: request.title,
      description: request.description,
      workspace_status: 'proposed',
      creator_member_id: request.creator_member_id,
      partner_member_id: request.partner_member_id,
      multisig_config: multisigConfig,
      milestone_definitions: milestones,
      created_at: now,
      updated_at: now,
    };

    auditLog(audit, 'workspace_scaffold_created', 'info', {
      http_status: 200,
      project_id: projectId,
      creator_member_id: request.creator_member_id,
      partner_member_id: request.partner_member_id,
      milestone_count: milestones.length,
      chain_id: multisigConfig.chain_id,
      multisig_address: multisigConfig.multisig_address,
    });

    return jsonWithAudit(
      {
        ok: true,
        audit_id: audit.auditId,
        workspace_reference: {
          project_id: projectId,
          participant_member_ids: [request.creator_member_id, request.partner_member_id],
          storage_path: 'project_milestone_scaffolding.active_collaborations',
          workspace_status: collaboration.workspace_status,
          created_at: now,
        },
        project_milestone_scaffolding_patch: {
          active_collaboration: collaboration,
          escrow_settlement_preferences: settlementPreferences,
        },
        mutation: {
          type: 'project.created',
          collaboration,
          escrow_settlement_preferences: settlementPreferences,
        },
      },
      audit.auditId,
      200,
    );
  } catch (error) {
    auditLog(audit, 'execution_failed', 'error', {
      http_status: 500,
      error: errorMessage(error),
    });
    return jsonWithAudit(
      { audit_id: audit.auditId, error: 'Project creation failed.' },
      audit.auditId,
      500,
    );
  }
}

async function parseCreateProjectRequest(
  req: NextRequest,
): Promise<{ ok: true; value: CreateProjectRequest } | { ok: false; error: string }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { ok: false, error: 'Request body must be valid JSON.' };
  }

  if (!isRecord(body)) return { ok: false, error: 'Request body must be a JSON object.' };

  const creatorMemberId = stringField(body.creator_member_id).trim();
  const partnerMemberId = stringField(body.partner_member_id).trim();
  const title = stringField(body.title).trim();
  const description = stringField(body.description).trim();

  if (!UUID_PATTERN.test(creatorMemberId)) {
    return { ok: false, error: 'creator_member_id must be a valid UUID.' };
  }

  if (!UUID_PATTERN.test(partnerMemberId)) {
    return { ok: false, error: 'partner_member_id must be a valid UUID.' };
  }

  if (creatorMemberId === partnerMemberId) {
    return { ok: false, error: 'creator_member_id and partner_member_id must be distinct.' };
  }

  if (title.length < 3 || title.length > 120) {
    return { ok: false, error: 'title must be between 3 and 120 characters.' };
  }

  if (description.length > 2000) {
    return { ok: false, error: 'description must be 2000 characters or fewer.' };
  }

  return {
    ok: true,
    value: {
      creator_member_id: creatorMemberId,
      partner_member_id: partnerMemberId,
      title,
      description,
      multisig_config: isRecord(body.multisig_config) ? body.multisig_config : undefined,
      escrow_settlement_preferences: isRecord(body.escrow_settlement_preferences)
        ? body.escrow_settlement_preferences
        : undefined,
      milestone_definitions: Array.isArray(body.milestone_definitions)
        ? body.milestone_definitions
        : undefined,
    },
  };
}

function normalizeSettlementPreferences(
  value: Partial<EscrowSettlementPreferences> | undefined,
): EscrowSettlementPreferences {
  const preferredChainId =
    typeof value?.preferred_chain_id === 'number' && SUPPORTED_CHAIN_IDS.has(value.preferred_chain_id)
      ? value.preferred_chain_id
      : getDefaultLiveBaseChainId();

  return {
    preferred_chain_id: preferredChainId,
    fallback_arbitration_enabled:
      typeof value?.fallback_arbitration_enabled === 'boolean'
        ? value.fallback_arbitration_enabled
        : true,
  };
}

function normalizeMultisigConfig(
  value: Partial<MultisigConfig> | undefined,
  preferredChainId: number,
  members: EdgeMember[],
): MultisigConfig {
  const walletSigners = members
    .map((member) => member.wallet_address)
    .filter((wallet): wallet is string => Boolean(wallet && ETH_ADDRESS_PATTERN.test(wallet)));
  const suppliedSigners = Array.isArray(value?.signers)
    ? value.signers.filter((wallet): wallet is string => ETH_ADDRESS_PATTERN.test(String(wallet)))
    : [];
  const signers = uniqueStrings([...suppliedSigners, ...walletSigners]);
  const requestedThreshold = typeof value?.threshold === 'number' ? value.threshold : null;

  return {
    chain_id:
      typeof value?.chain_id === 'number' && SUPPORTED_CHAIN_IDS.has(value.chain_id)
        ? value.chain_id
        : preferredChainId,
    multisig_address:
      typeof value?.multisig_address === 'string' && ETH_ADDRESS_PATTERN.test(value.multisig_address)
        ? value.multisig_address
        : ZERO_ADDRESS,
    threshold:
      requestedThreshold && requestedThreshold > 0
        ? Math.min(Math.floor(requestedThreshold), Math.max(signers.length, 1))
        : Math.min(2, Math.max(signers.length, 1)),
    signers,
  };
}

function normalizeMilestones(value: Array<Partial<MilestoneDefinition>> | undefined): MilestoneDefinition[] {
  if (!value) return [];

  return value.slice(0, 25).map((milestone, index) => ({
    milestone_id:
      typeof milestone.milestone_id === 'number' && Number.isSafeInteger(milestone.milestone_id)
        ? milestone.milestone_id
        : index + 1,
    title: boundedString(milestone.title, `Milestone ${index + 1}`, 120),
    description: boundedString(milestone.description, '', 1200),
    payout_amount_wei:
      typeof milestone.payout_amount_wei === 'string' && /^\d+$/.test(milestone.payout_amount_wei)
        ? milestone.payout_amount_wei
        : '0',
    status: 'pending',
    completed: false,
    ...(typeof milestone.tx_hash_attachment === 'string' &&
    /^0x[a-fA-F0-9]{64}$/.test(milestone.tx_hash_attachment)
      ? { tx_hash_attachment: milestone.tx_hash_attachment }
      : {}),
  }));
}

async function authenticateMember(req: NextRequest, env: SupabaseEnv): Promise<EdgeMember | null> {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    const user = await getSupabaseUser(env, token);
    if (user?.id) {
      const member = await lookupMember(env, 'supabase_auth_id', user.id);
      if (member) return member;
    }
  }

  const walletId = parseCookies(req.headers.get('cookie')).get('soe_wallet_id');
  if (walletId && UUID_PATTERN.test(walletId)) {
    return lookupMember(env, 'id', walletId);
  }

  return null;
}

async function getSupabaseUser(env: SupabaseEnv, token: string): Promise<{ id: string } | null> {
  const res = await fetch(`${env.url}/auth/v1/user`, {
    headers: {
      apikey: env.anonKey,
      authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  });

  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Supabase auth lookup failed with HTTP ${res.status}.`);

  const body: unknown = await res.json();
  return isRecord(body) && typeof body.id === 'string' ? { id: body.id } : null;
}

async function lookupMember(
  env: SupabaseEnv,
  field: 'id' | 'supabase_auth_id',
  value: string,
): Promise<EdgeMember | null> {
  const supabase = createClient(env.url, env.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase
    .from('members')
    .select(MEMBER_SELECT)
    .eq(field, value)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Member lookup failed: ${error.message}`);
  return data ? (data as EdgeMember) : null;
}

async function lookupMembers(env: SupabaseEnv, memberIds: string[]): Promise<EdgeMember[]> {
  const supabase = createClient(env.url, env.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase
    .from('members')
    .select(MEMBER_SELECT)
    .in('id', memberIds);

  if (error) throw new Error(`Project member lookup failed: ${error.message}`);
  return Array.isArray(data) ? (data as EdgeMember[]) : [];
}

function getSupabaseEnv(): SupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error('Supabase environment is not configured.');
  }

  return { url, anonKey, serviceRoleKey };
}

function jsonWithAudit(body: Record<string, unknown>, auditId: string, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-project-audit-id': auditId,
    },
  });
}

function auditLog(
  audit: ProjectAuditContext,
  phase: string,
  level: 'info' | 'warn' | 'error',
  details: Record<string, unknown> = {},
) {
  const line = JSON.stringify({
    event: 'movement.project.create.audit',
    phase,
    level,
    audit_id: audit.auditId,
    at: new Date().toISOString(),
    elapsed_ms: Math.round((performance.now() - audit.startedAtMs) * 100) / 100,
    caller_member_id: audit.callerMemberId,
    project_id: audit.projectId,
    ...details,
  });

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.info(line);
  }
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function boundedString(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}
