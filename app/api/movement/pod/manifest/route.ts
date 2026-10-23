import type { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { internalRouteError, privateJson } from '@/lib/http/routeError';
import { buildPodExportManifest } from '@/lib/movement/podManifest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    const manifest = await buildPodExportManifest(auth.memberId);
    return privateJson({ manifest });
  } catch {
    return internalRouteError('Pod manifest failed');
  }
}
