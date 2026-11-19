import assert from 'node:assert/strict';
import { offlineApp } from './offline-app.mjs';
import { createReviewCoverageDb, rpc, IDS, requestId, CONTENT,
  COVERAGE_SOURCE_HASHES, COVERAGE_FIXTURE_LIMITS } from './review-coverage-db.mjs';
export { IDS, requestId, CONTENT, COVERAGE_SOURCE_HASHES, COVERAGE_FIXTURE_LIMITS };

/** Actual route handlers and service-role SQL. Identity and the narrow PostgREST
 * transport are synthetic; no authorization result or decision is substituted. */
export async function reviewCoverageApp({ fixture, reportCount = 101 } = {}) {
  const owned = !fixture, f = fixture ?? await createReviewCoverageDb({ reportCount });
  const app = offlineApp(), calls = [], argumentNames = new Map();
  let actor = f.reviewerId, closed = false;
  app.setMock('@/lib/getAuthenticatedMember', () => ({ getAuthenticatedMember: async () => actor
    ? { memberId: actor, member: { id: actor, display_name: 'Synthetic Explorer' } } : null }));
  app.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => ({ rpc: async (name, args) => {
    calls.push({ name, keys: Object.keys(args).sort() });
    try {
      assert.match(name, /^soe_circle_[a-z_]+$/);
      if (!argumentNames.has(name)) {
        const result = await f.db.query("SELECT proargnames FROM pg_proc WHERE proname=$1 AND pronamespace='public'::regnamespace", [name]);
        assert.equal(result.rows.length, 1, 'Exactly one fixture RPC must match');
        argumentNames.set(name, result.rows[0].proargnames);
      }
      const names = argumentNames.get(name);
      assert.deepEqual(Object.keys(args).sort(), [...names].sort(), 'Do not silently drop or invent RPC arguments');
      return { data: await rpc(f.db, name, names.map(key => args[key])), error: null };
    } catch (error) { return { data: null, error: { code: error.code ?? 'FIXTURE_ERROR' } }; }
  } }) }));
  let routes;
  try {
    routes = {
      listingQueue: app.load('app/api/admin/circles/reports/route.ts'),
      listingDetail: app.load('app/api/admin/circles/reports/[circleId]/route.ts'),
      listingCoverage: app.load('app/api/admin/circles/reports/[circleId]/coverage/route.ts'),
      listingDecision: app.load('app/api/admin/circles/reports/[circleId]/coverage/decision/route.ts'),
      messageQueue: app.load('app/api/admin/circles/messages/route.ts'),
      messageDetail: app.load('app/api/admin/circles/[circleId]/messages/[messageId]/route.ts'),
      messageCoverage: app.load('app/api/admin/circles/[circleId]/messages/[messageId]/coverage/route.ts'),
      messageDecision: app.load('app/api/admin/circles/[circleId]/messages/[messageId]/coverage/decision/route.ts'),
    };
  } catch (error) { if (owned) await f.db.close(); throw error; }
  const targetPath = kind => kind === 'listing' ? `/api/admin/circles/reports/${f.circleId}`
    : `/api/admin/circles/${f.circleId}/messages/${f.messageId}`;
  async function dispatch(path, method = 'GET', body, signal) {
    assert.equal(closed, false, 'Fixture is closed');
    const url = new URL(path, 'https://review-coverage-fixture.test');
    assert.equal(url.origin, 'https://review-coverage-fixture.test');
    const request = new Request(url, { method, headers: { origin: url.origin,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }), signal });
    let route, params = {};
    if (url.pathname === '/api/admin/circles/reports') route = routes.listingQueue;
    else if (url.pathname === '/api/admin/circles/messages') route = routes.messageQueue;
    else {
      let match = /^\/api\/admin\/circles\/reports\/([^/]+)(\/coverage(?:\/decision)?)?$/.exec(url.pathname);
      if (match) { params = { circleId: match[1] }; route = match[2] === '/coverage/decision' ? routes.listingDecision : match[2] ? routes.listingCoverage : routes.listingDetail; }
      match = /^\/api\/admin\/circles\/([^/]+)\/messages\/([^/]+)(\/coverage(?:\/decision)?)?$/.exec(url.pathname);
      if (match) { params = { circleId: match[1], messageId: match[2] }; route = match[3] === '/coverage/decision' ? routes.messageDecision : match[3] ? routes.messageCoverage : routes.messageDetail; }
    }
    assert.equal(typeof route?.[method], 'function', 'Unexpected composed route: ' + method + ' ' + url.pathname);
    return route[method](request, { params: Promise.resolve(params) });
  }
  async function json(path, method = 'GET', body, expectedStatus = 200) {
    const response = await dispatch(path, method, body);
    assert.equal(response.status, expectedStatus, `${method} ${path}`);
    assert.match(response.headers.get('cache-control'), /private.*no-store/);
    return response.json();
  }
  const detail = kind => json(targetPath(kind));
  async function start(kind) {
    const snapshot = await detail(kind);
    return json(targetPath(kind) + '/coverage', 'POST', { action: 'start', expectedRevision: snapshot.revision, contentHash: snapshot.contentHash ?? null });
  }
  const page = (kind, sessionId, pageNumber) => json(targetPath(kind) + '/coverage?sessionId=' + sessionId + (pageNumber === undefined ? '' : '&page=' + pageNumber));
  const ack = (kind, value) => json(targetPath(kind) + '/coverage', 'POST', { action: 'ack', sessionId: value.sessionId, pageToken: value.pageToken });
  async function complete(kind) {
    let value = await start(kind), acknowledged = 0;
    const reportIds = [];
    while (!value.complete) {
      assert.equal(value.acknowledged, false);
      assert.equal(value.pageNumber, Math.floor(acknowledged / 50) + 1);
      assert.equal(value.reviewedReports, acknowledged);
      reportIds.push(...value.reports.map(report => report.id));
      acknowledged += value.reports.length;
      value = await ack(kind, value);
      assert.equal(value.reviewedReports, acknowledged);
    }
    assert.equal(new Set(reportIds).size, value.totalReports);
    assert.equal(acknowledged, value.totalReports);
    return { page: value, reportIds };
  }
  function decision(kind, value, overrides = {}) {
    const evidence = f.evidence[kind];
    return { expectedRevision: value.revision, ...(kind === 'message' ? { contentHash: value.contentHash } : {}),
      requestId: requestId(), action: 'hide', reason: 'safety',
      summary: 'A human reviewed the complete case and identified a conduct concern.',
      evidenceReportId: evidence.id, evidenceExcerpt: evidence.note.slice(0, 100), sessionId: value.sessionId, ...overrides };
  }
  async function addReport(kind) {
    const note = 'Additional private synthetic report ' + requestId();
    if (kind === 'listing') return rpc(f.db, 'soe_circle_report', [IDS.host, null, f.circleId, 'safety', note, requestId()]);
    const state = await rpc(f.db, 'soe_circle_message_state', [IDS.host, f.circleId, f.messageId]);
    return rpc(f.db, 'soe_circle_message_action', [IDS.host, f.circleId, f.messageId, state.revision, state.contentHash, requestId(), 'report', 'safety', note]);
  }
  async function counts(kind) {
    const listing = kind === 'listing', table = listing ? 'circle_reports' : 'circle_message_reports';
    const key = listing ? 'cohort_id' : 'message_id', id = listing ? f.circleId : f.messageId;
    const reports = await f.db.query(`SELECT count(*)::int total,count(*) FILTER(WHERE status='open')::int open FROM ${table} WHERE ${key}=$1`, [id]);
    const decisions = await f.db.query(`SELECT count(*)::int n FROM ${listing ? 'circle_review_decisions' : 'circle_message_decisions'} WHERE ${key}=$1`, [id]);
    return { ...reports.rows[0], decisions: decisions.rows[0].n };
  }
  return { ...f, app, routes, calls, targetPath, dispatch, json, detail, start, page, ack, complete, decision, addReport, counts,
    setActor(value) { actor = value; }, getActor() { return actor; },
    async close() { if (closed) return; closed = true; if (owned) await f.db.close(); } };
}
