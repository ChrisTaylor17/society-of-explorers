import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const CITY_LEAD_SELECT = 'why';
const MAX_LEAD_ROWS = 1000;
const MAX_CITY_NAME_LENGTH = 80;
const MAX_CITY_RESULTS = 50;

type SalonCityLeadRow = {
  why?: unknown;
};

type SalonCityCounts = {
  proposals: number;
  supports: number;
};

function publicCityName(value: unknown) {
  if (typeof value !== 'string') return null;
  const cleaned = value
    .replace(/[^\p{L}\p{N}\s.,'-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CITY_NAME_LENGTH);
  return cleaned || null;
}

function parseSalonCityLead(value: unknown) {
  if (typeof value !== 'string') return null;

  const proposalMatch = value.match(/\[Salon Proposal\]\s*([^:]+)/);
  if (proposalMatch) {
    const city = publicCityName(proposalMatch[1]);
    return city ? { city, kind: 'proposal' as const } : null;
  }

  const supportMatch = value.match(/\[Salon Support\]\s*(.+)/);
  if (supportMatch) {
    const city = publicCityName(supportMatch[1]);
    return city ? { city, kind: 'support' as const } : null;
  }

  return null;
}

function boundedCount(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data: rows, error } = await supabase
    .from('founding_interest')
    .select(CITY_LEAD_SELECT)
    .or('why.ilike.%Salon Proposal%,why.ilike.%Salon Support%')
    .limit(MAX_LEAD_ROWS);

  if (error) {
    return privateJson({ cities: [] });
  }

  const cityMap: Record<string, SalonCityCounts> = {};

  for (const row of (rows || []) as SalonCityLeadRow[]) {
    const parsed = parseSalonCityLead(row.why);
    if (!parsed) continue;

    cityMap[parsed.city] ||= { proposals: 0, supports: 0 };
    if (parsed.kind === 'proposal') cityMap[parsed.city].proposals++;
    if (parsed.kind === 'support') cityMap[parsed.city].supports++;
  }

  const cities = Object.entries(cityMap)
    .map(([name, counts]) => {
      const proposalCount = boundedCount(counts.proposals);
      const supportCount = boundedCount(counts.supports);
      return {
        name,
        proposalCount,
        supportCount,
        totalSupport: proposalCount + supportCount,
      };
    })
    .sort((a, b) => b.totalSupport - a.totalSupport || a.name.localeCompare(b.name))
    .slice(0, MAX_CITY_RESULTS);

  return privateJson({ cities });
}
