import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { calculateScanReward } from '@/lib/world/types';

const MAX_SCORE_BODY_LENGTH = 4096;
const MAX_NOTES_LENGTH = 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCAN_WITH_SPACE_SELECT = 'scanner_id, space_id, verified, is_first_scan, spaces(host_id)';
const QUALITY_SCORE_SELECT = 'quality_score';

type ScanWithSpace = {
  scanner_id: string;
  space_id: string;
  verified: boolean | null;
  is_first_scan: boolean | null;
  spaces: { host_id: string | null } | Array<{ host_id: string | null }> | null;
};

type QualityScoreRow = {
  quality_score: number | null;
};

type MemberExpRow = {
  id: string;
  exp_tokens: number | null;
};

async function safeRequestJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  const rawBody = await req.text();
  if (!rawBody || rawBody.length > MAX_SCORE_BODY_LENGTH) return null;

  try {
    const parsedBody = JSON.parse(rawBody);
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) return null;
    return parsedBody as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeScanId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const scanId = value.trim();
  return UUID_PATTERN.test(scanId) ? scanId : null;
}

function normalizeQualityScore(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;

  const score = Math.trunc(value);
  return score >= 0 && score <= 100 ? score : null;
}

function normalizeNotes(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const notes = value.trim();
  if (!notes) return null;
  return notes.slice(0, MAX_NOTES_LENGTH);
}

function hasValidScoringKey(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0 && Boolean(process.env.SCAN_SCORING_API_KEY) && value === process.env.SCAN_SCORING_API_KEY;
}

function resolveSpaceHostId(spaces: ScanWithSpace['spaces']): string | null {
  if (Array.isArray(spaces)) return spaces[0]?.host_id ?? null;
  return spaces?.host_id ?? null;
}

function randomAutoScore(): number {
  return Math.floor(40 + Math.random() * 55);
}

function scanScoreFailure() {
  return privateJson({ error: 'Failed to score scan' }, { status: 500 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await safeRequestJson(req);
    const scanId = normalizeScanId(body?.scanId);
    const submittedScore = normalizeQualityScore(body?.qualityScore);
    const hasSubmittedScore = body?.qualityScore !== undefined && body?.qualityScore !== null;
    const notes = normalizeNotes(body?.notes);

    if (!scanId) {
      return privateJson({ error: 'Missing required field: scanId' }, { status: 400 });
    }

    if (hasSubmittedScore && submittedScore === null) {
      return privateJson({ error: 'Quality score must be 0-100' }, { status: 400 });
    }

    const score = submittedScore ?? randomAutoScore();
    let reviewerId: string | null = null;

    if (hasValidScoringKey(body?.apiKey)) {
      reviewerId = 'system';
    } else {
      const auth = await getAuthenticatedMember(req);
      if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });
      reviewerId = auth.member.supabase_auth_id || auth.memberId;
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: scan, error: scanLookupError } = await supabaseAdmin
      .from('scan_uploads')
      .select(SCAN_WITH_SPACE_SELECT)
      .eq('id', scanId)
      .maybeSingle();

    if (scanLookupError) return scanScoreFailure();
    if (!scan) return privateJson({ error: 'Scan not found' }, { status: 404 });

    const scanRow = scan as ScanWithSpace;
    if (scanRow.verified) return privateJson({ error: 'Scan already scored' }, { status: 409 });

    if (reviewerId !== 'system') {
      const hostId = resolveSpaceHostId(scanRow.spaces);
      if (hostId !== reviewerId) {
        return privateJson({ error: 'Only the space host can score scans' }, { status: 403 });
      }
    }

    const databaseReviewerId = reviewerId === 'system' ? null : reviewerId;
    const { count: lifetimeScans, error: lifetimeScansError } = await supabaseAdmin
      .from('scan_uploads')
      .select('id', { count: 'exact', head: true })
      .eq('scanner_id', scanRow.scanner_id)
      .eq('verified', true);

    if (lifetimeScansError) return scanScoreFailure();

    const verifiedScanCount = lifetimeScans ?? 0;
    const expAmount = calculateScanReward(score, Boolean(scanRow.is_first_scan), verifiedScanCount);
    const { data: scoredRows, error: scoreUpdateError } = await supabaseAdmin
      .from('scan_uploads')
      .update({
        quality_score: score,
        verified: true,
        verified_by: databaseReviewerId,
        verified_at: new Date().toISOString(),
        reward_exp: expAmount,
        status: 'scored',
      })
      .eq('id', scanId)
      .or('verified.eq.false,verified.is.null')
      .select('id');

    if (scoreUpdateError) return scanScoreFailure();
    if (!scoredRows || scoredRows.length === 0) {
      return privateJson({ error: 'Scan already scored' }, { status: 409 });
    }

    const { error: qualityLogError } = await supabaseAdmin.from('scan_quality_log').insert({
      scan_id: scanId,
      reviewer_id: databaseReviewerId,
      quality_score: score,
      notes,
    });

    if (qualityLogError) return scanScoreFailure();

    const { data: spaceScans, error: spaceScansError } = await supabaseAdmin
      .from('scan_uploads')
      .select(QUALITY_SCORE_SELECT)
      .eq('space_id', scanRow.space_id)
      .eq('verified', true)
      .not('quality_score', 'is', null);

    if (spaceScansError) return scanScoreFailure();

    const qualityRows = (spaceScans || []) as QualityScoreRow[];
    if (qualityRows.length > 0) {
      const avg = qualityRows.reduce((sum, scanQuality) => sum + (scanQuality.quality_score || 0), 0) / qualityRows.length;
      const { error: spaceUpdateError } = await supabaseAdmin.from('spaces').update({ avg_quality: Math.round(avg * 10) / 10 }).eq('id', scanRow.space_id);
      if (spaceUpdateError) return scanScoreFailure();
    }

    if (expAmount > 0) {
      const { data: scannerMember, error: scannerMemberError } = await supabaseAdmin
        .from('members')
        .select('id, exp_tokens')
        .or(`supabase_auth_id.eq.${scanRow.scanner_id},id.eq.${scanRow.scanner_id}`)
        .maybeSingle();

      if (scannerMemberError) return scanScoreFailure();
      const scannerMemberRow = scannerMember as MemberExpRow | null;
      if (scannerMemberRow) {
        const { error: expEventError } = await supabaseAdmin.from('exp_events').insert({
          member_id: scannerMemberRow.id,
          amount: expAmount,
          reason: 'scan_verified',
          metadata: JSON.stringify({
            scanId,
            spaceId: scanRow.space_id,
            qualityScore: score,
            isFirstScan: scanRow.is_first_scan,
          }),
        });

        if (expEventError) return scanScoreFailure();

        const newTotal = (scannerMemberRow.exp_tokens || 0) + expAmount;
        const { error: memberUpdateError } = await supabaseAdmin
          .from('members')
          .update({ exp_tokens: newTotal })
          .eq('id', scannerMemberRow.id);

        if (memberUpdateError) return scanScoreFailure();
      }
    }

    return privateJson({
      success: true,
      qualityScore: score,
      expAwarded: expAmount,
      isFirstScan: scanRow.is_first_scan,
      lifetimeScans: verifiedScanCount + 1,
    });
  } catch {
    return scanScoreFailure();
  }
}
