import { NextRequest } from 'next/server';
import { internalRouteError, privateJson } from '@/lib/http/routeError';
import { getMovementAccess } from '@/lib/movement/access';
import { getPersonality } from '@/lib/movement/personalities';
import type { PersonalityKind } from '@/lib/movement/personalities/types';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 120;

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
    if (!access) return privateJson({ error: 'Unauthorized' }, { status: 401 });
    if (!access.canManage) return privateJson({ error: 'Oracle or founder access required' }, { status: 403 });

    const { slug } = await context.params;
    const personality = getPersonality(slug);
    if (!personality) return privateJson({ error: 'Personality not found' }, { status: 404 });

    const body = (await req.json().catch(() => ({}))) as GenerateBody;
    if (!isPersonalityKind(body.kind)) {
      return privateJson({ error: 'kind required' }, { status: 400 });
    }
    if (!personality.supportedKinds.includes(body.kind)) {
      return privateJson({ error: 'Unsupported kind for personality' }, { status: 400 });
    }
    if (typeof body.topic !== 'string' || !body.topic.trim()) {
      return privateJson({ error: 'topic required' }, { status: 400 });
    }

    const topic = body.topic.trim();
    const content = await personality.generate({ kind: body.kind, topic });
    const supabaseAdmin = getSupabaseAdmin();

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
    return privateJson(data);
  } catch {
    return internalRouteError('Personality generation failed');
  }
}
