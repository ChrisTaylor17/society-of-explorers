import { isUuid } from '../../lib/ids/uuid';
import { parseMessageDecisionReceipt, parseMessageReviewDetail, parseMessageReviewQueue, validateMessageDecisionInput,
  type MessageDecisionInput, type MessageDecisionReceipt, type MessageDecisionReason, type MessageReviewDetail, type MessageReviewQueue } from '../../lib/circles/message-moderation';
import { parseReviewCoveragePage, REVIEW_COVERAGE_PAGE_SIZE, type ReviewCoveragePage, type ReviewCoverageEvidence } from '../../lib/circles/review-coverage';
import { parseMessageAdviceReceipt, type MessageAdvice } from '../../lib/circles/message-ai';
import { validateMessageReviewRequest, messageReviewDecisionBody, messageReviewCoverageStartBody,
  messageReviewCoverageAckBody, messageReviewAdviceBody } from '../../lib/circles/message-review-wire';
import { approvedOrigin, type BearerCircleOwner, type CircleTransport } from '../native/src/circles/host';

export type MessageReviewAction = {
  contextRevision: number; interactionRevision: number; circleId: string | null; messageId: string | null;
  revision: number | null; contentHash: string | null; sessionId: string | null; pageToken: string | null;
};
export type MessageReviewDraft = { action: '' | 'hide' | 'restore'; reason: '' | MessageDecisionReason; summary: string; source: string; excerpt: string; confirmed: boolean };
export type MessageReviewCoverageModel = {
  page: ReviewCoveragePage | null; sessionId: string | null; confirmed: boolean; message: string;
  canStart: boolean; canRefresh: boolean; canPrevious: boolean; canNext: boolean; canFrontier: boolean; canConfirm: boolean; canAcknowledge: boolean;
};
export type MessageReviewsModel = {
  connected: boolean; active: boolean; online: boolean; busy: boolean;
  phase: 'idle' | 'loading' | 'ready' | 'sending' | 'unknown' | 'confirmed' | 'unavailable' | 'closed';
  queue: MessageReviewQueue | null; selected: { circleId: string; messageId: string } | null; detail: MessageReviewDetail | null;
  draft: MessageReviewDraft; evidence: ReviewCoverageEvidence | null; coverage: MessageReviewCoverageModel | null;
  advice: MessageAdvice | null; adviceMessage: string; receipt: MessageDecisionReceipt | null; decisionConfirmed: boolean; pendingDecision: boolean; message: string;
  canLoadQueue: boolean; canNextQueue: boolean; canSelect: boolean; canRefreshCase: boolean; canBack: boolean; canEditDraft: boolean;
  canConfirm: boolean; canSubmit: boolean; canRetry: boolean; canRequestAdvice: boolean; canNavigate: boolean; action: MessageReviewAction;
};
type Config = { owner: BearerCircleOwner; origin: string; reviewerTransport: CircleTransport; newRequestId: () => Promise<string>; timeoutMs?: number; initialOnline?: boolean };
type Pending = { path: string; body: string; input: MessageDecisionInput; sessionId?: string; reportCount: number };
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const lowerUuid = (value: unknown): value is string => isUuid(value) && value === value.toLowerCase();
const blank = (): MessageReviewDraft => ({ action: '', reason: '', summary: '', source: 'message', excerpt: '', confirmed: false });
const queuePath = '/api/admin/circles/messages';
const actionKeys = 'circleId,contentHash,contextRevision,interactionRevision,messageId,pageToken,revision,sessionId';
class ReviewFailure extends Error { constructor(public sent = false) { super('Review request unavailable'); } }

/** Private assigned-review workflow. A capability enables the lane, never a role.
 * All authority comes from fresh canonical server checks, with no durable drafts. */
export function createMessageReviews(config: Config) {
  const origin = approvedOrigin(config.origin), timeout = config.timeoutMs ?? 15000;
  if (!config.owner || !['scope', 'bearer', 'subscribe'].every(key => typeof config.owner[key as keyof BearerCircleOwner] === 'function')
    || typeof config.reviewerTransport !== 'function' || typeof config.newRequestId !== 'function'
    || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000
    || config.initialOnline !== undefined && typeof config.initialOnline !== 'boolean') throw Error('Verified reviewer connection required');
  let attached = false, active = true, online = config.initialOnline ?? false, scope: string | null = null;
  let generation = 0, bindingRevision = 0, contextRevision = 0, interaction = 0, busy = false, transition = false;
  let phase: MessageReviewsModel['phase'] = 'closed', queue: MessageReviewQueue | null = null;
  let selected: MessageReviewsModel['selected'] = null, detail: MessageReviewDetail | null = null, draft = blank();
  let page: ReviewCoveragePage | null = null, sessionId: string | null = null, coverageTotal: number | null = null, pageConfirmed = false;
  let evidence: ReviewCoverageEvidence | null = null, advice: MessageAdvice | null = null, adviceMessage = '';
  let receipt: MessageDecisionReceipt | null = null, decisionConfirmed = false, pending: Pending | null = null;
  let message = 'Check assigned message reviews when ready. Access is verified by the server.';
  let coverageMessage = 'Start a full review to read and acknowledge every report page.';
  let offOwner = () => {}, expiryTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<(model: MessageReviewsModel) => void>(), requests = new Set<AbortController>();
  const enabled = () => {
    try { return attached && active && online && scope !== null && config.owner.scope() === scope; } catch { return false; }
  };
  const current = (g: number) => enabled() && generation === g;
  const endpoint = () => selected ? `/api/admin/circles/${selected.circleId}/messages/${selected.messageId}` : null;
  const proofCurrent = () => !!detail && !!page && page.circleId === detail.circle.id && page.messageId === detail.message.id
    && page.revision === detail.revision && page.contentHash === detail.contentHash && Date.parse(page.expiresAt) > Date.now();
  const covered = () => proofCurrent() && page!.complete;
  const decisionReady = () => enabled() && !busy && !pending && !!detail && (detail.complete || covered()) && detail.revision < Number.MAX_SAFE_INTEGER;
  const evidenceText = () => draft.source === 'message' ? detail?.message.content
    : evidence?.id === draft.source ? evidence.note : detail?.reports.find(report => report.id === draft.source)?.note;
  function decisionInput(requestId: string): MessageDecisionInput | null {
    if (!detail) return null;
    const parsed = validateMessageDecisionInput({ expectedRevision: detail.revision, contentHash: detail.contentHash, requestId,
      action: draft.action, reason: draft.reason, summary: draft.summary, evidenceReportId: draft.action === 'hide' && draft.source !== 'message' ? draft.source : null,
      evidenceExcerpt: draft.action === 'hide' ? draft.excerpt : null });
    if (!parsed.ok || !messageReviewDecisionBody(parsed.value) || parsed.value.action === 'hide' && !evidenceText()?.includes(parsed.value.evidenceExcerpt!)) return null;
    return parsed.value;
  }
  const action = (): MessageReviewAction => ({ contextRevision, interactionRevision: interaction, circleId: selected?.circleId ?? null,
    messageId: selected?.messageId ?? null, revision: detail?.revision ?? null, contentHash: detail?.contentHash ?? null, sessionId, pageToken: page?.pageToken ?? null });
  const model = (): MessageReviewsModel => {
    const usable = enabled() && !busy, ready = decisionReady(), valid = ready && !!decisionInput('00000000-0000-4000-8000-000000000000');
    const livePage = proofCurrent(), frontier = livePage ? Math.min(Math.max(1, Math.ceil(page!.totalReports / REVIEW_COVERAGE_PAGE_SIZE)), Math.floor(page!.reviewedReports / REVIEW_COVERAGE_PAGE_SIZE) + 1) : 0;
    return copy({ connected: attached && scope !== null, active, online, busy, phase, queue, selected, detail, draft, evidence, advice, adviceMessage, receipt,
      decisionConfirmed, pendingDecision: pending !== null, message,
      coverage: detail && !detail.complete ? { page, sessionId, confirmed: pageConfirmed, message: coverageMessage,
        canStart: usable && !pending, canRefresh: usable && !pending && sessionId !== null,
        canPrevious: usable && livePage && page!.pageNumber > 1, canNext: usable && livePage && page!.pageNumber < frontier,
        canFrontier: usable && livePage && page!.pageNumber < frontier, canConfirm: usable && livePage && !page!.acknowledged && !page!.complete,
        canAcknowledge: usable && livePage && !page!.acknowledged && !page!.complete && pageConfirmed } : null,
      canLoadQueue: usable, canNextQueue: usable && queue?.nextCursor !== null && queue !== null,
      canSelect: usable && !!queue?.items.length, canRefreshCase: usable && selected !== null && !pending,
      canBack: usable && (selected !== null || queue !== null), canEditDraft: ready, canConfirm: valid, canSubmit: valid && draft.confirmed,
      canRetry: usable && pending !== null, canRequestAdvice: usable && !pending && !!detail?.complete && detail.message.visibility !== 'withdrawn',
      canNavigate: !busy, action: action() });
  };
  const emit = () => { for (const listener of listeners) { try { listener(model()); } catch { /* Independent observer. */ } } };
  function clearDraft() { draft = blank(); evidence = null; advice = null; adviceMessage = ''; pageConfirmed = false; }
  function clearCoverage() { clearTimeout(expiryTimer); expiryTimer = undefined; page = null; sessionId = null; coverageTotal = null; pageConfirmed = false; }
  function clearCase() { selected = null; detail = null; pending = null; receipt = null; decisionConfirmed = false; clearCoverage(); clearDraft(); }
  function retire(notice: string) {
    generation++; contextRevision++; interaction++; for (const request of requests) request.abort();
    busy = false; queue = null; clearCase(); phase = attached ? 'idle' : 'closed'; message = notice; emit();
  }
  function expire() {
    if (!page || Date.parse(page.expiresAt) > Date.now()) return;
    clearCoverage(); clearDraft(); interaction++;
    coverageMessage = 'Review progress expired. Start a new full review before deciding.'; emit();
  }
  function sameAction(value: MessageReviewAction) {
    expire();
    if (!value || typeof value !== 'object' || Object.keys(value).sort().join(',') !== actionKeys) return false;
    const expected = action();
    return (Object.keys(expected) as (keyof MessageReviewAction)[]).every(key => value[key] === expected[key]);
  }
  function acceptAction(value: MessageReviewAction) { return !transition && enabled() && !busy && sameAction(value); }
  function begin(notice: string, sending = false) {
    const g = ++generation; interaction++; busy = true; phase = sending ? 'sending' : 'loading'; message = notice; emit(); return g;
  }
  function deny(status?: number, confirmedBeforeRead = false) {
    queue = null; clearCase(); busy = false; interaction++; phase = 'unavailable'; decisionConfirmed = confirmedBeforeRead;
    message = (confirmedBeforeRead ? 'The decision was confirmed. ' : '') + (status === 401 ? 'Sign in and check assigned reviews again.'
      : status === 403 ? 'Review access or permission is unavailable. Check assigned reviews again before reading private evidence.'
        : status === 404 ? 'This review is unavailable.' : status === 409 ? 'The case or review progress changed. Load a fresh case before deciding.'
          : 'Review information could not be verified. Load assigned reviews again; no outcome is being assumed.'); emit();
  }
  async function request(path: string, method: 'GET' | 'POST', body: string | undefined, g: number, sendBefore?: number) {
    if (!validateMessageReviewRequest(path, { method, body })) throw new ReviewFailure();
    const expected = scope, abort = new AbortController(), deadlineAt = Date.now() + timeout;
    const live = () => current(g) && scope === expected && !abort.signal.aborted && Date.now() < deadlineAt;
    if (!expected || !live()) throw new ReviewFailure();
    let sent = false, dispatchTimer: ReturnType<typeof setTimeout> | undefined;
    let onAbort = () => {};
    const retired = new Promise<never>((_, reject) => { onAbort = () => reject(new ReviewFailure(sent)); abort.signal.addEventListener('abort', onAbort, { once: true }); });
    requests.add(abort);
    const timer = setTimeout(() => abort.abort(), timeout);
    if (sendBefore !== undefined) dispatchTimer = setTimeout(() => { if (!sent) abort.abort(); }, Math.max(0, sendBefore - Date.now()));
    try {
      return await Promise.race([(async () => {
        const bearer = await config.owner.bearer(expected);
        if (!live() || sendBefore !== undefined && Date.now() >= sendBefore || !bearer || bearer.length > 16384 || /[\s\u0000-\u001f\u007f]/.test(bearer)) throw new ReviewFailure(sent);
        sent = true;
        const response = await config.reviewerTransport(origin + path, { method, body, credentials: 'omit', redirect: 'error', cache: 'no-store', signal: abort.signal,
          headers: { Authorization: `Bearer ${bearer}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) } });
        if (!live() || response.redirected || response.url !== origin + path) throw new ReviewFailure(sent);
        const value = await response.json();
        if (!live()) throw new ReviewFailure(sent);
        return { status: response.status, body: value };
      })(), retired]);
    } catch { throw new ReviewFailure(sent); }
    finally { clearTimeout(timer); clearTimeout(dispatchTimer); abort.signal.removeEventListener('abort', onAbort); abort.abort(); requests.delete(abort); }
  }
  async function key(g: number, prepareUntil?: number) {
    const until = Math.min(Date.now() + timeout, prepareUntil ?? Infinity), abort = new AbortController();
    let onAbort = () => {};
    const retired = new Promise<never>((_, reject) => { onAbort = () => reject(Error('Request key retired')); abort.signal.addEventListener('abort', onAbort, { once: true }); });
    requests.add(abort); const timer = setTimeout(() => abort.abort(), Math.max(0, until - Date.now()));
    const live = () => current(g) && !abort.signal.aborted && Date.now() < until;
    try {
      if (!live()) throw Error('Review retired');
      const value = await Promise.race([Promise.resolve().then(() => { if (!live()) throw Error('Review retired'); return config.newRequestId(); }), retired]);
      if (!live() || !isUuid(value)) throw Error('Request key unavailable');
      return value.toLowerCase();
    } finally { clearTimeout(timer); abort.signal.removeEventListener('abort', onAbort); abort.abort(); requests.delete(abort); }
  }
  function receiveDetail(value: unknown, circleId: string, messageId: string, minimumRevision = 0) {
    const parsed = parseMessageReviewDetail(value);
    if (!parsed || parsed.circle.id !== circleId || parsed.message.id !== messageId || parsed.revision < minimumRevision) return false;
    detail = parsed.complete ? parsed : { ...parsed, reports: [] }; clearCoverage(); clearDraft();
    coverageMessage = 'Start a full review to read and acknowledge every report page.'; return true;
  }
  async function loadQueue(token: MessageReviewAction, after: string | null = null) {
    if (!acceptAction(token) || after !== null && (!model().canNextQueue || after !== queue?.nextCursor)) return;
    const earlierMayComplete = pending !== null;
    contextRevision++; queue = null; clearCase(); const g = begin('Checking assigned message reviews…');
    try {
      const response = await request(queuePath + (after ? '?after=' + after : ''), 'GET', undefined, g);
      if (!current(g)) return;
      const parsed = response.status === 200 ? parseMessageReviewQueue(response.body) : null;
      let cursor = after;
      if (!parsed || parsed.items.some(item => { const bad = !lowerUuid(item.circleId) || !lowerUuid(item.messageId) || cursor !== null && item.messageId <= cursor; cursor = item.messageId; return bad; })) return deny(response.status);
      queue = parsed; busy = false; phase = 'ready'; interaction++;
      message = (earlierMayComplete ? 'A previously sent decision may still complete. ' : '')
        + (parsed.items.length ? 'Assigned message reviews loaded. Open a case to check current evidence.' : 'No assigned message reviews were returned on this page.'); emit();
    } catch { if (current(g)) deny(); }
  }
  async function loadCase(circleId: string, messageId: string) {
    contextRevision++; queue = null; clearCase(); selected = { circleId, messageId }; const g = begin('Loading current message and reports…');
    try {
      const response = await request(endpoint()!, 'GET', undefined, g);
      if (!current(g)) return;
      if (response.status !== 200 || !receiveDetail(response.body, circleId, messageId)) return deny(response.status);
      busy = false; phase = 'ready'; interaction++; message = 'Current case loaded. A report is an allegation, not a finding.'; emit();
    } catch { if (current(g)) deny(); }
  }
  function edit(token: MessageReviewAction, work: () => void, allowed = model().canEditDraft) {
    if (!allowed || !acceptAction(token)) return false;
    transition = true;
    try { work(); draft.confirmed = false; pageConfirmed = false; interaction++; emit(); return true; }
    finally { transition = false; }
  }
  function coverageUnknown(notice: string) {
    clearTimeout(expiryTimer); expiryTimer = undefined; page = null; clearDraft(); busy = false; phase = 'ready'; interaction++; coverageMessage = notice; emit();
  }
  function receiveCoverage(value: unknown, expectedSession: string | null, requestedPage?: number, acknowledged?: ReviewCoveragePage) {
    const parsed = parseReviewCoveragePage(value);
    if (!parsed || !detail || parsed.circleId !== detail.circle.id || parsed.messageId !== detail.message.id || parsed.revision !== detail.revision
      || parsed.contentHash !== detail.contentHash || expectedSession !== null && parsed.sessionId !== expectedSession
      || requestedPage !== undefined && parsed.pageNumber !== requestedPage || Date.parse(parsed.expiresAt) <= Date.now()
      || expectedSession === null && (parsed.pageNumber !== 1 || parsed.reviewedReports !== 0)
      || expectedSession !== null && parsed.totalReports !== coverageTotal
      || acknowledged && (parsed.reviewedReports !== acknowledged.reviewedReports + acknowledged.reports.length
        || parsed.pageNumber !== (parsed.complete ? acknowledged.pageNumber : acknowledged.pageNumber + 1)
        || !parsed.complete && parsed.pageToken === acknowledged.pageToken)) return false;
    sessionId = parsed.sessionId; coverageTotal = parsed.totalReports; page = parsed; pageConfirmed = false; draft.confirmed = false; busy = false; phase = 'ready'; interaction++;
    clearTimeout(expiryTimer); expiryTimer = setTimeout(expire, Math.min(2147483647, Math.max(0, Date.parse(parsed.expiresAt) - Date.now())));
    coverageMessage = parsed.complete ? 'Every report page is acknowledged. Review your conduct finding and explanation before deciding.'
      : parsed.acknowledged ? 'Previously acknowledged page loaded. Revisiting does not advance review progress.' : 'Read every report, then explicitly acknowledge this page.';
    emit(); return true;
  }
  async function coverageRequest(kind: 'start' | 'read' | 'ack', requestedPage?: number) {
    if (!detail || !selected) return;
    const base = endpoint()! + '/coverage', oldSession = kind === 'start' ? null : sessionId, acknowledged = kind === 'ack' ? page! : undefined;
    const body = kind === 'start' ? messageReviewCoverageStartBody(detail.revision, detail.contentHash)
      : kind === 'ack' && page ? messageReviewCoverageAckBody(page.sessionId, page.pageToken) : undefined;
    if (kind !== 'read' && !body || kind === 'read' && !oldSession) return;
    const path = kind === 'read' ? base + '?sessionId=' + oldSession + (requestedPage === undefined ? '' : '&page=' + requestedPage) : base;
    if (kind === 'start') { clearCoverage(); clearDraft(); } else { clearTimeout(expiryTimer); expiryTimer = undefined; page = null; pageConfirmed = false; draft.confirmed = false; }
    const g = begin(kind === 'start' ? 'Starting full report review…' : kind === 'ack' ? 'Recording this page acknowledgement…' : 'Checking report review progress…');
    try {
      const response = await request(path, kind === 'read' ? 'GET' : 'POST', body ?? undefined, g);
      if (!current(g)) return;
      if (response.status === 200 && receiveCoverage(response.body, oldSession, requestedPage, acknowledged)) return;
      if ([401, 403, 404, 409].includes(response.status)) return deny(response.status);
      coverageUnknown('Review progress could not be confirmed. Refresh it manually or start again. No coverage is assumed.');
    } catch { if (current(g)) coverageUnknown('The page or acknowledgement reply was not confirmed and may still complete. Refresh progress manually; nothing retries automatically.'); }
  }
  async function sendDecision(exact: Pending, g: number, sendBefore?: number) {
    try {
      const response = await request(exact.path, 'POST', exact.body, g, sendBefore);
      if (!current(g)) return;
      const parsed = response.status === 200 ? parseMessageDecisionReceipt(response.body) : null;
      const receivedSession = response.body && typeof response.body === 'object' && 'sessionId' in response.body ? response.body.sessionId : undefined;
      const valid = parsed && selected && parsed.circleId === selected.circleId && parsed.messageId === selected.messageId
        && parsed.requestId === exact.input.requestId && parsed.decision.action === exact.input.action && parsed.decision.reason === exact.input.reason
        && parsed.decision.summary === exact.input.summary && parsed.decision.report_count === exact.reportCount
        && receivedSession === exact.sessionId && (parsed.replayed ? parsed.safety.revision > exact.input.expectedRevision : parsed.safety.revision === exact.input.expectedRevision + 1)
        && (parsed.replayed || parsed.safety.visibility === 'withdrawn' || parsed.safety.visibility === (exact.input.action === 'hide' ? 'hidden' : 'visible'));
      if (!valid) {
        if ([400, 401, 403, 404, 409, 413, 429].includes(response.status)) return deny(response.status);
        busy = false; phase = 'unknown'; interaction++; message = 'The decision may have been saved. Retry this exact decision manually, or leave and load a fresh queue. A read cannot confirm its receipt.'; emit(); return;
      }
      pending = null; receipt = parsed; decisionConfirmed = true; phase = 'confirmed'; interaction++; message = 'Decision confirmed. Checking the current case before another decision…'; emit();
      if (!current(g)) return;
      try {
        const fresh = await request(endpoint()!, 'GET', undefined, g);
        if (!current(g)) return;
        if ([401, 403, 404, 409].includes(fresh.status)) return deny(fresh.status, true);
        if (fresh.status !== 200 || !receiveDetail(fresh.body, parsed.circleId, parsed.messageId, parsed.safety.revision)) throw Error('Current case unavailable');
        busy = false; phase = 'confirmed'; interaction++; message = 'Decision confirmed. Current case loaded; another decision requires a new review.'; emit();
      } catch {
        if (!current(g)) return;
        busy = false; phase = 'confirmed'; interaction++; message = 'The decision was confirmed, but the current case could not be loaded. Refresh it manually before another decision.'; emit();
      }
    } catch (error) {
      if (!current(g)) return;
      if (sendBefore !== undefined && Date.now() >= sendBefore && error instanceof ReviewFailure && !error.sent) {
        pending = null; busy = false; phase = 'unavailable'; interaction++;
        message = 'Review progress expired before transmission. No decision was sent. Refresh the case and complete a fresh review.'; emit(); return;
      }
      busy = false; phase = 'unknown'; interaction++;
      message = error instanceof ReviewFailure && !error.sent ? 'The exact decision was not transmitted. Retry it manually or load a fresh queue.'
        : 'The decision reply was lost and may have been saved. Only an exact manual retry can confirm its receipt; nothing retries automatically.'; emit();
    }
  }
  return {
    model,
    subscribe(listener: (value: MessageReviewsModel) => void) { listeners.add(listener); listener(model()); return () => { listeners.delete(listener); }; },
    connect() {
      if (attached) return; attached = true;
      const binding = ++bindingRevision, ownsBinding = () => attached && bindingRevision === binding;
      let stop: (() => void) | undefined;
      try {
        stop = config.owner.subscribe(() => {
          if (!ownsBinding()) return;
          try {
            const nextScope = config.owner.scope(); if (!ownsBinding()) return;
            scope = nextScope; retire('Account changed. Private reviews and drafts cleared. Check assignments again when ready.');
          } catch { if (ownsBinding()) { scope = null; retire('Account access could not be verified. Private reviews and drafts cleared.'); } }
        });
        if (!ownsBinding()) { try { stop(); } catch { /* Already retired. */ } return; }
        offOwner = stop;
        const nextScope = config.owner.scope(); if (!ownsBinding()) return;
        scope = nextScope; retire('Check assigned message reviews when ready. Access is verified by the server.');
      } catch {
        if (!ownsBinding()) { try { stop?.(); } catch { /* Already retired. */ } return; }
        attached = false; scope = null; bindingRevision++; offOwner = () => {};
        try { stop?.(); } catch { /* Clear private state even if the owner cannot unsubscribe. */ }
        retire('Review connection is unavailable. Private reviews remain closed.');
      }
    },
    disconnect() {
      attached = false; bindingRevision++; scope = null; const stop = offOwner; offOwner = () => {};
      try { stop(); } catch { /* The retired binding cannot revive private state. */ }
      finally { retire('Private reviews closed. A decision already sent may still complete; nothing retries automatically.'); }
    },
    activity(value: boolean) { if (typeof value !== 'boolean' || active === value) return; active = value; if (!value) retire('Private reviews cleared while inactive. A sent decision may still complete.'); else { interaction++; emit(); } },
    connectivity(value: boolean) { if (typeof value !== 'boolean' || online === value) return; online = value; if (!value) retire('Private reviews cleared while offline. Reconnect and load assignments manually.'); else { interaction++; emit(); } },
    loadQueue: (token: MessageReviewAction) => loadQueue(token),
    nextQueue(token: MessageReviewAction) { return model().canNextQueue ? loadQueue(token, queue!.nextCursor) : Promise.resolve(); },
    openCase(circleId: string, messageId: string, token: MessageReviewAction) {
      if (!acceptAction(token) || !model().canSelect || !lowerUuid(circleId) || !lowerUuid(messageId) || !queue!.items.some(item => item.circleId === circleId && item.messageId === messageId)) return Promise.resolve();
      return loadCase(circleId, messageId);
    },
    refreshCase(token: MessageReviewAction) { return acceptAction(token) && model().canRefreshCase && selected ? loadCase(selected.circleId, selected.messageId) : Promise.resolve(); },
    back(token: MessageReviewAction) { if (acceptAction(token) && model().canBack) retire('Private case and exact retry cleared. A sent decision may still complete. Load assignments when ready.'); },
    setAction(value: string, token: MessageReviewAction) { return ['', 'hide', 'restore'].includes(value) && edit(token, () => { draft.action = value as MessageReviewDraft['action']; draft.reason = ''; draft.excerpt = ''; }); },
    setReason(value: string, token: MessageReviewAction) {
      const reasons = draft.action === 'hide' ? ['safety', 'harassment', 'spam', 'misleading', 'inappropriate'] : draft.action === 'restore' ? ['no_violation', 'insufficient_evidence', 'resolved'] : [];
      return (value === '' || reasons.includes(value)) && edit(token, () => { draft.reason = value as MessageReviewDraft['reason']; });
    },
    setSummary(value: string, token: MessageReviewAction) { return typeof value === 'string' && value.length <= 1000 && edit(token, () => { draft.summary = value; }); },
    setExcerpt(value: string, token: MessageReviewAction) { return typeof value === 'string' && value.length <= 500 && edit(token, () => { draft.excerpt = value; }); },
    setEvidence(source: string, token: MessageReviewAction) {
      if (!detail || typeof source !== 'string') return false;
      const reports = detail.complete ? detail.reports : proofCurrent() ? page!.reports : [];
      const report = reports.find(item => item.id === source);
      if (source !== 'message' && (!report?.note || report.note.trim().length < 5)) return false;
      return edit(token, () => { evidence = report ? { id: report.id, note: report.note, label: 'Report ' + ((page ? (page.pageNumber - 1) * 50 : 0) + reports.indexOf(report) + 1) } : null; draft.source = source; draft.excerpt = ''; }, !pending);
    },
    confirmDecision(value: boolean, token: MessageReviewAction) {
      if (typeof value !== 'boolean' || !acceptAction(token) || !model().canConfirm || draft.confirmed === value) return false;
      transition = true;
      try { draft.confirmed = value; interaction++; emit(); return true; } finally { transition = false; }
    },
    startCoverage(token: MessageReviewAction) { return acceptAction(token) && model().coverage?.canStart ? coverageRequest('start') : Promise.resolve(); },
    refreshCoverage(token: MessageReviewAction) { return acceptAction(token) && model().coverage?.canRefresh ? coverageRequest('read') : Promise.resolve(); },
    openCoveragePage(number: number, token: MessageReviewAction) {
      if (!acceptAction(token) || !proofCurrent() || !Number.isSafeInteger(number) || number < 1) return Promise.resolve();
      const frontier = Math.min(Math.max(1, Math.ceil(page!.totalReports / 50)), Math.floor(page!.reviewedReports / 50) + 1);
      return number <= frontier ? coverageRequest('read', number) : Promise.resolve();
    },
    confirmCoverage(value: boolean, token: MessageReviewAction) {
      if (typeof value !== 'boolean' || !acceptAction(token) || !model().coverage?.canConfirm || pageConfirmed === value) return false;
      transition = true;
      try { pageConfirmed = value; draft.confirmed = false; interaction++; emit(); return true; } finally { transition = false; }
    },
    ackCoverage(token: MessageReviewAction) { return acceptAction(token) && model().coverage?.canAcknowledge ? coverageRequest('ack') : Promise.resolve(); },
    async requestAdvice(token: MessageReviewAction) {
      if (!acceptAction(token) || !model().canRequestAdvice || !detail) return;
      const snapshot = detail, path = endpoint()! + '/advice', body = messageReviewAdviceBody(snapshot.revision, snapshot.contentHash)!;
      advice = null; draft.confirmed = false; adviceMessage = 'Checking author consent and requesting optional AI observations…'; const g = begin(adviceMessage);
      try {
        const response = await request(path, 'POST', body, g);
        if (!current(g)) return;
        const parsed = response.status === 200 ? parseMessageAdviceReceipt(response.body, snapshot.message.content) : null;
        if (!parsed || parsed.circleId !== snapshot.circle.id || parsed.messageId !== snapshot.message.id || parsed.revision !== snapshot.revision || parsed.contentHash !== snapshot.contentHash) {
          if ([401, 403, 404, 409].includes(response.status)) return deny(response.status);
          adviceMessage = 'AI advice could not be confirmed and may already have been requested. Human review remains available. No decision was made.';
        } else { advice = parsed.advice; adviceMessage = 'Unverified AI observations for this message only. Read all evidence yourself; no decision was made.'; }
      } catch { if (!current(g)) return; adviceMessage = 'AI advice was not confirmed and may already have been requested. Nothing retries automatically. Human review remains available.'; }
      busy = false; phase = 'ready'; interaction++; message = adviceMessage; emit();
    },
    async submitDecision(token: MessageReviewAction) {
      if (!acceptAction(token) || !model().canSubmit || !detail) return;
      const baseInput = decisionInput('00000000-0000-4000-8000-000000000000')!, coverageId = covered() ? sessionId! : undefined;
      const reportCount = coverageId ? page!.totalReports : detail.reports.length, path = endpoint()! + (coverageId ? '/coverage/decision' : '');
      const sendBefore = coverageId ? Date.parse(page!.expiresAt) : undefined;
      detail = null; queue = null; receipt = null; decisionConfirmed = false; clearCoverage(); clearDraft(); const g = begin('Preparing the exact reviewed decision. Nothing has been sent yet…', true);
      try {
        const requestId = await key(g, sendBefore); if (!current(g)) return;
        const input = { ...baseInput, requestId }, body = messageReviewDecisionBody(input, coverageId);
        if (!body) throw Error('Invalid decision');
        pending = { path, body, input, sessionId: coverageId, reportCount }; interaction++; message = 'Sending the exact reviewed decision…'; emit();
        if (current(g)) await sendDecision(pending!, g, sendBefore);
      } catch {
        if (!current(g)) return;
        pending = null; busy = false; phase = 'unavailable'; interaction++; message = 'The decision could not be prepared. Nothing was sent. Refresh the current case before deciding again.'; emit();
      }
    },
    retryDecision(token: MessageReviewAction) {
      if (!acceptAction(token) || !model().canRetry || !pending) return Promise.resolve();
      const exact = pending, g = begin('Retrying the exact unconfirmed decision…', true);
      return current(g) ? sendDecision(exact, g) : Promise.resolve();
    },
  };
}
export type MessageReviews = ReturnType<typeof createMessageReviews>;
