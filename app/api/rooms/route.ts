import { NextRequest } from 'next/server';
import { emitActivity } from '@/lib/feed/activityFeed';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const THINKER_IDS = new Set(['socrates', 'plato', 'aurelius', 'nietzsche', 'einstein', 'jobs']);
const ROOM_TYPES = new Set(['open', 'project', 'council', 'salon']);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RoomCreateBody = {
  title?: unknown;
  roomType?: unknown;
  projectId?: unknown;
  communitySlug?: unknown;
  memberId?: unknown;
  thinkers?: unknown;
};

type CommunityRow = {
  id: string;
};

type RoomRow = {
  id: string;
};

function normalizeText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

function normalizeNullableUuid(value: unknown) {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null;
}

function normalizeThinkers(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((thinker): thinker is string => typeof thinker === 'string' && THINKER_IDS.has(thinker))
    .slice(0, 6);
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

async function createDailyRoomUrl(roomName: string): Promise<string | null> {
  const apiKey = process.env.DAILY_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        name: roomName,
        properties: {
          max_participants: 8,
          enable_chat: true,
          exp: Math.floor(Date.now() / 1000) + 7200,
        },
      }),
    });
    if (!res.ok) return null;

    const body: unknown = await res.json();
    return isRecord(body) && typeof body.url === 'string' ? body.url : null;
  } catch {
    return null;
  }
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
    .select('*')
    .eq('community_id', communityRow.id)
    .eq('is_live', true)
    .order('started_at', { ascending: false });

  if (roomsError) return privateJson({ error: 'Failed to load rooms' }, { status: 500 });
  return privateJson({ rooms: rooms || [] });
}

export async function POST(req: NextRequest) {
  const body = await safeRequestJson(req);
  if (!isRecord(body)) return privateJson({ error: 'Invalid body' }, { status: 400 });

  const { title, roomType, projectId, communitySlug, memberId, thinkers } = body as RoomCreateBody;
  const normalizedTitle = normalizeText(title, 'Council Room', 120);
  const normalizedRoomType =
    typeof roomType === 'string' && ROOM_TYPES.has(roomType) ? roomType : 'open';
  const normalizedCommunitySlug = normalizeText(communitySlug, 'society-of-explorers', 80);
  const normalizedProjectId = normalizeNullableUuid(projectId);
  const normalizedThinkers = normalizeThinkers(thinkers);

  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  if (typeof memberId === 'string' && memberId && memberId !== auth.memberId) {
    return privateJson({ error: 'Cannot create a room for another member' }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const { data: community, error: communityError } = await supabase
    .from('communities')
    .select('id')
    .eq('slug', normalizedCommunitySlug)
    .single();

  if (communityError || !community) {
    return privateJson({ error: 'Community not found' }, { status: 404 });
  }

  const communityRow = community as CommunityRow;
  const roomName = `soe-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const dailyRoomUrl = await createDailyRoomUrl(roomName);

  const { data: room, error } = await supabase
    .from('video_rooms')
    .insert({
      community_id: communityRow.id,
      created_by: auth.memberId,
      room_name: roomName,
      daily_room_url: dailyRoomUrl,
      title: normalizedTitle,
      room_type: normalizedRoomType,
      project_id: normalizedProjectId,
      active_thinkers: normalizedThinkers,
      is_live: true,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !room) return privateJson({ error: 'Failed to create room' }, { status: 500 });

  const roomRow = room as RoomRow;
  await supabase.from('room_participants').insert({ room_id: roomRow.id, member_id: auth.memberId });
  emitActivity({
    communityId: communityRow.id,
    memberId: auth.memberId,
    eventType: 'room_started',
    title: `${normalizedTitle} is live`,
    metadata: { roomId: roomRow.id },
  }).catch(() => {});

  return privateJson({ room });
}
