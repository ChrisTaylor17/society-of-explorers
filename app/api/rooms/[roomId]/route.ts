import { isUuid } from '@/lib/ids/uuid';
import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';

const ROOM_ACTIONS = new Set(['join', 'leave', 'end', 'transcript']);

type RoomActionBody = {
  action?: unknown;
  memberId?: unknown;
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  if (!isUuid(roomId)) {
    return privateJson({ error: 'Invalid room' }, { status: 400 });
  }

  const body = await safeRequestJson(req);
  if (!isRecord(body)) return privateJson({ error: 'Invalid body' }, { status: 400 });

  const { action, memberId } = body as RoomActionBody;
  if (typeof action !== 'string' || !ROOM_ACTIONS.has(action)) {
    return privateJson({ error: 'Unknown action' }, { status: 400 });
  }

  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  if (typeof memberId === 'string' && memberId && memberId !== auth.memberId) {
    return privateJson({ error: 'Cannot update another member room state' }, { status: 403 });
  }

  // A valid ID and verified identity do not establish authority over a room.
  // Keep every legacy write closed until room/community/project membership and
  // room-kind changes can be checked atomically. Live Council has its own route.
  return privateJson({
    error: 'Legacy room controls are unavailable. Use the dedicated Live Council controls for supported sessions.',
    code: 'legacy_rooms_unavailable',
  }, { status: 409 });
}
