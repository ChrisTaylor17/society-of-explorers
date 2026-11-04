import { NextRequest } from 'next/server';
import { isPublicExplorerId, loadPublicExplorerProfile } from '@/lib/explorer/publicProfile';
import { privateJson } from '@/lib/http/routeError';

export const dynamic = 'force-dynamic';
const unavailable = (status: number) => privateJson({ error: 'Public profile unavailable.' }, { status });

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPublicExplorerId(id)) return unavailable(404);
  try {
    const profile = await loadPublicExplorerProfile(id);
    return profile ? privateJson({ profile }) : unavailable(404);
  } catch {
    return unavailable(503);
  }
}
