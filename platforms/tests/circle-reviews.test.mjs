import test from 'node:test';
import assert from 'node:assert/strict';
import { lstatSync } from 'node:fs';
const resident = name => { const s = lstatSync(new URL(name, import.meta.url)); assert(s.isFile() && !s.isSymbolicLink() && (!s.size || s.blocks)); };
resident('./load-source.mjs');
const { sourceLoader } = await import('./load-source.mjs');
const load = sourceLoader(), { createCircleReviews } = load('platforms/shared/circle-reviews.ts');
const { validateCircleReviewRequest } = load('lib/circles/circle-review-wire.ts');
const circle = '11111111-1111-4111-8111-111111111111';
const other = '33333333-3333-4333-8333-333333333333', origin = 'https://portable-review.invalid';
const base = `/api/admin/circles/reports/${circle}`, content = 'Synthetic listing description evidence for independent human review.';
const stamp = '2026-11-05T12:00:00Z';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const clone = value => JSON.parse(JSON.stringify(value)), tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const settled = promise => Promise.race([promise.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 40))]);
let created = 0, closed = 0;
function fixture(t, { count = 1, synchronousOwner = false, timeoutMs = 100, throwStop = false } = {}) {
  created++; let scope = 'synthetic-review-owner', revision = 2, sequence = 1000, countNow = count, hidden = false;
  let hook = null, bearerHook = null, keyHook = null, credentials = 0, keys = 0, expiryMs = 300000, scopeBroken = false;
  const calls = [], listeners = new Set(), decisions = [], sessions = new Map(), receipts = new Map(), snapshots = [];
  const reports = () => Array.from({ length: countNow }, (_, i) => ({ id: id(i + 1), reason: 'safety', note: `Private report ${i + 1} exact evidence for the human reviewer.`, created_at: stamp }));
  const title = 'Synthetic exact listing title';
  const detail = () => ({ circle: { id: circle, title, description: content, hidden },
    revision, reports: reports().slice(0, 100), decisions: clone(decisions), complete: countNow <= 100 });
  const project = (s, pageNumber = s.frontier) => ({ sessionId: s.id, circleId: circle, messageId: null, revision: s.revision, contentHash: null,
    totalReports: s.total, reviewedReports: s.reviewed, pageToken: id(s.sequence + pageNumber), reports: reports().slice((pageNumber - 1) * 50, pageNumber * 50),
    complete: s.reviewed === s.total, expiresAt: new Date(s.expires).toISOString(), pageNumber, acknowledged: s.reviewed === s.total || pageNumber * 50 <= s.reviewed });
  const controller = createCircleReviews({ origin, timeoutMs, initialOnline: true,
    owner: { scope: () => { if (scopeBroken) throw Error('Synthetic owner scope failure'); return scope; }, subscribe(fn) { listeners.add(fn); if (synchronousOwner) fn(); return () => { listeners.delete(fn); if (throwStop) throw Error('Synthetic unsubscribe failure'); }; }, async bearer() { credentials++; return bearerHook ? bearerHook() : 'NONISSUED_SYNTHETIC_REVIEWER'; } },
    async newRequestId() { keys++; return keyHook ? keyHook() : id(++sequence); },
    circleReviewerTransport: async (url, options) => {
      const path = url.slice(origin.length); assert.equal(validateCircleReviewRequest(path, options), true);
      calls.push({ path, method: options.method, body: options.body });
      const respond = () => {
        let status = 200, body;
        const query = new URL(url).searchParams, input = options.body ? JSON.parse(options.body) : null;
        if (new URL(url).pathname === '/api/admin/circles/reports') body = { items: query.has('after') ? [] : [{ id: circle, title, hidden, openReports: countNow, revision }], nextCursor: null };
        else if (path === base && options.method === 'GET') body = detail();
        else if (path.startsWith(base + '/coverage') && !path.endsWith('/decision')) {
          if (input?.action === 'start') {
            for (const s of sessions.values()) s.invalid = true;
            const s = { id: id(++sequence), sequence: sequence + 10000, revision, total: countNow, reviewed: 0, frontier: 1, expires: Date.now() + expiryMs, invalid: false };
            sessions.set(s.id, s); body = project(s);
          } else {
            const s = sessions.get(input?.sessionId ?? query.get('sessionId'));
            if (!s || s.invalid || s.expires <= Date.now() || s.revision !== revision || s.total !== countNow) { status = 409; body = {}; }
            else if (input?.action === 'ack') {
              const p = Number(input.pageToken.slice(-12)) - s.sequence;
              if (p > s.frontier || p < 1) { status = 409; body = {}; }
              else { if (p === s.frontier && s.reviewed < s.total) { s.reviewed += Math.min(50, s.total - s.reviewed); if (s.reviewed < s.total) s.frontier++; s.expires = Date.now() + expiryMs; } body = project(s); }
            } else { const p = query.has('page') ? Number(query.get('page')) : s.frontier; if (p > s.frontier) { status = 409; body = {}; } else body = project(s, p); }
          }
        } else if (options.method === 'POST' && (path === base || path === base + '/coverage/decision')) {
          const prior = receipts.get(input.requestId), s = input.sessionId ? sessions.get(input.sessionId) : null;
          if (prior) { if (prior.bytes !== options.body) { status = 409; body = {}; } else body = { ...clone(prior.body), replayed: true, revision, hidden }; }
          else if (input.expectedRevision !== revision || (s ? s.invalid || s.expires <= Date.now() || s.reviewed !== countNow : countNow > 100)) { status = 409; body = {}; }
          else {
            const decision = { id: id(++sequence), action: input.action, reason: input.reason, summary: input.summary, report_count: countNow, created_at: stamp };
            revision++; hidden = input.action === 'hide'; countNow = 0; decisions.unshift(decision);
            body = { requestId: input.requestId, circleId: circle, decision, revision, hidden, replayed: false, ...(input.sessionId ? { sessionId: input.sessionId } : {}) };
            receipts.set(input.requestId, { bytes: options.body, body: clone(body) });
          }
        } else throw Error('Unexpected fixture route');
        return { status, url, redirected: false, json: async () => clone(body) };
      };
      return hook ? hook({ path, options, respond }) : respond();
    } });
  controller.subscribe(value => snapshots.push(value));
  t.after(() => { controller.disconnect(); assert.equal(listeners.size, 0); closed++; });
  const token = () => controller.model().action;
  return { controller, calls, snapshots, token, sessions, decisions, listeners, connect: () => controller.connect(), setHook: value => { hook = value; }, setBearer: value => { bearerHook = value; }, setKey: value => { keyHook = value; },
    get credentials() { return credentials; }, get keys() { return keys; }, setExpiry: value => { expiryMs = value; },
    advanceCase() { revision++; hidden = !hidden; countNow = 1; },
    changeOwner() { scope = 'another-owner'; for (const fn of listeners) fn(); },
    failOwner() { scopeBroken = true; for (const fn of listeners) fn(); },
    async open() { controller.connect(); await controller.loadQueue(token()); await controller.openCase(circle, token()); },
    async cover() { await controller.startCoverage(token()); while (!controller.model().coverage.page.complete) { controller.confirmCoverage(true, token()); await controller.ackCoverage(token()); } },
    draft(action = 'hide', source = 'title', excerpt = 'Synthetic exact listing') {
      controller.setAction(action, token()); controller.setReason(action === 'hide' ? 'safety' : 'resolved', token());
      controller.setSummary('The human reviewer recorded a specific conduct finding with a private source.', token());
      if (source !== undefined && (source === 'title' || source === 'description' || controller.model().evidence?.id !== source)) controller.setEvidence(source, token());
      if (action === 'hide') controller.setExcerpt(excerpt, token()); controller.confirmDecision(true, token());
    } };
}

test('connection and foreground never fetch; fresh selected case requires current queue membership', async t => {
  const f = fixture(t), c = f.controller; f.connect(); c.activity(false); c.activity(true); c.connectivity(false); c.connectivity(true);
  await c.openCase(circle, f.token()); assert.equal(f.calls.length, 0); await c.loadQueue(f.token());
  const count = f.credentials; await c.openCase(other, f.token()); assert.equal(f.credentials, count);
  await c.openCase(circle, f.token()); assert.equal(c.model().detail.circle.id, circle); assert.equal(f.calls.length, 2);
  assert.equal(JSON.stringify(c.model()).includes('NONISSUED'), false);
});
test('queue pages replace and reject duplicate, nonascending and nonadvancing UUID sequences', async t => {
  for (const bad of ['duplicate', 'descending', 'cursor']) {
    const f = fixture(t); f.connect();
    f.setHook(async ({ respond }) => { const r = respond(), value = await r.json(), item = value.items[0];
      value.items = bad === 'duplicate' ? [item, item] : bad === 'descending' ? [{ ...item, id: other }, item] : [item];
      value.nextCursor = bad === 'cursor' ? other : null; return { ...r, json: async () => value }; });
    await f.controller.loadQueue(f.token()); assert.equal(f.controller.model().queue, null); assert.equal(f.controller.model().phase, 'unavailable');
  }
});
test('complete 0,50,100-report cases require explicit valid human draft and confirm the exact decision', async t => {
  for (const count of [0, 50, 100]) {
    const f = fixture(t, { count }); await f.open(); f.draft(); assert.equal(f.controller.model().canSubmit, true);
    await f.controller.submitDecision(f.token()); const m = f.controller.model();
    assert.equal(m.decisionConfirmed, true); assert.equal(m.receipt.decision.report_count, count); assert.equal(m.detail.circle.hidden, true);
    assert.equal(m.draft.confirmed, false); assert.equal(m.canSubmit, false); assert.equal(f.decisions.length, 1);
    assert.equal(f.calls.filter(x => x.method === 'POST')[0].path, base);
  }
});
test('101 and250 reports require every bounded page; earlier-page evidence survives without accumulating reports', async t => {
  for (const count of [101, 250]) {
    const f = fixture(t, { count }), c = f.controller; await f.open(); assert.equal(c.model().detail.reports.length, 0);
    assert.equal(c.model().canEditDraft, false); await c.startCoverage(f.token());
    const first = c.model().coverage.page.reports[0]; c.setEvidence(first.id, f.token()); const ids = [];
    while (!c.model().coverage.page.complete) {
      ids.push(...c.model().coverage.page.reports.map(r => r.id)); c.confirmCoverage(true, f.token()); await c.ackCoverage(f.token());
    }
    assert.equal(ids.length, count); assert.equal(new Set(ids).size, count); assert.equal(c.model().evidence.id, first.id);

    assert.equal(f.calls.some(x => x.path.endsWith('/advice')), false);
    await c.openCoveragePage(1, f.token()); assert.equal(c.model().coverage.page.acknowledged, true); assert.equal(c.model().coverage.canAcknowledge, false);
    f.draft('hide', first.id, first.note.slice(0, 20)); await c.submitDecision(f.token());
    assert.equal(c.model().decisionConfirmed, true); assert.equal(c.model().receipt.decision.report_count, count);
    const post = f.calls.find(x => x.path.endsWith('/coverage/decision')); assert.equal(JSON.parse(post.body).evidenceReportId, first.id);
    for (const m of f.snapshots) { if (m.coverage?.page) assert(m.coverage.page.reports.length <= 50); if (m.detail && !m.detail.complete) assert.equal(m.detail.reports.length, 0); }
  }
});
test('restore carries no private evidence and clears the listing hidden flag', async t => {
  const f = fixture(t); await f.open(); f.draft(); await f.controller.submitDecision(f.token());
  f.draft('restore'); await f.controller.submitDecision(f.token()); assert.equal(f.controller.model().detail.circle.hidden, false);
  const body = JSON.parse(f.calls.filter(x => x.method === 'POST').at(-1).body); assert.equal(body.evidenceReportId, null); assert.equal(body.evidenceExcerpt, null);
});
test('lost acknowledgement recovers progress only by manual read, clearing the next-page checkbox', async t => {
  const f = fixture(t, { count: 101 }), c = f.controller; await f.open(); await c.startCoverage(f.token()); c.confirmCoverage(true, f.token());
  const old = f.token(); f.setHook(({ path, options, respond }) => { const r = respond(); if (path.endsWith('/coverage') && JSON.parse(options.body).action === 'ack') throw Error('lost ACK'); return r; });
  await c.ackCoverage(old); assert.equal(c.model().coverage.page, null); assert.equal(c.model().coverage.confirmed, false);
  const count = f.calls.length; await c.ackCoverage(old); await tick(); assert.equal(f.calls.length, count);
  f.setHook(null); await c.refreshCoverage(f.token()); assert.equal(c.model().coverage.page.reviewedReports, 50); assert.equal(c.model().coverage.page.pageNumber, 2);
  c.confirmCoverage(true, old); await c.ackCoverage(old); assert.equal(c.model().coverage.canAcknowledge, false); assert.equal(f.calls.length, count + 1);
});
test('lost decision retains only exact manual POST retry; reading history is never a receipt substitute', async t => {
  const f = fixture(t), c = f.controller; await f.open(); f.draft();
  f.setHook(({ options, respond }) => { const r = respond(); if (options.method === 'POST') throw Error('lost committed decision'); return r; });
  await c.submitDecision(f.token()); assert.equal(c.model().pendingDecision, true); assert.equal(c.model().decisionConfirmed, false); assert.equal(c.model().detail, null);
  const first = f.calls.find(x => x.method === 'POST'), count = f.calls.length; await c.refreshCase(f.token()); await tick(); assert.equal(f.calls.length, count);
  assert.equal(JSON.stringify(c.model()).includes('exact reviewed decision body'), false);
  f.setHook(null); await c.retryDecision(f.token()); assert.equal(c.model().receipt.replayed, true); assert.equal(c.model().decisionConfirmed, true);
  assert.equal(f.calls.filter(x => x.method === 'POST')[1].body, first.body); assert.equal(f.decisions.length, 1);
});
test('refused exact retries retain earlier outcome uncertainty only within the owned lifetime', async t => {
  for (const reportCount of [1, 101]) for (const status of [400, 401, 403, 404, 409, 413, 429]) {
    const f = fixture(t, { count: reportCount }), c = f.controller; await f.open(); if (reportCount > 100) await f.cover(); f.draft();
    f.setHook(({ respond }) => { respond(); throw Error('Lost committed listing decision'); });
    await c.submitDecision(f.token()); const exact = f.calls.at(-1);
    f.setHook(() => ({ status, url: origin + exact.path, redirected: false, json: async () => ({}) }));
    await c.retryDecision(f.token()); assert.equal(c.model().phase, 'unknown'); assert.equal(c.model().pendingDecision, true);
    assert.equal(c.model().decisionConfirmed, false); assert.match(c.model().message, /earlier decision may have been saved/i);
    assert.equal(c.model().detail, null); assert.equal(c.model().draft.summary, '');
    const before = f.calls.length; await tick(); assert.equal(f.calls.length, before);
    assert.equal(f.calls.at(-1).body, exact.body); assert.equal(f.decisions.length, 1);
    if (status === 403) { f.changeOwner(); assert.equal(c.model().pendingDecision, false); }
    else if (status === 401) { c.activity(false); assert.equal(c.model().pendingDecision, false); }
    else { f.setHook(null); await c.retryDecision(f.token()); assert.equal(c.model().decisionConfirmed, true); assert.equal(c.model().pendingDecision, false); }
  }
});
test('malformed receipt bindings stay unknown and never trigger automatic readback', async t => {
  for (const patch of [{ requestId: other }, { circleId: other }, { requestId: undefined }, { circleId: undefined }, { sessionId: other }, { revision: 2 }, { revision: 4 }, { revision: 3, hidden: false }]) {
    const f = fixture(t); await f.open(); f.draft(); f.setHook(async ({ options, respond }) => { const r = respond(); return options.method === 'POST' ? { ...r, json: async () => ({ ...await r.json(), ...patch }) } : r; });
    await f.controller.submitDecision(f.token()); assert.equal(f.controller.model().phase, 'unknown'); assert.equal(f.controller.model().pendingDecision, true); assert.equal(f.calls.length, 3);
  }
});
test('covered receipts require the exact session and cannot credit a different report count', async t => {
  for (const kind of ['session', 'report-count']) {
    const f = fixture(t, { count: 101 }), c = f.controller; await f.open(); await f.cover(); f.draft();
    f.setHook(async ({ path, respond }) => { const r = respond(); if (!path.endsWith('/decision')) return r;
      const value = await r.json(); return { ...r, json: async () => kind === 'session' ? { ...value, sessionId: other } : { ...value, decision: { ...value.decision, report_count: 100 } } }; });
    await c.submitDecision(f.token()); assert.equal(c.model().phase, 'unknown'); assert.equal(c.model().decisionConfirmed, false);
    assert.equal(c.model().pendingDecision, true); assert.equal(c.model().detail, null);
  }
});
test('exact replay confirms the original decision while preserving newer opposite visibility and reports', async t => {
  for (const count of [1, 101]) {
    const f = fixture(t, { count }), c = f.controller; await f.open(); if (count > 100) await f.cover(); f.draft();
    f.setHook(({ path, options, respond }) => { const r = respond(); if (options.method === 'POST' && (path === base || path.endsWith('/decision'))) throw Error('lost original receipt'); return r; });
    await c.submitDecision(f.token()); const keyCount = f.keys, sent = f.calls.at(-1); f.advanceCase(); f.setHook(null);
    await c.retryDecision(f.token()); const m = c.model(), replay = f.calls.at(-2);
    assert.equal(f.keys, keyCount); assert.equal(replay.path, sent.path); assert.equal(replay.body, sent.body);
    assert.equal(m.decisionConfirmed, true); assert.equal(m.receipt.replayed, true); assert.equal(m.receipt.decision.action, 'hide');
    assert.equal(m.receipt.decision.report_count, count); assert.equal(m.receipt.revision, 4); assert.equal(m.receipt.hidden, false);
    assert.equal(m.detail.circle.hidden, false); assert.equal(m.detail.reports.length, 1); assert.equal(m.draft.confirmed, false);
  }
});
test('a confirmed decision remains confirmed when its later detail read fails or access is revoked', async t => {
  for (const status of [503, 403]) {
    const f = fixture(t); await f.open(); f.draft(); let wrote = false;
    f.setHook(({ options, respond }) => { const r = respond(); if (options.method === 'POST') wrote = true; else if (wrote) return { ...r, status, json: async () => ({}) }; return r; });
    await f.controller.submitDecision(f.token()); assert.equal(f.controller.model().decisionConfirmed, true); assert.equal(f.controller.model().pendingDecision, false);
    assert.equal(f.controller.model().detail, null); assert.match(f.controller.model().message, /confirmed/);
  }
});
test('captured tokens bind every edit and same-listing reselection before credentials or UUID work', async t => {
  const f = fixture(t), c = f.controller; await f.open(); const old = f.token(); f.draft();
  const edited = c.model().draft.summary; c.setSummary('Retained stale callback must not change current draft.', old); c.confirmDecision(false, old);
  assert.equal(c.model().draft.summary, edited); assert.equal(c.model().draft.confirmed, true);
  c.back(f.token()); await f.open(); const before = [f.credentials, f.keys, f.calls.length];
  for (const token of [old, { ...f.token(), extra: true }, Object.create(f.token()), { ...f.token(), circleId: other }]) {
    await c.loadQueue(token); await c.submitDecision(token); c.setAction('hide', token);
  }
  assert.deepEqual([f.credentials, f.keys, f.calls.length], before);
});
test('reentrant observer retirement fences queue, case, coverage and prepared decision requests', async t => {
  for (const operation of ['queue', 'case', 'coverage', 'decision']) {
    const f = fixture(t, { count: operation === 'coverage' ? 101 : 1 }), c = f.controller;
    if (operation === 'queue') f.connect(); else if (operation === 'case') { f.connect(); await c.loadQueue(f.token()); } else await f.open();
    if (operation === 'decision') f.draft(); const count = f.calls.length;
    const stop = c.subscribe(m => { if (m.busy) c.disconnect(); });
    if (operation === 'queue') await c.loadQueue(f.token());
    if (operation === 'case') await c.openCase(circle, f.token());
    if (operation === 'coverage') await c.startCoverage(f.token());
    if (operation === 'decision') await c.submitDecision(f.token());
    stop(); assert.equal(f.calls.length, count); assert.equal(c.model().detail, null); assert.equal(c.model().queue, null);
  }
});
test('synchronous owner subscription plus observer disconnect cannot reinstall a listener or scope', t => {
  const f = fixture(t, { synchronousOwner: true }), c = f.controller;
  const stop = c.subscribe(m => { if (m.connected) c.disconnect(); }); f.connect(); stop();
  assert.equal(f.listeners.size, 0); assert.equal(c.model().connected, false); assert.equal(c.model().phase, 'closed'); assert.equal(f.calls.length, 0);
});
test('owner scope and unsubscribe exceptions still clear all private review state', async t => {
  for (const failure of ['scope', 'unsubscribe']) {
    const f = fixture(t, { throwStop: failure === 'unsubscribe' }), c = f.controller; await f.open(); f.draft();
    if (failure === 'scope') assert.doesNotThrow(() => f.failOwner()); else assert.doesNotThrow(() => c.disconnect());
    assert.equal(c.model().detail, null); assert.equal(c.model().selected, null); assert.equal(c.model().draft.summary, ''); assert.equal(c.model().connected, false);
  }
});
test('coverage receipts cannot credit skipped acknowledgements or change the session report total', async t => {
  for (const operation of ['start', 'ack', 'total']) {
    const f = fixture(t, { count: 101 }), c = f.controller; await f.open();
    if (operation !== 'start') { await c.startCoverage(f.token()); c.confirmCoverage(true, f.token()); }
    f.setHook(async ({ respond }) => { const response = respond(), value = await response.json();
      return { ...response, json: async () => ({ ...value, totalReports: operation === 'total' ? 102 : 101, reviewedReports: operation === 'total' ? 102 : 101,
        pageNumber: 3, acknowledged: true, complete: true, reports: Array.from({ length: operation === 'total' ? 2 : 1 }, (_, i) => ({ id: id(101 + i), reason: 'safety', note: 'Synthetic report note', created_at: stamp })) }) }; });
    if (operation === 'start') await c.startCoverage(f.token()); else await c.ackCoverage(f.token());
    assert.equal(c.model().coverage.page, null); assert.equal(c.model().canEditDraft, false); assert.equal(c.model().canSubmit, false);
  }
});
test('held credentials, response body and request key settle promptly on retirement without late transmission or restoration', async t => {
  for (const stage of ['credentials', 'body', 'key']) for (const retire of ['activity', 'connectivity', 'owner']) {
    const f = fixture(t, { timeoutMs: 1000 }), c = f.controller, hold = deferred(); await f.open();
    if (stage === 'credentials') f.setBearer(() => hold.promise);
    if (stage === 'body') f.setHook(({ respond }) => ({ ...respond(), json: () => hold.promise }));
    if (stage === 'key') { f.draft(); f.setKey(() => hold.promise); }
    const before = f.calls.length, running = stage === 'key' ? c.submitDecision(f.token()) : c.refreshCase(f.token()); await tick();
    if (retire === 'owner') f.changeOwner(); else c[retire](false);
    assert.equal(await settled(running), true); assert.equal(c.model().detail, null);
    hold.resolve(stage === 'credentials' ? 'NONISSUED_SYNTHETIC_REVIEWER' : stage === 'key' ? id(9000) : {}); await tick();
    assert.equal(f.calls.length, before + (stage === 'body' ? 1 : 0));
    if (retire !== 'owner') c[retire](true); await tick(); assert.equal(f.calls.length, before + (stage === 'body' ? 1 : 0));
  }
});
test('coverage expiry clears draft/evidence and refuses a new decision during held key or credentials', async t => {
  for (const stage of ['idle', 'key', 'credentials']) {
    const f = fixture(t, { count: 101 }), c = f.controller; await f.open(); f.setExpiry(35); await f.cover(); f.draft();
    const before = f.calls.filter(x => x.path.endsWith('/coverage/decision')).length, hold = deferred();
    if (stage === 'key') f.setKey(() => hold.promise); if (stage === 'credentials') f.setBearer(() => hold.promise);
    const run = stage === 'idle' ? null : c.submitDecision(f.token());
    await new Promise(resolve => setTimeout(resolve, 50)); if (run) assert.equal(await settled(run), true);
    hold.resolve(stage === 'key' ? id(9001) : 'NONISSUED_SYNTHETIC_REVIEWER'); await tick();
    assert.equal(f.calls.filter(x => x.path.endsWith('/coverage/decision')).length, before); assert.equal(c.model().canSubmit, false); assert.equal(c.model().pendingDecision, false);
  }
});
test('a dispatched covered decision retains exact manual retry after coverage expiry', async t => {
  const f = fixture(t, { count: 101 }), c = f.controller; await f.open(); await f.cover(); f.draft();
  f.setHook(({ path, respond }) => { const r = respond(); if (path.endsWith('/coverage/decision')) throw Error('lost committed covered decision'); return r; });
  await c.submitDecision(f.token()); for (const s of f.sessions.values()) s.expires = Date.now() - 1;
  const first = f.calls.find(x => x.path.endsWith('/coverage/decision')); f.setHook(null); await c.retryDecision(f.token());
  assert.equal(c.model().decisionConfirmed, true); assert.equal(c.model().receipt.replayed, true); assert.equal(f.calls.filter(x => x.path.endsWith('/coverage/decision'))[1].body, first.body);
});
test('reentrant confirmation observers cannot acknowledge pages or save decisions', async t => {
  for (const kind of ['decision', 'page']) {
    const f = fixture(t, { count: kind === 'page' ? 101 : 1 }), c = f.controller; await f.open();
    if (kind === 'page') await c.startCoverage(f.token()); else { f.draft(); c.confirmDecision(false, f.token()); }
    const count = f.calls.length;
    const stop = c.subscribe(m => { if (m.draft.confirmed) { void c.submitDecision(m.action); } if (m.coverage?.confirmed) void c.ackCoverage(m.action); });
    if (kind === 'page') c.confirmCoverage(true, f.token()); else c.confirmDecision(true, f.token()); await tick(); stop();
    assert.equal(f.calls.length, count); assert.equal(f.keys, 0);
  }
});
test('listing evidence binds the chosen title or description, never their concatenation or another field', async t => {
  const f = fixture(t), c = f.controller; await f.open(); f.draft();
  assert.equal(c.model().draft.source, 'title'); assert.equal(c.model().canSubmit, true);
  c.setExcerpt('listing description evidence', f.token()); c.confirmDecision(true, f.token()); assert.equal(c.model().canSubmit, false);
  c.setEvidence('description', f.token()); c.setExcerpt('listing description evidence', f.token()); c.confirmDecision(true, f.token());
  assert.equal(c.model().canSubmit, true);
  c.setEvidence('title', f.token()); assert.equal(c.model().draft.confirmed, false); assert.equal(c.model().draft.excerpt, '');
  for (const source of ['title', 'description']) {
    c.setEvidence(source, f.token()); c.setExcerpt('listing title Synthetic listing', f.token()); c.confirmDecision(true, f.token()); assert.equal(c.model().canSubmit, false);
  }
  assert.equal(c.setEvidence('listing', f.token()), false); assert.equal(c.setReason('inappropriate', f.token()), false);
  assert.equal('requestAdvice' in c, false); assert.equal('advice' in c.model(), false); assert.equal('canRequestAdvice' in c.model(), false);
});
test('listing lane rejects message and AI routes, extra data, alternate bytes and invalid Unicode before any transport', () => {
  const decision = { expectedRevision: 2, requestId: id(9000), action: 'hide', reason: 'safety', summary: 'A human finding with enough explanation.', evidenceReportId: null, evidenceExcerpt: 'exact listing' };
  const check = (path, method, value) => validateCircleReviewRequest(path, { method, ...(value === undefined ? {} : { body: typeof value === 'string' ? value : JSON.stringify(value) }) });
  assert(check(base, 'POST', decision)); assert(check(base + '/coverage/decision', 'POST', { ...decision, sessionId: id(2) }));
  assert(check(base + '/coverage', 'POST', { action: 'start', expectedRevision: 2, contentHash: null }));
  assert(check(base + '/coverage', 'POST', { action: 'ack', sessionId: id(2), pageToken: id(3) }));
  assert(check(base + '/coverage?sessionId=' + id(2) + '&page=42949673', 'GET'));
  for (const path of [base + '/advice', '/api/admin/circles/messages', `/api/admin/circles/${circle}/messages/${other}`, base + '?', base + '/coverage?sessionId=' + id(2) + '&page=42949674', base + '/coverage?sessionId=' + id(2) + '&page=01']) assert.equal(check(path, 'GET'), false);
  for (const value of [{ ...decision, reason: 'inappropriate' }, { ...decision, contentHash: 'a'.repeat(64) }, { ...decision, summary: 'Bad surrogate in summary: \ud800' }, { ...decision, evidenceExcerpt: 'Bad \udc00 excerpt' }, { ...decision, evidenceReportId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'.toUpperCase() }, JSON.stringify(decision) + ' ', { requestId: decision.requestId, ...decision }, { ...decision, summary: ' Private untrimmed summary text. ' }]) assert.equal(check(base, 'POST', value), false);
  assert.equal(check(base + '/coverage', 'POST', { action: 'start', expectedRevision: 2 }), false);
  assert.equal(check(base + '/coverage', 'POST', { action: 'start', expectedRevision: 2, contentHash: 'a'.repeat(64) }), false);
  assert.equal(check(base, 'GET', '{}'), false);
});
test.after(() => { assert.equal(closed, created); console.log('CIRCLE_REVIEWS_STATS ' + JSON.stringify({ created, closed, providerCalls: 0, syntheticOnly: true })); });
