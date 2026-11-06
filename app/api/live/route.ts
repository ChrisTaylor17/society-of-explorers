import { NextRequest } from 'next/server';
import { authWriteOriginAllowed } from '@/lib/auth/request';
import { privateJson } from '@/lib/http/routeError';
import {
  createLiveSession, generateGoogleCalendarUrl, generateICSContent, getNextSessionDate,
  liveCouncilCommunityId, LIVE_COUNCIL_TYPE, LIVE_SESSION_SELECT,
} from '@/lib/live/scheduler';
import { getMovementAccess } from '@/lib/movement/access';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

async function safeRequestJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export async function GET() {
  const nextDate = getNextSessionDate();
  const calendar = {
    nextSessionDate: nextDate.toISOString(),
    calendarLinks: {
      google: generateGoogleCalendarUrl(nextDate),
      ics: 'data:text/calendar;charset=utf-8,' + encodeURIComponent(generateICSContent(nextDate)),
    },
  };

  const supabase = getSupabaseAdmin();
  const communityId = await liveCouncilCommunityId(supabase);
  if (!communityId) return privateJson({ upcoming: null, past: [], ...calendar });

  const { data: upcoming } = await supabase.from('video_rooms').select(LIVE_SESSION_SELECT)
    .eq('community_id', communityId).eq('room_type', LIVE_COUNCIL_TYPE).is('ended_at', null)
    .gte('scheduled_for', new Date(Date.now() - 3600000).toISOString())
    .order('scheduled_for', { ascending: true }).limit(1).maybeSingle();

  const { data: past } = await supabase.from('video_rooms').select(LIVE_SESSION_SELECT)
    .eq('community_id', communityId).eq('room_type', LIVE_COUNCIL_TYPE).eq('is_live', false)
    .lt('scheduled_for', new Date().toISOString()).order('scheduled_for', { ascending: false }).limit(10);

  return privateJson({ upcoming: upcoming ?? null, past: past ?? [], ...calendar });
}

export async function POST(req: NextRequest) {
  if (!authWriteOriginAllowed(req)) return privateJson({ error: 'Forbidden' }, { status: 403 });
  const body = await safeRequestJson(req);
  const action = body && typeof body === 'object' && 'action' in body ? body.action : null;
  if (action !== 'create_next' && action !== 'go_live') {
    return privateJson({ error: 'Unknown action' }, { status: 400 });
  }

  const access = await getMovementAccess(req);
  if (!access) return privateJson({ error: 'Unauthorized' }, { status: 401 });
  if (!access.canManage) return privateJson({ error: 'Oracle or founder access required' }, { status: 403 });

  if (action === 'create_next') {
    const session = await createLiveSession();
    return privateJson({ session });
  }

  const supabase = getSupabaseAdmin();
  const communityId = await liveCouncilCommunityId(supabase);
  if (!communityId) return privateJson({ error: 'Community not found' }, { status: 404 });

  const { data: session } = await supabase.from('video_rooms').select('id')
    .eq('community_id', communityId).eq('room_type', LIVE_COUNCIL_TYPE).eq('is_live', false)
    .is('ended_at', null).gte('scheduled_for', new Date(Date.now() - 3600000).toISOString())
    .order('scheduled_for', { ascending: true }).limit(1).maybeSingle();
  if (!session) return privateJson({ error: 'No upcoming session' }, { status: 404 });

  const { data: updated, error } = await supabase.from('video_rooms')
    .update({ is_live: true, started_at: new Date().toISOString() })
    .eq('id', session.id).eq('community_id', communityId).eq('room_type', LIVE_COUNCIL_TYPE)
    .eq('is_live', false).is('ended_at', null).select(LIVE_SESSION_SELECT).maybeSingle();
  if (error) return privateJson({ error: 'Failed to start live session' }, { status: 500 });
  if (!updated) return privateJson({ error: 'Live session changed' }, { status: 409 });

  return privateJson({ session: updated });
}
