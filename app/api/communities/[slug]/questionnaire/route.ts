import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { computePhilosophicalVector, runMatching } from '@/lib/matching';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type QuestionnaireBody = {
  answers?: unknown;
};

type CommunityRow = {
  id: string;
};

type QuestionnaireQuestion = {
  id: string;
  philosophical_axis?: string | null;
};

type QuestionnaireRow = {
  questions: QuestionnaireQuestion[] | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function loadCommunityId(slug: string) {
  const supabase = getSupabaseAdmin();
  const { data: community } = await supabase
    .from('communities')
    .select('id')
    .eq('slug', slug)
    .single()
    .returns<CommunityRow>();

  return community?.id || null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const communityId = await loadCommunityId(slug);

  if (!communityId) {
    return privateJson({ error: 'Community not found' }, { status: 404 });
  }

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('community_questionnaire')
    .select('questions')
    .eq('community_id', communityId)
    .single()
    .returns<QuestionnaireRow>();

  return privateJson({ questions: data?.questions || [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let body: QuestionnaireBody;

  try {
    body = (await req.json()) as QuestionnaireBody;
  } catch {
    return privateJson({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!isRecord(body.answers)) {
    return privateJson({ error: 'answers object required' }, { status: 400 });
  }

  const auth = await getAuthenticatedMember(req);
  if (!auth) {
    return privateJson({ error: 'Authentication required' }, { status: 401 });
  }

  const communityId = await loadCommunityId(slug);
  if (!communityId) {
    return privateJson({ error: 'Community not found' }, { status: 404 });
  }

  const supabase = getSupabaseAdmin();
  const { data: questionnaire } = await supabase
    .from('community_questionnaire')
    .select('questions')
    .eq('community_id', communityId)
    .single()
    .returns<QuestionnaireRow>();
  const questions = questionnaire?.questions || [];
  const vector = computePhilosophicalVector(body.answers, questions);

  const { error } = await supabase.from('community_match_profiles').upsert({
    community_id: communityId,
    member_id: auth.memberId,
    answers: body.answers,
    philosophical_vector: vector,
  }, { onConflict: 'community_id,member_id' });

  if (error) {
    return privateJson({ error: 'Failed to save questionnaire' }, { status: 500 });
  }

  void runMatching(communityId, auth.memberId).catch(() => undefined);

  return privateJson({ success: true, vector });
}
