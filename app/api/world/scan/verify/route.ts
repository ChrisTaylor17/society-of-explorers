import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { calculateScanReward } from '@/lib/world/types';

const MAX_VERIFY_BODY_LENGTH = 4096;
const MAX_NOTES_LENGTH = 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCAN_WITH_SPACE_SELECT = 'id, scanner_id, space_id, verified, is_first_scan, spaces(host_id)';
const QUALITY_SCORE_SELECT = 'quality_score';

type ScanWithSpace = {
  id: string;
  scanner_id: string;
  space_id: string;
  verified?: boolean | null;
  is_first_scan?: boolean | null;
  spaces?: { host_id?: string | null } | Array<{ host_id?: string | null }> | null;
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
  if (!rawBody || rawBody.length > MAX_VERIFY_BODY_LENGTH) return null;

  try {
    const parsedBody = JSON.parse(rawBody);
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) return null;
    return parsedBody as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmedValue = value.trim();
  return UUID_PATTERN.test(trimmedValue) ? trimmedValue : null;
}

function normalizeQualityScore(value: unknown): number | null {
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

function resolveSpaceHostId(spaces: ScanWithSpace['spaces']): string | null {
  if (Array.isArray(spaces)) return spaces[0]?.host_id ?? null;
  return spaces?.host_id ?? null;
}

function worldScanVerifyFailure() {
  return privateJson({ error: 'Failed to verify scan' }, { status: 500 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await safeRequestJson(req);
    const scanId = normalizeUuid(body?.scanId);
    const qualityScore = normalizeQualityScore(body?.qualityScore);
    const notes = normalizeNotes(body?.notes);

    if (!scanId || body?.qualityScore === undefined || body?.qualityScore === null) {
      return privateJson({ error: 'Missing required fields: scanId, qualityScore' }, { status: 400 });
    }

    if (qualityScore === null) {
      return privateJson({ error: 'Quality score must be 0-100' }, { status: 400 });
    }

    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    const supabaseAdmin = getSupabaseAdmin();
    const reviewerId = auth.member.supabase_auth_id || auth.memberId;

    const { data: scan, error: scanLookupError } = await supabaseAdmin
      .from('scan_uploads')
      .select(SCAN_WITH_SPACE_SELECT)
      .eq('id', scanId)
      .maybeSingle();

    if (scanLookupError) return worldScanVerifyFailure();
    const typedScan = scan as ScanWithSpace | null;
    if (!typedScan) return privateJson({ error: 'Scan not found' }, { status: 404 });
    if (typedScan.verified) return privateJson({ error: 'Scan already verified' }, { status: 409 });

    const hostId = resolveSpaceHostId(typedScan.spaces);
    if (hostId !== reviewerId && hostId !== auth.memberId) {
      return privateJson({ error: 'Only the space host can verify scans' }, { status: 403 });
    }

    const { count: lifetimeScans, error: lifetimeScansError } = await supabaseAdmin
      .from('scan_uploads')
      .select('id', { count: 'exact', head: true })
      .eq('scanner_id', typedScan.scanner_id)
      .eq('verified', true);

    if (lifetimeScansError) return worldScanVerifyFailure();

    const verifiedScanCount = lifetimeScans ?? 0;
    const expAmount = calculateScanReward(qualityScore, Boolean(typedScan.is_first_scan), verifiedScanCount);
    const { data: verifiedRows, error: verifyUpdateError } = await supabaseAdmin
      .from('scan_uploads')
      .update({
        quality_score: qualityScore,
        verified: true,
        verified_by: reviewerId,
        verified_at: new Date().toISOString(),
        exp_awarded: expAmount,
      })
      .eq('id', scanId)
      .or('verified.eq.false,verified.is.null')
      .select('id');

    if (verifyUpdateError) return worldScanVerifyFailure();
    if (!verifiedRows || verifiedRows.length === 0) {
      return privateJson({ error: 'Scan already verified' }, { status: 409 });
    }

    const { error: qualityLogError } = await supabaseAdmin.from('scan_quality_log').insert({
      scan_id: scanId,
      reviewer_id: reviewerId,
      quality_score: qualityScore,
      notes,
    });

    if (qualityLogError) return worldScanVerifyFailure();

    const { data: spaceScans, error: spaceScansError } = await supabaseAdmin
      .from('scan_uploads')
      .select(QUALITY_SCORE_SELECT)
      .eq('space_id', typedScan.space_id)
      .eq('verified', true)
      .not('quality_score', 'is', null);

    if (spaceScansError) return worldScanVerifyFailure();

    const qualityRows = (spaceScans || []) as QualityScoreRow[];
    if (qualityRows.length > 0) {
      const avg = qualityRows.reduce((sum, scanQuality) => sum + (scanQuality.quality_score || 0), 0) / qualityRows.length;
      const { error: spaceUpdateError } = await supabaseAdmin.from('spaces').update({ avg_quality: Math.round(avg * 10) / 10 }).eq('id', typedScan.space_id);
      if (spaceUpdateError) return worldScanVerifyFailure();
    }

    if (expAmount > 0) {
      const { data: scannerMember, error: scannerMemberError } = await supabaseAdmin
        .from('members')
        .select('id, exp_tokens')
        .or(`supabase_auth_id.eq.${typedScan.scanner_id},id.eq.${typedScan.scanner_id}`)
        .maybeSingle();

      if (scannerMemberError) return worldScanVerifyFailure();
      const scannerMemberRow = scannerMember as MemberExpRow | null;

      if (scannerMemberRow) {
        const { error: expEventError } = await supabaseAdmin.from('exp_events').insert({
          member_id: scannerMemberRow.id,
          amount: expAmount,
          reason: 'scan_verified',
          metadata: JSON.stringify({
            scanId,
            spaceId: typedScan.space_id,
            qualityScore,
            isFirstScan: typedScan.is_first_scan,
          }),
        });

        if (expEventError) return worldScanVerifyFailure();

        const newTotal = (scannerMemberRow.exp_tokens || 0) + expAmount;
        const { error: memberUpdateError } = await supabaseAdmin.from('members').update({ exp_tokens: newTotal }).eq('id', scannerMemberRow.id);
        if (memberUpdateError) return worldScanVerifyFailure();
      }
    }

    return privateJson({
      success: true,
      qualityScore,
      expAwarded: expAmount,
      isFirstScan: typedScan.is_first_scan,
      lifetimeScans: verifiedScanCount + 1,
    });
  } catch {
    return worldScanVerifyFailure();
  }
}
