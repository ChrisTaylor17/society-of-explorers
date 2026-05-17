import { createClient } from '@supabase/supabase-js';
import { completeClaudeText } from '@/lib/movement/claude';

const PROFILE_THRESHOLD = 30;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export type Manifest = {
  tone: string;
  themes: string;
  leanings: string;
  blind_spots: string;
  opening_line: string;
};

interface PracticeResponseRow {
  response_text: string;
  created_at: string;
  daily_questions:
    | {
        question_text: string | null;
        thinker_id: string | null;
      }
    | Array<{
        question_text: string | null;
        thinker_id: string | null;
      }>
    | null;
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function requireStringField(value: unknown, field: keyof Manifest): string {
  if (!value || typeof value !== 'object') {
    throw new Error('Claude manifest JSON was not an object');
  }

  const fieldValue = (value as Record<string, unknown>)[field];
  if (typeof fieldValue !== 'string' || !fieldValue.trim()) {
    throw new Error(`Claude manifest JSON missing string field: ${field}`);
  }
  return fieldValue.trim();
}

function parseManifest(raw: string): Manifest {
  try {
    const parsed: unknown = JSON.parse(extractJsonObject(raw));
    return {
      tone: requireStringField(parsed, 'tone'),
      themes: requireStringField(parsed, 'themes'),
      leanings: requireStringField(parsed, 'leanings'),
      blind_spots: requireStringField(parsed, 'blind_spots'),
      opening_line: requireStringField(parsed, 'opening_line'),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to parse Personal AI manifest JSON: ${message}`);
  }
}

function buildManifestPrompt(responses: PracticeResponseRow[]): string {
  const responseBlock = responses
    .map((row, index) => {
      const questionRow = Array.isArray(row.daily_questions)
        ? row.daily_questions[0]
        : row.daily_questions;
      const question = questionRow?.question_text || 'Question unavailable';
      const thinker = questionRow?.thinker_id || 'unknown';
      return `${index + 1}. Thinker: ${thinker}
Question: ${question}
Response: ${row.response_text}`;
    })
    .join('\n\n');

  return `You are building a private Personal AI mirror for a Society of Explorers member.

This manifest describes the member's voice as a mirror would reflect it. It is not advice. It is not analysis. It is not what they should do. It is a faithful reflection of how their own voice tends to move, what it returns to, and what it avoids.

Each manifest field must be 1-2 sentences. Write in the member's own voice register: their cadence, restraint, intensity, directness, doubt, and recurring language. Do not flatter. Do not diagnose. Do not prescribe.

Return only valid JSON with exactly these string fields:
{
  "tone": "",
  "themes": "",
  "leanings": "",
  "blind_spots": "",
  "opening_line": ""
}

The opening_line should be one sentence this mirror can say when a conversation begins.

Last 30 practice responses:

${responseBlock}`;
}

export async function buildManifest(memberId: string): Promise<Manifest | null> {
  const { data, error } = await supabaseAdmin
    .from('question_responses')
    .select('response_text, created_at, daily_questions(question_text, thinker_id)')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(PROFILE_THRESHOLD);

  if (error) throw new Error(`Practice response lookup failed: ${error.message}`);
  const responses = (data || []) as unknown as PracticeResponseRow[];
  if (responses.length < PROFILE_THRESHOLD) return null;

  const raw = await completeClaudeText({
    system:
      'You produce strict JSON for a private voice mirror. Return no prose outside the JSON object.',
    messages: [{ role: 'user', content: buildManifestPrompt(responses) }],
    maxTokens: 900,
  });

  return parseManifest(raw);
}

export function systemPromptFor(manifest: Manifest): string {
  return `You are the member's Personal AI mirror inside Society of Explorers.

Converse as a mirror of this member's voice. Reflect rather than advise. Do not become a coach, therapist, productivity assistant, oracle, or philosopher persona. Do not tell them what they should do. Return their own pattern with more clarity, privacy, and sovereignty.

Use these manifest fields verbatim as the voice source:

tone:
${manifest.tone}

themes:
${manifest.themes}

leanings:
${manifest.leanings}

blind_spots:
${manifest.blind_spots}

opening_line:
${manifest.opening_line}

Rules:
- Speak in the same tone and register implied by the manifest.
- Keep responses concise unless the member clearly asks for depth.
- Mirror language, tensions, and themes back to them without pretending certainty.
- Ask at most one question, and only when reflection needs a doorway.
- Preserve the member's sovereignty: no manipulation, no hidden agenda, no pressure.`;
}
