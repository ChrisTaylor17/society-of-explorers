import 'server-only';
import type { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { privateJson } from '@/lib/http/routeError';
import { isUuid } from '@/lib/ids/uuid';
import { circleWriteOrigin, readCircleReviewJson } from './moderation-server';
import { parseCircleDecisionReceipt, validateCircleReviewInput } from './moderation';
import { parseMessageDecisionReceipt, validateMessageDecisionInput } from './message-moderation';
import { parseReviewCoveragePage } from './review-coverage';

type Target = { circleId: string; messageId: string | null };
type Args = Record<string, string | number | null>;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const unavailable = () => privateJson({ error: 'Full review is unavailable. Refresh its current state before continuing.' }, { status: 503 });
const invalid = () => privateJson({ error: 'Use a current, valid review request.' }, { status: 400 });
const keysAre = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(key => Object.hasOwn(v, key));
function failure(error: unknown) {
  const code = record(error) ? error.code : null;
  if (code === 'PT400') return invalid();
  if (code === 'PT403') return privateJson({ error: 'This review is not available to you.' }, { status: 403 });
  if (code === 'PT404') return privateJson({ error: 'Review unavailable.' }, { status: 404 });
  if (code === 'PT409') return privateJson({ error: 'The case or review progress changed. Load its current state.' }, { status: 409 });
  return unavailable();
}

/** One bounded server lifetime; retired operations cannot start a later RPC. */
async function run(req: NextRequest, targetInput: Target | Promise<Target>, operation: 'read' | 'write' | 'decide') {
  const controller = new AbortController(), deadlineAt = Date.now() + 12_000;
  const abort = () => controller.abort();
  req.signal?.addEventListener('abort', abort, { once: true });
  if (req.signal?.aborted) abort();
  let retire: () => void = () => {};
  const retired = new Promise<Response>(resolve => { retire = () => resolve(unavailable()); });
  controller.signal.addEventListener('abort', retire, { once: true });
  const timer = setTimeout(abort, 12_000);
  const current = () => !controller.signal.aborted && Date.now() < deadlineAt;
  async function work(): Promise<Response> {
    if (!current()) return unavailable();
    if (operation !== 'read') { const refused = circleWriteOrigin(req); if (refused) return refused; }
    const target = await targetInput;
    if (!current()) return unavailable();
    if (!target || !isUuid(target.circleId) || !(target.messageId === null || isUuid(target.messageId))) return invalid();
    const base: Args = { p_circle_id: target.circleId, p_message_id: target.messageId };
    let rpcName: string, args: Args, sessionId: string | null = null, page: number | null = null;
    let expectedRevision: number | null = null, contentHash: string | null = null;
    let decision: ReturnType<typeof validateMessageDecisionInput> | ReturnType<typeof validateCircleReviewInput> | null = null;
    if (operation === 'read') {
      const query = (req.nextUrl ?? new URL(req.url)).searchParams;
      if ([...query.keys()].some(key => !['sessionId', 'page'].includes(key)) || query.getAll('sessionId').length !== 1 || query.getAll('page').length > 1) return invalid();
      sessionId = query.get('sessionId');
      const rawPage = query.get('page');
      if (!isUuid(sessionId) || (rawPage !== null && (!/^[1-9]\d*$/.test(rawPage) || Number(rawPage) > 42_949_673))) return invalid();
      page = rawPage === null ? null : Number(rawPage);
      rpcName = 'soe_circle_review_coverage_page'; args = { ...base, p_session_id: sessionId, p_page_number: page };
    } else {
      const body = await readCircleReviewJson(req, controller.signal);
      if (!current()) return unavailable();
      if (!body.ok) return body.response;
      if (!record(body.value)) return invalid();
      const value = body.value;
      if (operation === 'decide') {
        if (!isUuid(value.sessionId)) return invalid();
        sessionId = value.sessionId;
        const { sessionId: ignored, ...input } = value;
        void ignored;
        decision = target.messageId === null ? validateCircleReviewInput(input) : validateMessageDecisionInput(input);
        if (!decision.ok) return invalid();
        const d = decision.value;
        expectedRevision = d.expectedRevision;
        contentHash = 'contentHash' in d ? d.contentHash : null;
        rpcName = 'soe_circle_review_coverage_decide';
        args = { ...base, p_session_id: sessionId, p_expected_revision: expectedRevision, p_content_hash: contentHash,
          p_request_id: d.requestId, p_action: d.action, p_reason: d.reason, p_summary: d.summary,
          p_evidence_report_id: d.evidenceReportId, p_evidence_excerpt: d.evidenceExcerpt };
      } else if (value.action === 'start') {
        if (!keysAre(value, ['action', 'expectedRevision', 'contentHash']) || !Number.isSafeInteger(value.expectedRevision) || (value.expectedRevision as number) < 0
          || !(target.messageId === null ? value.contentHash === null : typeof value.contentHash === 'string' && /^[0-9a-f]{64}$/.test(value.contentHash))) return invalid();
        expectedRevision = value.expectedRevision as number; contentHash = value.contentHash as string | null;
        rpcName = 'soe_circle_review_coverage_start'; args = { ...base, p_expected_revision: expectedRevision, p_content_hash: contentHash };
      } else if (value.action === 'ack') {
        if (!keysAre(value, ['action', 'sessionId', 'pageToken']) || !isUuid(value.sessionId) || !isUuid(value.pageToken)) return invalid();
        sessionId = value.sessionId;
        rpcName = 'soe_circle_review_coverage_ack'; args = { ...base, p_session_id: sessionId, p_page_token: value.pageToken };
      } else return invalid();
    }
    const actor = await getAuthenticatedMember(req);
    if (!current()) return unavailable();
    if (!actor || !isUuid(actor.memberId)) return privateJson({ error: 'Sign in to review this case.' }, { status: 401 });
    const { data, error } = await getSupabaseAdmin().rpc(rpcName, { ...args, p_actor: actor.memberId });
    if (!current()) return unavailable();
    if (error) return failure(error);
    if (operation === 'decide') {
      if (!record(data) || !isUuid(data.sessionId) || !sessionId || !same(data.sessionId, sessionId) || !decision?.ok) return unavailable();
      const input = decision.value;
      if (target.messageId === null) {
        const receipt = parseCircleDecisionReceipt(data);
        if (!receipt || receipt.decision.action !== input.action || receipt.decision.reason !== input.reason || receipt.decision.summary !== input.summary
          || receipt.revision < input.expectedRevision || (!receipt.replayed && receipt.revision <= input.expectedRevision)) return unavailable();
        return privateJson({ ...receipt, sessionId: data.sessionId });
      }
      const receipt = parseMessageDecisionReceipt(data);
      if (!receipt || !same(receipt.requestId, input.requestId) || !same(receipt.circleId, target.circleId) || !same(receipt.messageId, target.messageId)
        || receipt.decision.action !== input.action || receipt.decision.reason !== input.reason || receipt.decision.summary !== input.summary
        || receipt.safety.revision < input.expectedRevision || (!receipt.replayed && receipt.safety.revision <= input.expectedRevision)) return unavailable();
      return privateJson({ ...receipt, sessionId: data.sessionId });
    }
    const result = parseReviewCoveragePage(data);
    if (!result || !same(result.circleId, target.circleId) || (target.messageId === null ? result.messageId !== null : !result.messageId || !same(result.messageId, target.messageId))
      || (sessionId !== null && !same(result.sessionId, sessionId)) || (expectedRevision !== null && result.revision !== expectedRevision)
      || (expectedRevision !== null && result.contentHash !== contentHash) || (page !== null && result.pageNumber !== page)) return unavailable();
    return privateJson(result);
  }
  try { if (!current()) return unavailable(); return await Promise.race([work(), retired]); }
  catch { return unavailable(); }
  finally { clearTimeout(timer); controller.abort(); controller.signal.removeEventListener('abort', retire); req.signal?.removeEventListener('abort', abort); }
}
export const coverageRead = (req: NextRequest, target: Target | Promise<Target>) => run(req, target, 'read');
export const coverageWrite = (req: NextRequest, target: Target | Promise<Target>) => run(req, target, 'write');
export const coverageDecide = (req: NextRequest, target: Target | Promise<Target>) => run(req, target, 'decide');
