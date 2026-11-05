import test from 'node:test';
import assert from 'node:assert/strict';
import { lstatSync } from 'node:fs';
const resident = name => { const s = lstatSync(new URL(name, import.meta.url)); assert(s.isFile() && !s.isSymbolicLink() && (!s.size || s.blocks)); };
resident('./load-source.mjs');
const { sourceLoader } = await import('./load-source.mjs');
const load = sourceLoader(), { createMessageReviews } = load('platforms/shared/message-reviews.ts');
const { validateMessageReviewRequest } = load('lib/circles/message-review-wire.ts');
const circle = '11111111-1111-4111-8111-111111111111', message = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333', origin = 'https://portable-review.invalid';
const base = `/api/admin/circles/${circle}/messages/${message}`, content = 'Synthetic exact message evidence for independent human review.';
const hash = 'a'.repeat(64), stamp = '2026-11-05T12:00:00Z';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const clone = value => JSON.parse(JSON.stringify(value)), tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const settled = promise => Promise.race([promise.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 40))]);
let created = 0, closed = 0;
function fixture(t, { count = 1, visibility = 'visible', synchronousOwner = false, timeoutMs = 100, throwStop = false } = {}) {
  created++; let scope = 'synthetic-review-owner', revision = 2, sequence = 1000, countNow = count, visible = visibility;
  let hook = null, bearerHook = null, keyHook = null, credentials = 0, keys = 0, expiryMs = 300000, scopeBroken = false;
  const calls = [], listeners = new Set(), decisions = [], sessions = new Map(), receipts = new Map(), snapshots = [];
  const reports = () => Array.from({ length: countNow }, (_, i) => ({ id: id(i + 1), reason: 'safety', note: `Private report ${i + 1} exact evidence for the human reviewer.`, created_at: stamp }));
  const detail = () => ({ circle: { id: circle, title: 'Assigned synthetic Circle' }, message: { id: message, member_name: 'Synthetic author', content, created_at: stamp, visibility: visible },
    revision, contentHash: hash, reports: reports().slice(0, 100), decisions: clone(decisions), complete: countNow <= 100 });
  const project = (s, pageNumber = s.frontier) => ({ sessionId: s.id, circleId: circle, messageId: message, revision: s.revision, contentHash: hash,
    totalReports: s.total, reviewedReports: s.reviewed, pageToken: id(s.sequence + pageNumber), reports: reports().slice((pageNumber - 1) * 50, pageNumber * 50),
    complete: s.reviewed === s.total, expiresAt: new Date(s.expires).toISOString(), pageNumber, acknowledged: s.reviewed === s.total || pageNumber * 50 <= s.reviewed });
  const controller = createMessageReviews({ origin, timeoutMs, initialOnline: true,
    owner: { scope: () => { if (scopeBroken) throw Error('Synthetic owner scope failure'); return scope; }, subscribe(fn) { listeners.add(fn); if (synchronousOwner) fn(); return () => { listeners.delete(fn); if (throwStop) throw Error('Synthetic unsubscribe failure'); }; }, async bearer() { credentials++; return bearerHook ? bearerHook() : 'NONISSUED_SYNTHETIC_REVIEWER'; } },
    async newRequestId() { keys++; return keyHook ? keyHook() : id(++sequence); },
    reviewerTransport: async (url, options) => {
      const path = url.slice(origin.length); assert.equal(validateMessageReviewRequest(path, options), true);
      calls.push({ path, method: options.method, body: options.body });
      const respond = () => {
        let status = 200, body;
        const query = new URL(url).searchParams, input = options.body ? JSON.parse(options.body) : null;
        if (path.startsWith('/api/admin/circles/messages')) body = { items: query.has('after') ? [] : [{ circleId: circle, messageId: message, circleTitle: 'Assigned synthetic Circle', visibility: visible, openReports: countNow, revision }], nextCursor: null };
        else if (path === base && options.method === 'GET') body = detail();
        else if (path === base + '/advice') body = { circleId: circle, messageId: message, revision, contentHash: hash, consentRevision: 1, policy: 'anthropic-message-review-v1',
          advice: { observations: [{ rule: 'context', excerpt: 'Synthetic exact message', note: 'Check missing context yourself.' }], counterevidence: [], questions: [] } };
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
          if (prior) { if (prior.bytes !== options.body) { status = 409; body = {}; } else body = { ...clone(prior.body), replayed: true, safety: { revision, visibility: visible } }; }
          else if (input.expectedRevision !== revision || input.contentHash !== hash || (s ? s.invalid || s.expires <= Date.now() || s.reviewed !== countNow : countNow > 100)) { status = 409; body = {}; }
          else {
            const decision = { id: id(++sequence), action: input.action, reason: input.reason, summary: input.summary, report_count: countNow, created_at: stamp };
            revision++; visible = visible === 'withdrawn' ? visible : input.action === 'hide' ? 'hidden' : 'visible'; countNow = 0; decisions.unshift(decision);
            body = { requestId: input.requestId, circleId: circle, messageId: message, decision, safety: { revision, visibility: visible }, replayed: false, ...(input.sessionId ? { sessionId: input.sessionId } : {}) };
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
    changeOwner() { scope = 'another-owner'; for (const fn of listeners) fn(); },
    failOwner() { scopeBroken = true; for (const fn of listeners) fn(); },
    async open() { controller.connect(); await controller.loadQueue(token()); await controller.openCase(circle, message, token()); },
    async cover() { await controller.startCoverage(token()); while (!controller.model().coverage.page.complete) { controller.confirmCoverage(true, token()); await controller.ackCoverage(token()); } },
    draft(action = 'hide', source = 'message', excerpt = 'Synthetic exact message') {
      controller.setAction(action, token()); controller.setReason(action === 'hide' ? 'safety' : 'resolved', token());
      controller.setSummary('The human reviewer recorded a specific conduct finding with a private source.', token());
      if (source !== undefined && (source === 'message' || controller.model().evidence?.id !== source)) controller.setEvidence(source, token());
      if (action === 'hide') controller.setExcerpt(excerpt, token()); controller.confirmDecision(true, token());
    } };
}

test('connection and foreground never fetch; fresh selected case requires current queue membership', async t => {
  const f = fixture(t), c = f.controller; f.connect(); c.activity(false); c.activity(true); c.connectivity(false); c.connectivity(true);
  await c.openCase(circle, message, f.token()); assert.equal(f.calls.length, 0); await c.loadQueue(f.token());
  const count = f.credentials; await c.openCase(circle, other, f.token()); assert.equal(f.credentials, count);
  await c.openCase(circle, message, f.token()); assert.equal(c.model().detail.message.id, message); assert.equal(f.calls.length, 2);
  assert.equal(JSON.stringify(c.model()).includes('NONISSUED'), false);
});
test('queue pages replace and reject duplicate, nonascending and nonadvancing UUID sequences', async t => {
  for (const bad of ['duplicate', 'descending', 'cursor']) {
    const f = fixture(t); f.connect();
    f.setHook(async ({ respond }) => { const r = respond(), value = await r.json(), item = value.items[0];
      value.items = bad === 'duplicate' ? [item, item] : bad === 'descending' ? [{ ...item, messageId: other }, item] : [item];
      value.nextCursor = bad === 'cursor' ? other : null; return { ...r, json: async () => value }; });
    await f.controller.loadQueue(f.token()); assert.equal(f.controller.model().queue, null); assert.equal(f.controller.model().phase, 'unavailable');
  }
});
test('complete 0,50,100-report cases require explicit valid human draft and confirm the exact decision', async t => {
  for (const count of [0, 50, 100]) {
    const f = fixture(t, { count }); await f.open(); f.draft(); assert.equal(f.controller.model().canSubmit, true);
    await f.controller.submitDecision(f.token()); const m = f.controller.model();
    assert.equal(m.decisionConfirmed, true); assert.equal(m.receipt.decision.report_count, count); assert.equal(m.detail.message.visibility, 'hidden');
    assert.equal(m.draft.confirmed, false); assert.equal(m.canSubmit, false); assert.equal(f.decisions.length, 1);
    assert.equal(f.calls.filter(x => x.method === 'POST')[0].path, base);
  }
});
test('101 and250 reports require every bounded page; earlier-page evidence survives without accumulating reports or enabling AI', async t => {
  for (const count of [101, 250]) {
    const f = fixture(t, { count }), c = f.controller; await f.open(); assert.equal(c.model().detail.reports.length, 0);
    assert.equal(c.model().canEditDraft, false); assert.equal(c.model().canRequestAdvice, false); await c.startCoverage(f.token());
    const first = c.model().coverage.page.reports[0]; c.setEvidence(first.id, f.token()); const ids = [];
    while (!c.model().coverage.page.complete) {
      ids.push(...c.model().coverage.page.reports.map(r => r.id)); c.confirmCoverage(true, f.token()); await c.ackCoverage(f.token());
    }
    assert.equal(ids.length, count); assert.equal(new Set(ids).size, count); assert.equal(c.model().evidence.id, first.id);
    assert.equal(c.model().canRequestAdvice, false); await c.requestAdvice(f.token());
    assert.equal(f.calls.some(x => x.path.endsWith('/advice')), false);
    await c.openCoveragePage(1, f.token()); assert.equal(c.model().coverage.page.acknowledged, true); assert.equal(c.model().coverage.canAcknowledge, false);
    f.draft('hide', first.id, first.note.slice(0, 20)); await c.submitDecision(f.token());
    assert.equal(c.model().decisionConfirmed, true); assert.equal(c.model().receipt.decision.report_count, count);
    const post = f.calls.find(x => x.path.endsWith('/coverage/decision')); assert.equal(JSON.parse(post.body).evidenceReportId, first.id);
    for (const m of f.snapshots) { if (m.coverage?.page) assert(m.coverage.page.reports.length <= 50); if (m.detail && !m.detail.complete) assert.equal(m.detail.reports.length, 0); }
  }
});
test('withdrawn messages remain human-reviewable; restore cannot reverse withdrawal and never sends evidence', async t => {
  const f = fixture(t, { visibility: 'withdrawn' }); await f.open(); assert.equal(f.controller.model().canRequestAdvice, false);
  f.draft('restore'); await f.controller.submitDecision(f.token()); assert.equal(f.controller.model().detail.message.visibility, 'withdrawn');
  const body = JSON.parse(f.calls.find(x => x.method === 'POST').body); assert.equal(body.evidenceReportId, null); assert.equal(body.evidenceExcerpt, null);
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
test('malformed receipt bindings stay unknown and never trigger automatic readback', async t => {
  for (const patch of [{ requestId: other }, { circleId: other }, { messageId: other }, { safety: { revision: 2, visibility: 'hidden' } }, { safety: { revision: 4, visibility: 'hidden' } }, { safety: { revision: 3, visibility: 'visible' } }]) {
    const f = fixture(t); await f.open(); f.draft(); f.setHook(async ({ options, respond }) => { const r = respond(); return options.method === 'POST' ? { ...r, json: async () => ({ ...await r.json(), ...patch }) } : r; });
    await f.controller.submitDecision(f.token()); assert.equal(f.controller.model().phase, 'unknown'); assert.equal(f.controller.model().pendingDecision, true); assert.equal(f.calls.length, 3);
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
test('captured tokens bind every edit and same-message reselection before credentials or UUID work', async t => {
  const f = fixture(t), c = f.controller; await f.open(); const old = f.token(); f.draft();
  const edited = c.model().draft.summary; c.setSummary('Retained stale callback must not change current draft.', old); c.confirmDecision(false, old);
  assert.equal(c.model().draft.summary, edited); assert.equal(c.model().draft.confirmed, true);
  c.back(f.token()); await f.open(); const before = [f.credentials, f.keys, f.calls.length];
  for (const token of [old, { ...f.token(), extra: true }, Object.create(f.token()), { ...f.token(), circleId: other }]) {
    await c.loadQueue(token); await c.submitDecision(token); await c.requestAdvice(token); c.setAction('hide', token);
  }
  assert.deepEqual([f.credentials, f.keys, f.calls.length], before);
});
test('advice is deliberate, snapshot-bound, quote-checked and never becomes decision evidence', async t => {
  const f = fixture(t), c = f.controller; await f.open(); f.draft(); assert.equal(f.calls.length, 2);
  await c.requestAdvice(f.token()); assert.equal(c.model().draft.confirmed, false); assert.equal(c.model().advice.observations.length, 1); assert.equal(f.decisions.length, 0);
  const sent = JSON.parse(f.calls.at(-1).body); assert.deepEqual(Object.keys(sent), ['expectedRevision', 'contentHash']);
  f.setHook(({ respond }) => { const r = respond(); return { ...r, json: async () => ({ circleId: circle, messageId: message, revision: 2, contentHash: hash, consentRevision: 1, policy: 'anthropic-message-review-v1', advice: { observations: [{ rule: 'safety', excerpt: 'fabricated quote', note: 'bad' }], counterevidence: [], questions: [] } }) }; });
  await c.requestAdvice(f.token()); assert.equal(c.model().advice, null); assert.equal(c.model().canEditDraft, true); assert.equal(f.decisions.length, 0);
});
test('AI errors preserve human review for quota/unavailable outcomes and retire private case on denied authority', async t => {
  for (const status of [429, 503, 401, 403, 404, 409]) {
    const f = fixture(t); await f.open(); f.setHook(({ respond }) => ({ ...respond(), status, json: async () => ({}) })); await f.controller.requestAdvice(f.token());
    assert.equal(f.controller.model().advice, null); assert.equal(f.controller.model().canEditDraft, [429, 503].includes(status));
    assert.equal(f.decisions.length, 0); const count = f.calls.length; await tick(); assert.equal(f.calls.length, count);
  }
});
test('reentrant observer retirement fences queue, case, coverage, advice and prepared decision requests', async t => {
  for (const operation of ['queue', 'case', 'coverage', 'advice', 'decision']) {
    const f = fixture(t, { count: operation === 'coverage' ? 101 : 1 }), c = f.controller;
    if (operation === 'queue') f.connect(); else if (operation === 'case') { f.connect(); await c.loadQueue(f.token()); } else await f.open();
    if (operation === 'decision') f.draft(); const count = f.calls.length;
    const stop = c.subscribe(m => { if (m.busy) c.disconnect(); });
    if (operation === 'queue') await c.loadQueue(f.token());
    if (operation === 'case') await c.openCase(circle, message, f.token());
    if (operation === 'coverage') await c.startCoverage(f.token());
    if (operation === 'advice') await c.requestAdvice(f.token());
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
    const before = f.calls.length, running = stage === 'key' ? c.submitDecision(f.token()) : c.requestAdvice(f.token()); await tick();
    if (retire === 'owner') f.changeOwner(); else c[retire](false);
    assert.equal(await settled(running), true); assert.equal(c.model().detail, null); assert.equal(c.model().advice, null);
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
test('reentrant confirmation observers cannot issue advice, acknowledge pages or save decisions', async t => {
  for (const kind of ['decision', 'page']) {
    const f = fixture(t, { count: kind === 'page' ? 101 : 1 }), c = f.controller; await f.open();
    if (kind === 'page') await c.startCoverage(f.token()); else { f.draft(); c.confirmDecision(false, f.token()); }
    const count = f.calls.length;
    const stop = c.subscribe(m => { if (m.draft.confirmed) { void c.requestAdvice(m.action); void c.submitDecision(m.action); } if (m.coverage?.confirmed) void c.ackCoverage(m.action); });
    if (kind === 'page') c.confirmCoverage(true, f.token()); else c.confirmDecision(true, f.token()); await tick(); stop();
    assert.equal(f.calls.length, count); assert.equal(f.keys, 0);
  }
});
test.after(() => { assert.equal(closed, created); console.log('MESSAGE_REVIEWS_STATS ' + JSON.stringify({ created, closed, providerCalls: 0, syntheticOnly: true })); });
