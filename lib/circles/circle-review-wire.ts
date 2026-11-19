import { isUuid } from '../ids/uuid';
import { validateCircleReviewInput, type CircleReviewInput } from './moderation';

export const CIRCLE_REVIEW_BODY_MAX_BYTES = 12000;
const uuid = (value: unknown): value is string => isUuid(value) && value === value.toLowerCase();
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const revision = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const scalarText = (value: string) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
const utf8Bytes = (value: string) => {
  let bytes = 0;
  for (const character of value) { const code = character.codePointAt(0)!; bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4; }
  return bytes;
};

/** One canonical wire order shared by controllers and the native JS boundary. */
export function circleReviewDecisionBody(input: CircleReviewInput, sessionId?: string): string | null {
  const parsed = validateCircleReviewInput(input);
  if (!parsed.ok || !uuid(parsed.value.requestId) || parsed.value.evidenceReportId !== null && !uuid(parsed.value.evidenceReportId)
    || sessionId !== undefined && !uuid(sessionId) || !scalarText(parsed.value.summary)
    || parsed.value.evidenceExcerpt !== null && !scalarText(parsed.value.evidenceExcerpt)) return null;
  return JSON.stringify({ ...parsed.value, ...(sessionId === undefined ? {} : { sessionId }) });
}
export function circleReviewCoverageStartBody(expectedRevision: number): string | null {
  return revision(expectedRevision) ? JSON.stringify({ action: 'start', expectedRevision, contentHash: null }) : null;
}
export function circleReviewCoverageAckBody(sessionId: string, pageToken: string): string | null {
  return uuid(sessionId) && uuid(pageToken) ? JSON.stringify({ action: 'ack', sessionId, pageToken }) : null;
}
/** Dedicated human listing review; no message or AI routes are accepted. */
export function validateCircleReviewRequest(path: string, input: { method: string; body?: string }): boolean {
  if (typeof path !== 'string' || !input || !['GET', 'POST'].includes(input.method)) return false;
  if (input.method === 'GET' && input.body !== undefined) return false;
  const queue = /^\/api\/admin\/circles\/reports(?:\?after=([a-f0-9-]{36}))?$/.exec(path);
  if (queue) return input.method === 'GET' && (!queue[1] || uuid(queue[1]));
  const route = /^\/api\/admin\/circles\/reports\/([a-f0-9-]{36})(\/coverage\/decision|\/coverage)?(?:\?sessionId=([a-f0-9-]{36})(?:&page=([1-9][0-9]*))?)?$/.exec(path);
  if (!route || !uuid(route[1])) return false;
  const [, , suffix = '', sessionId, page] = route;
  if (input.method === 'GET') return suffix === '' ? sessionId === undefined
    : suffix === '/coverage' && uuid(sessionId) && (page === undefined || Number.isSafeInteger(Number(page)) && Number(page) <= 42949673);
  if (sessionId !== undefined || typeof input.body !== 'string' || utf8Bytes(input.body) > CIRCLE_REVIEW_BODY_MAX_BYTES) return false;
  try {
    const value: unknown = JSON.parse(input.body);
    if (!record(value)) return false;
    let canonical: string | null = null;
    if (suffix === '' || suffix === '/coverage/decision') {
      const { sessionId: coverageId, ...decision } = value;
      if (suffix === '' && coverageId !== undefined || suffix !== '' && !uuid(coverageId)) return false;
      canonical = circleReviewDecisionBody(decision as CircleReviewInput, suffix ? coverageId as string : undefined);
    } else if (suffix === '/coverage') {
      if (value.action === 'start' && exact(value, ['action', 'expectedRevision', 'contentHash']) && value.contentHash === null) canonical = circleReviewCoverageStartBody(value.expectedRevision as number);
      if (value.action === 'ack' && exact(value, ['action', 'sessionId', 'pageToken'])) canonical = circleReviewCoverageAckBody(value.sessionId as string, value.pageToken as string);
    }
    return canonical !== null && canonical === input.body;
  } catch { return false; }
}
