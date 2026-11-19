import type { NextRequest } from 'next/server';
import { previewCircleDiscussion } from '@/lib/circles/thread-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ circleId: string }> };

export async function POST(req: NextRequest, { params }: Context) {
  return previewCircleDiscussion(req, (await params).circleId);
}
