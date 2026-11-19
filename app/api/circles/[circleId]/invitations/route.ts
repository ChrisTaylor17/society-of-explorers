import { NextRequest } from 'next/server';
import { circleInvitationIssue } from '@/lib/circles/admission-server';
export async function POST(req: NextRequest, { params }: { params: Promise<{ circleId: string }> }) {
  const { circleId } = await params;
  return circleInvitationIssue(req, circleId);
}
