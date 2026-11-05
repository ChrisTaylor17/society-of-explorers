import { privateJson } from '@/lib/http/routeError';
import { getOrCreateTodayQuestion } from '@/lib/practice/todayQuestion';

export async function GET() {
  const question = await getOrCreateTodayQuestion();
  if (!question) {
    return privateJson({ question: null, error: 'Practice is temporarily unavailable.' }, { status: 503 });
  }
  return privateJson({ question });
}
