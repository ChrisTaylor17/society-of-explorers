import type { NextRequest } from 'next/server';
import { generateSocialDraft } from '@/lib/feed/activityFeed';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { limitModelCall } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return privateJson({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const eventId = typeof body === 'object' && body && 'eventId' in body && typeof body.eventId === 'string' ? body.eventId.trim() : '';
    const platform = typeof body === 'object' && body && 'platform' in body ? body.platform : null;

    if (!eventId || eventId.length > 100 || (platform !== 'twitter' && platform !== 'linkedin')) {
      return privateJson({ error: 'eventId and a valid platform are required' }, { status: 400 });
    }

    const limited = limitModelCall(req, auth.memberId, 'social-draft');
    if (limited) return privateJson({ error: 'Too many requests, please slow down' }, {
      status: 429, headers: { 'Retry-After': limited.headers.get('Retry-After') || '1' },
    });
    const result = await generateSocialDraft(eventId, auth.memberId, platform);
    if (!result) return privateJson({ error: 'Event unavailable' }, { status: 404 });
    return privateJson(result);
  } catch {
    return privateJson({ error: 'Draft unavailable' }, { status: 503 });
  }
}
