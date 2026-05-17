import { NextRequest, NextResponse } from 'next/server';
import {
  ZERO_ADDRESS,
  getDefaultLiveBaseChainId,
  isLiveBaseChainId,
  normalizeHexAddress,
  resolveLiveBaseChainId,
  validateLiveMultisigConfig,
  type LiveBaseChainId,
} from '@/lib/blockchain/liveBaseProfile';
import { isRecord, stableStringify } from '@/lib/movement/podSync';
import type { MilestoneDefinition, MultisigConfig } from '@/lib/movement/explorerGraph';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'global';

const MEMBER_SELECT = 'id,tier,supabase_auth_id,wallet_address';
const INVITE_ENVELOPE_KIND = 'society-of-explorers.encrypted-project-invite';
const INVITE_ENVELOPE_VERSION = 1;
const INVITE_CIPHERTEXT_ENCODING = 'base64';
const MAX_INVITE_PAYLOAD_BYTES = 64 * 1024;
const MAX_INVITE_JSON_BYTES = 128 * 1024;
const MAX_INVITE_METADATA_BYTES = 8 * 1024;
const MAX_MILESTONES = 25;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const TX_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;

interface SupabaseEnv {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

interface EdgeMember {
  id: string;
  tier: string | null;
  supabase_auth_id: string | null;
  wallet_address: string | null;
}

interface InviteEnvelope {
  kind: typeof INVITE_ENVELOPE_KIND;
  version: typeof INVITE_ENVELOPE_VERSION;
  ciphertext_encoding: typeof INVITE_CIPHERTEXT_ENCODING;
  ciphertext: string;
  iv: string;
  commitment_hash: string;
  created_at: string;
  expires_at?: string;
  metadata: Record<string, unknown>;
}

interface ProjectInviteRequest {
  recipient_member_id: string;
  sender_match_hash: string;
  encrypted_invite_payload: string;
  workspace: {
    title: string;
    description: string;
    multisig_config: MultisigConfig;
    milestone_definitions: MilestoneDefinition[];
  };
  payload_commitment_hash: string | null;
}

interface ProjectInviteRpcResult {
  accepted: boolean;
  status: 'created' | 'duplicate_pending';
  project_id: string | null;
  signal_id: string | null;
  recipient_id: string;
  sender_match_hash: string;
  workspace_status: 'proposed';
  signal_status: 'pending';
  created_at: string;
}

interface InviteAuditContext {
  auditId: string;
  startedAtMs: number;
  route: string;
  method: string;
  region: string | null;
  request: {
    content_length: number | null;
    user_agent: string | null;
    bearer_present: boolean;
    wallet_cookie_present: boolean;
  };
  timings: Record<string, number>;
  callerMemberId?: string;
  recipientMemberId?: string;
  projectId?: string | null;
  signalId?: string | null;
  senderMatchHash?: string;
  payloadBytes?: number;
}

class InviteHttpError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'InviteHttpError';
    this.status = status;
    this.details = details;
  }
}

export async function POST(req: NextRequest) {
  const audit = createAuditContext(req);
  auditLog(audit, 'request_received', 'info');

  try {
    const envStartedAt = performance.now();
    const env = getSupabaseEnv();
    markAuditTiming(audit, 'env_ms', envStartedAt);

    const authStartedAt = performance.now();
    const auth = await authenticateMember(req, env);
    markAuditTiming(audit, 'auth_ms', authStartedAt);
    if (!auth) throw new InviteHttpError(401, 'Unauthorized');

    audit.callerMemberId = auth.id;
    auditLog(audit, 'auth_accepted', 'info', { member_id: auth.id, tier: auth.tier });

    const parseStartedAt = performance.now();
    const parsed = await parseProjectInviteRequest(req);
    markAuditTiming(audit, 'parse_ms', parseStartedAt);

    if (parsed.recipient_member_id === auth.id) {
      throw new InviteHttpError(400, 'recipient_member_id must be distinct from the inviting member.');
    }

    audit.recipientMemberId = parsed.recipient_member_id;
    audit.senderMatchHash = parsed.sender_match_hash;
    audit.payloadBytes = utf8ByteLength(parsed.encrypted_invite_payload);

    const lookupStartedAt = performance.now();
    const members = await lookupMembers(env, [auth.id, parsed.recipient_member_id]);
    markAuditTiming(audit, 'member_lookup_ms', lookupStartedAt);
    if (members.length !== 2) throw new InviteHttpError(404, 'Inviting and recipient members must both exist.');

    const normalizedWorkspace = normalizeWorkspaceForMembers(parsed.workspace, members);
    const validation = validateLiveMultisigConfig(normalizedWorkspace.multisig_config, {
      fallbackChainId: resolveLiveBaseChainId(normalizedWorkspace.multisig_config.chain_id),
    });

    if (!validation.ok) {
      throw new InviteHttpError(400, 'multisig_config is not valid for a live Base deployment.', {
        errors: validation.errors,
      });
    }

    auditLog(audit, 'payload_verified', 'info', {
      recipient_member_id: parsed.recipient_member_id,
      sender_match_hash: parsed.sender_match_hash,
      payload_bytes: audit.payloadBytes,
      chain_id: normalizedWorkspace.multisig_config.chain_id,
      milestone_count: normalizedWorkspace.milestone_definitions.length,
    });

    const rpcStartedAt = performance.now();
    const invitation = await createProjectInvitation(env, {
      p_creator_member_id: auth.id,
      p_partner_member_id: parsed.recipient_member_id,
      p_title: normalizedWorkspace.title,
      p_description: normalizedWorkspace.description,
      p_multisig_config: normalizedWorkspace.multisig_config,
      p_milestone_definitions: normalizedWorkspace.milestone_definitions,
      p_sender_match_hash: parsed.sender_match_hash,
      p_encrypted_invite_payload: parsed.encrypted_invite_payload,
    });
    markAuditTiming(audit, 'rpc_transaction_ms', rpcStartedAt);

    audit.projectId = invitation.project_id;
    audit.signalId = invitation.signal_id;

    if (!invitation.accepted) {
      auditLog(audit, 'duplicate_pending', 'warn', {
        http_status: 409,
        recipient_member_id: invitation.recipient_id,
        sender_match_hash: invitation.sender_match_hash,
      });

      return jsonWithAudit(
        {
          ok: false,
          audit_id: audit.auditId,
          error: 'A pending invitation already exists for this recipient and sender match hash.',
          invitation: publicInvitationResult(invitation),
        },
        audit.auditId,
        409,
      );
    }

    auditLog(audit, 'invite_signal_created', 'info', {
      http_status: 201,
      project_id: invitation.project_id,
      signal_id: invitation.signal_id,
      recipient_member_id: invitation.recipient_id,
      chain_id: validation.chain_id,
      network: validation.network,
    });

    return jsonWithAudit(
      {
        ok: true,
        audit_id: audit.auditId,
        invitation: publicInvitationResult(invitation),
        workspace_reference: {
          project_id: invitation.project_id,
          workspace_status: invitation.workspace_status,
          participant_member_ids: [auth.id, parsed.recipient_member_id],
          storage_path: 'project_milestone_scaffolding.active_collaborations',
        },
        inbox_signal: {
          signal_id: invitation.signal_id,
          recipient_member_id: invitation.recipient_id,
          sender_match_hash: invitation.sender_match_hash,
          signal_status: invitation.signal_status,
          payload_commitment_hash: parsed.payload_commitment_hash,
        },
        multisig_validation: {
          ok: validation.ok,
          chain_id: validation.chain_id,
          network: validation.network,
          explorer_url: validation.explorer_url,
          required_confirmations: validation.required_confirmations,
          threshold: validation.threshold,
          signer_count: validation.signers.length,
        },
      },
      audit.auditId,
      201,
    );
  } catch (error) {
    const normalized = normalizeError(error, audit);
    return jsonWithAudit(normalized.body, audit.auditId, normalized.status);
  }
}

async function parseProjectInviteRequest(req: NextRequest): Promise<ProjectInviteRequest> {
  const contentLength = req.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_INVITE_JSON_BYTES) {
    throw new InviteHttpError(413, 'Invite request body exceeds the JSON size limit.');
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new InviteHttpError(400, 'Request body must be valid JSON.');
  }

  if (!isRecord(body)) throw new InviteHttpError(400, 'Request body must be a JSON object.');

  const recipientMemberId = stringField(body.recipient_member_id || body.target_member_id).trim();
  if (!UUID_PATTERN.test(recipientMemberId)) {
    throw new InviteHttpError(400, 'recipient_member_id must be a valid UUID.');
  }

  const senderMatchHash = stringField(body.sender_match_hash).trim().toLowerCase();
  if (!SHA256_HEX_PATTERN.test(senderMatchHash)) {
    throw new InviteHttpError(400, 'sender_match_hash must be a 64-character sha256 hex digest.');
  }

  const payload = await normalizeEncryptedInvitePayload(body.encrypted_invite_payload);
  const workspace = parseWorkspace(body.workspace || body.project || body.sandbox);

  return {
    recipient_member_id: recipientMemberId,
    sender_match_hash: senderMatchHash,
    encrypted_invite_payload: payload.serialized,
    payload_commitment_hash: payload.commitmentHash,
    workspace,
  };
}

async function normalizeEncryptedInvitePayload(
  value: unknown,
): Promise<{ serialized: string; commitmentHash: string | null }> {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const payloadBytes = utf8ByteLength(trimmed);
    if (payloadBytes === 0) throw new InviteHttpError(400, 'encrypted_invite_payload is required.');
    if (payloadBytes > MAX_INVITE_PAYLOAD_BYTES) {
      throw new InviteHttpError(413, 'encrypted_invite_payload exceeds the payload size limit.');
    }

    return { serialized: trimmed, commitmentHash: null };
  }

  if (!isRecord(value)) {
    throw new InviteHttpError(400, 'encrypted_invite_payload must be an opaque string or invite envelope.');
  }

  const metadata = normalizeMetadata(value.metadata);
  const envelope = normalizeInviteEnvelope(value, metadata);
  const expectedCommitment = await sha256Hex(
    new TextEncoder().encode(canonicalInviteCommitmentInput(envelope)),
  );

  if (envelope.commitment_hash !== expectedCommitment) {
    throw new InviteHttpError(400, 'encrypted_invite_payload.commitment_hash does not match the invite payload.', {
      expected_commitment_hash: expectedCommitment,
    });
  }

  const serialized = stableStringify(envelope);
  if (utf8ByteLength(serialized) > MAX_INVITE_PAYLOAD_BYTES) {
    throw new InviteHttpError(413, 'encrypted_invite_payload exceeds the payload size limit.');
  }

  return { serialized, commitmentHash: envelope.commitment_hash };
}

function normalizeInviteEnvelope(
  value: Record<string, unknown>,
  metadata: Record<string, unknown>,
): InviteEnvelope {
  if (value.kind !== INVITE_ENVELOPE_KIND) {
    throw new InviteHttpError(400, `encrypted_invite_payload.kind must be ${INVITE_ENVELOPE_KIND}.`);
  }

  if (value.version !== INVITE_ENVELOPE_VERSION) {
    throw new InviteHttpError(400, `encrypted_invite_payload.version must be ${INVITE_ENVELOPE_VERSION}.`);
  }

  if (value.ciphertext_encoding !== INVITE_CIPHERTEXT_ENCODING) {
    throw new InviteHttpError(400, `encrypted_invite_payload.ciphertext_encoding must be ${INVITE_CIPHERTEXT_ENCODING}.`);
  }

  const ciphertext = requiredString(value.ciphertext, 'encrypted_invite_payload.ciphertext').trim();
  const iv = requiredString(value.iv, 'encrypted_invite_payload.iv').trim();
  const commitmentHash = requiredString(value.commitment_hash, 'encrypted_invite_payload.commitment_hash')
    .trim()
    .toLowerCase();
  const createdAt = normalizeTimestamp(value.created_at, 'encrypted_invite_payload.created_at');
  const expiresAt =
    value.expires_at === undefined || value.expires_at === null
      ? undefined
      : normalizeTimestamp(value.expires_at, 'encrypted_invite_payload.expires_at');

  if (!SHA256_HEX_PATTERN.test(commitmentHash)) {
    throw new InviteHttpError(400, 'encrypted_invite_payload.commitment_hash must be a sha256 hex digest.');
  }

  const ciphertextBytes = base64ToBytes(ciphertext, 'encrypted_invite_payload.ciphertext');
  const ivBytes = base64ToBytes(iv, 'encrypted_invite_payload.iv');

  if (ciphertextBytes.byteLength < 17) {
    throw new InviteHttpError(400, 'encrypted_invite_payload.ciphertext must include AES-GCM auth tag bytes.');
  }

  if (ciphertextBytes.byteLength > MAX_INVITE_PAYLOAD_BYTES) {
    throw new InviteHttpError(413, 'encrypted_invite_payload.ciphertext exceeds the payload size limit.');
  }

  if (ivBytes.byteLength !== 12) {
    throw new InviteHttpError(400, 'encrypted_invite_payload.iv must be 12 bytes for AES-GCM.');
  }

  if (Date.parse(createdAt) > Date.now() + 15 * 60 * 1000) {
    throw new InviteHttpError(400, 'encrypted_invite_payload.created_at is too far in the future.');
  }

  if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
    throw new InviteHttpError(400, 'encrypted_invite_payload.expires_at must be in the future.');
  }

  return {
    kind: INVITE_ENVELOPE_KIND,
    version: INVITE_ENVELOPE_VERSION,
    ciphertext_encoding: INVITE_CIPHERTEXT_ENCODING,
    ciphertext,
    iv,
    commitment_hash: commitmentHash,
    created_at: createdAt,
    ...(expiresAt ? { expires_at: expiresAt } : {}),
    metadata,
  };
}

function canonicalInviteCommitmentInput(envelope: InviteEnvelope): string {
  return stableStringify({
    ciphertext: envelope.ciphertext,
    ciphertext_encoding: envelope.ciphertext_encoding,
    created_at: envelope.created_at,
    expires_at: envelope.expires_at,
    iv: envelope.iv,
    kind: envelope.kind,
    metadata: envelope.metadata,
    version: envelope.version,
  });
}

function parseWorkspace(value: unknown): ProjectInviteRequest['workspace'] {
  if (!isRecord(value)) throw new InviteHttpError(400, 'workspace must be a JSON object.');

  const title = stringField(value.title).trim();
  const description = stringField(value.description).trim();

  if (title.length < 3 || title.length > 120) {
    throw new InviteHttpError(400, 'workspace.title must be between 3 and 120 characters.');
  }

  if (description.length > 2000) {
    throw new InviteHttpError(400, 'workspace.description must be 2000 characters or fewer.');
  }

  return {
    title,
    description,
    multisig_config: normalizeMultisigConfig(value.multisig_config),
    milestone_definitions: normalizeMilestones(value.milestone_definitions),
  };
}

function normalizeWorkspaceForMembers(
  workspace: ProjectInviteRequest['workspace'],
  members: EdgeMember[],
): ProjectInviteRequest['workspace'] {
  const memberWallets = members
    .map((member) => normalizeHexAddress(member.wallet_address))
    .filter((wallet): wallet is `0x${string}` => Boolean(wallet));
  const signers = uniqueAddresses([...workspace.multisig_config.signers, ...memberWallets]);
  const chainId = resolveLiveBaseChainId(workspace.multisig_config.chain_id, getDefaultLiveBaseChainId());

  return {
    ...workspace,
    description: workspace.description || 'Private collaboration invitation.',
    multisig_config: {
      chain_id: chainId,
      multisig_address: workspace.multisig_config.multisig_address,
      threshold: Math.min(workspace.multisig_config.threshold, Math.max(signers.length, 1)),
      signers,
    },
  };
}

function normalizeMultisigConfig(value: unknown): MultisigConfig {
  const source = isRecord(value) ? value : {};
  const chainId = normalizeBaseChainId(source.chain_id);
  const multisigAddress = normalizeHexAddress(source.multisig_address) || ZERO_ADDRESS;
  const signers = uniqueAddresses(Array.isArray(source.signers) ? source.signers : []);
  const threshold =
    typeof source.threshold === 'number' && Number.isSafeInteger(source.threshold) && source.threshold > 0
      ? Math.min(source.threshold, Math.max(signers.length, 1))
      : Math.min(2, Math.max(signers.length, 1));

  return {
    chain_id: chainId,
    multisig_address: multisigAddress,
    threshold,
    signers,
  };
}

function normalizeBaseChainId(value: unknown): LiveBaseChainId {
  if (typeof value === 'number' && isLiveBaseChainId(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (isLiveBaseChainId(parsed)) return parsed;
  }

  return getDefaultLiveBaseChainId();
}

function normalizeMilestones(value: unknown): MilestoneDefinition[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, MAX_MILESTONES).map((entry, index) => {
    const milestone = isRecord(entry) ? entry : {};
    const txHash = typeof milestone.tx_hash_attachment === 'string' && TX_HASH_PATTERN.test(milestone.tx_hash_attachment)
      ? milestone.tx_hash_attachment
      : undefined;

    return {
      milestone_id:
        typeof milestone.milestone_id === 'number' && Number.isSafeInteger(milestone.milestone_id)
          ? milestone.milestone_id
          : index + 1,
      title: boundedString(milestone.title, `Milestone ${index + 1}`, 120),
      description: boundedString(milestone.description, '', 1200),
      payout_amount_wei:
        typeof milestone.payout_amount_wei === 'string' && /^\d+$/.test(milestone.payout_amount_wei)
          ? milestone.payout_amount_wei.replace(/^0+(?=\d)/, '')
          : '0',
      status: 'pending',
      completed: false,
      ...(txHash ? { tx_hash_attachment: txHash } : {}),
    };
  });
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
    const member = await lookupMember(env, 'id', walletId);
    if (member) return member;
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
  if (!res.ok) throw new InviteHttpError(res.status, 'Supabase auth lookup failed.', await safeJson(res));

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

  if (!res.ok) throw new InviteHttpError(res.status, 'Member lookup failed.', await safeJson(res));

  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? (rows[0] as EdgeMember) : null;
}

async function lookupMembers(env: SupabaseEnv, memberIds: string[]): Promise<EdgeMember[]> {
  const url = new URL(`${env.url}/rest/v1/members`);
  url.searchParams.set('select', MEMBER_SELECT);
  url.searchParams.set('id', `in.(${memberIds.join(',')})`);

  const res = await fetch(url, {
    headers: serviceHeaders(env),
    cache: 'no-store',
  });

  if (!res.ok) throw new InviteHttpError(res.status, 'Project member lookup failed.', await safeJson(res));

  const rows = await res.json();
  return Array.isArray(rows) ? (rows as EdgeMember[]) : [];
}

async function createProjectInvitation(
  env: SupabaseEnv,
  params: Record<string, unknown>,
): Promise<ProjectInviteRpcResult> {
  const res = await fetch(`${env.url}/rest/v1/rpc/create_project_invitation_v1`, {
    method: 'POST',
    headers: {
      ...serviceHeaders(env),
      'content-type': 'application/json',
    },
    body: JSON.stringify(params),
    cache: 'no-store',
  });

  const body = await safeJson(res);
  if (!res.ok) throw new InviteHttpError(res.status, 'Project invitation transaction failed.', body);
  if (!isRecord(body) || typeof body.accepted !== 'boolean') {
    throw new InviteHttpError(502, 'Project invitation transaction returned an invalid response.', body);
  }

  return body as unknown as ProjectInviteRpcResult;
}

function createAuditContext(req: NextRequest): InviteAuditContext {
  const url = new URL(req.url);
  const cookies = parseCookies(req.headers.get('cookie'));
  const contentLength = req.headers.get('content-length');

  return {
    auditId: crypto.randomUUID(),
    startedAtMs: performance.now(),
    route: url.pathname,
    method: req.method,
    region: process.env.VERCEL_REGION || null,
    request: {
      content_length: contentLength ? Number(contentLength) : null,
      user_agent: req.headers.get('user-agent'),
      bearer_present: req.headers.get('authorization')?.startsWith('Bearer ') || false,
      wallet_cookie_present: cookies.has('soe_wallet_id'),
    },
    timings: {},
  };
}

function normalizeError(error: unknown, audit: InviteAuditContext): { status: number; body: Record<string, unknown> } {
  if (error instanceof InviteHttpError) {
    auditLog(audit, error.status >= 500 ? 'execution_failed' : 'validation_rejected', error.status >= 500 ? 'error' : 'warn', {
      http_status: error.status,
      error: error.message,
      details: error.details,
    });

    return {
      status: error.status,
      body: {
        ok: false,
        audit_id: audit.auditId,
        error: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    };
  }

  auditLog(audit, 'execution_failed', 'error', {
    http_status: 500,
    error: errorMessage(error),
  });

  return {
    status: 500,
    body: {
      ok: false,
      audit_id: audit.auditId,
      error: 'Project invitation failed.',
    },
  };
}

function publicInvitationResult(invitation: ProjectInviteRpcResult) {
  return {
    accepted: invitation.accepted,
    status: invitation.status,
    project_id: invitation.project_id,
    signal_id: invitation.signal_id,
    recipient_member_id: invitation.recipient_id,
    sender_match_hash: invitation.sender_match_hash,
    workspace_status: invitation.workspace_status,
    signal_status: invitation.signal_status,
    created_at: invitation.created_at,
  };
}

function getSupabaseEnv(): SupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    throw new InviteHttpError(500, 'Supabase environment is not configured.');
  }

  return { url, anonKey, serviceRoleKey };
}

function serviceHeaders(env: SupabaseEnv): HeadersInit {
  return {
    apikey: env.serviceRoleKey,
    authorization: `Bearer ${env.serviceRoleKey}`,
  };
}

function jsonWithAudit(body: Record<string, unknown>, auditId: string, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-invite-audit-id': auditId,
    },
  });
}

function auditLog(
  audit: InviteAuditContext,
  phase: string,
  level: 'info' | 'warn' | 'error',
  details: Record<string, unknown> = {},
) {
  const line = JSON.stringify({
    event: 'movement.project.invite.audit',
    phase,
    level,
    audit_id: audit.auditId,
    at: new Date().toISOString(),
    elapsed_ms: roundMs(performance.now() - audit.startedAtMs),
    route: audit.route,
    method: audit.method,
    region: audit.region,
    request: audit.request,
    caller_member_id: audit.callerMemberId,
    recipient_member_id: audit.recipientMemberId,
    project_id: audit.projectId,
    signal_id: audit.signalId,
    sender_match_hash: audit.senderMatchHash,
    payload_bytes: audit.payloadBytes,
    timings_ms: audit.timings,
    ...dropUndefined(details),
  });

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.info(line);
  }
}

function markAuditTiming(audit: InviteAuditContext, key: string, startedAtMs: number) {
  audit.timings[key] = roundMs(performance.now() - startedAtMs);
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) throw new InviteHttpError(400, 'encrypted_invite_payload.metadata must be a JSON object.');

  if (utf8ByteLength(stableStringify(value)) > MAX_INVITE_METADATA_BYTES) {
    throw new InviteHttpError(413, 'encrypted_invite_payload.metadata exceeds the metadata size limit.');
  }

  return value;
}

function normalizeTimestamp(value: unknown, field: string): string {
  const raw = requiredString(value, field);
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) throw new InviteHttpError(400, `${field} must be a valid ISO timestamp.`);
  return new Date(timestamp).toISOString();
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InviteHttpError(400, `${field} is required.`);
  }

  return value;
}

function base64ToBytes(value: string, field: string): Uint8Array {
  if (value.length === 0 || value.length % 4 !== 0 || !BASE64_PATTERN.test(value)) {
    throw new InviteHttpError(400, `${field} must be valid base64.`);
  }

  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
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

function stringField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function boundedString(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

function uniqueAddresses(values: unknown[]): string[] {
  const seen = new Set<string>();
  const addresses: string[] = [];

  for (const value of values) {
    const address = normalizeHexAddress(value);
    if (!address) continue;

    const key = address.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    addresses.push(address);
  }

  return addresses;
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

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function dropUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined));
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
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
