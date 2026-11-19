import type { NextRequest } from 'next/server';
import { getCirclePassage, postCirclePassage } from '@/lib/circles/passage-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ circleId: string }> };

export async function GET(req: NextRequest, { params }: Context) {
  return getCirclePassage(req, (await params).circleId);
}
export async function POST(req: NextRequest, { params }: Context) {
  return postCirclePassage(req, (await params).circleId);
}
