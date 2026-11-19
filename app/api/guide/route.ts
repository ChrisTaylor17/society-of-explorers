import { NextRequest } from 'next/server';
import { type AuthenticatedMember, getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { getSpawningTree } from '@/lib/salons';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const GUIDE_SALON_SELECT = 'id, title, status, week_number, created_at';
const MAX_DISPLAY_TEXT = 120;
const MAX_GUIDE_LEVEL = 3;

type SalonRow = {
  id?: unknown;
  title?: unknown;
  status?: unknown;
  week_number?: unknown;
  created_at?: unknown;
};

type GuideSalonStats = {
  member_count: number;
  sessions_completed: number;
  current_week: number;
};

type PublicSpawningTreeNode = {
  id: string;
  title: string;
  status: string;
  children: PublicSpawningTreeNode[];
};

function boundedInteger(value: unknown, max = Number.MAX_SAFE_INTEGER) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(0, Math.trunc(value)), max) : 0;
}

function publicText(value: unknown, fallback: string, maxLength = MAX_DISPLAY_TEXT) {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, maxLength) || fallback;
}

function publicGuideSalon(row: SalonRow, stats: GuideSalonStats) {
  return {
    id: publicText(row.id, 'salon', 80),
    title: publicText(row.title, 'Salon'),
    status: publicText(row.status, 'recruiting', 32),
    week_number: boundedInteger(row.week_number, 7) || 1,
    stats,
  };
}

async function getGuideSalonStats(supabase: ReturnType<typeof getSupabaseAdmin>, row: SalonRow): Promise<GuideSalonStats> {
  const salonId = typeof row.id === 'string' ? row.id : null;
  if (!salonId) return { member_count: 0, sessions_completed: 0, current_week: 1 };

  const [membersResult, sessionsResult] = await Promise.all([
    supabase.from('salon_members').select('id', { count: 'exact', head: true }).eq('salon_id', salonId),
    supabase
      .from('salon_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('salon_id', salonId)
      .eq('status', 'completed'),
  ]);

  if (membersResult.error || sessionsResult.error) throw new Error('guide-salon-stats-failed');

  return {
    member_count: boundedInteger(membersResult.count, 20),
    sessions_completed: boundedInteger(sessionsResult.count, 100),
    current_week: boundedInteger(row.week_number, 7) || 1,
  };
}

function publicSpawningTree(value: unknown): PublicSpawningTreeNode | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const children = Array.isArray(row.children) ? row.children : [];
  return {
    id: publicText(row.id, 'salon', 80),
    title: publicText(row.title, 'Salon'),
    status: publicText(row.status, 'recruiting', 32),
    children: children
      .map(publicSpawningTree)
      .filter((child): child is PublicSpawningTreeNode => Boolean(child))
      .slice(0, 20),
  };
}

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  const member = auth.member as AuthenticatedMember & {
    is_guide?: boolean | null;
    guide_level?: number | null;
    salons_led?: number | null;
    members_graduated?: number | null;
    guide_earnings_total?: number | null;
  };
  if (!member.is_guide) return privateJson({ error: 'Not a guide' }, { status: 403 });

  const supabase = getSupabaseAdmin();
  const { data: salons, error: salonsError } = await supabase
    .from('salons')
    .select(GUIDE_SALON_SELECT)
    .eq('guide_member_id', auth.memberId)
    .order('created_at', { ascending: false });

  if (salonsError) return privateJson({ error: 'Failed to load guide salons' }, { status: 500 });

  const salonRows = (salons || []) as SalonRow[];
  let salonDetails;
  try {
    salonDetails = await Promise.all(salonRows.map(async (salon) => publicGuideSalon(salon, await getGuideSalonStats(supabase, salon))));
  } catch {
    return privateJson({ error: 'Failed to load guide salons' }, { status: 500 });
  }

  let publicTree = null;
  const firstSalonId = salonRows.length > 0 && typeof salonRows[0].id === 'string' ? salonRows[0].id : null;
  if (firstSalonId) {
    publicTree = publicSpawningTree(await getSpawningTree(firstSalonId));
  }

  return privateJson({
    guide_level: boundedInteger(member.guide_level, MAX_GUIDE_LEVEL),
    salons_led: boundedInteger(member.salons_led),
    members_graduated: boundedInteger(member.members_graduated),
    guide_earnings_total: boundedInteger(member.guide_earnings_total),
    salons: salonDetails,
    spawning_tree: publicTree,
  });
}
