import type { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { internalRouteError, privateJson } from '@/lib/http/routeError';
import { getPodStats } from '@/lib/movement/pod';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    const stats = await getPodStats(auth.memberId);
    return privateJson({ stats });
  } catch {
    return internalRouteError('Pod stats failed');
  }
}
