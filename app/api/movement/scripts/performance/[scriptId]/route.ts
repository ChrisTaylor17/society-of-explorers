import type { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { getMovementAccess } from '@/lib/movement/access';
import { buildCreatorOpsReceipt } from '@/lib/movement/creatorOpsReceipts';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ scriptId: string }>;
};

const MOVEMENT_SCRIPT_PERFORMANCE_SELECT =
  'id, question_id, platform, hook, script, visual_treatment, cta, duration_seconds, status, performance, created_at, daily_questions(question_text, date, thinker_id)';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_METRIC_VALUE = 10_000_000;

type PerformanceBody = {
  audience?: unknown;
  channel?: unknown;
  owner?: unknown;
  experimentHypothesis?: unknown;
  resultNotes?: unknown;
  views?: unknown;
  clicks?: unknown;
  saves?: unknown;
};

type Platform = 'tiktok' | 'reels' | 'shorts';
type QueueStatus = 'draft' | 'approved' | 'published' | 'archived';

type MovementScriptRow = {
  id: string | null;
  question_id: string | null;
  platform: string | null;
  hook: string | null;
  script: string | null;
  visual_treatment: string | null;
  cta: string | null;
  duration_seconds: number | null;
  status: string | null;
  performance: unknown;
  created_at: string | null;
  daily_questions: unknown;
};

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

function cleanNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(MAX_METRIC_VALUE, Math.max(0, Math.round(value)));
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(MAX_METRIC_VALUE, Math.max(0, Math.round(parsed))) : null;
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

async function safeRequestJson(req: NextRequest): Promise<PerformanceBody | null> {
  try {
    const parsed = await req.json();
    return !parsed || typeof parsed !== 'object' || Array.isArray(parsed) ? null : (parsed as PerformanceBody);
  } catch {
    return null;
  }
}

function publicPlatform(value: unknown): Platform {
  return value === 'reels' || value === 'shorts' ? value : 'tiktok';
}

function publicStatus(value: unknown): QueueStatus {
  if (value === 'approved' || value === 'published' || value === 'archived') return value;
  return 'draft';
}

function publicDailyQuestion(value: unknown) {
  const record = Array.isArray(value) ? objectRecord(value[0]) : objectRecord(value);
  if (!Object.keys(record).length) return null;
  return {
    question_text: cleanText(record.question_text, 600),
    date: cleanText(record.date, 40),
    thinker_id: cleanText(record.thinker_id, 80),
  };
}

function publicCreatorOpsPerformance(value: unknown) {
  const performance = objectRecord(value);
  const creatorOps = objectRecord(performance.creator_ops);
  const metrics = objectRecord(creatorOps.metrics);
  return {
    audience: cleanText(creatorOps.audience, 120),
    channel: cleanText(creatorOps.channel, 80),
    owner: cleanText(creatorOps.owner, 80),
    experiment_hypothesis: cleanText(creatorOps.experiment_hypothesis, 360),
    result_notes: cleanText(creatorOps.result_notes, 800),
    metrics: {
      views: cleanNumber(metrics.views),
      clicks: cleanNumber(metrics.clicks),
      saves: cleanNumber(metrics.saves),
    },
    updated_at: cleanText(creatorOps.updated_at, 40),
  };
}

function publicMovementStudioScript(row: MovementScriptRow) {
  return {
    id: cleanText(row.id, 64) || '',
    question_id: cleanText(row.question_id, 64) || '',
    platform: publicPlatform(row.platform),
    hook: cleanText(row.hook, 280) || '',
    script: cleanText(row.script, 4000) || '',
    visual_treatment: cleanText(row.visual_treatment, 800),
    cta: cleanText(row.cta, 180),
    duration_seconds: typeof row.duration_seconds === 'number' ? Math.max(0, Math.round(row.duration_seconds)) : null,
    status: publicStatus(row.status),
    performance: {
      creator_ops: publicCreatorOpsPerformance(row.performance),
    },
    created_at: cleanText(row.created_at, 40) || '',
    daily_questions: publicDailyQuestion(row.daily_questions),
  };
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const access = await getMovementAccess(req);
    if (!access) return privateJson({ error: 'Unauthorized' }, { status: 401 });
    if (!access.canManage) return privateJson({ error: 'Oracle or founder access required' }, { status: 403 });

    const { scriptId } = await context.params;
    if (!UUID_RE.test(scriptId)) return privateJson({ error: 'Invalid scriptId' }, { status: 400 });

    const body = await safeRequestJson(req);
    if (!body) return privateJson({ error: 'Invalid body' }, { status: 400 });

    const supabaseAdmin = getSupabaseAdmin();
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('movement_scripts')
      .select('id, performance')
      .eq('id', scriptId)
      .single();

    if (existingError || !existing) {
      return privateJson({ error: 'Script not found' }, { status: 404 });
    }

    const priorPerformance = objectRecord((existing as { performance?: unknown }).performance);
    const priorCreatorOps = objectRecord(priorPerformance.creator_ops);
    const creatorOps = {
      ...priorCreatorOps,
      audience: cleanText(body.audience, 120),
      channel: cleanText(body.channel, 80),
      owner: cleanText(body.owner, 80),
      experiment_hypothesis: cleanText(body.experimentHypothesis, 360),
      result_notes: cleanText(body.resultNotes, 800),
      metrics: {
        views: cleanNumber(body.views),
        clicks: cleanNumber(body.clicks),
        saves: cleanNumber(body.saves),
      },
      updated_at: new Date().toISOString(),
    };

    const performance = {
      ...priorPerformance,
      creator_ops: creatorOps,
    };

    const { data, error } = await supabaseAdmin
      .from('movement_scripts')
      .update({ performance })
      .eq('id', scriptId)
      .select(MOVEMENT_SCRIPT_PERFORMANCE_SELECT)
      .single();

    if (error || !data) {
      return privateJson({ error: 'Script performance update failed' }, { status: 500 });
    }

    return privateJson({
      script: publicMovementStudioScript(data as MovementScriptRow),
      creatorReceipt: buildCreatorOpsReceipt({
        action: 'performance_note',
        generatedAt: new Date().toISOString(),
        recordScope: 'movement_scripts.performance.creator_ops',
        detail: 'Saved local performance notes only. No external analytics import, publish, send, schedule, or paid promotion was triggered.',
      }),
    });
  } catch {
    return privateJson({ error: 'Script performance update failed' }, { status: 500 });
  }
}
