import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const MAX_HISTORY_ROWS = 20;
const MAX_PROMPTS = 5;
const MATCH_HISTORY_SELECT =
  'id, member_a, member_b, thinker_id, match_reason, prompts, scheduled_for, status, created_at, completed_at';

type MatchHistoryRow = {
  id: string;
  member_a: string;
  member_b: string;
  thinker_id: string | null;
  match_reason: string | null;
  prompts: unknown;
  scheduled_for: string | null;
  status: string | null;
  created_at: string | null;
  completed_at: string | null;
};

type PartnerRow = {
  id: string;
  display_name: string | null;
};

type PublicPrompt = {
  prompt: string;
};

function boundedText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  return trimmed.slice(0, maxLength);
}

function publicPromptList(value: unknown): PublicPrompt[] {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, MAX_PROMPTS)
    .map((prompt) => {
      if (!prompt || typeof prompt !== 'object' || Array.isArray(prompt)) return null;
      const promptText = boundedText((prompt as { prompt?: unknown }).prompt, 500);
      return promptText ? { prompt: promptText } : null;
    })
    .filter((prompt): prompt is PublicPrompt => Boolean(prompt));
}

function publicMatchHistoryRow(match: MatchHistoryRow, partnerName: string | null) {
  return {
    id: match.id,
    partner_name: boundedText(partnerName, 120) || 'Explorer',
    thinker_id: boundedText(match.thinker_id, 80),
    match_reason: boundedText(match.match_reason, 1000),
    prompts: publicPromptList(match.prompts),
    scheduled_for: match.scheduled_for,
    status: boundedText(match.status, 40) || 'pending',
    created_at: match.created_at,
    completed_at: match.completed_at,
  };
}

function matchHistoryFailure() {
  return privateJson({ error: 'Failed to load match history' }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('matched_conversations')
    .select(MATCH_HISTORY_SELECT)
    .or(`member_a.eq.${auth.memberId},member_b.eq.${auth.memberId}`)
    .order('created_at', { ascending: false })
    .limit(MAX_HISTORY_ROWS);

  if (error) return matchHistoryFailure();

  const matches = (data || []) as MatchHistoryRow[];
  const partnerIds = Array.from(
    new Set(matches.map((match) => (match.member_a === auth.memberId ? match.member_b : match.member_a))),
  );

  const partners = new Map<string, PartnerRow>();
  if (partnerIds.length > 0) {
    const { data: partnerRows, error: partnerError } = await supabase
      .from('members')
      .select('id, display_name')
      .in('id', partnerIds);

    if (partnerError) return matchHistoryFailure();

    for (const partner of (partnerRows || []) as PartnerRow[]) {
      partners.set(partner.id, partner);
    }
  }

  const enriched = matches.map((match) => {
    const partnerId = match.member_a === auth.memberId ? match.member_b : match.member_a;
    return publicMatchHistoryRow(match, partners.get(partnerId)?.display_name || null);
  });

  return privateJson({ matches: enriched });
}
