import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { isUuid } from '@/lib/ids/uuid';
import { parseMessageDecisionReceipt, parseMessageReviewDetail, validateMessageDecisionInput } from '@/lib/circles/message-moderation';
import { messageSafetyRpc, messageSafetyUnavailable, sameMessageId } from '@/lib/circles/message-moderation-server';
import { circleWriteOrigin, readCircleReviewJson } from '@/lib/circles/moderation-server';
type Context = { params: Promise<{ circleId: string; messageId: string }> };
export async function GET(req: NextRequest, { params }: Context) {
  try {
    const { circleId, messageId } = await params;
    if (!isUuid(circleId) || !isUuid(messageId)) return privateJson({ error: 'Invalid post id.' }, { status: 400 });
    const result = await messageSafetyRpc(req, 'soe_circle_message_review_detail', { p_circle_id: circleId, p_message_id: messageId }, (value) => {
      const detail = parseMessageReviewDetail(value);
      return detail && sameMessageId(detail.circle.id, circleId) && sameMessageId(detail.message.id, messageId) ? detail : null;
    });
    return result.ok ? privateJson(result.value) : result.response;
  } catch { return messageSafetyUnavailable(); }
}
export async function POST(req: NextRequest, { params }: Context) {
  try {
    const refused = circleWriteOrigin(req);
    if (refused) return refused;
    const { circleId, messageId } = await params;
    if (!isUuid(circleId) || !isUuid(messageId)) return privateJson({ error: 'Invalid post id.' }, { status: 400 });
    const body = await readCircleReviewJson(req);
    if (!body.ok) return body.response;
    const parsed = validateMessageDecisionInput(body.value);
    if (!parsed.ok) return privateJson({ error: parsed.error }, { status: 400 });
    const input = parsed.value;
    const result = await messageSafetyRpc(req, 'soe_circle_message_review_decide', {
      p_circle_id: circleId, p_message_id: messageId, p_expected_revision: input.expectedRevision, p_content_hash: input.contentHash,
      p_request_id: input.requestId, p_action: input.action, p_reason: input.reason, p_summary: input.summary,
      p_evidence_report_id: input.evidenceReportId, p_evidence_excerpt: input.evidenceExcerpt,
    }, (value) => {
      const receipt = parseMessageDecisionReceipt(value);
      if (!receipt || !sameMessageId(receipt.requestId, input.requestId) || !sameMessageId(receipt.circleId, circleId) || !sameMessageId(receipt.messageId, messageId)
        || receipt.decision.action !== input.action || receipt.decision.reason !== input.reason || receipt.decision.summary !== input.summary
        || receipt.safety.revision < input.expectedRevision || (!receipt.replayed && receipt.safety.revision <= input.expectedRevision)) return null;
      return receipt;
    });
    return result.ok ? privateJson(result.value) : result.response;
  } catch { return messageSafetyUnavailable(); }
}
