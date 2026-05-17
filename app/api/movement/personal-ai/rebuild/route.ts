import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { buildManifest } from '@/lib/movement/personalAI';

const THRESHOLD = 30;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function countPracticeResponses(memberId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('question_responses')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', memberId);

  if (error) throw new Error(`Practice response count failed: ${error.message}`);
  return count ?? 0;
}

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const responseCount = await countPracticeResponses(auth.memberId);
    const manifest = await buildManifest(auth.memberId);

    if (!manifest) {
      return NextResponse.json({
        ready: false,
        responseCount,
        threshold: THRESHOLD,
      });
    }

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

    if (error) throw new Error(`Personal AI profile upsert failed: ${error.message}`);

    return NextResponse.json({ ready: true, manifest });
  } catch (error) {
    console.error('[movement/personal-ai/rebuild] failed', error);
    return NextResponse.json(
      {
        error: 'Personal AI rebuild failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
