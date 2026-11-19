import { isUuid } from '@/lib/ids/uuid';

// Changing provider, model, input scope or terms requires a new policy and fresh
// author consent. An operator enable flag never substitutes for that consent.
export const MESSAGE_AI_POLICY = 'anthropic-message-review-v1';
export type MessageAdvice = {
  observations: { rule: 'safety' | 'harassment' | 'spam' | 'context'; excerpt: string; note: string }[];
  counterevidence: { excerpt: string; note: string }[];
  questions: string[];
};
export type MessageAdviceSnapshot = {
  circleId: string; messageId: string; content: string; revision: number;
  contentHash: string; consentRevision: number; policy: typeof MESSAGE_AI_POLICY;
};
export type MessageAdviceReceipt = Omit<MessageAdviceSnapshot, 'content'> & { advice: MessageAdvice };

export const aiRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export const aiInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
export const aiHash = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
export const aiPlain = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max
  && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
export const aiKeys = (value: Record<string, unknown>, expected: string[]): boolean => Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));

/** A model response is untrusted data. Exact source quotes are necessary, but
 * do not prove an observation is fair or correct; a human must check context. */
export function parseMessageAdvice(value: unknown, content: string): MessageAdvice | null {
  if (!aiRecord(value) || !aiKeys(value, ['observations', 'counterevidence', 'questions'])
    || !Array.isArray(value.observations) || value.observations.length > 4
    || !Array.isArray(value.counterevidence) || value.counterevidence.length > 4
    || !Array.isArray(value.questions) || value.questions.length > 4) return null;
  const observations: MessageAdvice['observations'] = [];
  const counterevidence: MessageAdvice['counterevidence'] = [];
  for (const item of value.observations) {
    if (!aiRecord(item) || !aiKeys(item, ['rule', 'excerpt', 'note']) || typeof item.rule !== 'string' || !['safety', 'harassment', 'spam', 'context'].includes(item.rule)
      || !aiPlain(item.excerpt, 500) || !content.includes(item.excerpt) || !aiPlain(item.note, 500)) return null;
    observations.push({ rule: item.rule as MessageAdvice['observations'][number]['rule'], excerpt: item.excerpt, note: item.note });
  }
  for (const item of value.counterevidence) {
    if (!aiRecord(item) || !aiKeys(item, ['excerpt', 'note']) || !aiPlain(item.excerpt, 500) || !content.includes(item.excerpt) || !aiPlain(item.note, 500)) return null;
    counterevidence.push({ excerpt: item.excerpt, note: item.note });
  }
  if (!value.questions.every(item => aiPlain(item, 300))) return null;
  return { observations, counterevidence, questions: [...value.questions] as string[] };
}

export function parseMessageAdviceSnapshot(value: unknown): MessageAdviceSnapshot | null {
  if (!aiRecord(value) || !isUuid(value.circleId) || !isUuid(value.messageId) || !aiPlain(value.content, 2000)
    || !aiInteger(value.revision) || !aiHash(value.contentHash) || !aiInteger(value.consentRevision)
    || value.consentRevision === 0 || value.policy !== MESSAGE_AI_POLICY) return null;
  return { circleId: value.circleId, messageId: value.messageId, content: value.content, revision: value.revision,
    contentHash: value.contentHash, consentRevision: value.consentRevision, policy: MESSAGE_AI_POLICY };
}

export function parseMessageAdviceReceipt(value: unknown, content: string): MessageAdviceReceipt | null {
  if (!aiRecord(value)) return null;
  const snapshot = parseMessageAdviceSnapshot({ ...value, content });
  const advice = parseMessageAdvice(value.advice, content);
  if (!snapshot || !advice) return null;
  return { circleId: snapshot.circleId, messageId: snapshot.messageId, revision: snapshot.revision,
    contentHash: snapshot.contentHash, consentRevision: snapshot.consentRevision, policy: snapshot.policy, advice };
}

export function parseMessageAdviceInput(value: unknown): { expectedRevision: number; contentHash: string } | null {
  return aiRecord(value) && aiKeys(value, ['expectedRevision', 'contentHash']) && aiInteger(value.expectedRevision) && aiHash(value.contentHash)
    ? { expectedRevision: value.expectedRevision, contentHash: value.contentHash } : null;
}
