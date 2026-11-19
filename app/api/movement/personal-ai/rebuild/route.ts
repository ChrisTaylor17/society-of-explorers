import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { internalRouteError, privateJson } from '@/lib/http/routeError';
import { buildManifest } from '@/lib/movement/personalAI';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const THRESHOLD = 30;

async function countPracticeResponses(memberId: string): Promise<number> {
  const supabaseAdmin = getSupabaseAdmin();
  const { count, error } = await supabaseAdmin
    .from('question_responses')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', memberId);

  if (error) throw new Error('practice-response-count-failed');
  return count ?? 0;
}

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    const responseCount = await countPracticeResponses(auth.memberId);
    const manifest = await buildManifest(auth.memberId);

    if (!manifest) {
      return privateJson({
        ready: false,
        responseCount,
        threshold: THRESHOLD,
      });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin.from('personal_ai_profiles').upsert(
      {
        member_id: auth.memberId,
        manifest,
        response_count_at_build: responseCount,
        last_built_at: new Date().toISOString(),
        version: 1,
      },
      { onConflict: 'member_id' },
    );

    if (error) throw new Error('personal-ai-profile-upsert-failed');

    return privateJson({ ready: true, manifest });
  } catch {
    return internalRouteError('Personal AI rebuild failed');
  }
}
