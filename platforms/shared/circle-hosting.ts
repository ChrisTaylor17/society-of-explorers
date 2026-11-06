import { parseCircleReadingEditionResponse, type CircleReadingEditionResponse, getReadingEdition, matchesReadingEdition } from '../../lib/circles/reading-program';
import { validateCircleInput, type CircleInput } from '../../lib/circles/schedule';
import { parseCircleDetail } from '../../lib/circles/membership';
import { parseCircleCreateMutation, circleCreateMutationBody, parseCircleHostingAccess, parseOwnedCircleCreateReceipt,
  type CircleCreateMutation, type CircleHostingAccess } from '../../lib/circles/hosting';
import { isUuid } from '../../lib/ids/uuid';
import { approvedOrigin, type CircleTransport } from '../native/src/circles/host';
import type { VerifiedAccountOwner } from '../native/src/circles/verified-member-session';

export type CircleHostingConfig = { origin: string; memberId: string; owner: VerifiedAccountOwner; transport: CircleTransport;
  hostingTransport: CircleTransport; editionTransport?: CircleTransport; newRequestId?: () => Promise<string>;
  timeoutMs?: number; initialOnline?: boolean; now?: () => Date };
export type CircleHostingModel = {
  connected: boolean; active: boolean; online: boolean; busy: boolean;
  phase: 'idle' | 'checking' | 'editing' | 'loading-edition' | 'review' | 'sending' | 'unknown' | 'created' | 'unavailable' | 'closed';
  eligibility: Omit<CircleHostingAccess, 'memberId'> | null; edition: CircleReadingEditionResponse | null;
  review: CircleInput | null; confirmed: boolean; retryReview: boolean; created: { circleId: string; current: boolean } | null;
  message: string; canCheck: boolean; canEdit: boolean; canLoadEdition: boolean; canReview: boolean;
  canConfirm: boolean; canCancel: boolean; canRetry: boolean; canCheckCreated: boolean; canStartAnother: boolean; canNavigate: boolean;
};
type Pending = { mutation: CircleCreateMutation; body: string; subject: string; sent: boolean };
type Created = { circleId: string; minimumRevision: number; subject: string };
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const presentation = (v: CircleCreateMutation): CircleInput => {
  return copy({ title: v.title, description: v.description, format: v.format, city: v.city, region: v.region,
    venueName: v.venueName, venueType: v.venueType, weekday: v.weekday, time: v.time, timezone: v.timezone,
    startDate: v.startDate, maxMembers: v.maxMembers, onlineUrl: v.onlineUrl,
    ...(v.readingProgram ? { readingProgram: v.readingProgram } : {}) });
};

/** A verified member owns one retained creation attempt. Lifecycle retirement
 * hides its private listing, while only terminal Close discards a sent key. */
export function createCircleHosting(config: CircleHostingConfig) {
  const origin = approvedOrigin(config.origin), memberId = config.memberId, timeout = config.timeoutMs ?? 15000;
  if (!isUuid(memberId) || memberId !== memberId.toLowerCase() || typeof config.owner?.scope !== 'function'
    || typeof config.owner.credentials !== 'function' || typeof config.owner.subscribe !== 'function'
    || typeof config.transport !== 'function' || typeof config.hostingTransport !== 'function'
    || config.editionTransport !== undefined && typeof config.editionTransport !== 'function'
    || config.newRequestId !== undefined && typeof config.newRequestId !== 'function'
    || config.now !== undefined && typeof config.now !== 'function'
    || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000
    || config.initialOnline !== undefined && typeof config.initialOnline !== 'boolean') throw Error('Verified Circle hosting connection required');
  let attached = false, closed = false, active = true, online = config.initialOnline ?? false, scope: string | null = null;
  let generation = 0, attachment = 0, busy = false, boundSubject: string | null = null, offOwner = () => {};
  let phase: CircleHostingModel['phase'] = 'closed', eligibility: CircleHostingModel['eligibility'] = null;
  let edition: CircleReadingEditionResponse | null = null, review: CircleInput | null = null, confirmed = false, retryReview = false;
  let pending: Pending | null = null, known: Created | null = null, created: CircleHostingModel['created'] = null;
  let message = 'Check hosting access before preparing your free Circle.';
  const listeners = new Set<(model: CircleHostingModel) => void>(), requests = new Set<AbortController>();
  const enabled = () => !closed && attached && active && online && scope !== null && config.owner.scope() === scope;
  const model = (): CircleHostingModel => {
    const visible = enabled(), usable = visible && !busy;
    return { connected: attached && scope !== null && config.owner.scope() === scope, active, online, busy, phase,
      eligibility: visible ? copy(eligibility) : null, edition: visible ? copy(edition) : null, review: visible ? copy(review) : null,
      confirmed: visible && confirmed, retryReview: visible && retryReview, created: visible ? copy(created) : null, message,
      canCheck: usable && phase !== 'review', canEdit: usable && phase === 'editing' && Boolean(eligibility?.canCreate) && !pending && !known,
      canLoadEdition: usable && phase === 'editing' && Boolean(eligibility?.canCreate && config.editionTransport) && !pending && !known,
      canReview: usable && phase === 'editing' && Boolean(eligibility?.canCreate && config.newRequestId) && !pending && !known,
      canConfirm: usable && phase === 'review' && review !== null && confirmed,
      canCancel: usable && phase === 'review', canRetry: usable && phase === 'unknown' && pending?.sent === true,
      canCheckCreated: usable && known !== null && phase !== 'review',
      canStartAnother: usable && phase === 'created' && created?.current === true && known !== null && pending === null,
      canNavigate: !busy && phase !== 'review' && pending === null };
  };
  const emit = () => { for (const listener of listeners) { try { listener(model()); } catch { /* Observers grant no authority. */ } } };
  function clearView(notice: string) {
    generation++; for (const request of requests) request.abort(); busy = false; eligibility = null; edition = null; review = null;
    created = null; confirmed = false; retryReview = false; if (pending && !pending.sent) pending = null;
    phase = attached ? pending ? 'unknown' : 'idle' : 'closed'; message = notice; emit();
  }
  const uncertain = () => {
    phase = 'unknown'; review = null; edition = null; confirmed = false; retryReview = false;
    message = 'A Circle may already have been created. Review only the exact original request before retrying. Nothing retries automatically.';
  };
  async function run(action: 'check' | 'edition' | 'review' | 'retry' | 'create', input?: Record<string, unknown>, bookId?: string) {
    const m = model();
    if (action === 'create' ? !m.canConfirm : action === 'retry' ? !m.canRetry : action === 'edition' ? !m.canLoadEdition : action === 'review' ? !m.canReview : !m.canCheck) return;
    if (action === 'edition' && (!bookId || !getReadingEdition(bookId))) return;
    const chosen = action === 'create' ? copy(review!) : null, earlier = pending;
    const g = ++generation, expectedScope = scope!, abort = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    let operationSubject: string | null = null, sent = false, discardedCreation = false;
    const current = () => enabled() && generation === g && scope === expectedScope && !abort.signal.aborted;
    const visible = () => enabled() && generation === g && scope === expectedScope;
    busy = true; confirmed = false; review = null; retryReview = false; created = null;
    phase = action === 'create' ? 'sending' : action === 'edition' ? 'loading-edition' : 'checking';
    message = action === 'create' ? 'Checking the current account before creating the reviewed Circle…' : 'Checking current hosting access…';
    if (action === 'edition') edition = null;
    requests.add(abort); emit();
    const request = async (path: string, method: 'GET' | 'POST', lane: CircleTransport, body?: string, anonymous = false, markSent = false) => {
      if (!current()) throw Error('Hosting lifetime ended');
      let headers: Record<string, string> = {};
      if (!anonymous) {
        const proof = await config.owner.credentials(expectedScope);
        if (!current() || !proof || !isUuid(proof.subject) || typeof proof.bearer !== 'string' || proof.bearer.length > 16377
          || !/^[A-Za-z0-9._~+/-]+=*$/.test(proof.bearer)) throw Error('Hosting owner unavailable');
        const subject = proof.subject.toLowerCase();
        if (boundSubject !== null && boundSubject !== subject || operationSubject !== null && operationSubject !== subject
          || pending && pending.subject !== subject || known && known.subject !== subject) {
          discardedCreation = pending?.sent === true || known !== null;
          pending = null; known = null; boundSubject = null; throw Error('Hosting owner changed');
        }
        operationSubject = subject;
        headers = { Authorization: `Bearer ${proof.bearer}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) };
      }
      if (!current()) throw Error('Hosting lifetime ended');
      if (markSent) { if (!pending) throw Error('No exact request'); pending.sent = true; sent = true; }
      const url = origin + path;
      const response = await lane(url, { method, headers, ...(body === undefined ? {} : { body }),
        redirect: 'error', credentials: 'omit', cache: 'no-store', signal: abort.signal });
      if (!current() || response.url !== url || response.redirected !== false || !Number.isInteger(response.status)) throw Error('Hosting response refused');
      const payload = await response.json(); if (!current()) throw Error('Hosting lifetime ended');
      return { status: response.status, body: payload };
    };
    const access = async () => {
      const result = await request('/api/circles/start', 'GET', config.hostingTransport);
      if (!current()) throw Error('Hosting lifetime ended');
      const parsed = result.status === 200 ? parseCircleHostingAccess(result.body) : null;
      if (parsed && parsed.memberId !== memberId) { discardedCreation = pending?.sent === true || known !== null;
        pending = null; known = null; boundSubject = null; throw Error('Hosting member changed'); }
      if (!parsed) throw Error('Hosting access unverified');
      boundSubject = operationSubject;
      eligibility = { canCreate: parsed.canCreate, activeHosted: parsed.activeHosted, maxActiveHosted: parsed.maxActiveHosted };
      return parsed;
    };
    const verifyEdition = async (id: string) => {
      if (!config.editionTransport) throw Error('Edition connection unavailable');
      const result = await request('/api/great-books/text/' + id, 'GET', config.editionTransport, undefined, true);
      if (!current()) throw Error('Hosting lifetime ended');
      const parsed = result.status === 200 ? parseCircleReadingEditionResponse(result.body) : null, pin = getReadingEdition(id);
      if (!parsed || !pin || !matchesReadingEdition(parsed, pin)) throw Error('Edition unverified');
      return parsed;
    };
    const readCreated = async () => {
      if (!known) throw Error('Creation unavailable');
      created = { circleId: known.circleId, current: false };
      const result = await request('/api/circles/' + known.circleId, 'GET', config.transport);
      if (!current()) throw Error('Hosting lifetime ended');
      const detail = result.status === 200 ? parseCircleDetail(result.body, known.circleId) : null;
      if (!detail || !detail.viewer.signed_in || !detail.viewer.is_host || detail.revision < known.minimumRevision) throw Error('Created Circle access unverified');
      created = { circleId: known.circleId, current: true }; phase = 'created';
      message = 'Circle creation confirmed and current hosting access checked. Open My Circles to continue.';
    };
    try {
      await Promise.race([(async () => {
        const checked = await access(); if (!current()) return;
        if (action === 'check') {
          if (known) { await readCreated(); if (!current()) return; }
          else if (pending?.sent) uncertain();
          else { phase = 'editing'; message = checked.canCreate ? 'Hosting access checked. Prepare and review your listing before creating it.'
            : `Hosting is currently unavailable. You host ${checked.activeHosted} active Circles; the limit is ${checked.maxActiveHosted}. A temporary creation limit may also apply.`; }
          return;
        }
        if (action === 'retry') {
          if (!pending?.sent) throw Error('No exact retry');
          review = presentation(pending.mutation); retryReview = true; phase = 'review';
          message = 'Review the original listing and private link. This exact retry keeps its original request ID, even if current hosting limits or dates have changed.'; return;
        }
        if (action === 'create') {
          if (!earlier && !checked.canCreate) throw Error('Hosting limit changed');
          if (!earlier) {
            if (!chosen || !config.newRequestId || !operationSubject) throw Error('No reviewed listing');
            const key = await config.newRequestId(); if (!current()) return;
            const mutation = parseCircleCreateMutation({ expectedMemberId: memberId, requestId: typeof key === 'string' ? key.toLowerCase() : key, ...chosen });
            if (!mutation) throw Error('Creation request unverified');
            pending = { mutation, body: circleCreateMutationBody(mutation), subject: operationSubject, sent: false };
          }
          const exact = pending; if (!exact) throw Error('No exact request');
          const result = await request('/api/circles', 'POST', config.hostingTransport, exact.body, false, true);
          if (!current()) return;
          const receipt = [200, 201].includes(result.status) ? parseOwnedCircleCreateReceipt(result.body, exact.mutation.requestId, memberId) : null;
          if (!receipt || receipt.state.revision < 1) {
            if (!earlier && [400, 401, 403, 404, 409, 413, 415, 429].includes(result.status)) { pending = null; throw Error('Creation refused'); }
            throw Error('Creation unknown');
          }
          known = { circleId: receipt.circleId, minimumRevision: receipt.state.revision, subject: exact.subject }; pending = null;
          await readCreated(); if (!current()) return; return;
        }
        if (!checked.canCreate) throw Error('Hosting unavailable');
        if (action === 'edition') { const metadata = await verifyEdition(bookId!); if (!current()) return; edition = metadata; phase = 'editing'; message = 'Pinned source edition verified. Choose and review the weekly reading ranges.'; return; }
        const parsed = validateCircleInput(input!, config.now?.() ?? new Date());
        if (!parsed.ok) throw Error('Listing invalid');
        if (parsed.value.readingProgram) {
          const metadata = await verifyEdition(parsed.value.readingProgram.bookId); if (!current()) return;
          if (!matchesReadingEdition(metadata, parsed.value.readingProgram)) throw Error('Reading plan changed'); edition = metadata;
        }
        review = copy(parsed.value); phase = 'review'; message = 'Current hosting access checked. Review the public listing, private link, reading plan and community norms before confirming.';
      })(), new Promise<never>((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(Error('Hosting deadline')); }, timeout); }),
      new Promise<never>((_, reject) => abort.signal.addEventListener('abort', () => reject(Error('Hosting retired')), { once: true }))]);
    } catch {
      if (!visible()) return;
      if (pending?.sent) uncertain();
      else if (known) { created = { circleId: known.circleId, current: false }; phase = 'created';
        message = 'Creation was confirmed, but current hosting access could not be checked. Check the created Circle or My Circles before another change.'; }
      else { pending = null; review = null; confirmed = false; retryReview = false; eligibility = null; edition = null; phase = 'unavailable';
        message = discardedCreation ? 'The current account changed. Earlier retry information was discarded; a Circle may already have been created for the earlier account. Check that account’s My Circles before listing another.'
          : sent ? 'The creation request was refused. Check hosting access before preparing another listing.' : 'Hosting access or the proposed listing could not be verified. Check your account and details before continuing.'; }
    } finally {
      clearTimeout(timer); requests.delete(abort);
      if (visible()) { busy = false; emit(); }
    }
  }
  return {
    model, subscribe(listener: (value: CircleHostingModel) => void) { listeners.add(listener); listener(model()); return () => { listeners.delete(listener); }; },
    connect() {
      if (attached || closed) return; attached = true; const at = ++attachment;
      const stop = config.owner.subscribe(() => { if (!attached || closed || at !== attachment) return; scope = config.owner.scope(); clearView('Account access changed. Private hosting details cleared. Check this member account before recovering an earlier request.'); });
      if (!attached || closed || at !== attachment) { stop(); return; } offOwner = stop; scope = config.owner.scope();
      clearView('Check hosting access when ready. An earlier retained request never retries automatically.');
    },
    disconnect() { attachment++; attached = false; scope = null; offOwner(); offOwner = () => {}; clearView('Hosting view hidden. A sent request is retained privately and may still complete.'); },
    activity(value: boolean) { active = value; if (!value) clearView('Private hosting fields hidden while inactive. A sent request may still complete; check current access before recovering it.'); else emit(); },
    connectivity(value: boolean) { online = value; if (!value) clearView('Private hosting fields hidden while offline. Reconnect and check current access manually.'); else emit(); },
    check() { return run('check'); }, loadEdition(bookId: string) { return run('edition', undefined, bookId); },
    review(input: Record<string, unknown>, normsAgreed: boolean) { if (!model().canReview) return Promise.resolve();
      if (!normsAgreed) { message = 'Review and agree to the community norms before preparing a listing.'; emit(); return Promise.resolve(); }
      const parsed = validateCircleInput(input, config.now?.() ?? new Date()); if (!parsed.ok) { message = parsed.error; emit(); return Promise.resolve(); }
      return run('review', copy(parsed.value) as unknown as Record<string, unknown>); },
    confirm(value: boolean) { if (!enabled() || busy || phase !== 'review' || !review) return; confirmed = value === true; emit(); },
    create() { return run('create'); }, reviewRetry() { return run('retry'); },
    cancel() { if (!model().canCancel) return; review = null; confirmed = false; retryReview = false;
      if (pending) uncertain(); else { phase = 'editing'; message = 'Review cancelled. Nothing was created.'; } emit(); },
    checkCreated() { return known ? run('check') : Promise.resolve(); },
    startAnother() { if (!model().canStartAnother) return; known = null; clearView('New Circle draft. Check current hosting access before preparing another listing.'); },
    close() { if (closed) return; closed = true; attachment++; attached = false; scope = null; offOwner(); offOwner = () => {};
      pending = null; known = null; boundSubject = null; clearView('Hosting view closed and retry information discarded. A sent request may still have created a Circle; check My Circles before listing another.'); },
  };
}
export type CircleHosting = ReturnType<typeof createCircleHosting>;
