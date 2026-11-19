import type { NextRequest } from 'next/server';
import { previewCirclePassage } from '@/lib/circles/passage-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ circleId: string }> };

export async function POST(req: NextRequest, { params }: Context) {
  return previewCirclePassage(req, (await params).circleId);
}
