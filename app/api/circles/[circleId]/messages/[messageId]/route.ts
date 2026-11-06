import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { isUuid } from '@/lib/ids/uuid';
import { parseMessageActionReceipt, parseMessageBlockInput, parseMessageBlockReceipt, parseMessageSafetyState, validateMessageActionInput } from '@/lib/circles/message-moderation';
import { messageSafetyRpc, messageSafetyUnavailable, sameMessageId } from '@/lib/circles/message-moderation-server';
import { circleWriteOrigin, readCircleReviewJson } from '@/lib/circles/moderation-server';

type Context = { params: Promise<{ circleId: string; messageId: string }> };
export async function GET(req: NextRequest, { params }: Context) {
  try {
    const { circleId, messageId } = await params;
    if (!isUuid(circleId) || !isUuid(messageId)) return privateJson({ error: 'Invalid post id.' }, { status: 400 });
    const result = await messageSafetyRpc(req, 'soe_circle_message_state', { p_circle_id: circleId, p_message_id: messageId }, (value, memberId) => {
      const state = parseMessageSafetyState(value);
      return state && sameMessageId(state.circleId, circleId) && sameMessageId(state.message.id, messageId)
        && (!state.blockReview || sameMessageId(state.blockReview.memberId, memberId)) ? state : null;
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
    if (body.value && typeof body.value === 'object' && 'action' in body.value && body.value.action === 'block') {
      const input = parseMessageBlockInput(body.value);
      if (!input) return privateJson({ error: 'Review the current post before blocking its author.' }, { status: 400 });
      const result = await messageSafetyRpc(req, 'soe_circle_message_block', {
        p_circle_id: circleId, p_message_id: messageId, p_expected_revision: input.expectedRevision, p_content_hash: input.contentHash,
        p_expected_block_revision: input.expectedBlockRevision, p_request_id: input.requestId,
      }, value => parseMessageBlockReceipt(value, input, circleId, messageId), { expectedMemberId: input.expectedMemberId });
      return result.ok ? privateJson(result.value) : result.response;
    }
    const parsed = validateMessageActionInput(body.value);
    if (!parsed.ok) return privateJson({ error: parsed.error }, { status: 400 });
    const input = parsed.value;
    const result = await messageSafetyRpc(req, 'soe_circle_message_action', {
      p_circle_id: circleId, p_message_id: messageId, p_expected_revision: input.expectedRevision, p_content_hash: input.contentHash,
      p_request_id: input.requestId, p_action: input.action, p_reason: input.action === 'report' ? input.reason : null, p_note: input.action === 'report' ? input.note : null,
    }, (value) => {
      const receipt = parseMessageActionReceipt(value);
      if (!receipt || !sameMessageId(receipt.requestId, input.requestId) || !sameMessageId(receipt.circleId, circleId) || !sameMessageId(receipt.messageId, messageId)
        || receipt.state.revision < input.expectedRevision || (input.action === 'report' ? receipt.received !== true : receipt.withdrawn !== true)) return null;
      return receipt;
    }, { report: input.action === 'report' });
    return result.ok ? privateJson(result.value) : result.response;
  } catch { return messageSafetyUnavailable(); }
}
