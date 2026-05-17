import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMovementAccess } from '@/lib/movement/access';
import { getPersonality } from '@/lib/movement/personalities';
import type { PersonalityKind } from '@/lib/movement/personalities/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface GenerateBody {
  kind?: unknown;
  topic?: unknown;
}

function isPersonalityKind(value: unknown): value is PersonalityKind {
  return value === 'script' || value === 'lyric' || value === 'dialogue' || value === 'commentary';
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const access = await getMovementAccess(req);
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!access.canManage) return NextResponse.json({ error: 'Oracle or founder access required' }, { status: 403 });

    const { slug } = await context.params;
    const personality = getPersonality(slug);
    if (!personality) return NextResponse.json({ error: 'Personality not found' }, { status: 404 });

    const body = (await req.json().catch(() => ({}))) as GenerateBody;
    if (!isPersonalityKind(body.kind)) {
      return NextResponse.json({ error: 'kind required' }, { status: 400 });
    }
    if (!personality.supportedKinds.includes(body.kind)) {
      return NextResponse.json({ error: 'Unsupported kind for personality' }, { status: 400 });
    }
    if (typeof body.topic !== 'string' || !body.topic.trim()) {
      return NextResponse.json({ error: 'topic required' }, { status: 400 });
    }

    const topic = body.topic.trim();
    const content = await personality.generate({ kind: body.kind, topic });

    const { data, error } = await supabaseAdmin
      .from('personality_outputs')
      .insert({
        personality_slug: personality.slug,
        kind: body.kind,
        topic,
        content,
        status: 'draft',
      })
      .select('*')
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    console.error('[movement/personalities/generate] failed', err);
    return NextResponse.json({ error: 'Personality generation failed', details: String(err) }, { status: 500 });
  }
}
