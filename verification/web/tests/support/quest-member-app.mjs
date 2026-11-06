// Actual member/discussion handlers over the current strict disposable SQL chain.
// Only credential verification and the narrow SDK/PostgREST transport are doubled.
import assert from 'node:assert/strict';
import { offlineApp } from './offline-app.mjs';
import { rpc, requestId, COVERAGE_FIXTURE_LIMITS } from './review-coverage-db.mjs';
import { createPublicProfileApp, publicProfileAppHashes } from './public-profile-app.mjs';
import { runSql } from './circle-live-db.mjs';

export const QUEST_ORIGIN = 'https://quest-member-composed.test';
export const QUEST_TEST_MEETING = 'https://quest-meeting.fixture.invalid/room?invite=synthetic';
export const SUBJECTS = Object.freeze({ author: '72111111-1111-4111-8111-111111111111', outsider: '72222222-2222-4222-8222-222222222222' });
export const TOKENS = Object.freeze({ author: 'NONISSUED_QUEST_COMPOSED_AUTHOR', outsider: 'NONISSUED_QUEST_COMPOSED_OUTSIDER' });
export { publicProfileAppHashes as questMemberAppHashes, COVERAGE_FIXTURE_LIMITS };

export async function questMemberApp({ sharedSalon = false, writing = false, meeting = false, reading = false } = {}) {
  const f = await createPublicProfileApp(), app = offlineApp(), calls = [], argumentNames = new Map();
  const requestAccounts = new WeakMap();
  const salonRpc = 'soe_circle_salon_presence';
  const allowed = ['soe_circle_discussion_read_profiles', 'soe_circle_discussion_thread_profiles'];
  if (writing) allowed.push('soe_circle_discussion_target', 'soe_circle_discussion_post', 'soe_circle_discussion_receipt_profiles');
  if (sharedSalon) allowed.push(salonRpc);
  if (meeting || reading) allowed.push('soe_circle_detail_profiles');
  let selected = { actor: 'author', provider: 'supabase' }, closed = false;
  const memberId = actor => actor === 'author' ? f.authorId : f.reviewerId;
  // Explicit synthetic identity authority. SQL independently authorizes the mapped
  // member; a real reviewer grant does not confer ordinary Circle membership.
  app.setMock('@/lib/getAuthenticatedMember', () => ({ getAuthenticatedMember: async req => {
    const bearer = req.headers.get('authorization');
    const account = requestAccounts.get(req) ?? selected;
    const actor = bearer ? Object.keys(TOKENS).find(key => bearer === 'Bearer ' + TOKENS[key]) : account?.actor;
    if (!actor) return null;
    const provider = bearer ? 'supabase' : account.provider;
    const subject = provider === 'supabase' ? SUBJECTS[actor] : memberId(actor);
    return { memberId: memberId(actor), member: { id: memberId(actor), supabase_auth_id: SUBJECTS[actor], display_name: 'Synthetic own-session name' }, auth: { provider, subject } };
  } }));
  async function callRpc(name, args) {
    const call = { name, keys: Object.keys(args).sort(), status: 'pending' }; calls.push(call);
    try {
      assert.ok(allowed.includes(name), 'Unexpected Quest composed RPC: ' + name);
      if (!argumentNames.has(name)) {
        const result = await f.db.query("SELECT proargnames FROM pg_proc WHERE proname=$1 AND pronamespace='public'::regnamespace", [name]);
        assert.equal(result.rows.length, 1); argumentNames.set(name, result.rows[0].proargnames);
      }
      const names = argumentNames.get(name);
      assert.deepEqual(Object.keys(args).sort(), [...names].sort());
      const data = await rpc(f.db, name, names.map(key => args[key])); call.status = 'ok';
      return { data, error: null };
    } catch (error) { call.status = error.code ?? 'FIXTURE_ERROR'; return { data: null, error: { code: call.status } }; }
  }
  app.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => ({
    rpc: (name, args) => name === salonRpc ? { abortSignal(signal) { signal.throwIfAborted(); return callRpc(name, args); } } : callRpc(name, args),
  }) }));
  try {
    const member = app.load('app/api/auth/member/route.ts'), discussion = app.load('app/api/circles/[circleId]/discussion/route.ts');
    const preview = writing ? app.load('app/api/circles/[circleId]/discussion/preview/route.ts') : null;
    const circleDetailRoute = meeting || reading ? app.load('app/api/circles/[circleId]/route.ts') : null;
    const passage = reading ? app.load('app/api/great-books/passage/route.ts') : null;
    if (sharedSalon || meeting) await f.db.query("UPDATE book_cohorts SET circle_format='online' WHERE id=$1", [f.circleId]);
    if (meeting) await f.db.query('INSERT INTO circle_private(cohort_id,online_url) VALUES ($1,$2) ON CONFLICT (cohort_id) DO UPDATE SET online_url=excluded.online_url',
      [f.circleId, QUEST_TEST_MEETING]);
    let salon;
    if (sharedSalon) {
      app.context.AbortSignal = AbortSignal;
      await runSql(f.db, 'docs/sql/circle-salon-presence-apply.sql');
      salon = app.load('app/api/circles/[circleId]/salon-presence/route.ts');
    }
    const format = app.load('lib/circles/thread.ts').formatDiscussionContent;
    // 105 tied historical roots test exact keyset paging beyond the old 100.
    // Direct owner setup is synthetic, separate from all browser operations.
    await f.db.query(`INSERT INTO seminar_messages(id,cohort_id,member_id,member_name,content,created_at)
      SELECT ('f1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,$1,$2,'Synthetic archive author',
        'Synthetic archived contribution '||n,'2020-01-01T00:00:00Z'::timestamptz FROM generate_series(1,105)n`, [f.circleId, f.authorId]);
    const replies = [];
    for (const text of ['Independent visible reply remains readable.', 'WITHDRAWN_REPLY_TEXT_MUST_NOT_LEAVE_SQL']) {
      const parent = await rpc(f.db, 'soe_circle_discussion_target', [f.authorId, f.circleId, f.messageId]);
      const saved = await rpc(f.db, 'soe_circle_discussion_post', [f.authorId, f.circleId, requestId(),
        format(f.circleId, text, f.messageId), f.messageId, parent.target.revision, parent.target.contentHash, 'Synthetic reply author']);
      replies.push(saved.message.id);
    }
    // Actual author withdrawal and actual human decision RPCs produce tombstones;
    // the HTTP transport never fabricates a visibility or authorization result.
    const state = await rpc(f.db, 'soe_circle_message_state', [f.authorId, f.circleId, replies[1]]);
    await rpc(f.db, 'soe_circle_message_action', [f.authorId, f.circleId, replies[1], state.revision, state.contentHash, requestId(), 'withdraw', null, null]);
    const detail = await rpc(f.db, 'soe_circle_message_review_detail', [f.reviewerId, f.circleId, f.messageId]);
    await rpc(f.db, 'soe_circle_message_review_decide', [f.reviewerId, f.circleId, f.messageId, detail.revision, detail.contentHash,
      requestId(), 'hide', 'safety', 'Synthetic human decision for testing the restricted projection.', null, 'Synthetic disagreement']);
    const expectedArchiveIds = (await f.db.query("SELECT id FROM seminar_messages WHERE cohort_id=$1 ORDER BY coalesce(created_at,'-infinity'::timestamptz) DESC,id DESC", [f.circleId])).rows.map(row => row.id);
    assert.equal(expectedArchiveIds.length, 108);
    return { ...f, calls, replies, expectedArchiveIds, root: f.messageId,
      select(actor = 'author', provider = 'supabase') { assert.ok(['author', 'outsider'].includes(actor)); assert.ok(['supabase', 'wallet'].includes(provider)); selected = { actor, provider }; },
      async receiptCount() { return (await f.db.query('SELECT count(*)::int AS n FROM circle_discussion_post_receipts')).rows[0].n; },
      async leave() {
        const result = await f.db.query('SELECT circle_participation_revision FROM book_cohorts WHERE id=$1', [f.circleId]);
        return rpc(f.db, 'soe_circle_leave', [f.authorId, f.circleId, result.rows[0].circle_participation_revision, requestId()]);
      },
      enableSalon(enabled) { app.context.process.env.SOE_SHARED_SALON_ENABLED = enabled ? 'true' : 'false'; },
      async dispatch(path, headers = {}, signal, { body, account } = {}) {
        assert.equal(closed, false);
        const url = new URL(path, QUEST_ORIGIN); assert.equal(url.origin, QUEST_ORIGIN);
        const request = new Request(url, { method: body === undefined ? 'GET' : 'POST', headers, signal, body });
        if (account) requestAccounts.set(request, account);
        // Cookie accessor is a NextRequest transport port, never an issued cookie.
        Object.defineProperty(request, 'cookies', { value: { get: () => undefined } });
        if (url.pathname === '/api/auth/member') { assert.equal(url.search, ''); assert.equal(request.headers.get('authorization'), null); return member.GET(request); }
        if (passage && url.pathname === '/api/great-books/passage') {
          assert.equal(request.method, 'GET');
          for (const field of ['authorization', 'apikey', 'cookie', 'referer']) assert.equal(request.headers.get(field), null);
          return passage.GET(request);
        }
        const salonMatch = /^\/api\/circles\/([^/]+)\/salon-presence$/.exec(url.pathname);
        if (salon && salonMatch) return salon.POST(request, { params: Promise.resolve({ circleId: salonMatch[1] }) });
        const detailMatch = /^\/api\/circles\/([^/]+)$/.exec(url.pathname);
        if (circleDetailRoute && detailMatch) {
          assert.equal(request.method, 'GET'); assert.equal(url.search, '');
          Object.defineProperty(request, 'nextUrl', { value: url });
          return circleDetailRoute.GET(request, { params: Promise.resolve({ circleId: detailMatch[1] }) });
        }
        const match = /^\/api\/circles\/([^/]+)\/discussion(\/preview)?$/.exec(url.pathname);
        assert.ok(match, 'Unexpected Quest composed route');
        assert.ok(writing || (request.method === 'GET' && !url.searchParams.has('requestId')));
        const handler = match[2] ? preview : discussion;
        assert.equal(typeof handler?.[request.method], 'function');
        return handler[request.method](request, { params: Promise.resolve({ circleId: match[1] }) });
      },
      async close() { if (closed) return; closed = true; await f.close(); },
    };
  } catch (error) { await f.close(); throw error; }
}
