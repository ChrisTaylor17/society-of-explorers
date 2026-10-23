import { NextRequest } from 'next/server';
import { createAnthropicClient, resolveClaudeModel } from '@/lib/ai/anthropic';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { limitModelCall } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_SESSION_ID_LENGTH = 120;
const MAX_QUESTION_LENGTH = 1_000;
const MAX_RESPONSES = 8;
const MAX_THINKER_LENGTH = 80;
const MAX_RESPONSE_LENGTH = 4_000;

type CouncilResponse = {
  thinker: string;
  response: string;
};

type CouncilVote = {
  thinker: string;
  position?: string;
  one_liner?: string;
};

type CouncilAnalysis = {
  votes?: CouncilVote[];
  best_quote?: string;
  best_quote_thinker?: string;
  session_theme?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textField(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

async function safeRequestJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function normalizeResponses(value: unknown): CouncilResponse[] {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, MAX_RESPONSES)
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const thinker = textField(entry.thinker, MAX_THINKER_LENGTH);
      const response = textField(entry.response, MAX_RESPONSE_LENGTH);
      return thinker && response ? { thinker, response } : null;
    })
    .filter((entry): entry is CouncilResponse => Boolean(entry));
}

function parseCouncilAnalysis(analysisText: string): CouncilAnalysis {
  const normalized = analysisText.replace(/```json\n?|```/g, '').trim();
  const candidates = [normalized, normalized.match(/\{[\s\S]*\}/)?.[0]].filter(
    (candidate): candidate is string => Boolean(candidate),
  );

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as CouncilAnalysis;
      return {
        votes: Array.isArray(parsed.votes) ? parsed.votes : [],
        best_quote: textField(parsed.best_quote, 240) || '',
        best_quote_thinker: textField(parsed.best_quote_thinker, MAX_THINKER_LENGTH) || '',
        session_theme: textField(parsed.session_theme, 80) || '',
      };
    } catch {}
  }

  return { votes: [], best_quote: '', best_quote_thinker: '', session_theme: '' };
}

function buildVerdictSlug(question: string) {
  const slugBase = question.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).slice(0, 5).join('-') || 'council';
  return `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;
}

function buildPublicVerdictUrl(req: NextRequest, slug: string) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || req.nextUrl.origin;
  return `${baseUrl.replace(/\/$/, '')}/council/verdict/${slug}`;
}

export async function POST(req: NextRequest) {
  const parsed = await safeRequestJson(req);
  if (!isRecord(parsed)) return privateJson({ error: 'Invalid body' }, { status: 400 });

  const sessionId = textField(parsed.sessionId, MAX_SESSION_ID_LENGTH);
  const question = textField(parsed.question, MAX_QUESTION_LENGTH);
  const responses = normalizeResponses(parsed.responses);

  if (!sessionId || !question || !responses?.length) {
    return privateJson({ error: 'Missing fields' }, { status: 400 });
  }

  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  // Security fix S6c: a verdict is private unless the member explicitly asks to share it.
  const makePublic = parsed.makePublic === true;

  // Security fix S6d: a sessionId already owned by another member can't be overwritten.
  const supabase = getSupabaseAdmin();
  const { data: existingSessions, error: existingError } = await supabase
    .from('council_sessions')
    .select('member_id')
    .eq('session_id', sessionId)
    .limit(1);
  if (existingError) return privateJson({ error: 'Failed to save verdict' }, { status: 500 });
  const existingOwner = (existingSessions || [])[0]?.member_id ?? null;
  if (existingSessions && existingSessions.length > 0 && existingOwner !== auth.memberId) {
    return privateJson({ error: 'Forbidden' }, { status: 403 });
  }

  const limited = limitModelCall(req, auth.memberId, 'council-verdict');
  if (limited) return limited;

  const anthropic = createAnthropicClient();
  const model = resolveClaudeModel('content', 'claude-sonnet-4-20250514');
  let analysisText = '';

  try {
    const analysisResponse = await anthropic.messages.create({
      model,
      max_tokens: 400,
      system: 'Analyze these council responses and return ONLY valid JSON.',
      messages: [{
        role: 'user',
        content: `Question: "${question}"\n\nResponses:\n${responses.map((r) => `${r.thinker}: ${r.response}`).join('\n\n')}\n\nReturn JSON:\n{"votes":[{"thinker":"name","position":"AGREE|CHALLENGE|REFRAME|AMPLIFY","one_liner":"core point in under 10 words"}],"best_quote":"single most powerful sentence under 30 words","best_quote_thinker":"who said it","session_theme":"2-3 word theme"}`,
      }],
    });

    analysisText = analysisResponse.content.find(b => b.type === 'text')?.text || '';
  } catch {
    return privateJson({ error: 'Failed to analyze verdict' }, { status: 500 });
  }

  const analysis = parseCouncilAnalysis(analysisText);
  const slug = buildVerdictSlug(question);

  const thinkerResponses = responses.map((r) => {
    const vote = analysis.votes?.find((v) => v.thinker === r.thinker);
    return { ...r, vote_position: vote?.position || 'REFRAME', one_liner: vote?.one_liner || '' };
  });

  const { data: session, error } = await supabase.from('council_sessions').upsert({
    session_id: sessionId,
    member_id: auth.memberId,
    question,
    thinker_responses: thinkerResponses,
    public_url_slug: slug,
    is_public: makePublic,
  }, { onConflict: 'session_id' }).select().single();

  if (error) return privateJson({ error: 'Failed to save verdict' }, { status: 500 });

  return privateJson({
    session,
    analysis,
    publicUrl: makePublic ? buildPublicVerdictUrl(req, slug) : null,
    slug: makePublic ? slug : null,
  });
}
