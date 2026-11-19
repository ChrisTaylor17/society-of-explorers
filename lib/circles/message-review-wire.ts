import { isUuid } from '../ids/uuid';
import { validateMessageDecisionInput, type MessageDecisionInput } from './message-moderation';
import { parseMessageAdviceInput } from './message-ai';

export const MESSAGE_REVIEW_BODY_MAX_BYTES = 12000;
const uuid = (value: unknown): value is string => isUuid(value) && value === value.toLowerCase();
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const revision = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const scalarText = (value: string) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
const utf8Bytes = (value: string) => {
  let bytes = 0;
  for (const character of value) { const code = character.codePointAt(0)!; bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4; }
  return bytes;
};

/** One canonical wire order shared by controllers and the native JS boundary. */
export function messageReviewDecisionBody(input: MessageDecisionInput, sessionId?: string): string | null {
  const parsed = validateMessageDecisionInput(input);
  if (!parsed.ok || !uuid(parsed.value.requestId) || parsed.value.evidenceReportId !== null && !uuid(parsed.value.evidenceReportId)
    || sessionId !== undefined && !uuid(sessionId) || !scalarText(parsed.value.summary)
    || parsed.value.evidenceExcerpt !== null && !scalarText(parsed.value.evidenceExcerpt)) return null;
  return JSON.stringify({ ...parsed.value, ...(sessionId === undefined ? {} : { sessionId }) });
}
export function messageReviewCoverageStartBody(expectedRevision: number, contentHash: string): string | null {
  return revision(expectedRevision) && hash(contentHash) ? JSON.stringify({ action: 'start', expectedRevision, contentHash }) : null;
}
export function messageReviewCoverageAckBody(sessionId: string, pageToken: string): string | null {
  return uuid(sessionId) && uuid(pageToken) ? JSON.stringify({ action: 'ack', sessionId, pageToken }) : null;
}
export function messageReviewAdviceBody(expectedRevision: number, contentHash: string): string | null {
  return revision(expectedRevision) && hash(contentHash) ? JSON.stringify({ expectedRevision, contentHash }) : null;
}

/** A dedicated reviewer lane. Human decisions carry bounded explanation/evidence;
 * the advice operation accepts only a revision and hash, never private text. */
export function validateMessageReviewRequest(path: string, input: { method: string; body?: string }): boolean {
  if (typeof path !== 'string' || !input || !['GET', 'POST'].includes(input.method)) return false;
  if (input.method === 'GET' && input.body !== undefined) return false;
  const queue = /^\/api\/admin\/circles\/messages(?:\?after=([a-f0-9-]{36}))?$/.exec(path);
  if (queue) return input.method === 'GET' && (!queue[1] || uuid(queue[1]));
  const route = /^\/api\/admin\/circles\/([a-f0-9-]{36})\/messages\/([a-f0-9-]{36})(\/coverage\/decision|\/coverage|\/advice)?(?:\?sessionId=([a-f0-9-]{36})(?:&page=([1-9][0-9]*))?)?$/.exec(path);
  if (!route || !uuid(route[1]) || !uuid(route[2])) return false;
  const [, , , suffix = '', sessionId, page] = route;
  if (input.method === 'GET') return suffix === '' ? sessionId === undefined
    : suffix === '/coverage' && uuid(sessionId) && (page === undefined || Number.isSafeInteger(Number(page)) && Number(page) <= 42949673);
  if (sessionId !== undefined || typeof input.body !== 'string' || utf8Bytes(input.body) > MESSAGE_REVIEW_BODY_MAX_BYTES) return false;
  try {
    const value: unknown = JSON.parse(input.body);
    if (!record(value)) return false;
    let canonical: string | null = null;
    if (suffix === '' || suffix === '/coverage/decision') {
      const { sessionId: coverageId, ...decision } = value;
      if (suffix === '' && coverageId !== undefined || suffix !== '' && !uuid(coverageId)) return false;
      canonical = messageReviewDecisionBody(decision as MessageDecisionInput, suffix ? coverageId as string : undefined);
    } else if (suffix === '/coverage') {
      if (value.action === 'start' && exact(value, ['action', 'expectedRevision', 'contentHash'])) canonical = messageReviewCoverageStartBody(value.expectedRevision as number, value.contentHash as string);
      if (value.action === 'ack' && exact(value, ['action', 'sessionId', 'pageToken'])) canonical = messageReviewCoverageAckBody(value.sessionId as string, value.pageToken as string);
    } else if (suffix === '/advice') {
      const parsed = parseMessageAdviceInput(value);
      if (parsed) canonical = messageReviewAdviceBody(parsed.expectedRevision, parsed.contentHash);
    }
    return canonical !== null && canonical === input.body;
  } catch { return false; }
}
