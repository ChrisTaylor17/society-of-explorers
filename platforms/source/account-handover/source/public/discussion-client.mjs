import { PLAN, hashBody } from './plan-client.mjs';
const ENDPOINTS = new Set(['discussion-consent', 'discussion-post', 'discussion-flag', 'discussion-decide', 'discussion-appeal']);

/** Reuses the corrected plan client's session, exact-token denial handling and
 * authentication scope. No new login, cookie, token store or automatic retry. */
export function createDiscussionClient(core, identity, { newKey = () => crypto.randomUUID() } = {}) {
  if (identity?.contract !== 'plan-discussion-v1' || !/^[a-f0-9]{32}$/.test(identity.instanceId)) throw Error('Explicit discussion fixture identity required');
  const listeners = new Set(), pendingByActor = new Map();
  let generation = 0, scope = null, disposed = false, queued = false;
  let state = { phase: 'signed-out', busy: false, feed: null, queue: null, notices: null, pending: null, receipt: null, message: 'Sign in above to inspect this local discussion fixture.' };
  const authScope = () => { const a = core.auth(); return a.authenticated ? JSON.stringify([a.actor, a.scope]) : null; };
  const current = (g, s) => !disposed && g === generation && s === authScope();
  const view = () => structuredClone({ ...state, actor: core.auth().actor, canAct: Boolean(authScope() && !core.view().busy && !core.view().pending && !state.busy && !state.pending) });
  const emit = () => { for (const fn of listeners) fn(view()); };
  function clear() {
    generation++;
    state = { ...state, phase: 'needs-refresh', busy: false, feed: null, queue: null, notices: null, receipt: null, pending: pendingByActor.get(core.auth().actor) ?? null, message: 'Session or participation changed. Current discussion access must be checked.' };
    emit();
  }
  async function refresh() {
    if (!authScope() || core.view().busy || core.view().pending || state.busy || disposed) return;
    const s = authScope(), g = ++generation;
    state = { ...state, busy: true, phase: 'checking', feed: null, queue: null, notices: null }; emit();
    try {
      const views = ['feed', 'queue', 'notices'];
      const replies = await Promise.all(views.map(v => core.authRequest(`/api/plans/${PLAN}/discussion?view=${v}`)));
      if (!current(g, s)) return;
      const values = {};
      for (let i = 0; i < views.length; i++) {
        const r = replies[i];
        if (r.http === 200 && r.body?.status === 'ok' && r.body.data?.instanceId === identity.instanceId && /^[a-f0-9]{64}$/.test(r.body.snapshotId)) values[views[i]] = r.body.data;
        else if ([401, 403, 404].includes(r.http)) values[views[i]] = null;
        else throw Error('Invalid discussion view');
      }
      state = { ...state, ...values, phase: 'ready', message: 'Current local access checked. Rule suggestions are not decisions.' };
    } catch { if (current(g, s)) state = { ...state, phase: 'unavailable', feed: null, queue: null, notices: null, message: 'Discussion unavailable. No current access or action is confirmed.' }; }
    finally { if (current(g, s)) { state.busy = false; emit(); } }
  }
  async function act(endpoint, extras) {
    if (!ENDPOINTS.has(endpoint) || !view().canAct) return;
    const a = core.auth(), s = authScope(), g = ++generation;
    state.busy = true; state.phase = 'sending'; state.receipt = null; emit();
    const body = { instanceId: identity.instanceId, planId: PLAN, ...extras }, key = newKey();
    try {
      const hash = await hashBody(body); if (!current(g, s)) return;
      const pending = { actor: a.actor, endpoint, key, hash, instanceId: identity.instanceId };
      pendingByActor.set(a.actor, pending); state.pending = pending; emit();
      const r = await core.authRequest(`/api/writes/${endpoint}`, { body: { personId: a.actor, idempotencyKey: key, payloadHash: hash, body } });
      if (!current(g, s)) return;
      if (r.http === 200 && r.body?.status === 'committed' && r.body.data?.operation === endpoint && r.body.data.planId === PLAN) {
        pendingByActor.delete(a.actor); state.pending = null;
        state.receipt = { operation: endpoint, outcome: r.body.data.outcome, historical: true };
        state.message = 'Historical receipt recorded. Checking current access.'; state.busy = false; await refresh();
      } else if ([400, 403, 409, 413, 429].includes(r.http) && ['rejected', 'conflict'].includes(r.body?.status)) {
        pendingByActor.delete(a.actor); state.pending = null; state.phase = 'denied'; state.message = 'Action denied or review changed. Refresh and check the current form; no new action is confirmed.';
      } else { state.phase = 'unknown'; state.message = 'Reply unconfirmed. Check the original receipt before making another change.'; }
    } catch { if (current(g, s)) { state.phase = state.pending ? 'unknown' : 'unavailable'; state.message = 'Local request unavailable. Check the original receipt if shown; nothing was retried.'; } }
    finally { if (current(g, s)) { state.busy = false; emit(); } }
  }
  async function reconcile() {
    const p = state.pending, a = core.auth();
    if (!p || p.actor !== a.actor || state.busy || !authScope()) return;
    const s = authScope(), g = ++generation; state.busy = true; emit();
    try {
      const r = await core.authRequest('/api/lookup', { body: { personId: a.actor, endpoint: p.endpoint, key: p.key, payloadHash: p.hash, instanceId: p.instanceId } });
      if (!current(g, s)) return;
      if (r.http === 200 && ['recorded', 'absent'].includes(r.body?.status)) {
        if (r.body.status === 'recorded' && (r.body.result?.data?.operation !== p.endpoint || r.body.result.data.planId !== PLAN)) throw Error('Invalid receipt');
        pendingByActor.delete(a.actor); state.pending = null; state.busy = false;
        state.message = r.body.status === 'recorded' ? 'Original receipt found. No action was sent again.' : 'Original receipt absent. No retry was sent; re-enter your intent if still wanted.';
        await refresh();
      } else state.message = 'Receipt unavailable. Keep the original key; no retry was sent.';
    } catch { if (current(g, s)) state.message = 'Receipt lookup unavailable. No retry was sent.'; }
    finally { if (current(g, s)) { state.busy = false; emit(); } }
  }
  const stop = core.subscribe(s => {
    const next = authScope();
    if (next !== scope) { scope = next; clear(); }
    if (s.busy || s.pending) { if (state.phase !== 'needs-refresh') clear(); return; }
    if (!next) return;
    if (state.phase === 'needs-refresh' && !queued) { queued = true; queueMicrotask(() => { queued = false; if (!disposed) void refresh(); }); }
  });
  const stopIntent = core.onIntent?.(({ endpoint }) => { if (['leave', 'block', 'delete-account'].includes(endpoint)) clear(); });
  return { view, refresh, act, reconcile, subscribe(fn) { listeners.add(fn); fn(view()); return () => listeners.delete(fn); },
    dispose() { disposed = true; generation++; stop(); stopIntent?.(); listeners.clear(); pendingByActor.clear(); } };
}
