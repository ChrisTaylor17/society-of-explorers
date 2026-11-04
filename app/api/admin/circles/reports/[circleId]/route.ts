import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { isUuid } from '@/lib/ids/uuid';
import { parseCircleDecisionReceipt, parseCircleReviewDetail, validateCircleReviewInput } from '@/lib/circles/moderation';
import { circleReviewRpc, circleWriteOrigin, readCircleReviewJson } from '@/lib/circles/moderation-server';

type Context = { params: Promise<{ circleId: string }> };

export async function GET(req: NextRequest, { params }: Context) {
  const { circleId } = await params;
  if (!isUuid(circleId)) return privateJson({ error: 'Invalid circle id' }, { status: 400 });
  const result = await circleReviewRpc(req, 'soe_circle_review_detail', { p_circle_id: circleId }, (value) => {
    const detail = parseCircleReviewDetail(value);
    return detail?.circle.id.toLowerCase() === circleId.toLowerCase() ? detail : null;
  });
  return result.ok ? privateJson(result.value) : result.response;
}

export async function POST(req: NextRequest, { params }: Context) {
  const refused = circleWriteOrigin(req);
  if (refused) return refused;
  const { circleId } = await params;
  if (!isUuid(circleId)) return privateJson({ error: 'Invalid circle id' }, { status: 400 });
  const body = await readCircleReviewJson(req);
  if (!body.ok) return body.response;
  const parsed = validateCircleReviewInput(body.value);
  if (!parsed.ok) return privateJson({ error: parsed.error }, { status: 400 });
  const input = parsed.value;
  const result = await circleReviewRpc(req, 'soe_circle_review_decide', {
    p_circle_id: circleId, p_expected_revision: input.expectedRevision, p_request_id: input.requestId,
    p_action: input.action, p_reason: input.reason, p_summary: input.summary,
    p_evidence_report_id: input.evidenceReportId, p_evidence_excerpt: input.evidenceExcerpt,
  }, (value) => {
    const receipt = parseCircleDecisionReceipt(value);
    if (!receipt || receipt.decision.action !== input.action || receipt.decision.reason !== input.reason
      || receipt.decision.summary !== input.summary || (!receipt.replayed && receipt.revision <= input.expectedRevision)) return null;
    return receipt;
  });
  return result.ok ? privateJson(result.value) : result.response;
}
