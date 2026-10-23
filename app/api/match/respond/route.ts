import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const MATCH_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_FEEDBACK_LENGTH = 1000;

type MatchAction = 'accept' | 'decline' | 'complete';

type MatchConversationRow = {
  id: string;
  member_a: string;
  member_b: string;
  status: string | null;
  rating_a: number | null;
  rating_b: number | null;
};

type MatchUpdate = {
  status?: string;
  rating_a?: number | null;
  rating_b?: number | null;
  feedback_a?: string | null;
  feedback_b?: string | null;
  completed_at?: string;
};

type MemberExpRow = {
  exp_tokens: number | null;
};

type CompletedMatchRow = {
  id: string;
};

function isMatchAction(action: unknown): action is MatchAction {
  return action === 'accept' || action === 'decline' || action === 'complete';
}

async function safeRequestJson(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeMatchId(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return MATCH_ID_PATTERN.test(trimmed) ? trimmed : null;
}

function normalizeRating(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;

  const rating = Math.trunc(value);
  if (rating < 1 || rating > 5) return null;

  return rating;
}

function normalizeFeedback(value: unknown) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  return trimmed.slice(0, MAX_FEEDBACK_LENGTH);
}

function hasRating(value: number | null | undefined) {
  return value !== null && value !== undefined;
}

function matchResponseFailure() {
  return privateJson({ error: 'Failed to update match response' }, { status: 500 });
}

async function awardMatchCompletionExp(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  memberIds: string[],
) {
  for (const memberId of memberIds) {
    const { error: expEventError } = await supabase
      .from('exp_events')
      .insert({ member_id: memberId, amount: 10, reason: 'Completed matched conversation' });

    if (expEventError) return expEventError;

    const { data: member, error: memberLookupError } = await supabase
      .from('members')
      .select('exp_tokens')
      .eq('id', memberId)
      .single();

    if (memberLookupError) return memberLookupError;

    const memberRow = member as MemberExpRow | null;
    if (memberRow) {
      const { error: updateError } = await supabase
        .from('members')
        .update({ exp_tokens: (memberRow.exp_tokens || 0) + 10 })
        .eq('id', memberId);

      if (updateError) return updateError;
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await safeRequestJson(req);
    const matchId = normalizeMatchId(body?.matchId);
    const action = body?.action;
    if (!matchId || !isMatchAction(action)) {
      return privateJson({ error: 'matchId and valid action required' }, { status: 400 });
    }

    const rating = normalizeRating(body?.rating);
    if (action === 'complete' && rating === null) {
      return privateJson({ error: 'rating required' }, { status: 400 });
    }

    const feedback = normalizeFeedback(body?.feedback);

    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data: match, error: matchError } = await supabase
      .from('matched_conversations')
      .select('id, member_a, member_b, status, rating_a, rating_b')
      .eq('id', matchId)
      .single();

    if (matchError || !match) return privateJson({ error: 'Match not found' }, { status: 404 });

    const matchRow = match as MatchConversationRow;
    const isA = matchRow.member_a === auth.memberId;
    const isB = matchRow.member_b === auth.memberId;
    if (!isA && !isB) return privateJson({ error: 'Not your match' }, { status: 403 });

    if (action === 'accept') {
      const { error } = await supabase
        .from('matched_conversations')
        .update({ status: 'accepted' })
        .eq('id', matchId);

      if (error) return matchResponseFailure();
      return privateJson({ success: true });
    }

    if (action === 'decline') {
      const { error } = await supabase
        .from('matched_conversations')
        .update({ status: 'declined' })
        .eq('id', matchId);

      if (error) return matchResponseFailure();
      return privateJson({ success: true });
    }

    const updates: MatchUpdate = {};
    if (isA) {
      updates.rating_a = rating;
      updates.feedback_a = feedback;
    }
    if (isB) {
      updates.rating_b = rating;
      updates.feedback_b = feedback;
    }

    const { error: updateError } = await supabase
      .from('matched_conversations')
      .update(updates)
      .eq('id', matchId);

    if (updateError) return matchResponseFailure();

    // Check if both rated. Only transition once to avoid duplicate EXP awards.
    const { data: updated, error: updatedError } = await supabase
      .from('matched_conversations')
      .select('status, rating_a, rating_b')
      .eq('id', matchId)
      .single();

    if (updatedError) return matchResponseFailure();

    const updatedRow = updated as Pick<MatchConversationRow, 'status' | 'rating_a' | 'rating_b'> | null;
    if (updatedRow && hasRating(updatedRow.rating_a) && hasRating(updatedRow.rating_b)) {
      const { data: completedRows, error: completeError } = await supabase
        .from('matched_conversations')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', matchId)
        .neq('status', 'completed')
        .select('id');

      if (completeError) return matchResponseFailure();

      const completedMatchRows = (completedRows || []) as CompletedMatchRow[];
      if (completedMatchRows.length > 0) {
        const expError = await awardMatchCompletionExp(supabase, [matchRow.member_a, matchRow.member_b]);
        if (expError) {
          return matchResponseFailure();
        }
      }
    }

    return privateJson({ success: true });
  } catch {
    return matchResponseFailure();
  }
}
