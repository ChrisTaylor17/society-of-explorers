import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getTodayET } from '@/lib/practice/todayQuestion';
import { parsePulseQuestion } from '@/lib/feed/pulseClient';

export async function GET() {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('daily_questions')
      .select('question_text, thinker_id, date')
      .lte('date', getTodayET())
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();
    const todayQuestion = parsePulseQuestion(data);
    if (error || (data && !todayQuestion)) throw new Error('Prompt unavailable');
    return privateJson({ todayQuestion });
  } catch {
    return privateJson({ error: 'Failed to load community pulse' }, { status: 503 });
  }
}
