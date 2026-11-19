import { NextRequest } from 'next/server';
import { circleDetail, circleListing } from '@/lib/circles/membership-server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ circleId: string }> }) {
  const { circleId } = await params;
  if (req.nextUrl.searchParams.get('view') === 'listing') return circleListing(circleId);
  return circleDetail(req, circleId);
}
