import type { NextRequest } from 'next/server';
import { getCircleDiscussion, postCircleDiscussion } from '@/lib/circles/thread-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ circleId: string }> };

export async function GET(req: NextRequest, { params }: Context) {
  return getCircleDiscussion(req, (await params).circleId);
}
export async function POST(req: NextRequest, { params }: Context) {
  return postCircleDiscussion(req, (await params).circleId);
}
