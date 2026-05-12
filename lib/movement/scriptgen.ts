import { createClient } from '@supabase/supabase-js';
import { completeClaudeText } from '@/lib/movement/claude';

export type MovementPlatform = 'tiktok' | 'reels' | 'shorts';
export type MovementScriptStatus = 'draft' | 'approved' | 'published' | 'archived';

export interface MovementScript {
  id: string;
  question_id: string;
  platform: MovementPlatform;
  hook: string;
  script: string;
  visual_treatment: string | null;
  cta: string | null;
  duration_seconds: number | null;
  status: MovementScriptStatus;
  performance: Record<string, unknown>;
  created_at: string;
  published_at: string | null;
}

interface DailyQuestionRow {
  id: string;
  question_text: string;
  question_context: string | null;
  thinker_id: string;
  date: string;
}

interface ClaudeScriptVariant {
  platform: MovementPlatform;
  hook: string;
  script: string;
  visualTreatment: string;
  durationSeconds: number;
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PLATFORMS: MovementPlatform[] = ['tiktok', 'reels', 'shorts'];

function isPlatform(value: unknown): value is MovementPlatform {
  return typeof value === 'string' && PLATFORMS.includes(value as MovementPlatform);
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function trimWords(text: string, limit: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length <= limit ? text.trim() : words.slice(0, limit).join(' ');
}

function shortCode(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `mv${Date.now().toString(36)}${random}`.slice(0, 18);
}

function extractJsonArray(text: string): unknown {
  const cleaned = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Claude response did not include a JSON array');
    return JSON.parse(match[0]);
  }
}

function normalizeVariants(value: unknown): ClaudeScriptVariant[] {
  if (!Array.isArray(value)) throw new Error('Claude script response was not an array');

  const variants = value.map((item): ClaudeScriptVariant => {
    const row = item as Record<string, unknown>;
    if (!isPlatform(row.platform)) throw new Error('Claude returned an invalid platform');
    if (typeof row.hook !== 'string') throw new Error('Claude returned a script without hook');
    if (typeof row.script !== 'string') throw new Error('Claude returned a script without body');

    const visualTreatment =
      typeof row.visualTreatment === 'string'
        ? row.visualTreatment
        : typeof row.visual_treatment === 'string'
          ? row.visual_treatment
          : '';

    const durationSeconds =
      typeof row.durationSeconds === 'number'
        ? row.durationSeconds
        : typeof row.duration_seconds === 'number'
          ? row.duration_seconds
          : 60;

    return {
      platform: row.platform,
      hook: trimWords(row.hook, 8),
      script: trimWords(row.script, 140),
      visualTreatment: visualTreatment.trim(),
      durationSeconds: Math.max(15, Math.min(90, Math.round(durationSeconds))),
    };
  });

  const byPlatform = new Map<MovementPlatform, ClaudeScriptVariant>();
  for (const platform of PLATFORMS) {
    const variant = variants.find((candidate) => candidate.platform === platform);
    if (variant) byPlatform.set(platform, variant);
  }

  if (byPlatform.size !== PLATFORMS.length) {
    throw new Error('Claude did not return all three platform variants');
  }

  return PLATFORMS.map((platform) => byPlatform.get(platform)!);
}

function practiceCta(platform: MovementPlatform, code: string): string {
  const params = new URLSearchParams({
    utm_source: platform,
    utm_medium: 'short_video',
    utm_campaign: 'movement_daily',
    utm_content: code,
  });
  return `/practice?${params.toString()}`;
}

export async function generateScripts(questionId: string): Promise<MovementScript[]> {
  const { data: question, error: questionError } = await supabaseAdmin
    .from('daily_questions')
    .select('id, question_text, question_context, thinker_id, date')
    .eq('id', questionId)
    .single();

  if (questionError || !question) {
    throw new Error(`Question lookup failed: ${questionError?.message || 'not found'}`);
  }

  const q = question as DailyQuestionRow;
  const raw = await completeClaudeText({
    maxTokens: 1800,
    system:
      'You are the Society of Explorers short-form content engine. You turn one daily philosophical question into concrete, ready-to-shoot video scripts that invite people into a sovereign daily practice. Write plain modern English. No hype, no guru voice, no surveillance-platform framing.',
    messages: [
      {
        role: 'user',
        content: `Daily question:
"${q.question_text}"

Context:
${q.question_context || 'No extra context.'}

Thinker:
${q.thinker_id}

Return ONLY valid JSON. Return an array with exactly three objects, one each for platform "tiktok", "reels", and "shorts".
Each object must use this shape:
{
  "platform": "tiktok",
  "hook": "8 words maximum",
  "script": "60-second spoken script, 140 words maximum",
  "visualTreatment": "specific shot plan and editing style",
  "durationSeconds": 60
}

Every script must end by inviting the viewer to answer today's question at Society of Explorers.`,
      },
    ],
  });

  const variants = normalizeVariants(extractJsonArray(raw));
  for (const variant of variants) {
    if (countWords(variant.hook) > 8 || countWords(variant.script) > 140) {
      throw new Error(`Generated ${variant.platform} variant exceeded word limits`);
    }
  }

  const created: MovementScript[] = [];
  for (const variant of variants) {
    const code = shortCode();
    const cta = practiceCta(variant.platform, code);
    const { data: script, error: scriptError } = await supabaseAdmin
      .from('movement_scripts')
      .insert({
        question_id: q.id,
        platform: variant.platform,
        hook: variant.hook,
        script: variant.script,
        visual_treatment: variant.visualTreatment,
        cta,
        duration_seconds: variant.durationSeconds,
      })
      .select('*')
      .single();

    if (scriptError || !script) {
      throw new Error(`Script insert failed: ${scriptError?.message || 'no row returned'}`);
    }

    const inserted = script as MovementScript;
    const { error: utmError } = await supabaseAdmin.from('utm_links').insert({
      script_id: inserted.id,
      utm_source: variant.platform,
      utm_medium: 'short_video',
      utm_campaign: 'movement_daily',
      utm_content: code,
      short_code: code,
    });

    if (utmError) {
      throw new Error(`UTM insert failed for ${inserted.id}: ${utmError.message}`);
    }

    created.push(inserted);
  }

  return created;
}
