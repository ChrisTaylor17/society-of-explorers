import { NextRequest } from 'next/server';
import { circleMutation } from '@/lib/circles/membership-server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ circleId: string }> }) {
  const { circleId } = await params;
  return circleMutation(req, circleId, 'join');
}
