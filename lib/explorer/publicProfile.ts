import { getSupabaseAdmin } from '@/lib/supabase/admin';

const PUBLIC_EXPLORER_MEMBER_SELECT =
  'id, display_name, created_at, current_streak, longest_streak, total_responses, exp_tokens, tier, decision_archetype';

const RESPONSE_SELECT = 'id, response_text, created_at, question_id';
const QUESTION_SELECT = 'id, question_text, thinker_id';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface PublicExplorer {
  id: string;
  display_name: string | null;
  created_at: string;
  current_streak: number | null;
  longest_streak: number | null;
  total_responses: number | null;
  exp_tokens: number | null;
  tier: string | null;
  decision_archetype: string | null;
}

export interface PublicExplorerQuestion {
  id: string;
  question_text: string | null;
  thinker_id: string | null;
}

export interface PublicExplorerResponse {
  id: string;
  response_text: string;
  created_at: string;
  question: PublicExplorerQuestion | null;
}

export interface PublicExplorerStats {
  totalExp: number;
  daysSinceJoined: number;
  responsesCount: number;
}

export interface PublicExplorerProfile {
  explorer: PublicExplorer;
  recentResponses: PublicExplorerResponse[];
  responseDates: string[];
  stats: PublicExplorerStats;
}

interface ExplorerResponseRow {
  id: string;
  response_text: string;
  created_at: string;
  question_id: string;
}

interface ExpAmountRow {
  amount: number | string | null;
}

export function isPublicExplorerId(value: string): boolean {
  return UUID_RE.test(value);
}

export async function loadPublicExplorerProfile(id: string): Promise<PublicExplorerProfile | null> {
  if (!isPublicExplorerId(id)) return null;

  const supabase = getSupabaseAdmin();
  const { data: explorer, error } = await supabase
    .from('members')
    .select(PUBLIC_EXPLORER_MEMBER_SELECT)
    .eq('id', id)
    .single<PublicExplorer>();

  if (error || !explorer) return null;

  const { data: responses } = await supabase
    .from('question_responses')
    .select(RESPONSE_SELECT)
    .eq('member_id', id)
    .order('created_at', { ascending: false })
    .limit(30)
    .returns<ExplorerResponseRow[]>();

  const responseRows = responses ?? [];
  const recentQuestionIds = responseRows.slice(0, 5).map((response) => response.question_id);
  let questionsById: Record<string, PublicExplorerQuestion> = {};

  if (recentQuestionIds.length > 0) {
    const { data: questions } = await supabase
      .from('daily_questions')
      .select(QUESTION_SELECT)
      .in('id', recentQuestionIds)
      .returns<PublicExplorerQuestion[]>();

    questionsById = Object.fromEntries((questions ?? []).map((question) => [question.id, question]));
  }

  const recentResponses = responseRows.slice(0, 5).map((response) => ({
    id: response.id,
    response_text: response.response_text,
    created_at: response.created_at,
    question: questionsById[response.question_id] ?? null,
  }));

  const { data: expRows } = await supabase
    .from('exp_events')
    .select('amount')
    .eq('member_id', id)
    .returns<ExpAmountRow[]>();

  const totalExp = (expRows ?? []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const joinedAt = new Date(explorer.created_at).getTime();
  const daysSinceJoined = Number.isFinite(joinedAt)
    ? Math.max(1, Math.floor((Date.now() - joinedAt) / 86400000))
    : 1;

  return {
    explorer,
    recentResponses,
    responseDates: responseRows.map((response) => response.created_at),
    stats: {
      totalExp,
      daysSinceJoined,
      responsesCount: responseRows.length,
    },
  };
}
