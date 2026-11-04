import { NextRequest } from 'next/server';
import { circleMembership } from '@/lib/circles/membership-server';

export async function GET(req: NextRequest, context: { params: Promise<{ circleId: string }> }) {
  const { circleId } = await context.params;
  return circleMembership(req, circleId);
}
