import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { isUuid } from '@/lib/ids/uuid';
import { boundedText, isRecord } from '@/lib/circles/http';
import { REPORT_REASONS } from '@/lib/circles/report';
import { circleReportRpc, circleWriteOrigin, readCircleReviewJson } from '@/lib/circles/moderation-server';


// Reporting stays available signed in or out. The service-only RPC atomically
// deduplicates each operation and applies the published report threshold policy.
export async function POST(req: NextRequest) {
  const refused = circleWriteOrigin(req, true);
  if (refused) return refused;
  const parsed = await readCircleReviewJson(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  if (!isRecord(body)) return privateJson({ error: 'Invalid body' }, { status: 400 });
  const circleId = body.circleId;
  if (!isUuid(circleId)) return privateJson({ error: 'Invalid circle id' }, { status: 400 });
  if (!isUuid(body.requestId)) return privateJson({ error: 'Use a valid report request id.' }, { status: 400 });
  const reason = REPORT_REASONS.find((value) => value === body.reason);
  if (!reason) return privateJson({ error: 'Choose a reason' }, { status: 400 });
  return circleReportRpc(req, { circleId, requestId: body.requestId, reason, note: boundedText(body.note, 1000) });
}
