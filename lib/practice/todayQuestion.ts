import 'server-only';
import { createAnthropicClient, resolveClaudeModel } from '@/lib/ai/anthropic';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { pickFallbackQuestion } from '@/lib/practice/fallbackQuestions';

export interface DailyQuestion {
  id: string;
  thinker_id: string;
  question_text: string;
  question_context: string | null;
  date: string;
  created_at: string;
}
const DAILY_QUESTION_SELECT = 'id, thinker_id, question_text, question_context, date, created_at';

const THINKERS = [
  { id: 'socrates', name: 'Socrates', lens: 'You find the question behind the question.' },
  { id: 'plato', name: 'Plato', lens: 'You see systems and structures beneath the surface.' },
  { id: 'aurelius', name: 'Marcus Aurelius', lens: 'You cut through noise to what is in our control.' },
  { id: 'nietzsche', name: 'Nietzsche', lens: 'You challenge comfort zones and comfortable lies.' },
  { id: 'einstein', name: 'Einstein', lens: 'You find elegant simplifications through analogy.' },
  { id: 'jobs', name: 'Steve Jobs', lens: 'You focus on what the user should feel.' },
];

export function getTodayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function pickThinker(): typeof THINKERS[number] {
  const today = new Date();
  const dayOfYear = Math.floor(
    (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000,
  );
  return THINKERS[dayOfYear % THINKERS.length];
}

// claude-sonnet-4-20250514 was retired on June 15, 2026 and now returns 404,
// which left /practice without a question every day. Use a current model.
export const TODAY_QUESTION_MODEL_FALLBACK = 'claude-sonnet-4-6';

async function generateQuestion(
  thinker: (typeof THINKERS)[number],
): Promise<{ question: string; context: string } | null> {
  try {
    const anthropic = createAnthropicClient();
    const model = resolveClaudeModel('content', TODAY_QUESTION_MODEL_FALLBACK);
    const response = await anthropic.messages.create(
      {
        model,
        max_tokens: 200,
        system: `You are ${thinker.name}, the AI thinker from Society of Explorers. ${thinker.lens} Generate ONE philosophical question for today's daily practice. The question should be answerable in 280 characters or less, provoke genuine reflection, and reflect your unique perspective. Respond with ONLY a JSON object: {"question": "...", "context": "A 1-sentence note on why you're asking this today."}`,
        messages: [{ role: 'user', content: "Generate today's daily practice question." }],
      },
      { timeout: 15_000, maxRetries: 0 },
    );

    const text = response.content.find((b) => b.type === 'text')?.text || '';
    let parsed: { question?: unknown; context?: unknown };
    try {
      parsed = JSON.parse(text.replace(/```json\n?|```/g, '').trim());
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { question: text.slice(0, 200), context: '' };
    }
    const question = typeof parsed.question === 'string' ? parsed.question.trim() : '';
    if (!question) return null;
    return { question, context: typeof parsed.context === 'string' ? parsed.context : '' };
  } catch (err) {
    console.error('[practice/todayQuestion] generation failed, using fallback question:', err);
    return null;
  }
}

export async function getOrCreateTodayQuestion({ allowProvider = false } = {}): Promise<DailyQuestion | null> {
  const supabase = getSupabaseAdmin();
  const today = getTodayET();

  const { data: existing, error } = await supabase
    .from('daily_questions')
    .select(DAILY_QUESTION_SELECT)
    .eq('date', today)
    .maybeSingle();
  if (error) return null;
  if (existing) return existing;

  const thinker = pickThinker();
  const generated = allowProvider ? await generateQuestion(thinker) : null;
  const fallback = pickFallbackQuestion(today);
  const row = generated
    ? { thinker_id: thinker.id, question_text: generated.question, question_context: generated.context, date: today }
    : { ...fallback, date: today };

  const { data: inserted, error: insertError } = await supabase
    .from('daily_questions')
    .insert(row)
    .select(DAILY_QUESTION_SELECT)
    .single();
  if (inserted) return inserted;

  // date is UNIQUE: another request may have created today's row first.
  const { data: raced } = await supabase
    .from('daily_questions')
    .select(DAILY_QUESTION_SELECT)
    .eq('date', today)
    .maybeSingle();
  if (raced) return raced;

  console.error('[practice/todayQuestion] could not store today\'s question:', insertError?.message);
  return null;
}
