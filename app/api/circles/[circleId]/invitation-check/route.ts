import { NextRequest } from 'next/server';
import { circleInvitationCheck } from '@/lib/circles/admission-server';
export async function POST(req: NextRequest, { params }: { params: Promise<{ circleId: string }> }) {
  const { circleId } = await params;
  return circleInvitationCheck(req, circleId);
}
