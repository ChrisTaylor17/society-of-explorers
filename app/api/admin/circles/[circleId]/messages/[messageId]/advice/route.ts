import type { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { privateJson } from '@/lib/http/routeError';
import { isUuid } from '@/lib/ids/uuid';
import { rateLimit } from '@/lib/rateLimit';
import { circleWriteOrigin, readCircleReviewJson } from '@/lib/circles/moderation-server';
import { parseMessageAdvice, parseMessageAdviceInput, parseMessageAdviceSnapshot, type MessageAdviceSnapshot } from '@/lib/circles/message-ai';
import { providerAvailable, requestMessageAdvice } from '@/lib/circles/message-ai-provider';

type Context = { params: Promise<{ circleId: string; messageId: string }> };
const unavailable = () => privateJson({ error: 'AI advice is unavailable. Human review remains available.' }, { status: 503 });
const changed = () => privateJson({ error: 'The review or consent changed. Load a fresh case.' }, { status: 409 });
const denied = () => privateJson({ error: 'AI advice is not available for this review.' }, { status: 403 });

/** No advice is stored or applied. The DB checks current author consent and
 * reviewer eligibility twice; the original server actor cannot be swapped. */
export async function POST(req: NextRequest, { params }: Context) {
  const controller = new AbortController();
  const deadlineAt = Date.now() + 12_000;
  const abort = () => controller.abort();
  req.signal?.addEventListener('abort', abort, { once: true });
  if (req.signal?.aborted) controller.abort();
  let rejectRetired: () => void = () => {};
  const retired = new Promise<Response>(resolve => { rejectRetired = () => resolve(unavailable()); });
  controller.signal.addEventListener('abort', rejectRetired, { once: true });
  const deadline = setTimeout(abort, 12_000);
  const current = () => !controller.signal.aborted && Date.now() < deadlineAt;
  async function work(): Promise<Response> {
    const origin = circleWriteOrigin(req);
    if (origin) return origin;
    if (!current() || !providerAvailable()) return unavailable();
    const { circleId, messageId } = await params;
    if (!current()) return unavailable();
    if (!isUuid(circleId) || !isUuid(messageId)) return privateJson({ error: 'Invalid post id.' }, { status: 400 });
    const body = await readCircleReviewJson(req, controller.signal);
    if (!current()) return unavailable();
    if (!body.ok) return body.response;
    const input = parseMessageAdviceInput(body.value);
    if (!input) return privateJson({ error: 'Use a current review snapshot.' }, { status: 400 });
    const actor = await getAuthenticatedMember(req);
    if (!current()) return unavailable();
    if (!actor || !isUuid(actor.memberId)) return privateJson({ error: 'Sign in to review this message.' }, { status: 401 });
    const actorId = actor.memberId;
    const admin = getSupabaseAdmin();
    async function snapshot(): Promise<MessageAdviceSnapshot | Response> {
      if (!current()) return unavailable();
      const { data, error } = await admin.rpc('soe_circle_message_ai_snapshot', { p_actor: actorId, p_circle_id: circleId, p_message_id: messageId });
      if (!current()) return unavailable();
      if (error) return error.code === 'PT403' ? denied() : error.code === 'PT409' || error.code === 'PT404' ? changed() : unavailable();
      const value = parseMessageAdviceSnapshot(data);
      return value && value.circleId.toLowerCase() === circleId.toLowerCase() && value.messageId.toLowerCase() === messageId.toLowerCase() ? value : unavailable();
    }
    const before = await snapshot();
    if (before instanceof Response) return before;
    if (!current()) return unavailable();
    if (before.revision !== input.expectedRevision || before.contentHash !== input.contentHash) return changed();
    // Per-instance throttle only. An approved production budget still needs a
    // shared limit; a cold start or another instance resets these counters.
    for (const [key, maximum] of [[`message-ai:${actorId}`, 5], ['message-ai:instance', 50]] as const) {
      const limit = rateLimit(key, maximum, 60 * 60 * 1000);
      if (!limit.ok) return privateJson({ error: 'AI advice is temporarily limited. Continue human review.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterS) } });
    }
    if (!current()) return unavailable();
    const output = await requestMessageAdvice(before.content, controller.signal);
    if (!current()) return unavailable();
    const advice = parseMessageAdvice(output, before.content);
    if (!advice) return unavailable();
    const freshActor = await getAuthenticatedMember(req);
    if (!current()) return unavailable();
    if (!freshActor || freshActor.memberId !== actorId) return denied();
    const after = await snapshot();
    if (after instanceof Response) return after;
    if (!current()) return unavailable();
    if (after.content !== before.content || after.contentHash !== before.contentHash || after.revision !== before.revision
      || after.consentRevision !== before.consentRevision || after.policy !== before.policy) return changed();
    return privateJson({ circleId: after.circleId, messageId: after.messageId, revision: after.revision,
      contentHash: after.contentHash, consentRevision: after.consentRevision, policy: after.policy, advice });
  }
  try {
    if (!current()) return unavailable();
    return await Promise.race([work(), retired]);
  } catch { return unavailable(); }
  finally {
    // Mark the attempt retired even if a dependency ignores cancellation. Later
    // continuations cannot make another provider call or return private advice.
    clearTimeout(deadline);
    controller.abort();
    controller.signal.removeEventListener('abort', rejectRetired);
    req.signal?.removeEventListener('abort', abort);
  }
}
