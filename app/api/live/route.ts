import { NextRequest } from 'next/server';
import { getNextSessionDate, generateGoogleCalendarUrl, generateICSContent, createLiveSession } from '@/lib/live/scheduler';
import { privateJson } from '@/lib/http/routeError';
import { getMovementAccess } from '@/lib/movement/access';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const LIVE_SESSION_SELECT =
  'id,title,daily_room_url,scheduled_for,started_at,ended_at,is_live,room_type,metadata';
const LIVE_ACTIONS = new Set(['create_next', 'go_live']);

type CommunityRow = {
  id: string;
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

function liveCalendarPayload(nextDate: Date) {
  return {
    nextSessionDate: nextDate.toISOString(),
    calendarLinks: {
      google: generateGoogleCalendarUrl(nextDate),
      ics: 'data:text/calendar;charset=utf-8,' + encodeURIComponent(generateICSContent(nextDate)),
    },
  };
}

export async function GET() {
  const nextDate = getNextSessionDate();
  const supabase = getSupabaseAdmin();
  const { data: community, error: communityError } = await supabase
    .from('communities')
    .select('id')
    .eq('slug', 'society-of-explorers')
    .single();

  if (communityError || !community) {
    return privateJson({ upcoming: null, past: [], ...liveCalendarPayload(nextDate) });
  }

  const communityRow = community as CommunityRow;

  const { data: upcoming } = await supabase.from('video_rooms').select(LIVE_SESSION_SELECT)
    .eq('community_id', communityRow.id).eq('room_type', 'live_session')
    .gte('scheduled_for', new Date(Date.now() - 3600000).toISOString())
    .order('scheduled_for', { ascending: true }).limit(1).maybeSingle();

  const { data: past } = await supabase.from('video_rooms').select(LIVE_SESSION_SELECT)
    .eq('community_id', communityRow.id).eq('room_type', 'live_session').eq('is_live', false)
    .lt('scheduled_for', new Date().toISOString()).order('scheduled_for', { ascending: false }).limit(10);

  return privateJson({ upcoming, past: past || [], ...liveCalendarPayload(nextDate) });
}

export async function POST(req: NextRequest) {
  const body = await safeRequestJson(req);
  const action = isRecord(body) && typeof body.action === 'string' ? body.action : '';
  if (!LIVE_ACTIONS.has(action)) return privateJson({ error: 'Unknown action' }, { status: 400 });

  const access = await getMovementAccess(req);
  if (!access) return privateJson({ error: 'Unauthorized' }, { status: 401 });
  if (!access.canManage) return privateJson({ error: 'Oracle or founder access required' }, { status: 403 });

  if (action === 'create_next') {
    const session = await createLiveSession();
    return privateJson({ session });
  }

  if (action === 'go_live') {
    const supabase = getSupabaseAdmin();
    const { data: community, error: communityError } = await supabase
      .from('communities')
      .select('id')
      .eq('slug', 'society-of-explorers')
      .single();
    if (communityError || !community) {
      return privateJson({ error: 'Community not found' }, { status: 404 });
    }

    const communityRow = community as CommunityRow;
    const { data: session } = await supabase.from('video_rooms').select(LIVE_SESSION_SELECT)
      .eq('community_id', communityRow.id).eq('room_type', 'live_session').eq('is_live', false)
      .gte('scheduled_for', new Date(Date.now() - 3600000).toISOString())
      .order('scheduled_for', { ascending: true }).limit(1).maybeSingle();
    if (!session) return privateJson({ error: 'No upcoming session' }, { status: 404 });

    const { data: updated, error } = await supabase
      .from('video_rooms')
      .update({ is_live: true, started_at: new Date().toISOString() })
      .eq('id', session.id)
      .select(LIVE_SESSION_SELECT)
      .single();
    if (error) return privateJson({ error: 'Failed to start live session' }, { status: 500 });

    return privateJson({ session: updated || { ...session, is_live: true } });
  }
}
