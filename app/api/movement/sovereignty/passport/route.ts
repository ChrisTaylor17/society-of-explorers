import type { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { internalRouteError, privateJson } from '@/lib/http/routeError';
import { buildSovereigntyPassport } from '@/lib/movement/sovereigntyPassport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    const passport = await buildSovereigntyPassport({
      memberId: auth.memberId,
      member: auth.member,
    });

    return privateJson({ passport });
  } catch {
    return internalRouteError('Sovereignty passport failed');
  }
}
