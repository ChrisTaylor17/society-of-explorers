import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { isUuid } from '@/lib/ids/uuid';
import { parseMessageActionReceipt, parseMessageSafetyState, validateMessageActionInput } from '@/lib/circles/message-moderation';
import { messageSafetyRpc, messageSafetyUnavailable, sameMessageId } from '@/lib/circles/message-moderation-server';
import { circleWriteOrigin, readCircleReviewJson } from '@/lib/circles/moderation-server';

type Context = { params: Promise<{ circleId: string; messageId: string }> };
export async function GET(req: NextRequest, { params }: Context) {
  try {
    const { circleId, messageId } = await params;
    if (!isUuid(circleId) || !isUuid(messageId)) return privateJson({ error: 'Invalid post id.' }, { status: 400 });
    const result = await messageSafetyRpc(req, 'soe_circle_message_state', { p_circle_id: circleId, p_message_id: messageId }, (value) => {
      const state = parseMessageSafetyState(value);
      return state && sameMessageId(state.circleId, circleId) && sameMessageId(state.message.id, messageId) ? state : null;
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
