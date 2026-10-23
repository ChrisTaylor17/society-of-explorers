import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const MAX_OFFSET = 5000;
const SCAN_HISTORY_SELECT =
  'id, space_id, file_size_bytes, scan_type, scan_format, quality_score, verified, verified_at, reward_exp, is_first_scan, location_name, status, created_at';
const SPACE_SUMMARY_SELECT = 'id, name, city, space_type';

type ScanRow = {
  id: string;
  space_id: string | null;
  file_size_bytes: number | null;
  scan_type: string | null;
  scan_format: string | null;
  quality_score: number | null;
  reward_exp: number | null;
  is_first_scan: boolean | null;
  location_name: string | null;
  status: string | null;
  verified: boolean | null;
  verified_at: string | null;
  created_at: string | null;
};

type SpaceSummary = {
  name: string;
  city: string | null;
  space_type: string;
};

type SpaceRow = SpaceSummary & {
  id: string;
};

function parseBoundedInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed)) return fallback;

  return Math.min(max, Math.max(min, parsed));
}

function parseStatus(value: string | null) {
  return value === 'verified' || value === 'scored' || value === 'pending' ? value : null;
}

function boundedText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  return trimmed.slice(0, maxLength);
}

function publicScanRow(scan: ScanRow, space: SpaceSummary | null) {
  return {
    id: scan.id,
    file_size_bytes: Number(scan.file_size_bytes) || 0,
    scan_type: boundedText(scan.scan_type, 40) || 'photo',
    scan_format: boundedText(scan.scan_format, 40) || 'scan',
    quality_score: scan.quality_score === null ? null : Math.max(0, Math.min(100, Number(scan.quality_score) || 0)),
    verified: Boolean(scan.verified),
    verified_at: scan.verified_at,
    reward_exp: Math.max(0, Number(scan.reward_exp) || 0),
    is_first_scan: Boolean(scan.is_first_scan),
    location_name: boundedText(scan.location_name, 160),
    status: boundedText(scan.status, 40) || (scan.verified ? 'scored' : 'pending'),
    created_at: scan.created_at,
    space,
  };
}

function scanHistoryFailure() {
  return privateJson({ error: 'Failed to load scans' }, { status: 500 });
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = req.nextUrl;
    const page = parseBoundedInteger(searchParams.get('page'), 1, 1, 500);
    const limit = parseBoundedInteger(searchParams.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT);
    const requestedOffset = parseBoundedInteger(searchParams.get('offset'), (page - 1) * limit, 0, MAX_OFFSET);
    const offset = Math.min(MAX_OFFSET, requestedOffset);
    const status = parseStatus(searchParams.get('status'));

    const scannerId = auth.member.supabase_auth_id || auth.memberId;
    const supabaseAdmin = getSupabaseAdmin();
    let query = supabaseAdmin
      .from('scan_uploads')
      .select(SCAN_HISTORY_SELECT, { count: 'exact' })
      .or(`scanner_id.eq.${scannerId},scanner_id.eq.${auth.memberId}`)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status === 'verified' || status === 'scored') query = query.eq('verified', true);
    else if (status === 'pending') query = query.eq('verified', false);

    const { data: scans, count, error } = await query;

    if (error) return scanHistoryFailure();

    // Fetch space names for enrichment
    const scanRows = (scans || []) as ScanRow[];
    const spaceIds = [...new Set(scanRows.map((scan) => scan.space_id).filter(Boolean))] as string[];
    const spaces: Record<string, SpaceSummary> = {};

    if (spaceIds.length > 0) {
      const { data: spaceRows } = await supabaseAdmin
        .from('spaces')
        .select(SPACE_SUMMARY_SELECT)
        .in('id', spaceIds);

      if (spaceRows) {
        for (const sp of spaceRows as SpaceRow[]) {
          spaces[sp.id] = { name: sp.name, city: sp.city, space_type: sp.space_type };
        }
      }
    }

    const enriched = scanRows.map((scan) => publicScanRow(scan, scan.space_id ? spaces[scan.space_id] || null : null));

    const totalExp = scanRows.reduce((sum, scan) => sum + (scan.reward_exp || 0), 0);
    const verifiedCount = scanRows.filter((scan) => scan.verified).length;

    return privateJson({
      scans: enriched,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
      stats: {
        totalScans: count || 0,
        verifiedScans: verifiedCount,
        pendingScans: (count || 0) - verifiedCount,
        totalExpEarned: totalExp,
      },
    });
  } catch {
    return scanHistoryFailure();
  }
}
