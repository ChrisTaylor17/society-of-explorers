import type { NextRequest } from 'next/server';
import { generateSocialDraft } from '@/lib/feed/activityFeed';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return privateJson({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const eventId = typeof body === 'object' && body && 'eventId' in body ? String(body.eventId || '').trim() : '';
  const platform = typeof body === 'object' && body && 'platform' in body ? body.platform : null;

  if (!eventId || (platform !== 'twitter' && platform !== 'linkedin')) {
    return privateJson({ error: 'eventId and a valid platform are required' }, { status: 400 });
  }

  const result = await generateSocialDraft(eventId, auth.memberId, platform);
  if (!result) return privateJson({ error: 'Failed' }, { status: 500 });
  return privateJson(result);
}
