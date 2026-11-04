import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { isUuid } from '@/lib/ids/uuid';
import { parseMessageAiConsent, parseMessageAiConsentInput } from '@/lib/circles/message-ai-consent';
import { messageSafetyRpc, messageSafetyUnavailable, sameMessageId } from '@/lib/circles/message-moderation-server';
import { circleWriteOrigin, readCircleReviewJson } from '@/lib/circles/moderation-server';

type Context = { params: Promise<{ circleId: string; messageId: string }> };
const invalid = () => privateJson({ error: 'Use a valid message AI permission request.' }, { status: 400 });
export async function GET(req: NextRequest, { params }: Context) {
  try {
    const { circleId, messageId } = await params;
    if (!isUuid(circleId) || !isUuid(messageId) || (req.nextUrl ?? new URL(req.url)).searchParams.size) return invalid();
    const result = await messageSafetyRpc(req, 'soe_circle_message_ai_consent_state', {
      p_circle_id: circleId.toLowerCase(), p_message_id: messageId.toLowerCase(),
    }, value => {
      const state = parseMessageAiConsent(value);
      return state && sameMessageId(state.circleId, circleId) && sameMessageId(state.messageId, messageId) ? state : null;
    });
    return result.ok ? privateJson(result.value) : result.response;
  } catch { return messageSafetyUnavailable(); }
}
export async function POST(req: NextRequest, { params }: Context) {
  try {
    const origin = circleWriteOrigin(req);
    if (origin) return origin;
    const { circleId, messageId } = await params;
    if (!isUuid(circleId) || !isUuid(messageId) || (req.nextUrl ?? new URL(req.url)).searchParams.size) return invalid();
    const body = await readCircleReviewJson(req);
    if (!body.ok) return body.response;
    const input = parseMessageAiConsentInput(body.value);
    if (!input) return invalid();
    const result = await messageSafetyRpc(req, 'soe_circle_message_ai_consent_set', {
      p_circle_id: circleId.toLowerCase(), p_message_id: messageId.toLowerCase(),
      p_expected_consent_revision: input.expectedConsentRevision, p_content_hash: input.contentHash,
      p_policy: input.policy, p_allowed: input.allowed,
    }, value => {
      const state = parseMessageAiConsent(value);
      return state && sameMessageId(state.circleId, circleId) && sameMessageId(state.messageId, messageId)
        && state.allowed === input.allowed && state.contentHash === input.contentHash
        && state.consentRevision >= input.expectedConsentRevision
        && state.consentRevision <= input.expectedConsentRevision + 1 ? state : null;
    });
    return result.ok ? privateJson(result.value) : result.response;
  } catch { return messageSafetyUnavailable(); }
}
