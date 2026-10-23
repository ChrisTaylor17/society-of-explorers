import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const GUIDE_LEADERBOARD_SELECT = 'display_name, guide_level, salons_led, members_graduated, guide_earnings_total';
const MAX_GUIDES = 50;
const MAX_DISPLAY_NAME_LENGTH = 80;
const MAX_GUIDE_LEVEL = 3;

type GuideLeaderboardRow = {
  display_name: string | null;
  guide_level: number | null;
  salons_led: number | null;
  members_graduated: number | null;
  guide_earnings_total: number | null;
};

type PublicGuideLeaderboardEntry = {
  rankKey: string;
  displayName: string;
  guideLevel: number;
  salonsLed: number;
  membersGraduated: number;
  guideExp: number;
};

function boundedInteger(value: unknown, max = Number.MAX_SAFE_INTEGER) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(0, Math.trunc(value)), max) : 0;
}

function displayName(value: unknown) {
  if (typeof value !== 'string') return 'Guide';
  return value.trim().slice(0, MAX_DISPLAY_NAME_LENGTH) || 'Guide';
}

function publicGuideLeaderboardEntry(row: GuideLeaderboardRow, index: number): PublicGuideLeaderboardEntry {
  return {
    rankKey: `guide-rank-${index + 1}`,
    displayName: displayName(row.display_name),
    guideLevel: boundedInteger(row.guide_level, MAX_GUIDE_LEVEL),
    salonsLed: boundedInteger(row.salons_led),
    membersGraduated: boundedInteger(row.members_graduated),
    guideExp: boundedInteger(row.guide_earnings_total),
  };
}

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('members')
    .select(GUIDE_LEADERBOARD_SELECT)
    .eq('is_guide', true)
    .order('members_graduated', { ascending: false })
    .order('salons_led', { ascending: false })
    .limit(MAX_GUIDES);

  if (error) return privateJson({ guides: [], error: 'Failed to load leaderboard' }, { status: 500 });

  const guides = ((data || []) as GuideLeaderboardRow[]).map(publicGuideLeaderboardEntry);
  return privateJson({ guides });
}
