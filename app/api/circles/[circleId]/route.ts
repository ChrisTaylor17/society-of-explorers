import { NextRequest } from 'next/server';
import { circleDetail } from '@/lib/circles/membership-server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ circleId: string }> }) {
  const { circleId } = await params;
  return circleDetail(req, circleId);
}
