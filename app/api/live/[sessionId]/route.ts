import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { generateSessionSummary } from '@/lib/live/scheduler';
import { privateJson } from '@/lib/http/routeError';
import { getMovementAccess } from '@/lib/movement/access';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LIVE_SESSION_ACTIONS = new Set(['join', 'end', 'summarize']);

type DailyRoomRow = {
  daily_room_url: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function safeRequestJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

async function requireLiveManager(req: NextRequest) {
  const access = await getMovementAccess(req);
  if (!access) return { error: privateJson({ error: 'Unauthorized' }, { status: 401 }) };
  if (!access.canManage) {
    return { error: privateJson({ error: 'Oracle or founder access required' }, { status: 403 }) };
  }
  return { access };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!UUID_RE.test(sessionId)) return privateJson({ error: 'Invalid session id' }, { status: 400 });

  const body = await safeRequestJson(req);
  const action = isRecord(body) && typeof body.action === 'string' ? body.action : '';
  if (!LIVE_SESSION_ACTIONS.has(action)) return privateJson({ error: 'Unknown action' }, { status: 400 });

  if (action === 'join') {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { error: participantError } = await supabase.from('room_participants').upsert(
      { room_id: sessionId, member_id: auth.memberId, joined_at: new Date().toISOString() },
      { onConflict: 'room_id,member_id' },
    );
    if (participantError) return privateJson({ error: 'Failed to join live session' }, { status: 500 });

    const { data: room, error: roomError } = await supabase
      .from('video_rooms')
      .select('daily_room_url')
      .eq('id', sessionId)
      .single();
    if (roomError || !room) return privateJson({ error: 'Live session not found' }, { status: 404 });

    return privateJson({ success: true, dailyUrl: (room as DailyRoomRow).daily_room_url });
  }

  if (action === 'end') {
    const manager = await requireLiveManager(req);
    if (manager.error) return manager.error;

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('video_rooms')
      .update({ is_live: false, ended_at: new Date().toISOString() })
      .eq('id', sessionId);
    if (error) return privateJson({ error: 'Failed to end live session' }, { status: 500 });

    generateSessionSummary(sessionId).catch(() => {});
    return privateJson({ success: true });
  }

  if (action === 'summarize') {
    const manager = await requireLiveManager(req);
    if (manager.error) return manager.error;

    const summary = await generateSessionSummary(sessionId);
    return privateJson({ summary });
  }
}
