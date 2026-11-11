import { isUuid } from '@/lib/ids/uuid';
import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const ROOM_ACTIONS = new Set(['join', 'leave', 'end', 'transcript']);
const GENERIC_ROOM_TYPES = new Set(['open', 'project', 'council', 'salon']);
const MAX_TRANSCRIPT_LENGTH = 4_000;
const MAX_SPEAKER_NAME_LENGTH = 80;

type RoomActionBody = {
  action?: unknown;
  memberId?: unknown;
  content?: unknown;
  speakerName?: unknown;
};

type RoomOwnerRow = {
  created_by: string | null;
  room_type: string | null;
};

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

function normalizeText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  if (!isUuid(roomId)) {
    return privateJson({ error: 'Invalid room' }, { status: 400 });
  }

  const body = await safeRequestJson(req);
  if (!isRecord(body)) return privateJson({ error: 'Invalid body' }, { status: 400 });

  const { action, memberId, content, speakerName } = body as RoomActionBody;
  if (typeof action !== 'string' || !ROOM_ACTIONS.has(action)) {
    return privateJson({ error: 'Unknown action' }, { status: 400 });
  }

  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  if (typeof memberId === 'string' && memberId && memberId !== auth.memberId) {
    return privateJson({ error: 'Cannot update another member room state' }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const { data: room, error: roomError } = await supabase
    .from('video_rooms')
    .select('created_by,room_type')
    .eq('id', roomId)
    .single();
  if (roomError || !room) return privateJson({ error: 'Room unavailable' }, { status: 404 });
  const roomRow = room as RoomOwnerRow;
  // Live Council has separate membership and URL checks. An unknown room kind
  // must not acquire generic mutation access merely because its ID is valid.
  if (roomRow.room_type !== null && !GENERIC_ROOM_TYPES.has(roomRow.room_type)) {
    return privateJson({ error: 'Use the dedicated controls for this room' }, { status: 409 });
  }

  if (action === 'join') {
    const { error } = await supabase
      .from('room_participants')
      .upsert(
        { room_id: roomId, member_id: auth.memberId, joined_at: new Date().toISOString() },
        { onConflict: 'room_id,member_id' },
      );

    if (error) return privateJson({ error: 'Failed to join room' }, { status: 500 });
    return privateJson({ success: true });
  }

  if (action === 'leave') {
    const { error } = await supabase
      .from('room_participants')
      .update({ left_at: new Date().toISOString() })
      .eq('room_id', roomId)
      .eq('member_id', auth.memberId);

    if (error) return privateJson({ error: 'Failed to leave room' }, { status: 500 });
    return privateJson({ success: true });
  }

  if (action === 'end') {
    if (roomRow.created_by !== auth.memberId) return privateJson({ error: 'Not your room' }, { status: 403 });

    const ending = supabase
      .from('video_rooms')
      .update({ is_live: false, ended_at: new Date().toISOString() })
      .eq('id', roomId)
      .eq('created_by', auth.memberId);
    const { data: ended, error } = await (roomRow.room_type === null
      ? ending.is('room_type', null)
      : ending.eq('room_type', roomRow.room_type))
      .select('id')
      .maybeSingle();

    if (error) return privateJson({ error: 'Failed to end room' }, { status: 500 });
    if (!ended) return privateJson({ error: 'Room changed. Check its current controls before ending it.' }, { status: 409 });
    return privateJson({ success: true });
  }

  const transcriptContent = normalizeText(content, '', MAX_TRANSCRIPT_LENGTH);
  if (!transcriptContent) return privateJson({ error: 'Transcript content required' }, { status: 400 });

  const { error } = await supabase.from('room_transcripts').insert({
    room_id: roomId,
    member_id: auth.memberId,
    speaker_name: normalizeText(speakerName, auth.member.display_name || 'Explorer', MAX_SPEAKER_NAME_LENGTH),
    content: transcriptContent,
  });

  if (error) return privateJson({ error: 'Failed to save transcript' }, { status: 500 });
  return privateJson({ success: true });
}
