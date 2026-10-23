import type { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { buildCreatorOpsReadiness } from '@/lib/movement/creatorOpsReceipts';
import { getMovementAccess } from '@/lib/movement/access';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ScriptStatus = 'draft' | 'approved' | 'published' | 'archived';
type Platform = 'tiktok' | 'reels' | 'shorts';

type ScriptOpsRow = {
  id: string;
  question_id: string | null;
  platform: Platform | null;
  status: ScriptStatus | null;
  performance: Record<string, unknown> | null;
  created_at: string | null;
  published_at: string | null;
};

type LatestQuestionRow = {
  id: string;
  question_text: string | null;
  date: string | null;
  thinker_id: string | null;
};

function countBy<T extends string>(values: T[]): Record<T, number> {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {} as Record<T, number>);
}

function hasPerformanceNotes(row: ScriptOpsRow): boolean {
  const performance = row.performance || {};
  return Object.keys(performance).some((key) => {
    const value = performance[key];
    return value !== null && value !== undefined && String(value).trim() !== '';
  });
}

export async function GET(req: NextRequest) {
  try {
    const access = await getMovementAccess(req);
    if (!access) return privateJson({ error: 'Unauthorized' }, { status: 401 });
    if (!access.canManage) return privateJson({ error: 'Oracle or founder access required' }, { status: 403 });

    const today = new Date().toISOString().slice(0, 10);
    const supabaseAdmin = getSupabaseAdmin();
    const [latestQuestionRes, scriptsRes] = await Promise.all([
      supabaseAdmin
        .from('daily_questions')
        .select('id, question_text, date, thinker_id')
        .lte('date', today)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('movement_scripts')
        .select('id, question_id, platform, status, performance, created_at, published_at')
        .order('created_at', { ascending: false })
        .limit(240),
    ]);

    if (latestQuestionRes.error || scriptsRes.error) {
      return privateJson({ error: 'Script operations check failed' }, { status: 500 });
    }

    const latestQuestion = latestQuestionRes.data as LatestQuestionRow | null;
    const scripts = (scriptsRes.data || []) as ScriptOpsRow[];
    const statusCounts = countBy(scripts.map((script) => script.status || 'draft'));
    const platformCounts = countBy(scripts.map((script) => script.platform || 'shorts'));
    const latestScripts = latestQuestion
      ? scripts.filter((script) => script.question_id === latestQuestion.id)
      : [];
    const latestPlatforms = new Set(latestScripts.map((script) => script.platform).filter(Boolean));
    const approvedLatest = latestScripts.filter((script) => script.status === 'approved');
    const publishedWithoutNotes = scripts.filter((script) => script.status === 'published' && !hasPerformanceNotes(script));

    const checklist = [
      {
        id: 'latest-question',
        label: 'Latest question selected',
        status: latestQuestion ? 'ready' : 'blocked',
        detail: latestQuestion?.question_text || 'No daily question was found for today or earlier.',
      },
      {
        id: 'latest-scripts',
        label: 'Three platform drafts generated',
        status: latestPlatforms.size >= 3 ? 'ready' : latestScripts.length > 0 ? 'partial' : 'todo',
        detail: latestQuestion
          ? `${latestPlatforms.size}/3 platforms have scripts for the latest question.`
          : 'Generate after a latest question exists.',
      },
      {
        id: 'approval-review',
        label: 'Approved scripts ready',
        status: approvedLatest.length > 0 ? 'ready' : latestScripts.length > 0 ? 'todo' : 'blocked',
        detail: `${approvedLatest.length} approved script${approvedLatest.length === 1 ? '' : 's'} for the latest question.`,
      },
      {
        id: 'performance-notes',
        label: 'Performance notes captured',
        status: publishedWithoutNotes.length === 0 ? 'ready' : 'todo',
        detail:
          publishedWithoutNotes.length === 0
            ? 'No published scripts are missing local performance notes.'
            : `${publishedWithoutNotes.length} published script${publishedWithoutNotes.length === 1 ? '' : 's'} need performance notes.`,
      },
      {
        id: 'external-boundary',
        label: 'Publishing boundary',
        status: 'blocked',
        detail: 'This screen can prepare drafts only. Publishing, sending, or paid promotion still requires explicit approval.',
      },
    ];

    return privateJson(
      {
        ops: {
          generatedAt: new Date().toISOString(),
          latestQuestion,
          counts: {
            total: scripts.length,
            byStatus: statusCounts,
            byPlatform: platformCounts,
            latestQuestionScripts: latestScripts.length,
            latestQuestionPlatforms: latestPlatforms.size,
            approvedLatest: approvedLatest.length,
            publishedWithoutNotes: publishedWithoutNotes.length,
          },
          checklist,
          nextActions: [
            latestPlatforms.size >= 3 ? 'Review hooks and approve the strongest platform script.' : 'Generate drafts for the latest question.',
            'Keep UTM links draft-only until the publish channel and exact caption are approved.',
            'After any approved publish, add local performance notes before the next weekly review.',
          ],
          readiness: buildCreatorOpsReadiness(),
          externalActionBoundary:
            'No posting, sending, paid boosting, or third-party publishing from Movement Studio without explicit approval.',
        },
      },
    );
  } catch {
    return privateJson({ error: 'Script operations check failed' }, { status: 500 });
  }
}
