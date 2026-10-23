import type { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { getMovementAccess } from '@/lib/movement/access';
import { generateScripts, getLatestQuestionId } from '@/lib/movement/scriptgen';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MANAGER_STATUSES = ['draft', 'approved', 'published', 'archived'] as const;
const MOVEMENT_SCRIPT_QUEUE_SELECT =
  'id, question_id, platform, hook, script, visual_treatment, cta, duration_seconds, status, performance, created_at, daily_questions(question_text, date, thinker_id)';
const MAX_METRIC_VALUE = 10_000_000;

type ManagerStatus = (typeof MANAGER_STATUSES)[number];
type Platform = 'tiktok' | 'reels' | 'shorts';

type ScriptBody = {
  questionId?: unknown;
  latest?: unknown;
};

type MovementScriptRow = {
  id?: unknown;
  question_id?: unknown;
  platform?: unknown;
  hook?: unknown;
  script?: unknown;
  visual_treatment?: unknown;
  cta?: unknown;
  duration_seconds?: unknown;
  status?: unknown;
  performance?: unknown;
  created_at?: unknown;
  daily_questions?: unknown;
};

function isManagerStatus(value: string | null): value is ManagerStatus {
  return !!value && MANAGER_STATUSES.includes(value as ManagerStatus);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function safeRequestJson(req: NextRequest): Promise<ScriptBody | null> {
  try {
    const parsed = await req.json();
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

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
  return isRecord(value) ? value : {};
}

function publicPlatform(value: unknown): Platform {
  return value === 'reels' || value === 'shorts' ? value : 'tiktok';
}

function publicStatus(value: unknown): ManagerStatus {
  const status = typeof value === 'string' ? value : null;
  return isManagerStatus(status) ? status : 'draft';
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

export async function POST(req: NextRequest) {
  try {
    const access = await getMovementAccess(req);
    if (!access) return privateJson({ error: 'Unauthorized' }, { status: 401 });
    if (!access.canManage) return privateJson({ error: 'Oracle or founder access required' }, { status: 403 });

    const body = await safeRequestJson(req);
    if (!body) return privateJson({ error: 'Invalid body' }, { status: 400 });

    const questionId =
      typeof body.questionId === 'string' && body.questionId
        ? body.questionId
        : body.latest === true
          ? await getLatestQuestionId()
          : null;
    if (!questionId) return privateJson({ error: 'questionId or latest=true required' }, { status: 400 });

    const scripts = await generateScripts(questionId);
    return privateJson({ questionId, scripts: scripts.map((script) => publicMovementStudioScript(script)) });
  } catch {
    return privateJson({ error: 'Script generation failed' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const access = await getMovementAccess(req);
    if (!access) return privateJson({ error: 'Unauthorized' }, { status: 401 });
    if (!access.canManage) return privateJson({ error: 'Oracle or founder access required' }, { status: 403 });

    const statusParam = req.nextUrl.searchParams.get('status');
    const status = isManagerStatus(statusParam) ? statusParam : 'draft';
    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from('movement_scripts')
      .select(MOVEMENT_SCRIPT_QUEUE_SELECT)
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(60);

    if (error) return privateJson({ error: 'Script queue failed' }, { status: 500 });
    return privateJson({ scripts: (data || []).map((script) => publicMovementStudioScript(script)) });
  } catch {
    return privateJson({ error: 'Script queue failed' }, { status: 500 });
  }
}
