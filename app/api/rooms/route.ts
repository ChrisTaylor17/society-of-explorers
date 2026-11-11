import { isUuid } from '@/lib/ids/uuid';
import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const ROOM_LIST_FIELDS =
  'id,community_id,created_by,room_name,daily_room_url,title,room_type,project_id,council_session_id,active_thinkers,is_live,max_participants,started_at,ended_at,created_at,scheduled_for';

type RoomCreateBody = {
  projectId?: unknown;
  memberId?: unknown;
};

type CommunityRow = {
  id: string;
};

function normalizeText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

function normalizeNullableUuid(value: unknown) {
  return typeof value === 'string' && isUuid(value) ? value : null;
}

async function safeRequestJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  const communitySlug = normalizeText(
    req.nextUrl.searchParams.get('community'),
    'society-of-explorers',
    80,
  );
  const supabase = getSupabaseAdmin();
  const { data: community, error: communityError } = await supabase
    .from('communities')
    .select('id')
    .eq('slug', communitySlug)
    .single();

  if (communityError || !community) return privateJson({ rooms: [] });

  const communityRow = community as CommunityRow;
  const { data: rooms, error: roomsError } = await supabase
    .from('video_rooms')
    .select(ROOM_LIST_FIELDS)
    .eq('community_id', communityRow.id)
    .eq('is_live', true)
    .or('room_type.is.null,room_type.neq.live_session')
    .order('started_at', { ascending: false });

  if (roomsError) return privateJson({ error: 'Failed to load rooms' }, { status: 500 });
  return privateJson({ rooms: rooms || [] });
}

export async function POST(req: NextRequest) {
  const body = await safeRequestJson(req);
  if (!isRecord(body)) return privateJson({ error: 'Invalid body' }, { status: 400 });

  const { projectId, memberId } = body as RoomCreateBody;
  const normalizedProjectId = normalizeNullableUuid(projectId);

  if (projectId !== undefined && projectId !== null && projectId !== '' && !normalizedProjectId) {
    return privateJson({ error: 'Invalid project id' }, { status: 400 });
  }

  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  if (typeof memberId === 'string' && memberId && memberId !== auth.memberId) {
    return privateJson({ error: 'Cannot create a room for another member' }, { status: 403 });
  }

  // No generic provider room or project association may be created until the
  // legacy community/project authority is reviewed. Do not treat sign-in as it.
  return privateJson({
    error: 'Legacy room creation is unavailable. Use the dedicated Live Council controls for supported sessions.',
    code: 'legacy_rooms_unavailable',
  }, { status: 409 });
}
