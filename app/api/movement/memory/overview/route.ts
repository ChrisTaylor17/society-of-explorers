import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { buildMemoryConsentReadiness } from '@/lib/memory/consentActions';
import { getPodStats } from '@/lib/movement/pod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type QueryResult<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;
type CountResult = PromiseLike<{ count: number | null; error: { message: string } | null }>;

function truncate(value: unknown, max = 360): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  if (!cleaned) return null;
  return cleaned.length > max ? `${cleaned.slice(0, max - 3)}...` : cleaned;
}

function reportMemoryOverviewFailure(label: string) {
  console.warn(`[movement/memory] ${label} failed`);
}

async function safeData<T>(label: string, query: QueryResult<T>, fallback: T): Promise<T> {
  try {
    const { data, error } = await query;
    if (error) {
      reportMemoryOverviewFailure(label);
      return fallback;
    }
    return data ?? fallback;
  } catch {
    reportMemoryOverviewFailure(label);
    return fallback;
  }
}

async function safeCount(label: string, query: CountResult): Promise<number> {
  try {
    const { count, error } = await query;
    if (error) {
      reportMemoryOverviewFailure(label);
      return 0;
    }
    return count ?? 0;
  } catch {
    reportMemoryOverviewFailure(label);
    return 0;
  }
}

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  const memberId = auth.memberId;
  const consentReadiness = buildMemoryConsentReadiness();
  const supabaseAdmin = getSupabaseAdmin();
  const [
    facts,
    episodeCount,
    recentEpisodes,
    profile,
    triggers,
    personalAi,
    pod,
  ] = await Promise.all([
    safeData(
      'semantic memory',
      supabaseAdmin
        .from('user_semantic_memory')
        .select('id, category, key, value, confidence, valid_from, updated_at')
        .eq('member_id', memberId)
        .is('valid_until', null)
        .order('updated_at', { ascending: false })
        .limit(80),
      [],
    ),
    safeCount(
      'episode count',
      supabaseAdmin
        .from('user_episodes')
        .select('id', { count: 'exact', head: true })
        .eq('member_id', memberId),
    ),
    safeData(
      'recent episodes',
      supabaseAdmin
        .from('user_episodes')
        .select('id, thinker_id, role, summary, emotional_tone, significance_score, created_at')
        .eq('member_id', memberId)
        .order('created_at', { ascending: false })
        .limit(10),
      [],
    ),
    safeData(
      'profile summary',
      supabaseAdmin
        .from('user_profile_summary')
        .select('summary_text, active_goals, pending_commitments, current_emotional_state, last_session_at, updated_at')
        .eq('member_id', memberId)
        .maybeSingle(),
      null,
    ),
    safeData(
      'proactive triggers',
      supabaseAdmin
        .from('proactive_triggers')
        .select('id, trigger_type, suggested_thinker, context_summary, scheduled_for, status, delivered_at')
        .eq('member_id', memberId)
        .order('scheduled_for', { ascending: false })
        .limit(10),
      [],
    ),
    safeData(
      'personal ai profile',
      supabaseAdmin
        .from('personal_ai_profiles')
        .select('response_count_at_build, last_built_at, version')
        .eq('member_id', memberId)
        .maybeSingle(),
      null,
    ),
    getPodStats(memberId).catch(() => {
      reportMemoryOverviewFailure('pod stats');
      return null;
    }),
  ]);

  const categoryCounts = (facts as Array<{ category?: string }>).reduce<Record<string, number>>(
    (counts, fact) => {
      const category = fact.category || 'uncategorized';
      counts[category] = (counts[category] || 0) + 1;
      return counts;
    },
    {},
  );

  return privateJson({
    member: {
      id: memberId,
      displayName: auth.member.display_name || null,
    },
    summary: {
      activeFactCount: (facts as unknown[]).length,
      episodeCount,
      categoryCounts,
      profileUpdatedAt: (profile as { updated_at?: string } | null)?.updated_at || null,
      personalAiBuiltAt: (personalAi as { last_built_at?: string } | null)?.last_built_at || null,
      podUpdatedAt: pod?.updated_at || null,
    },
    consentReadiness,
    facts: (facts as Array<Record<string, unknown>>).map((fact) => ({
      id: fact.id,
      category: truncate(fact.category, 60) || 'uncategorized',
      key: truncate(fact.key, 140) || 'Untitled memory',
      value: truncate(fact.value, 700) || '',
      confidence: typeof fact.confidence === 'number' ? fact.confidence : null,
      validFrom: fact.valid_from || null,
      updatedAt: fact.updated_at || null,
    })),
    profile: profile
      ? {
          summary: truncate((profile as Record<string, unknown>).summary_text, 700),
          activeGoals: Array.isArray((profile as Record<string, unknown>).active_goals)
            ? (profile as Record<string, unknown>).active_goals
            : [],
          pendingCommitments: Array.isArray((profile as Record<string, unknown>).pending_commitments)
            ? (profile as Record<string, unknown>).pending_commitments
            : [],
          currentEmotionalState: truncate((profile as Record<string, unknown>).current_emotional_state, 80),
          lastSessionAt: (profile as Record<string, unknown>).last_session_at || null,
          updatedAt: (profile as Record<string, unknown>).updated_at || null,
        }
      : null,
    recentEpisodes: (recentEpisodes as Array<Record<string, unknown>>).map((episode) => ({
      id: episode.id,
      thinkerId: episode.thinker_id,
      role: episode.role,
      summary: truncate(episode.summary, 260),
      emotionalTone: truncate(episode.emotional_tone, 80),
      significanceScore: typeof episode.significance_score === 'number' ? episode.significance_score : null,
      createdAt: episode.created_at || null,
    })),
    triggers: (triggers as Array<Record<string, unknown>>).map((trigger) => ({
      id: trigger.id,
      type: trigger.trigger_type,
      suggestedThinker: trigger.suggested_thinker,
      contextSummary: truncate(trigger.context_summary, 240),
      scheduledFor: trigger.scheduled_for || null,
      status: trigger.status || null,
      deliveredAt: trigger.delivered_at || null,
    })),
    personalAi,
    pod,
  });
}
