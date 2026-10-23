import { NextRequest, NextResponse } from 'next/server';
import { isPublicExplorerId, loadPublicExplorerProfile } from '@/lib/explorer/publicProfile';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!isPublicExplorerId(id)) return NextResponse.json({ error: 'Invalid explorer id' }, { status: 400 });

  const profile = await loadPublicExplorerProfile(id);
  if (!profile) return NextResponse.json({ error: 'Explorer not found' }, { status: 404 });

  return NextResponse.json(profile);
}
