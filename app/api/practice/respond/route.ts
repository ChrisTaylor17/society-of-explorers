import type { NextRequest } from 'next/server';
import { circleWriteOrigin, readCircleReviewJson } from '@/lib/circles/moderation-server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { isUuid } from '@/lib/ids/uuid';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type PracticeRespondBody = {
  questionId?: unknown;
  responseText?: unknown;
};

const unavailable = () => privateJson({ error: 'Could not confirm the saved answer.' }, { status: 503 });

export async function POST(req: NextRequest) {
  const refused = circleWriteOrigin(req);
  if (refused) return refused;
  const parsed = await readCircleReviewJson(req, req.signal);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return privateJson({ error: 'Invalid answer' }, { status: 400 });
  }
  const input = body as PracticeRespondBody;
  const questionId = typeof input.questionId === 'string' ? input.questionId.trim() : '';
  const responseText = typeof input.responseText === 'string' ? input.responseText.trim() : '';

  if (!isUuid(questionId) || !responseText || !responseText.isWellFormed() || responseText.includes('\0')) {
    return privateJson({ error: 'Use a valid question and answer.' }, { status: 400 });
  }
  if (responseText.length > 280) {
    return privateJson({ error: 'Response must be 280 characters or less.' }, { status: 400 });
  }

  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth || !isUuid(auth.memberId)) return privateJson({ error: 'Authentication required.' }, { status: 401 });
    const expectedOwner = req.headers.get('x-soe-practice-owner');
    if (expectedOwner !== null && expectedOwner !== auth.memberId) {
      return privateJson({ error: 'The Practice account changed.' }, { status: 409 });
    }

    const { data, error } = await getSupabaseAdmin().rpc('soe_practice_response_save', {
      p_actor: auth.memberId, p_question_id: questionId, p_response_text: responseText,
    });
    if (error?.code === 'PT403') return privateJson({ error: 'Practice account unavailable.' }, { status: 401 });
    if (error?.code === 'PT404') return privateJson({ error: 'Practice question unavailable.' }, { status: 404 });
    if (error?.code === 'PT400') return privateJson({ error: 'Use a valid question and answer.' }, { status: 400 });
    const saved = data?.response;
    if (error || !isUuid(saved?.id) || saved.response_text !== responseText
      || (saved.created_at !== null && typeof saved.created_at !== 'string')
      || ![data.streak, data.longest, data.total].every(Number.isSafeInteger)) return unavailable();

    return privateJson({
      success: true, responseId: saved.id,
      response: { id: saved.id, response_text: saved.response_text, created_at: saved.created_at },
      streak: data.streak, longest: data.longest, total: data.total,
    });
  } catch {
    return unavailable();
  }
}
