import type { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { getMovementAccess } from '@/lib/movement/access';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const MOVEMENT_SCRIPT_BY_QUESTION_SELECT =
  'id, question_id, platform, hook, script, visual_treatment, cta, duration_seconds, status, performance, created_at, published_at, utm_links(short_code, clicks, utm_source, utm_medium, utm_campaign, utm_content)';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_METRIC_VALUE = 10_000_000;
const MAX_UTM_LINKS = 5;

type Platform = 'tiktok' | 'reels' | 'shorts';
type ScriptStatus = 'draft' | 'approved' | 'published' | 'archived';

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
  published_at?: unknown;
  utm_links?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

function publicStatus(value: unknown): ScriptStatus {
  if (value === 'approved' || value === 'published' || value === 'archived') return value;
  return 'draft';
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

function publicUtmLink(value: unknown) {
  const record = objectRecord(value);
  return {
    short_code: cleanText(record.short_code, 32) || '',
    clicks: cleanNumber(record.clicks) ?? 0,
    utm_source: cleanText(record.utm_source, 80),
    utm_medium: cleanText(record.utm_medium, 80),
    utm_campaign: cleanText(record.utm_campaign, 120),
    utm_content: cleanText(record.utm_content, 120),
  };
}

function publicUtmLinks(value: unknown) {
  const links = Array.isArray(value) ? value : value ? [value] : [];
  return links.slice(0, MAX_UTM_LINKS).map(publicUtmLink);
}

function publicMovementQuestionScript(row: MovementScriptRow, canManage: boolean) {
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
    performance: canManage ? { creator_ops: publicCreatorOpsPerformance(row.performance) } : null,
    created_at: cleanText(row.created_at, 40) || '',
    published_at: cleanText(row.published_at, 40),
    utm_links: publicUtmLinks(row.utm_links),
  };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ questionId: string }> },
) {
  try {
    const { questionId } = await context.params;
    if (!UUID_RE.test(questionId)) return privateJson({ error: 'Invalid questionId' }, { status: 400 });

    const access = await getMovementAccess(req);
    const canManage = Boolean(access?.canManage);
    const supabaseAdmin = getSupabaseAdmin();

    let query = supabaseAdmin
      .from('movement_scripts')
      .select(MOVEMENT_SCRIPT_BY_QUESTION_SELECT)
      .eq('question_id', questionId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (!canManage) query = query.in('status', ['approved', 'published']);

    const { data, error } = await query;
    if (error) return privateJson({ error: 'Script lookup failed' }, { status: 500 });

    return privateJson({ scripts: (data || []).map((script) => publicMovementQuestionScript(script, canManage)) });
  } catch {
    return privateJson({ error: 'Script lookup failed' }, { status: 500 });
  }
}
