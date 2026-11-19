import { isUuid } from '@/lib/ids/uuid';
import type { MessageAdviceSnapshot } from './message-ai';

/** A fresh, one-use database debit. This is a request allowance, not a bill. */
export function messageAiSendDeadline(value: unknown, snapshot: MessageAdviceSnapshot,
  attemptId: string, requestedAt: number, now: number): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const keys = ['attemptId', 'circleId', 'messageId', 'revision', 'contentHash', 'consentRevision', 'policy', 'validForMs'];
  if (Object.keys(v).length !== keys.length || !keys.every(key => Object.hasOwn(v, key))
    || !isUuid(v.attemptId) || v.attemptId !== attemptId || !isUuid(v.circleId) || !isUuid(v.messageId)
    || v.circleId.toLowerCase() !== snapshot.circleId.toLowerCase() || v.messageId.toLowerCase() !== snapshot.messageId.toLowerCase()
    || v.revision !== snapshot.revision || v.contentHash !== snapshot.contentHash
    || v.consentRevision !== snapshot.consentRevision || v.policy !== snapshot.policy
    || !Number.isSafeInteger(v.validForMs) || (v.validForMs as number) < 1 || (v.validForMs as number) > 8000
    || !Number.isSafeInteger(requestedAt) || !Number.isSafeInteger(now) || now < requestedAt) return null;
  // Anchor before the RPC so transport/queue time consumes the allowance's
  // remaining window, rather than extending it when the reply reaches us.
  const deadline = requestedAt + (v.validForMs as number);
  return Number.isSafeInteger(deadline) && now < deadline ? deadline : null;
}
