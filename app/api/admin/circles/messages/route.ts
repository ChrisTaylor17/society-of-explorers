import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { parseMessageReviewQueue } from '@/lib/circles/message-moderation';
import { messageSafetyPagination, messageSafetyRpc, messageSafetyUnavailable } from '@/lib/circles/message-moderation-server';
export async function GET(req: NextRequest) {
  try {
    const page = messageSafetyPagination(req);
    if (!page.ok) return page.response;
    const result = await messageSafetyRpc(req, 'soe_circle_message_review_queue', { p_after: page.value.after, p_limit: page.value.limit }, parseMessageReviewQueue);
    return result.ok ? privateJson(result.value) : result.response;
  } catch { return messageSafetyUnavailable(); }
}
