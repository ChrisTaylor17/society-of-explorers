import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'global';

const MEMBER_SELECT = 'id,tier,supabase_auth_id,wallet_address';
const MAX_CANDIDATES = 100;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BUILDER_ARCHETYPES = [
  'Systems Architect',
  'Visionary Philosopher',
  'Algorithmic Operator',
  'Growth Catalyst',
] as const;

type BuilderArchetype = (typeof BUILDER_ARCHETYPES)[number];

interface EpistemicVectors {
  rationalism_vs_empiricism: number;
  risk_acceleration_tolerance: number;
  open_source_conviction: number;
}

interface MatchProjection {
  member_id: string;
  epistemic_vectors: EpistemicVectors;
  primary_builder_archetype: BuilderArchetype;
  decentralization_conviction: number;
  synergistic_skills: string[];
}

interface MatchReport {
  candidate_id: string;
  compatibility_score: number;
  ideological_resonance: number;
  builder_complementarity: number;
  skill_overlap_score: number;
  asymmetric_synergy: boolean;
  shared_skill_overlap: string[];
  analysis: {
    complementary_roles: string;
    shared_vectors: string[];
    tension_vectors: string[];
    shared_vectors_count: number;
    trust_summary: string;
  };
}

interface EdgeMember {
  id: string;
  tier: string | null;
  supabase_auth_id: string | null;
  wallet_address: string | null;
}

interface SupabaseEnv {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

interface MatchAuditContext {
  auditId: string;
  startedAtMs: number;
  sourceMemberId?: string;
  candidatesProcessed?: number;
}

export async function POST(req: NextRequest) {
  const audit: MatchAuditContext = {
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

    const body = await safeRequestJson(req);
    const sourceProjection = parseProjectionBody(body);
    if (!sourceProjection.ok) {
      auditLog(audit, 'validation_rejected', 'warn', {
        http_status: 400,
        error: sourceProjection.error,
      });
      return jsonWithAudit(
        { audit_id: audit.auditId, error: sourceProjection.error },
        audit.auditId,
        400,
      );
    }

    if (sourceProjection.value.member_id !== auth.id) {
      auditLog(audit, 'member_mismatch', 'warn', {
        http_status: 403,
        authenticated_member_id: auth.id,
        submitted_member_id: sourceProjection.value.member_id,
      });
      return jsonWithAudit(
        { audit_id: audit.auditId, error: 'Projection member_id does not match authenticated member.' },
        audit.auditId,
        403,
      );
    }

    audit.sourceMemberId = auth.id;
    const supabase = createClient(env.url, env.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await supabase
      .from('consented_match_projections')
      .select('*')
      .neq('member_id', sourceProjection.value.member_id)
      .limit(MAX_CANDIDATES);

    if (error) {
      throw new Error(`Match projection query failed: ${error.message}`);
    }

    const candidates = normalizeCandidates(data);
    const matches = candidates
      .map((candidate) => buildMatchReport(sourceProjection.value, candidate))
      .sort((left, right) => right.compatibility_score - left.compatibility_score);

    audit.candidatesProcessed = candidates.length;
    auditLog(audit, 'match_matrix_calculated', 'info', {
      http_status: 200,
      candidates_processed: candidates.length,
      matches_returned: matches.length,
    });

    return jsonWithAudit(
      {
        ok: true,
        audit_id: audit.auditId,
        source_member_id: sourceProjection.value.member_id,
        candidates_processed: candidates.length,
        matches,
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
      { audit_id: audit.auditId, error: 'Internal edge matching failure.' },
      audit.auditId,
      500,
    );
  }
}

function buildMatchReport(source: MatchProjection, candidate: MatchProjection): MatchReport {
  const sourceVector = projectionToVector(source);
  const candidateVector = projectionToVector(candidate);
  const cosineSimilarity = calculateCosineSimilarity(sourceVector, candidateVector);
  const ideologicalResonance = normalizeCosine(cosineSimilarity);
  const builderComplementarity = calculateBuilderComplementarity(
    source.primary_builder_archetype,
    candidate.primary_builder_archetype,
  );
  const sharedSkills = intersectSkills(source.synergistic_skills, candidate.synergistic_skills);
  const skillOverlapScore = calculateSkillOverlap(source.synergistic_skills, candidate.synergistic_skills);
  const sharedVectors = findSharedVectors(source, candidate);
  const tensionVectors = findTensionVectors(source, candidate);

  const compatibilityScore = clamp01(
    ideologicalResonance * 0.52 +
      builderComplementarity * 0.23 +
      skillOverlapScore * 0.15 +
      sharedVectors.length * 0.025 -
      tensionVectors.length * 0.025,
  );

  const asymmetricSynergy = source.primary_builder_archetype !== candidate.primary_builder_archetype;

  return {
    candidate_id: candidate.member_id,
    compatibility_score: round4(compatibilityScore),
    ideological_resonance: round4(ideologicalResonance),
    builder_complementarity: round4(builderComplementarity),
    skill_overlap_score: round4(skillOverlapScore),
    asymmetric_synergy: asymmetricSynergy,
    shared_skill_overlap: sharedSkills,
    analysis: {
      complementary_roles: describeRolePair(
        source.primary_builder_archetype,
        candidate.primary_builder_archetype,
      ),
      shared_vectors: sharedVectors,
      tension_vectors: tensionVectors,
      shared_vectors_count: sharedVectors.length,
      trust_summary: summarizeTrustBasis(ideologicalResonance, builderComplementarity, sharedSkills),
    },
  };
}

function projectionToVector(projection: MatchProjection): number[] {
  return [
    projection.epistemic_vectors.rationalism_vs_empiricism,
    projection.epistemic_vectors.risk_acceleration_tolerance,
    projection.epistemic_vectors.open_source_conviction,
    projection.decentralization_conviction,
  ];
}

function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < vecA.length; index += 1) {
    dotProduct += vecA[index] * vecB[index];
    normA += vecA[index] * vecA[index];
    normB += vecB[index] * vecB[index];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function calculateBuilderComplementarity(source: BuilderArchetype, candidate: BuilderArchetype): number {
  if (source === candidate) return 0.62;

  const pair = new Set([source, candidate]);
  if (pair.has('Visionary Philosopher') && pair.has('Algorithmic Operator')) return 0.96;
  if (pair.has('Systems Architect') && pair.has('Growth Catalyst')) return 0.94;
  if (pair.has('Systems Architect') && pair.has('Visionary Philosopher')) return 0.88;
  if (pair.has('Algorithmic Operator') && pair.has('Growth Catalyst')) return 0.86;
  return 0.8;
}

function calculateSkillOverlap(sourceSkills: string[], candidateSkills: string[]): number {
  const source = new Set(sourceSkills.map(normalizeSkill).filter(Boolean));
  const candidate = new Set(candidateSkills.map(normalizeSkill).filter(Boolean));
  if (source.size === 0 && candidate.size === 0) return 0.5;

  const intersection = [...source].filter((skill) => candidate.has(skill)).length;
  const union = new Set([...source, ...candidate]).size;
  return union === 0 ? 0 : intersection / union;
}

function intersectSkills(sourceSkills: string[], candidateSkills: string[]): string[] {
  const candidate = new Set(candidateSkills.map(normalizeSkill).filter(Boolean));
  return sourceSkills
    .filter((skill) => candidate.has(normalizeSkill(skill)))
    .map((skill) => skill.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function findSharedVectors(source: MatchProjection, candidate: MatchProjection): string[] {
  const vectors = [
    {
      label: 'Truth-seeking style',
      left: source.epistemic_vectors.rationalism_vs_empiricism,
      right: candidate.epistemic_vectors.rationalism_vs_empiricism,
    },
    {
      label: 'Risk and acceleration tolerance',
      left: source.epistemic_vectors.risk_acceleration_tolerance,
      right: candidate.epistemic_vectors.risk_acceleration_tolerance,
    },
    {
      label: 'Open-source conviction',
      left: source.epistemic_vectors.open_source_conviction,
      right: candidate.epistemic_vectors.open_source_conviction,
    },
    {
      label: 'Decentralization conviction',
      left: source.decentralization_conviction,
      right: candidate.decentralization_conviction,
    },
  ];

  return vectors
    .filter((vector) => Math.abs(vector.left - vector.right) <= 0.3)
    .map((vector) => vector.label);
}

function findTensionVectors(source: MatchProjection, candidate: MatchProjection): string[] {
  const vectors = [
    {
      label: 'Truth-seeking style',
      left: source.epistemic_vectors.rationalism_vs_empiricism,
      right: candidate.epistemic_vectors.rationalism_vs_empiricism,
    },
    {
      label: 'Risk and acceleration tolerance',
      left: source.epistemic_vectors.risk_acceleration_tolerance,
      right: candidate.epistemic_vectors.risk_acceleration_tolerance,
    },
    {
      label: 'Open-source conviction',
      left: source.epistemic_vectors.open_source_conviction,
      right: candidate.epistemic_vectors.open_source_conviction,
    },
    {
      label: 'Decentralization conviction',
      left: source.decentralization_conviction,
      right: candidate.decentralization_conviction,
    },
  ];

  return vectors
    .filter((vector) => Math.abs(vector.left - vector.right) >= 1.15)
    .map((vector) => vector.label);
}

function describeRolePair(source: BuilderArchetype, candidate: BuilderArchetype): string {
  if (source === candidate) {
    return `Parallel roles: both operate as ${source}. Expect high context sharing and possible ownership overlap.`;
  }

  return `Complementary roles: ${source} paired with ${candidate}. This creates useful execution asymmetry without requiring either explorer to surrender sovereignty.`;
}

function summarizeTrustBasis(
  ideologicalResonance: number,
  builderComplementarity: number,
  sharedSkills: string[],
): string {
  if (ideologicalResonance >= 0.82 && builderComplementarity >= 0.86) {
    return 'Strong philosophical alignment with complementary execution posture.';
  }
  if (ideologicalResonance >= 0.72) {
    return 'Shared ethical and epistemic ground; clarify operating roles before funding milestones.';
  }
  if (builderComplementarity >= 0.86 && sharedSkills.length > 0) {
    return 'Execution fit is promising; use early project milestones to test philosophical trust.';
  }
  return 'Potential collaboration requires a scoped sandbox and explicit milestone boundaries.';
}

function normalizeCandidates(data: unknown): MatchProjection[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((row) => {
      const source = isRecord(row) && isRecord(row.projection) ? row.projection : row;
      const parsed = parseProjection(source);
      return parsed.ok ? parsed.value : null;
    })
    .filter((candidate): candidate is MatchProjection => Boolean(candidate));
}

function parseProjectionBody(body: unknown): { ok: true; value: MatchProjection } | { ok: false; error: string } {
  if (!isRecord(body)) return { ok: false, error: 'Request body must be a JSON object.' };
  if (!('projection' in body)) return { ok: false, error: 'Missing projection payload.' };
  return parseProjection(body.projection);
}

function parseProjection(value: unknown): { ok: true; value: MatchProjection } | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: 'Profile projection must be a JSON object.' };
  if (typeof value.member_id !== 'string' || !UUID_PATTERN.test(value.member_id)) {
    return { ok: false, error: 'projection.member_id must be a valid UUID.' };
  }

  const epistemicVectors = parseEpistemicVectors(value.epistemic_vectors);
  if (!epistemicVectors.ok) return epistemicVectors;

  if (!isBuilderArchetype(value.primary_builder_archetype)) {
    return { ok: false, error: 'projection.primary_builder_archetype is invalid.' };
  }

  const decentralizationConviction = numberInRange(value.decentralization_conviction, -1, 1);
  if (decentralizationConviction === null) {
    return { ok: false, error: 'projection.decentralization_conviction must be between -1 and 1.' };
  }

  if (!Array.isArray(value.synergistic_skills)) {
    return { ok: false, error: 'projection.synergistic_skills must be an array.' };
  }

  const synergisticSkills = value.synergistic_skills
    .filter((skill): skill is string => typeof skill === 'string')
    .map((skill) => skill.trim())
    .filter(Boolean)
    .slice(0, 50);

  return {
    ok: true,
    value: {
      member_id: value.member_id,
      epistemic_vectors: epistemicVectors.value,
      primary_builder_archetype: value.primary_builder_archetype,
      decentralization_conviction: decentralizationConviction,
      synergistic_skills: synergisticSkills,
    },
  };
}

function parseEpistemicVectors(
  value: unknown,
): { ok: true; value: EpistemicVectors } | { ok: false; error: string } {
  if (!isRecord(value)) {
    return { ok: false, error: 'projection.epistemic_vectors must be a JSON object.' };
  }

  const rationalismVsEmpiricism = numberInRange(value.rationalism_vs_empiricism, -1, 1);
  const riskAccelerationTolerance = numberInRange(value.risk_acceleration_tolerance, -1, 1);
  const openSourceConviction = numberInRange(value.open_source_conviction, -1, 1);

  if (
    rationalismVsEmpiricism === null ||
    riskAccelerationTolerance === null ||
    openSourceConviction === null
  ) {
    return {
      ok: false,
      error: 'projection.epistemic_vectors values must all be numbers between -1 and 1.',
    };
  }

  return {
    ok: true,
    value: {
      rationalism_vs_empiricism: rationalismVsEmpiricism,
      risk_acceleration_tolerance: riskAccelerationTolerance,
      open_source_conviction: openSourceConviction,
    },
  };
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

async function safeRequestJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
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
      'x-match-audit-id': auditId,
    },
  });
}

function auditLog(
  audit: MatchAuditContext,
  phase: string,
  level: 'info' | 'warn' | 'error',
  details: Record<string, unknown> = {},
) {
  const line = JSON.stringify({
    event: 'movement.pod.match.audit',
    phase,
    level,
    audit_id: audit.auditId,
    at: new Date().toISOString(),
    elapsed_ms: Math.round((performance.now() - audit.startedAtMs) * 100) / 100,
    source_member_id: audit.sourceMemberId,
    candidates_processed: audit.candidatesProcessed,
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

function isBuilderArchetype(value: unknown): value is BuilderArchetype {
  return typeof value === 'string' && BUILDER_ARCHETYPES.includes(value as BuilderArchetype);
}

function numberInRange(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}

function normalizeCosine(value: number): number {
  return clamp01((value + 1) / 2);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round4(value: number): number {
  return Number.parseFloat(value.toFixed(4));
}

function normalizeSkill(skill: string): string {
  return skill.trim().toLowerCase();
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
