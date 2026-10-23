import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { createLiveSession } from '@/lib/live/scheduler';

type LiveSessionReceipt = {
  id: string | null;
  roomName: string | null;
  scheduledFor: string | null;
};

function cronAuthorized(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  return Boolean(cronSecret) && req.headers.get('authorization') === `Bearer ${cronSecret}`;
}

function textOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function liveSessionReceipt(session: unknown): LiveSessionReceipt | null {
  if (!session || typeof session !== 'object') return null;
  const row = session as Record<string, unknown>;
  return {
    id: textOrNull(row.id),
    roomName: textOrNull(row.room_name),
    scheduledFor: textOrNull(row.scheduled_for),
  };
}

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return privateJson({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const session = await createLiveSession();
    const receipt = liveSessionReceipt(session);

    if (!receipt?.id) {
      return privateJson({ created: false, session: null, error: 'Failed to create live session' }, { status: 500 });
    }

    return privateJson({ created: true, session: receipt });
  } catch {
    console.warn('[cron/create-live-session] failed');
    return privateJson({ created: false, session: null, error: 'Failed to create live session' }, { status: 500 });
  }
}
