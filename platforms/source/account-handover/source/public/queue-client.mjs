import { PLAN_ID, PERSONAS, EXPECTED_BACKEND_SHA256 } from './queue-fixture-contract.mjs';

const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const integer = x => Number.isSafeInteger(x) && x >= 1;
const identifier = x => typeof x === 'string' && /^[a-zA-Z0-9._:-]{1,100}$/.test(x);
const exact = (x, required, optional = []) => object(x) && required.every(k => Object.hasOwn(x, k)) && Object.keys(x).every(k => [...required, ...optional].includes(k));
const validPresentation = x => exact(x, ['replayed', 'authorityCurrent']) && typeof x.replayed === 'boolean' && typeof x.authorityCurrent === 'boolean';
const stable = x => Array.isArray(x) ? `[${x.map(stable).join(',')}]` : object(x) ? `{${Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + stable(x[k])).join(',')}}` : JSON.stringify(x);
export async function hashBody(body) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable(body))))].map(x => x.toString(16).padStart(2, '0')).join('');
}
const nonnegative = x => Number.isSafeInteger(x) && x >= 0;
function validSnapshot(value, actor) {
  const d=value?.data;
  if (value?.contract !== 'safety-queue-v1' || value.status !== 'ok' || !integer(value.version) || !object(d) || !Array.isArray(d.assignments) || !Array.isArray(d.holds)) return false;
  if (!d.assignments.every(a => identifier(a.assignmentId) && a.planId===PLAN_ID && ['lead','safety','safety_triage'].includes(a.role) && a.status==='active' && integer(a.epoch)) || !d.holds.every(h => identifier(h.holdId) && ['held','resumed','cancelled'].includes(h.state))) return false;
  if (actor.view==='requester') return Array.isArray(d.requests) && Array.isArray(d.audit) && Array.isArray(d.reportRefs) && !Object.hasOwn(d,'offers') && !Object.hasOwn(d,'handoffs') && !Object.hasOwn(value,'privateRevision') && d.requests.every(r => identifier(r.requestId) && identifier(r.holdId) && ['queued','closed'].includes(r.state));
  return value.revisionDomain===`safety-queue-v1:${actor.view}:${PLAN_ID}:${actor.id}` && nonnegative(value.privateRevision) && Array.isArray(d.offers) && d.offers.every(h => identifier(h.handoffId) && identifier(h.holdId) && identifier(h.recipientAssignmentId) && integer(h.epochAtRequest) && ['requested','acknowledged','declined'].includes(h.state)) && (actor.view!=='triage' || Array.isArray(d.cases) && d.cases.every(r => identifier(r.requestId) && identifier(r.holdId) && typeof r.open==='boolean' && typeof r.escalationRequired==='boolean'));
}
function validReceipt(value,intent) {
 const d=value?.data, priv=['review-dispatch','review-escalate','handoff-ack'].includes(intent.endpoint);
 const extra=intent.endpoint==='hold'?['holdId']:intent.endpoint==='handoff-ack'?['holdId','handoffId']:['holdId','requestId'];
 if(!exact(value,['status','version','data',...(priv?['privateRevision','revisionDomain']:[])],['presentation']) || !exact(d,['operation','outcome','planId','committedAt',...extra]) || value.status!=='committed' || !integer(value.version) || d.planId!==PLAN_ID || d.operation!==intent.endpoint || !Number.isFinite(Date.parse(d.committedAt)))return false;
 const persona=PERSONAS.find(p=>p.id===intent.actorId);
 if(priv && (!integer(value.privateRevision) || value.revisionDomain!==`safety-queue-v1:${persona.view}:${PLAN_ID}:${persona.id}`))return false;
 if(intent.endpoint==='hold')return d.outcome==='held' && /^hold-[a-f0-9]{32}$/.test(d.holdId);
 if(intent.endpoint==='safety-request')return d.outcome==='queued' && d.holdId===intent.body.holdId && /^review-[a-f0-9]{32}$/.test(d.requestId);
 if(['review-dispatch','review-escalate'].includes(intent.endpoint))return d.outcome==='recorded' && d.requestId===intent.body.requestId && /^hold-[a-f0-9]{32}$/.test(d.holdId);
 return d.outcome===intent.body.decision && d.handoffId===intent.body.handoffId && /^hold-[a-f0-9]{32}$/.test(d.holdId);
}

export function createQueueClient({ baseUrl = '', fetcher = fetch, storage = null, now = () => Date.now(), newKey = () => crypto.randomUUID(), timeoutMs = 7000 } = {}) {
  const storageKey = 'synthetic-queue-pending-v1';
  let token = null, generation = 0, revision = 0, readSequence = 0, currentRead = 0, minimumVersion = 0;
  let running = null, refreshRun = null;
  const controllers = new Set(), listeners = new Set(), deniedThrough = new Map(), privateFloors = new Map();
  let state = { actor: null, phase: 'signed-out', connection: 'unchecked', snapshot: null, fresh: false, checkedAt: null,
    pending: null, proposal: null, receipt: null, message: 'Choose a fictional operator. Use a second tab for the recipient.', fixture: null };
  try {
    const saved = JSON.parse(storage?.getItem(storageKey) ?? 'null');
    if (saved && PERSONAS.some(p => p.id === saved.actorId) && ['hold','safety-request','handoff-ack','review-dispatch','review-escalate'].includes(saved.endpoint) &&
      typeof saved.key === 'string' && /^[a-f0-9]{64}$/.test(saved.hash) && object(saved.body) && saved.body.planId === PLAN_ID) {
      state.pending = { ...saved, stage: 'unknown', uncertain: true, canRetry: false };
      state.message = 'An earlier action is unconfirmed. Sign in as the same fictional operator to check its receipt.';
    }
  } catch { storage?.removeItem(storageKey); }
  const emit = () => { for (const callback of listeners) callback(view()); };
  const persist = () => { try { state.pending ? storage?.setItem(storageKey, JSON.stringify(state.pending)) : storage?.removeItem(storageKey); } catch { state.message += ' This tab could not retain the action for reload; keep it open until checked.'; } };
  const view = () => structuredClone(state);
  const assignment = () => state.fresh && state.snapshot?.data.assignments.find(a => a.assignmentId === state.actor?.assignmentId);
  const held = () => state.snapshot?.data.holds.find(h => h.state === 'held');
  const cancelled = () => state.snapshot?.data.holds.some(h => h.state === 'cancelled');
  const activeHandoff = handoffId => state.snapshot?.data.offers?.find(h => h.handoffId === handoffId && h.holdId === held()?.holdId && h.recipientAssignmentId === state.actor?.assignmentId);
  const allowed = () => Boolean(token && state.fresh && assignment() && !running && !state.pending && !state.proposal && state.connection === 'connected');
  const session = () => ({ generation, actorId: state.actor?.id });
  const sameSession = context => context.generation === generation && context.actorId === state.actor?.id;
  const current = (context, barrier) => sameSession(context) && barrier === revision;
  // A write, disconnect or session transition invalidates every earlier read and
  // lookup, including their catch/finally continuations. A denial needs no version
  // to defeat an older success. Locks are retired by identity, never by old work.
  function fence() { ++revision; currentRead = ++readSequence; refreshRun = null; state.fresh = false; if(state.actor && state.actor.view!=='requester')state.snapshot=null; return revision; }
  function abortAll() { for (const controller of controllers) controller.abort(); }
  // An unversioned denial invalidates every version already known at that point.
  // Keep this per actor for this pinned-plan controller's lifetime, including
  // sign-out/reconnect. A newer request alone cannot reacquire authority.
  function rememberDenial(version = minimumVersion) {
    const actorId = state.actor?.id;
    if (actorId) { const prior=deniedThrough.get(actorId); deniedThrough.set(actorId,{public:Math.max(prior?.public??0, minimumVersion,version),private:Math.max(prior?.private??-1,privateFloors.get(actorId)??-1)}); }
    state.fresh = false; if(state.actor && state.actor.view!=='requester')state.snapshot=null; state.proposal = null;
  }

  async function request(path, { method = 'GET', body, auth = true } = {}) {
    const controller = new AbortController(); controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(baseUrl + path, { method, redirect: 'error', cache: 'no-store', signal: controller.signal,
        headers: { accept: 'application/json', ...(auth && token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const value = await response.json();
      return { http: response.status, body: value };
    } finally { clearTimeout(timer); controllers.delete(controller); }
  }
  async function readCurrent(context, barrier) {
    if (!current(context, barrier)) return null;
    const order = ++readSequence; currentRead = order;
    const applicable = () => current(context, barrier) && order === currentRead;
    try {
      const result = await request('/api/ops/' + (state.actor.view==='requester'?'state':state.actor.view) + '?planId=' + PLAN_ID);
      if (!applicable()) return null;
      if (result.http === 200 && validSnapshot(result.body, state.actor)) {
        if (result.body.version < minimumVersion) {
          state.fresh = false; if(state.actor && state.actor.view!=='requester')state.snapshot=null; state.connection = 'unavailable';
          state.message = 'The reply is older than verified server state. Current status remains unverified.'; return false;
        }
        const denied=deniedThrough.get(context.actorId), pf=privateFloors.get(context.actorId)??-1;
        if (state.actor.view!=='requester' && result.body.privateRevision < pf) {
          state.fresh=false; state.snapshot=null; state.proposal=null;
          state.message='Private reply is older than verified state.'; return false;
        }
        if (denied && (result.body.version < denied.public || result.body.version === denied.public && (state.actor.view==='requester' || result.body.privateRevision <= denied.private))) {
          state.fresh = false; if(state.actor && state.actor.view!=='requester')state.snapshot=null; state.phase = 'authority-stale'; state.connection = 'unavailable';
          state.message = 'This snapshot does not establish newer authority after a denial. Actions remain disabled.'; return false;
        }
        minimumVersion = result.body.version;
        if(state.actor.view!=='requester')privateFloors.set(context.actorId,result.body.privateRevision);
        state.snapshot = result.body; state.fresh = true; state.connection = 'connected'; state.checkedAt = now();
        if (!assignment()) { rememberDenial(); state.phase = 'authority-stale'; state.message = 'This fictional assignment is no longer active. Actions are disabled.'; return false; }
        return true;
      }
      state.fresh = false; if(state.actor && state.actor.view!=='requester')state.snapshot=null;
      if ([401, 403, 404].includes(result.http)) {
        rememberDenial();
        state.phase = result.http === 401 ? 'session-expired' : 'authority-stale';
        state.message = 'Current authority could not be verified. Actions are disabled; a past receipt remains history only.';
      } else { state.connection = 'unavailable'; state.message = 'Current plan status could not be verified. Last-seen data is not current authority.'; }
      return false;
    } catch {
      if (!applicable()) return null;
      state.fresh = false; if(state.actor && state.actor.view!=='requester')state.snapshot=null; state.connection = 'disconnected'; state.message = 'Disconnected. Current plan status is unverified; no action was retried.';
      return false;
    }
  }
  async function connect(actorId) {
    if (running || state.phase === 'connecting') return false;
    const persona = PERSONAS.find(p => p.id === actorId);
    if (!persona) return false;
    if (state.pending && state.pending.actorId !== actorId) { state.message = 'This tab retains another operator’s unconfirmed action. Use a separate tab or return to that operator.'; emit(); return false; }
    ++generation; const barrier = fence(); abortAll();
    token = null; state.actor = persona; state.phase = 'connecting'; state.snapshot = null; state.proposal = null; state.receipt = null; state.checkedAt = null;
    const context = session(); emit();
    try {
      const fixture = await request('/local-fixture.json', { auth: false });
      if (!current(context, barrier)) return false;
      if (fixture.http !== 200 || fixture.body.synthetic !== true || fixture.body.backendSourceArchiveSHA256 !== EXPECTED_BACKEND_SHA256 || fixture.body.resumePolicyConfigured !== false || fixture.body.contract !== 'safety-queue-v1') throw Error('Unexpected fixture');
      const health = await request('/api/health', { auth: false });
      if (!current(context, barrier)) return false;
      if (health.http !== 200 || health.body.status !== 'ok' || health.body.prototype !== true) throw Error('Unexpected backend');
      const signed = await request('/api/session', { method: 'POST', auth: false, body: { magicName: persona.id, passcode: 'synthetic-' + persona.id } });
      if (!current(context, barrier)) return false;
      if (signed.http !== 200 || signed.body.status !== 'ok' || !/^[a-f0-9]{64}$/.test(signed.body.token) || signed.body.person?.id !== persona.id) throw Error('Sign-in unverified');
      token = signed.body.token; state.fixture = fixture.body; state.phase = 'ready';
      const fresh = await readCurrent(context, barrier);
      if (!current(context, barrier) || fresh === null) return false;
      if (fresh) state.message = state.pending ? 'Check the original receipt before any further action.' : 'Connected to the local fixture. No real staff is assigned.';
      emit(); return fresh;
    } catch {
      if (!current(context, barrier)) return false;
      token = null; state.phase = 'signed-out'; state.connection = 'disconnected'; state.message = 'Local connection or fixture identity could not be verified. Nothing was submitted.'; emit(); return false;
    }
  }
  function prepare(kind, targetId) {
    if (!allowed()) return false;
    const a = assignment(), hold = held(), handoff = activeHandoff(targetId);
    let endpoint, extra;
    if (kind === 'pause' && !hold && !cancelled()) { endpoint = 'hold'; extra = { reasonCode: 'manual' }; }
    else if (kind === 'handoff' && a.role === 'lead' && hold && !state.snapshot.data.requests?.some(r=>r.holdId===hold.holdId)) { endpoint = 'safety-request'; extra = { holdId: hold.holdId, ...(state.snapshot.data.reportRefs?.[0] ? {reportRef:state.snapshot.data.reportRefs[0].ref}: {}) }; }
    else if (['dispatch','escalate'].includes(kind) && a.role==='safety_triage' && hold) { const row=state.snapshot.data.cases.find(r=>r.open && (!targetId || r.requestId===targetId)); if(!row)return false; endpoint=kind==='dispatch'?'review-dispatch':'review-escalate';extra={requestId:row.requestId}; }
    else if (['accept', 'decline'].includes(kind) && hold && handoff?.state === 'requested' && handoff.recipientAssignmentId === a.assignmentId && handoff.epochAtRequest === a.epoch) { endpoint = 'handoff-ack'; extra = { handoffId: handoff.handoffId, decision: kind === 'decline' ? 'declined' : 'acknowledged' }; }
    else return false;
    state.proposal = { kind, endpoint, actorId: state.actor.id, body: { planId: PLAN_ID, assignmentId: a.assignmentId, expectedEpoch: a.epoch, ...extra } }; emit(); return true;
  }
  function cancelProposal() { if (running || !state.proposal) return false; state.proposal = null; state.message = 'Dialog cancelled. No new action was submitted.'; emit(); return true; }

  async function transmit(intent, context, barrier) {
    intent.stage = 'sending'; intent.canRetry = false; state.phase = 'submitting'; state.fresh = false; if(state.actor && state.actor.view!=='requester')state.snapshot=null; state.proposal = null; state.pending = intent; persist(); state.message = 'Submitting once. Confirmation is pending.'; emit();
    try {
      const result = await request('/api/writes/' + intent.endpoint, { method: 'POST', body: { personId: intent.actorId, idempotencyKey: intent.key, payloadHash: intent.hash, body: intent.body } });
      if (!sameSession(context) || state.pending !== intent) return false;
      if ([401, 403, 404].includes(result.http)) rememberDenial();
      if (result.http === 200 && validPresentation(result.body.presentation) && validReceipt(result.body, intent)) {
        const { presentation, ...facts } = result.body;
        minimumVersion = Math.max(minimumVersion, facts.version);
        if(facts.privateRevision!==undefined)privateFloors.set(context.actorId,Math.max(privateFloors.get(context.actorId)??-1,facts.privateRevision));
        if (!presentation.authorityCurrent) rememberDenial();
        state.receipt = { state: 'stored', key: intent.key, facts, recovered: false }; state.pending = null; persist(); state.phase = 'ready';
        state.message = 'Action receipt is stored; current plan status could not be verified.';
        // A receipt delivered after disconnect is history, never reconnection.
        const fresh = await readCurrent(context, barrier);
        if (current(context, barrier) && fresh !== null) state.message = fresh ? 'Action stored. Current status was checked separately.' : 'Action receipt is stored; current plan status could not be verified.';
        return true;
      }
      if ([401, 403].includes(result.http) && result.body?.status === (result.http === 401 ? 'expired-session' : 'rejected') && !intent.uncertain) {
        state.receipt = { state: 'rejected', key: intent.key, error: result.body.error ?? 'session_expired' }; state.pending = null; persist(); state.fresh = false; if(state.actor && state.actor.view!=='requester')state.snapshot=null;
        state.phase = result.http === 401 ? 'session-expired' : 'authority-stale';
        const fresh = await readCurrent(context, barrier);
        if (current(context, barrier) && fresh !== null) state.message = 'Request rejected. No success is confirmed. Check current authority before a new action.';
        return false;
      }
      intent.stage = result.http === 409 ? 'conflict' : 'unknown'; intent.uncertain = true; persist();
      state.phase = 'unknown'; state.fresh = false; if(state.actor && state.actor.view!=='requester')state.snapshot=null; state.message = result.http === 409 ? 'Action conflict. This intent remains unconfirmed and will not be resent automatically.' : 'The response did not confirm a valid receipt. Check the original action; do not assume success.';
      return false;
    } catch {
      if (!sameSession(context) || state.pending !== intent) return false;
      intent.stage = 'unknown'; intent.uncertain = true; state.phase = 'unknown'; state.fresh = false; if(state.actor && state.actor.view!=='requester')state.snapshot=null; state.connection = 'disconnected'; persist();
      state.message = 'Response lost or disconnected. The action may have committed. Check its receipt before retrying.'; return false;
    } finally { if (sameSession(context)) emit(); }
  }
  function lockWrite(work, context, barrier) {
    const task = Promise.resolve().then(() => current(context, barrier) ? work() : false).catch(() => {
      if (!current(context, barrier)) return false;
      state.phase = state.pending ? 'unknown' : 'ready'; state.fresh = false; if(state.actor && state.actor.view!=='requester')state.snapshot=null;
      state.message = state.pending ? 'This action remains unconfirmed. Check the original receipt before retrying.' : 'The local intent could not be prepared. Nothing was submitted.'; return false;
    }).finally(() => { if (running === task) running = null; if (sameSession(context)) emit(); });
    running = task; return task;
  }
  function confirm() {
    if (running) return running;
    if (!state.proposal || !token || state.pending || !state.fresh || state.connection !== 'connected') return Promise.resolve(false);
    const proposal = structuredClone(state.proposal), context = session(), barrier = fence();
    // Install the synchronous lock before hashing or any network await.
    state.phase = 'submitting'; state.proposal = null;
    const task = lockWrite(async () => {
      const intent = { ...proposal, key: newKey(), hash: await hashBody(proposal.body), stage: 'sending', uncertain: false };
      if (!current(context, barrier)) return false;
      return transmit(intent, context, barrier);
    }, context, barrier);
    emit(); return task;
  }
  async function checkReceipt() {
    if (running || !token || !state.pending || state.pending.actorId !== state.actor?.id) return false;
    if (refreshRun) return refreshRun.promise;
    const intent = state.pending, context = session(), barrier = fence(), run = {};
    intent.canRetry = false; persist(); refreshRun = run;
    state.message = 'Checking the original receipt and current authority. No write is sent.'; emit();
    run.promise = (async () => {
      try {
        const found = await request('/api/lookup', { method: 'POST', body: { personId: intent.actorId, endpoint: intent.endpoint, key: intent.key, payloadHash: intent.hash } });
        if (!current(context, barrier) || state.pending !== intent) return false;
        if ([401, 403, 404].includes(found.http)) rememberDenial();
        if (found.http === 200 && found.body.status === 'recorded' && validPresentation(found.body.presentation) && validReceipt(found.body.result, intent)) {
          minimumVersion = Math.max(minimumVersion, found.body.result.version);
          if(found.body.result.privateRevision!==undefined)privateFloors.set(context.actorId,Math.max(privateFloors.get(context.actorId)??-1,found.body.result.privateRevision));
          if (!found.body.presentation.authorityCurrent) rememberDenial();
          state.receipt = { state: 'stored', key: intent.key, facts: found.body.result, recovered: true }; state.pending = null; persist(); state.phase = 'ready';
          const fresh = await readCurrent(context, barrier);
          if (current(context, barrier) && fresh !== null) state.message = fresh ? 'Stored receipt recovered. No duplicate write was sent.' : 'Stored historical receipt recovered. Current authority or status is unavailable.';
          return true;
        }
        if (found.http === 200 && found.body.status === 'absent' && Object.keys(found.body).length === 1) {
          intent.stage = 'absent'; persist(); state.phase = 'ready'; const fresh = await readCurrent(context, barrier);
          if (!current(context, barrier) || fresh === null || state.pending !== intent) return false;
          const a = assignment(); intent.canRetry = Boolean(fresh && a && a.assignmentId === intent.body.assignmentId && a.epoch === intent.body.expectedEpoch);
          persist(); state.message = intent.canRetry ? 'No receipt at this check. Authority is current. A same-intent retry requires your confirmation.' : 'No receipt at this check. Original authority is no longer verified; this intent cannot be retried.'; return false;
        }
        state.fresh = false; if(state.actor && state.actor.view!=='requester')state.snapshot=null; state.message = 'Receipt remains unconfirmed. No write was resent.'; return false;
      } catch {
        if (!current(context, barrier)) return false;
        state.fresh = false; if(state.actor && state.actor.view!=='requester')state.snapshot=null; state.connection = 'disconnected'; state.message = 'Receipt check failed. The original action remains unconfirmed; no write was resent.'; return false;
      } finally { if (refreshRun === run) refreshRun = null; if (current(context, barrier)) emit(); }
    })();
    return run.promise;
  }
  function retry() {
    if (running) return running;
    const intent = state.pending, a = assignment();
    if (!token || intent?.stage !== 'absent' || !intent.canRetry || !state.fresh || !a || a.assignmentId !== intent.body.assignmentId || a.epoch !== intent.body.expectedEpoch) return Promise.resolve(false);
    const context = session(), barrier = fence();
    return lockWrite(() => transmit(intent, context, barrier), context, barrier);
  }
  async function refresh() {
    if (state.pending) return checkReceipt();
    if (!token || running) return false;
    if (refreshRun) return refreshRun.promise;
    const context = session(), barrier = revision, run = {}; refreshRun = run;
    run.promise = readCurrent(context, barrier).then(ok => {
      if (!current(context, barrier) || ok === null) return false;
      if (ok) { state.phase = 'ready'; state.message = 'Current local status checked. No action was sent.'; }
      emit(); return ok;
    }).finally(() => { if (refreshRun === run) refreshRun = null; });
    return run.promise;
  }
  function noteOffline() {
    fence(); abortAll();
    state.proposal = null;
    if (state.pending) { state.pending.canRetry = false; persist(); }
    if (state.phase === 'connecting') state.phase = 'signed-out';
    else if (state.phase === 'submitting' && !state.pending) state.phase = 'ready';
    state.connection = 'disconnected'; state.message = state.pending ? 'Connection interrupted. The action is not confirmed; check its original receipt.' : 'Disconnected. Last-seen status is not current; actions are disabled.'; emit();
  }
  function signOut() {
    ++generation; fence(); abortAll(); running = null; token = null;
    if (state.pending) { state.pending.stage = 'unknown'; state.pending.uncertain = true; state.pending.canRetry = false; persist(); }
    state.actor = null; state.proposal = null; state.snapshot = null; state.receipt = null; state.phase = 'signed-out'; state.connection = 'unchecked'; state.message = state.pending ? 'Signed out. The original action remains unconfirmed in this tab; sign back in as the same actor to check it.' : 'Signed out of this fictional session.'; emit();
  }
  return { view, connect, prepare, cancelProposal, confirm, checkReceipt, retry, refresh, noteOffline, signOut,
    subscribe(callback) { listeners.add(callback); callback(view()); return () => listeners.delete(callback); } };
}
