import { NextRequest } from 'next/server';
import { authWriteOriginAllowed } from '@/lib/auth/request';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { liveCouncilCommunityId, liveCouncilRoomUrl, LIVE_COUNCIL_TYPE } from '@/lib/live/scheduler';
import { getMovementAccess } from '@/lib/movement/access';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function safeRequestJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  if (!authWriteOriginAllowed(req)) return privateJson({ error: 'Forbidden' }, { status: 403 });
  const { sessionId } = await params;
  if (!UUID_RE.test(sessionId)) return privateJson({ error: 'Invalid session id' }, { status: 400 });

  const body = await safeRequestJson(req);
  const action = body && typeof body === 'object' && 'action' in body ? body.action : null;
  if (action !== 'join' && action !== 'end' && action !== 'summarize') {
    return privateJson({ error: 'Unknown action' }, { status: 400 });
  }

  if (action === 'join') {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const communityId = await liveCouncilCommunityId(supabase);
    if (!communityId) return privateJson({ error: 'Live session not found' }, { status: 404 });

    const { data: room, error: roomError } = await supabase.from('video_rooms')
      .select('daily_room_url,room_name')
      .eq('id', sessionId).eq('community_id', communityId).eq('room_type', LIVE_COUNCIL_TYPE)
      .eq('is_live', true).is('ended_at', null).maybeSingle();
    if (roomError) return privateJson({ error: 'Failed to check live session' }, { status: 503 });
    if (!room) return privateJson({ error: 'Live session not found' }, { status: 404 });
    const dailyUrl = liveCouncilRoomUrl(room.daily_room_url, room.room_name);
    if (!dailyUrl) return privateJson({ error: 'The meeting link is unavailable' }, { status: 409 });

    // Bind the validated URL to the row locked by the attendance write.
    const { data: joined, error } = await supabase.rpc('soe_join_live_council', {
      p_room: sessionId, p_member: auth.memberId, p_expected_url: room.daily_room_url,
    });
    if (error) return privateJson({ error: 'Failed to join live session' }, { status: 503 });
    if (joined !== true) return privateJson({ error: 'Live session changed' }, { status: 409 });
    return privateJson({ success: true, dailyUrl });
  }

  const access = await getMovementAccess(req);
  if (!access) return privateJson({ error: 'Unauthorized' }, { status: 401 });
  if (!access.canManage) return privateJson({ error: 'Oracle or founder access required' }, { status: 403 });
  if (action === 'summarize') {
    return privateJson({ error: 'Live Council transcript summaries are unavailable' }, { status: 410 });
  }

  const supabase = getSupabaseAdmin();
  const communityId = await liveCouncilCommunityId(supabase);
  if (!communityId) return privateJson({ error: 'Live session not found' }, { status: 404 });

  const { data, error } = await supabase.from('video_rooms')
    .update({ is_live: false, ended_at: new Date().toISOString() })
    .eq('id', sessionId).eq('community_id', communityId).eq('room_type', LIVE_COUNCIL_TYPE)
    .eq('is_live', true).is('ended_at', null).select('id').maybeSingle();
  if (error) return privateJson({ error: 'Failed to end live session' }, { status: 500 });
  if (!data) return privateJson({ error: 'Live session not found' }, { status: 404 });

  return privateJson({ success: true });
}
