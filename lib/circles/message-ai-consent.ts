import { isUuid } from '@/lib/ids/uuid';
import { MESSAGE_AI_POLICY } from './message-ai';

export { MESSAGE_AI_POLICY };
export const MESSAGE_AI_POLICY_HREF = '/circles/message-ai-policy';
export type MessageAiConsent = {
  circleId: string; messageId: string; allowed: boolean; consentRevision: number;
  policy: typeof MESSAGE_AI_POLICY; contentHash: string; messageRevision: number; canEnable: boolean;
};
export type MessageAiConsentInput = {
  expectedConsentRevision: number; contentHash: string; policy: typeof MESSAGE_AI_POLICY; allowed: boolean;
};
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const revision = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);

/** Author-only settings, never message content or a profile projection. */
export function parseMessageAiConsent(value: unknown): MessageAiConsent | null {
  if (!record(value) || !isUuid(value.circleId) || !isUuid(value.messageId)
    || typeof value.allowed !== 'boolean' || !revision(value.consentRevision)
    || value.policy !== MESSAGE_AI_POLICY || !hash(value.contentHash)
    || !revision(value.messageRevision) || typeof value.canEnable !== 'boolean') return null;
  return { circleId: value.circleId.toLowerCase(), messageId: value.messageId.toLowerCase(),
    allowed: value.allowed, consentRevision: value.consentRevision, policy: MESSAGE_AI_POLICY,
    contentHash: value.contentHash, messageRevision: value.messageRevision, canEnable: value.canEnable };
}
export function parseMessageAiConsentInput(value: unknown): MessageAiConsentInput | null {
  if (!record(value) || Object.keys(value).length !== 4
    || !['expectedConsentRevision', 'contentHash', 'policy', 'allowed'].every(key => Object.hasOwn(value, key))
    || !revision(value.expectedConsentRevision) || !hash(value.contentHash)
    || value.policy !== MESSAGE_AI_POLICY || typeof value.allowed !== 'boolean') return null;
  return { expectedConsentRevision: value.expectedConsentRevision, contentHash: value.contentHash,
    policy: MESSAGE_AI_POLICY, allowed: value.allowed };
}
export function sameMessageAiConsent(a: MessageAiConsent, b: MessageAiConsent): boolean {
  return a.circleId === b.circleId && a.messageId === b.messageId && a.allowed === b.allowed
    && a.consentRevision === b.consentRevision && a.policy === b.policy && a.contentHash === b.contentHash
    && a.messageRevision === b.messageRevision && a.canEnable === b.canEnable;
}
