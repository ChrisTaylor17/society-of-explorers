import { isUuid } from '../../lib/ids/uuid';
import { parseCircleDecisionReceipt, parseCircleReviewDetail, parseCircleReviewQueue, validateCircleReviewInput,
  type CircleReviewInput, type CircleDecisionReceipt, type CircleReviewReason, type CircleReviewDetail, type CircleReviewQueue } from '../../lib/circles/moderation';
import { parseReviewCoveragePage, REVIEW_COVERAGE_PAGE_SIZE, type ReviewCoveragePage, type ReviewCoverageEvidence } from '../../lib/circles/review-coverage';
import { validateCircleReviewRequest, circleReviewDecisionBody, circleReviewCoverageStartBody,
  circleReviewCoverageAckBody } from '../../lib/circles/circle-review-wire';
import { approvedOrigin, type BearerCircleOwner, type CircleTransport } from '../native/src/circles/host';

export type CircleReviewAction = {
  contextRevision: number; interactionRevision: number; circleId: string | null;
  revision: number | null; sessionId: string | null; pageToken: string | null;
};
export type CircleReviewDraft = { action: '' | 'hide' | 'restore'; reason: '' | CircleReviewReason; summary: string; source: string; excerpt: string; confirmed: boolean };
export type CircleReviewCoverageModel = {
  page: ReviewCoveragePage | null; sessionId: string | null; confirmed: boolean; message: string;
  canStart: boolean; canRefresh: boolean; canPrevious: boolean; canNext: boolean; canFrontier: boolean; canConfirm: boolean; canAcknowledge: boolean;
};
export type CircleReviewsModel = {
  connected: boolean; active: boolean; online: boolean; busy: boolean;
  phase: 'idle' | 'loading' | 'ready' | 'sending' | 'unknown' | 'confirmed' | 'unavailable' | 'closed';
  queue: CircleReviewQueue | null; selected: { circleId: string } | null; detail: CircleReviewDetail | null;
  draft: CircleReviewDraft; evidence: ReviewCoverageEvidence | null; coverage: CircleReviewCoverageModel | null;
  receipt: CircleDecisionReceipt | null; decisionConfirmed: boolean; pendingDecision: boolean; message: string;
  canLoadQueue: boolean; canNextQueue: boolean; canSelect: boolean; canRefreshCase: boolean; canBack: boolean; canEditDraft: boolean;
  canConfirm: boolean; canSubmit: boolean; canRetry: boolean; canNavigate: boolean; action: CircleReviewAction;
};
type Config = { owner: BearerCircleOwner; origin: string; circleReviewerTransport: CircleTransport; newRequestId: () => Promise<string>; timeoutMs?: number; initialOnline?: boolean };
type Pending = { path: string; body: string; input: CircleReviewInput; sessionId?: string; reportCount: number };
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const lowerUuid = (value: unknown): value is string => isUuid(value) && value === value.toLowerCase();
const blank = (): CircleReviewDraft => ({ action: '', reason: '', summary: '', source: 'title', excerpt: '', confirmed: false });
const queuePath = '/api/admin/circles/reports';
const actionKeys = 'circleId,contextRevision,interactionRevision,pageToken,revision,sessionId';
class ReviewFailure extends Error { constructor(public sent = false) { super('Review request unavailable'); } }

/** Private assigned-review workflow. A capability enables the lane, never a role.
 * All authority comes from fresh canonical server checks, with no durable drafts. */
export function createCircleReviews(config: Config) {
  const origin = approvedOrigin(config.origin), timeout = config.timeoutMs ?? 15000;
  if (!config.owner || !['scope', 'bearer', 'subscribe'].every(key => typeof config.owner[key as keyof BearerCircleOwner] === 'function')
    || typeof config.circleReviewerTransport !== 'function' || typeof config.newRequestId !== 'function'
    || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000
    || config.initialOnline !== undefined && typeof config.initialOnline !== 'boolean') throw Error('Verified reviewer connection required');
  let attached = false, active = true, online = config.initialOnline ?? false, scope: string | null = null;
  let generation = 0, bindingRevision = 0, contextRevision = 0, interaction = 0, busy = false, transition = false;
  let phase: CircleReviewsModel['phase'] = 'closed', queue: CircleReviewQueue | null = null;
  let selected: CircleReviewsModel['selected'] = null, detail: CircleReviewDetail | null = null, draft = blank();
  let page: ReviewCoveragePage | null = null, sessionId: string | null = null, coverageTotal: number | null = null, pageConfirmed = false;
  let evidence: ReviewCoverageEvidence | null = null;
  let receipt: CircleDecisionReceipt | null = null, decisionConfirmed = false, pending: Pending | null = null;
  let message = 'Check assigned Circle listing reviews when ready. Access is verified by the server.';
  let coverageMessage = 'Start a full review to read and acknowledge every report page.';
  let offOwner = () => {}, expiryTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<(model: CircleReviewsModel) => void>(), requests = new Set<AbortController>();
  const enabled = () => {
    try { return attached && active && online && scope !== null && config.owner.scope() === scope; } catch { return false; }
  };
  const current = (g: number) => enabled() && generation === g;
  const endpoint = () => selected ? `/api/admin/circles/reports/${selected.circleId}` : null;
  const proofCurrent = () => !!detail && !!page && page.circleId === detail.circle.id && page.messageId === null
    && page.revision === detail.revision && page.contentHash === null && Date.parse(page.expiresAt) > Date.now();
  const covered = () => proofCurrent() && page!.complete;
  const decisionReady = () => enabled() && !busy && !pending && !!detail && (detail.complete || covered()) && detail.revision < Number.MAX_SAFE_INTEGER;
  const hasEvidence = (excerpt: string) => draft.source === 'title' || draft.source === 'description'
    ? !!detail?.circle[draft.source]?.includes(excerpt)
    : (evidence?.id === draft.source ? evidence.note : detail?.reports.find(report => report.id === draft.source)?.note)?.includes(excerpt) === true;
  function decisionInput(requestId: string): CircleReviewInput | null {
    if (!detail) return null;
    const parsed = validateCircleReviewInput({ expectedRevision: detail.revision, requestId,
      action: draft.action, reason: draft.reason, summary: draft.summary, evidenceReportId: draft.action === 'hide' && draft.source !== 'title' && draft.source !== 'description' ? draft.source : null,
      evidenceExcerpt: draft.action === 'hide' ? draft.excerpt : null });
    if (!parsed.ok || !circleReviewDecisionBody(parsed.value) || parsed.value.action === 'hide' && !hasEvidence(parsed.value.evidenceExcerpt!)) return null;
    return parsed.value;
  }
  const action = (): CircleReviewAction => ({ contextRevision, interactionRevision: interaction, circleId: selected?.circleId ?? null,
    revision: detail?.revision ?? null, sessionId, pageToken: page?.pageToken ?? null });
  const model = (): CircleReviewsModel => {
    const usable = enabled() && !busy, ready = decisionReady(), valid = ready && !!decisionInput('00000000-0000-4000-8000-000000000000');
    const livePage = proofCurrent(), frontier = livePage ? Math.min(Math.max(1, Math.ceil(page!.totalReports / REVIEW_COVERAGE_PAGE_SIZE)), Math.floor(page!.reviewedReports / REVIEW_COVERAGE_PAGE_SIZE) + 1) : 0;
    return copy({ connected: attached && scope !== null, active, online, busy, phase, queue, selected, detail, draft, evidence, receipt,
      decisionConfirmed, pendingDecision: pending !== null, message,
      coverage: detail && !detail.complete ? { page, sessionId, confirmed: pageConfirmed, message: coverageMessage,
        canStart: usable && !pending, canRefresh: usable && !pending && sessionId !== null,
        canPrevious: usable && livePage && page!.pageNumber > 1, canNext: usable && livePage && page!.pageNumber < frontier,
        canFrontier: usable && livePage && page!.pageNumber < frontier, canConfirm: usable && livePage && !page!.acknowledged && !page!.complete,
        canAcknowledge: usable && livePage && !page!.acknowledged && !page!.complete && pageConfirmed } : null,
      canLoadQueue: usable, canNextQueue: usable && queue?.nextCursor !== null && queue !== null,
      canSelect: usable && !!queue?.items.length, canRefreshCase: usable && selected !== null && !pending,
      canBack: usable && (selected !== null || queue !== null), canEditDraft: ready, canConfirm: valid, canSubmit: valid && draft.confirmed,
      canRetry: usable && pending !== null,
      canNavigate: !busy, action: action() });
  };
  const emit = () => { for (const listener of listeners) { try { listener(model()); } catch { /* Independent observer. */ } } };
  function clearDraft() { draft = blank(); evidence = null; pageConfirmed = false; }
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
  function sameAction(value: CircleReviewAction) {
    expire();
    if (!value || typeof value !== 'object' || Object.keys(value).sort().join(',') !== actionKeys) return false;
    const expected = action();
    return (Object.keys(expected) as (keyof CircleReviewAction)[]).every(key => value[key] === expected[key]);
  }
  function acceptAction(value: CircleReviewAction) { return !transition && enabled() && !busy && sameAction(value); }
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
    if (!validateCircleReviewRequest(path, { method, body })) throw new ReviewFailure();
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
        const response = await config.circleReviewerTransport(origin + path, { method, body, credentials: 'omit', redirect: 'error', cache: 'no-store', signal: abort.signal,
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
  function receiveDetail(value: unknown, circleId: string, minimumRevision = 0) {
    const parsed = parseCircleReviewDetail(value);
    if (!parsed || parsed.circle.id !== circleId || parsed.revision < minimumRevision) return false;
    detail = parsed.complete ? parsed : { ...parsed, reports: [] }; clearCoverage(); clearDraft();
    coverageMessage = 'Start a full review to read and acknowledge every report page.'; return true;
  }
  async function loadQueue(token: CircleReviewAction, after: string | null = null) {
    if (!acceptAction(token) || after !== null && (!model().canNextQueue || after !== queue?.nextCursor)) return;
    const earlierMayComplete = pending !== null;
    contextRevision++; queue = null; clearCase(); const g = begin('Checking assigned Circle listing reviews…');
    try {
      const response = await request(queuePath + (after ? '?after=' + after : ''), 'GET', undefined, g);
      if (!current(g)) return;
      const parsed = response.status === 200 ? parseCircleReviewQueue(response.body) : null;
      let cursor = after;
      if (!parsed || parsed.items.some(item => { const bad = !lowerUuid(item.id) || cursor !== null && item.id <= cursor; cursor = item.id; return bad; })) return deny(response.status);
      queue = parsed; busy = false; phase = 'ready'; interaction++;
      message = (earlierMayComplete ? 'A previously sent decision may still complete. ' : '')
        + (parsed.items.length ? 'Assigned Circle listing reviews loaded. Open a case to check current evidence.' : 'No assigned Circle listing reviews were returned on this page.'); emit();
    } catch { if (current(g)) deny(); }
  }
  async function loadCase(circleId: string) {
    contextRevision++; queue = null; clearCase(); selected = { circleId }; const g = begin('Loading current Circle listing and reports…');
    try {
      const response = await request(endpoint()!, 'GET', undefined, g);
      if (!current(g)) return;
      if (response.status !== 200 || !receiveDetail(response.body, circleId)) return deny(response.status);
      busy = false; phase = 'ready'; interaction++; message = 'Current case loaded. A report is an allegation, not a finding.'; emit();
    } catch { if (current(g)) deny(); }
  }
  function edit(token: CircleReviewAction, work: () => void, allowed = model().canEditDraft) {
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
    if (!parsed || !detail || parsed.circleId !== detail.circle.id || parsed.messageId !== null || parsed.revision !== detail.revision
      || parsed.contentHash !== null || expectedSession !== null && parsed.sessionId !== expectedSession
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
    const body = kind === 'start' ? circleReviewCoverageStartBody(detail.revision)
      : kind === 'ack' && page ? circleReviewCoverageAckBody(page.sessionId, page.pageToken) : undefined;
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
  async function sendDecision(exact: Pending, g: number, sendBefore?: number, retry = false) {
    try {
      const response = await request(exact.path, 'POST', exact.body, g, sendBefore);
      if (!current(g)) return;
      const parsed = response.status === 200 ? parseCircleDecisionReceipt(response.body) : null;
      const receivedSession = response.body && typeof response.body === 'object' && 'sessionId' in response.body ? response.body.sessionId : undefined;
      const valid = parsed && selected && parsed.circleId === selected.circleId
        && parsed.requestId === exact.input.requestId && parsed.decision.action === exact.input.action && parsed.decision.reason === exact.input.reason
        && parsed.decision.summary === exact.input.summary && parsed.decision.report_count === exact.reportCount
        && receivedSession === exact.sessionId && (parsed.replayed ? parsed.revision > exact.input.expectedRevision : parsed.revision === exact.input.expectedRevision + 1)
        && (parsed.replayed || parsed.hidden === (exact.input.action === 'hide'));
      if (!valid) {
        if (!retry && [400, 401, 403, 404, 409, 413, 429].includes(response.status)) return deny(response.status);
        busy = false; phase = 'unknown'; interaction++; message = 'An earlier decision may have been saved, even if this retry was refused. Retry this exact decision manually, or leave and load a fresh queue. A read cannot confirm its receipt.'; emit(); return;
      }
      pending = null; receipt = parsed; decisionConfirmed = true; phase = 'confirmed'; interaction++; message = 'Decision confirmed. Checking the current case before another decision…'; emit();
      if (!current(g)) return;
      try {
        const fresh = await request(endpoint()!, 'GET', undefined, g);
        if (!current(g)) return;
        if ([401, 403, 404, 409].includes(fresh.status)) return deny(fresh.status, true);
        if (fresh.status !== 200 || !receiveDetail(fresh.body, parsed.circleId, parsed.revision)) throw Error('Current case unavailable');
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
    subscribe(listener: (value: CircleReviewsModel) => void) { listeners.add(listener); listener(model()); return () => { listeners.delete(listener); }; },
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
        scope = nextScope; retire('Check assigned Circle listing reviews when ready. Access is verified by the server.');
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
    loadQueue: (token: CircleReviewAction) => loadQueue(token),
    nextQueue(token: CircleReviewAction) { return model().canNextQueue ? loadQueue(token, queue!.nextCursor) : Promise.resolve(); },
    openCase(circleId: string, token: CircleReviewAction) {
      if (!acceptAction(token) || !model().canSelect || !lowerUuid(circleId) || !queue!.items.some(item => item.id === circleId)) return Promise.resolve();
      return loadCase(circleId);
    },
    refreshCase(token: CircleReviewAction) { return acceptAction(token) && model().canRefreshCase && selected ? loadCase(selected.circleId) : Promise.resolve(); },
    back(token: CircleReviewAction) { if (acceptAction(token) && model().canBack) retire('Private case and exact retry cleared. A sent decision may still complete. Load assignments when ready.'); },
    setAction(value: string, token: CircleReviewAction) { return ['', 'hide', 'restore'].includes(value) && edit(token, () => { draft.action = value as CircleReviewDraft['action']; draft.reason = ''; draft.excerpt = ''; }); },
    setReason(value: string, token: CircleReviewAction) {
      const reasons = draft.action === 'hide' ? ['safety', 'harassment', 'spam', 'misleading'] : draft.action === 'restore' ? ['no_violation', 'insufficient_evidence', 'resolved'] : [];
      return (value === '' || reasons.includes(value)) && edit(token, () => { draft.reason = value as CircleReviewDraft['reason']; });
    },
    setSummary(value: string, token: CircleReviewAction) { return typeof value === 'string' && value.length <= 1000 && edit(token, () => { draft.summary = value; }); },
    setExcerpt(value: string, token: CircleReviewAction) { return typeof value === 'string' && value.length <= 500 && edit(token, () => { draft.excerpt = value; }); },
    setEvidence(source: string, token: CircleReviewAction) {
      if (!detail || typeof source !== 'string') return false;
      const reports = detail.complete ? detail.reports : proofCurrent() ? page!.reports : [];
      const report = reports.find(item => item.id === source);
      if (source !== 'title' && source !== 'description' && (!report?.note || report.note.trim().length < 5)) return false;
      return edit(token, () => { evidence = report ? { id: report.id, note: report.note, label: 'Report ' + ((page ? (page.pageNumber - 1) * 50 : 0) + reports.indexOf(report) + 1) } : null; draft.source = source; draft.excerpt = ''; }, !pending);
    },
    confirmDecision(value: boolean, token: CircleReviewAction) {
      if (typeof value !== 'boolean' || !acceptAction(token) || !model().canConfirm || draft.confirmed === value) return false;
      transition = true;
      try { draft.confirmed = value; interaction++; emit(); return true; } finally { transition = false; }
    },
    startCoverage(token: CircleReviewAction) { return acceptAction(token) && model().coverage?.canStart ? coverageRequest('start') : Promise.resolve(); },
    refreshCoverage(token: CircleReviewAction) { return acceptAction(token) && model().coverage?.canRefresh ? coverageRequest('read') : Promise.resolve(); },
    openCoveragePage(number: number, token: CircleReviewAction) {
      if (!acceptAction(token) || !proofCurrent() || !Number.isSafeInteger(number) || number < 1) return Promise.resolve();
      const frontier = Math.min(Math.max(1, Math.ceil(page!.totalReports / 50)), Math.floor(page!.reviewedReports / 50) + 1);
      return number <= frontier ? coverageRequest('read', number) : Promise.resolve();
    },
    confirmCoverage(value: boolean, token: CircleReviewAction) {
      if (typeof value !== 'boolean' || !acceptAction(token) || !model().coverage?.canConfirm || pageConfirmed === value) return false;
      transition = true;
      try { pageConfirmed = value; draft.confirmed = false; interaction++; emit(); return true; } finally { transition = false; }
    },
    ackCoverage(token: CircleReviewAction) { return acceptAction(token) && model().coverage?.canAcknowledge ? coverageRequest('ack') : Promise.resolve(); },
    async submitDecision(token: CircleReviewAction) {
      if (!acceptAction(token) || !model().canSubmit || !detail) return;
      const baseInput = decisionInput('00000000-0000-4000-8000-000000000000')!, coverageId = covered() ? sessionId! : undefined;
      const reportCount = coverageId ? page!.totalReports : detail.reports.length, path = endpoint()! + (coverageId ? '/coverage/decision' : '');
      const sendBefore = coverageId ? Date.parse(page!.expiresAt) : undefined;
      detail = null; queue = null; receipt = null; decisionConfirmed = false; clearCoverage(); clearDraft(); const g = begin('Preparing the exact reviewed decision. Nothing has been sent yet…', true);
      try {
        const requestId = await key(g, sendBefore); if (!current(g)) return;
        const input = { ...baseInput, requestId }, body = circleReviewDecisionBody(input, coverageId);
        if (!body) throw Error('Invalid decision');
        pending = { path, body, input, sessionId: coverageId, reportCount }; interaction++; message = 'Sending the exact reviewed decision…'; emit();
        if (current(g)) await sendDecision(pending!, g, sendBefore);
      } catch {
        if (!current(g)) return;
        pending = null; busy = false; phase = 'unavailable'; interaction++; message = 'The decision could not be prepared. Nothing was sent. Refresh the current case before deciding again.'; emit();
      }
    },
    retryDecision(token: CircleReviewAction) {
      if (!acceptAction(token) || !model().canRetry || !pending) return Promise.resolve();
      const exact = pending, g = begin('Retrying the exact unconfirmed decision…', true);
      return current(g) ? sendDecision(exact, g, undefined, true) : Promise.resolve();
    },
  };
}
export type CircleReviews = ReturnType<typeof createCircleReviews>;
