import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { parseCircleHostReviews } from '@/lib/circles/moderation';
import { circleReviewPagination, circleReviewRpc } from '@/lib/circles/moderation-server';

export async function GET(req: NextRequest) {
  const page = circleReviewPagination(req);
  if (!page.ok) return page.response;
  const result = await circleReviewRpc(req, 'soe_circle_host_reviews', { p_after: page.value.after, p_limit: page.value.limit }, (value) => {
    const reviews = parseCircleHostReviews(value);
    return reviews && reviews.items.length <= page.value.limit ? reviews : null;
  });
  return result.ok ? privateJson(result.value) : result.response;
}
