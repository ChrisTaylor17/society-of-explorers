import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { isUuid } from '@/lib/ids/uuid';
import { parseCircleHostReview } from '@/lib/circles/moderation';
import { circleReviewRpc } from '@/lib/circles/moderation-server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ circleId: string }> }) {
  const { circleId } = await params;
  if (!isUuid(circleId)) return privateJson({ error: 'Invalid circle id' }, { status: 400 });
  const result = await circleReviewRpc(req, 'soe_circle_host_review', { p_circle_id: circleId }, (value) => {
    const review = parseCircleHostReview(value);
    return review?.circle.id.toLowerCase() === circleId.toLowerCase() ? review : null;
  });
  return result.ok ? privateJson(result.value) : result.response;
}
