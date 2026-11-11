import assert from 'node:assert/strict';
import test from 'node:test';
import { offlineApp } from './support/offline-app.mjs';

// Actual route modules, synthetic authentication/database/provider boundaries.
// The process network guard remains active; no hosted requests or messages occur.
const ID = '3f2b8c1e-9d4a-4f6b-a2c7-1e5d9b0f4a73';
const VALID_IDS = [ID, ID.toUpperCase(), '01890a5d-ac96-774b-bcce-b302099a8057'];
const INVALID_IDS = ['not-a-uuid', ID + 'x', '3f2b8c1e-9d4a-4f6b-a2c71e5d9b0f4a73', "1' or '1'='1"];
const MEMBER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const COMMUNITY = '33333333-3333-4333-8333-333333333333';
const AUTH = { memberId: MEMBER, member: { id: MEMBER, supabase_auth_id: MEMBER, display_name: 'Fixture member' } };
const ORIGIN = 'https://uuid-fixture.invalid';

function fixture({ auth = null, access = null, seed = {}, unpauseInFixture = false } = {}) {
  const app = offlineApp();
  const db = app.fakes.resetDb(seed);
  const calls = { auth: 0, access: 0, admin: 0, fetch: [], effects: [], modelLimit: 0 };
  const unexpected = name => { calls.effects.push(name); throw Error(`Unexpected ${name} in UUID guard test`); };
  app.context.performance = performance;
  app.context.console = { ...console, info() {}, warn() {}, error() {} };
  app.context.fetch = async (url, init) => { calls.fetch.push({ url, init }); return unexpected('provider request'); };
  app.setMock('@/lib/getAuthenticatedMember', () => ({
    getAuthenticatedMember: async () => { calls.auth++; return auth; },
    getAuthenticatedEdgeMember: async () => { calls.auth++; return auth ? { ...auth.member, id: auth.memberId } : null; },
  }));
  app.setMock('@/lib/movement/access', () => ({ getMovementAccess: async () => { calls.access++; return access; } }));
  app.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => { calls.admin++; return db; } }));
  app.setMock('@/lib/feed/activityFeed', () => ({ emitActivity: async () => unexpected('activity') }));
  app.setMock('@/lib/ai/anthropic', () => ({ createAnthropicClient: () => unexpected('AI'), resolveClaudeModel: () => 'UNISSUED_FIXTURE_MODEL' }));
  app.setMock('@/lib/claude/thinkers', () => ({ buildSystemPrompt: () => unexpected('prompt'), getThinkerProfile: () => unexpected('thinker') }));
  app.setMock('@/lib/thinkerMemory', () => ({ getMemory: async () => unexpected('memory') }));
  app.setMock('@/lib/thinkerActions', () => ({ parseActions: () => unexpected('actions'), executeThinkerAction: async () => unexpected('execute action') }));
  app.setMock('@/lib/rateLimit', () => ({ limitModelCall: () => { calls.modelLimit++; return Response.json({ error: 'Fixture model limit' }, { status: 429 }); } }));
  if (unpauseInFixture) {
    // Exercise validation beyond the dormant gate in this VM only. The real
    // release module remains false, separately asserted below for every handler.
    app.setMock('@/lib/twiddle/release', () => ({ LEGACY_TWIDDLE_AVAILABLE: true, legacyTwiddleUnavailable: () => unexpected('fixture release branch') }));
  }
  const request = (body, path = '/api/fixture', headers = {}) => app.fakes.makeReq(body, { url: ORIGIN + path, headers: { origin: ORIGIN, ...headers } });
  return { app, db, calls, request, route: path => app.load(`app/api/${path}/route.ts`) };
}

function noEffects(f, { reads = false } = {}) {
  assert.deepEqual(f.calls.effects, []);
  assert.deepEqual(f.calls.fetch, []);
  assert.equal((reads ? f.db.log.filter(entry => entry.op !== 'select') : f.db.log).length, 0);
}
function noCache(response) { assert.match(response.headers.get('cache-control'), /private.*no-store/); }
const context = (id, key = 'id') => ({ params: Promise.resolve({ [key]: id }) });

test('merch suggestion UUIDs reach access checks; malformed IDs never reach access or data', async () => {
  for (const id of VALID_IDS) {
    const f = fixture(), response = await f.route('merch/suggestions/[id]').PATCH(f.request({ status: 'approved' }), context(id));
    assert.equal(response.status, 401); assert.equal(f.calls.access, 1); noCache(response); noEffects(f);
  }
  for (const id of INVALID_IDS) {
    const f = fixture({ access: { canManage: true } });
    assert.equal((await f.route('merch/suggestions/[id]').PATCH(f.request({ status: 'approved' }), context(id))).status, 400);
    assert.equal(f.calls.access, 0); noEffects(f);
  }
  const denied = fixture({ access: { canManage: false } });
  assert.equal((await denied.route('merch/suggestions/[id]').PATCH(denied.request({ status: 'approved' }), context(ID))).status, 403);
  noEffects(denied);
});

test('merch publish preserves manager and missing-provider gates after accepting valid UUIDs', async () => {
  const body = { suggestionId: ID, name: 'Fixture artwork', price: 20 };
  for (const [access, expected] of [[null, 401], [{ canManage: false }, 403]]) {
    const f = fixture({ access });
    assert.equal((await f.route('merch/publish').POST(f.request(body))).status, expected); noEffects(f);
  }
  for (const id of [...VALID_IDS, ...INVALID_IDS]) {
    const f = fixture({ access: { canManage: true } });
    assert.equal(f.app.context.process.env.PRINTFUL_API_KEY, undefined);
    const response = await f.route('merch/publish').POST(f.request({ ...body, suggestionId: id }));
    assert.equal(response.status, VALID_IDS.includes(id) ? 503 : 400); noCache(response); noEffects(f);
  }
});

test('generic room IDs reach authentication without admitting malformed IDs or forged member IDs', async () => {
  for (const id of [...VALID_IDS, ...INVALID_IDS]) {
    const f = fixture();
    const response = await f.route('rooms/[roomId]').POST(f.request({ action: 'join' }), context(id, 'roomId'));
    assert.equal(response.status, VALID_IDS.includes(id) ? 401 : 400);
    assert.equal(f.calls.auth, VALID_IDS.includes(id) ? 1 : 0); noCache(response); noEffects(f);
  }
  const f = fixture({ auth: AUTH });
  assert.equal((await f.route('rooms/[roomId]').POST(f.request({ action: 'end', memberId: OTHER }), context(ID, 'roomId'))).status, 403);
  noEffects(f);
});

test('every legacy room action stays unavailable for owners and outsiders before any room lookup or mutation', async () => {
  for (const roomType of [null, 'open', 'project', 'council', 'salon', 'live_session', 'future_private_room', undefined]) {
    for (const creator of [MEMBER, OTHER]) {
      for (const action of ['join', 'leave', 'end', 'transcript']) {
        const seed = {
          video_rooms: [{ id: ID, created_by: creator, room_type: roomType, is_live: true }],
          room_participants: [{ room_id: ID, member_id: MEMBER, joined_at: '2026-01-01' }],
          room_transcripts: [],
        };
        const f = fixture({ auth: AUTH, seed }), before = JSON.stringify(f.db.tables);
        const response = await f.route('rooms/[roomId]').POST(f.request({ action, content: 'Synthetic transcript' }), context(ID, 'roomId'));
        assert.equal(response.status, 409, `${roomType}:${creator}:${action}`);
        const body = await response.json();
        assert.equal(body.code, 'legacy_rooms_unavailable'); assert.match(body.error, /unavailable/);
        assert.equal(Object.hasOwn(body, 'success'), false);
        noCache(response); noEffects(f); assert.equal(f.calls.admin, 0);
        assert.equal(JSON.stringify(f.db.tables), before);
      }
    }
  }
});

test('missing or changing room state cannot bypass the legacy hold, which has no check/write race', async () => {
  const f = fixture({ auth: AUTH });
  f.db.from = () => { throw Error('Legacy mutation must not query room state'); };
  for (const id of VALID_IDS) {
    const response = await f.route('rooms/[roomId]').POST(f.request({ action: 'end' }), context(id, 'roomId'));
    assert.equal(response.status, 409); assert.equal((await response.json()).code, 'legacy_rooms_unavailable');
    noEffects(f); assert.equal(f.calls.admin, 0);
  }
});

test('room creation rejects supplied malformed project IDs before auth, database or provider effects', async () => {
  for (const projectId of [...INVALID_IDS, 42, {}]) {
    const f = fixture({ auth: AUTH });
    assert.equal((await f.route('rooms').POST(f.request({ title: 'Fixture room', projectId }))).status, 400);
    assert.equal(f.calls.auth, 0); noEffects(f);
  }
  for (const projectId of VALID_IDS) {
    const f = fixture();
    assert.equal((await f.route('rooms').POST(f.request({ title: 'Fixture room', projectId }))).status, 401); noEffects(f);
  }
  const f = fixture({ auth: AUTH });
  assert.equal((await f.route('rooms').POST(f.request({ title: 'Fixture room', projectId: ID }))).status, 409);
  noEffects(f); assert.equal(f.calls.admin, 0);
});

test('legacy creation cannot attach another project, create provider rooms or emit activity even with provider configuration', async () => {
  for (const projectId of [undefined, null, '', ...VALID_IDS]) {
    for (const roomType of ['open', 'project', 'council', 'salon', 'live_session']) {
      const f = fixture({ auth: AUTH, seed: { communities: [{ id: COMMUNITY, slug: 'society-of-explorers' }] } });
      f.app.context.process.env.DAILY_API_KEY = 'UNISSUED_SYNTHETIC_FIXTURE_ONLY';
      const before = JSON.stringify(f.db.tables);
      const response = await f.route('rooms').POST(f.request({ title: 'Fixture room', projectId, roomType, communitySlug: 'another-private-community' }));
      assert.equal(response.status, 409); noCache(response);
      const body = await response.json();
      assert.equal(body.code, 'legacy_rooms_unavailable'); assert.match(body.error, /unavailable/);
      assert.equal(Object.hasOwn(body, 'room'), false); assert.equal(Object.hasOwn(body, 'success'), false);
      assert.equal(JSON.stringify(f.db.tables), before); assert.equal(f.calls.admin, 0); noEffects(f);
    }
  }
  const forged = fixture({ auth: AUTH });
  assert.equal((await forged.route('rooms').POST(forged.request({ memberId: OTHER, projectId: ID }))).status, 403);
  assert.equal(forged.calls.admin, 0); noEffects(forged);
});

const inviteBody = id => ({ recipient_member_id: id, sender_match_hash: 'a'.repeat(64), encrypted_invite_payload: 'synthetic opaque fixture', workspace: { title: 'Fixture collaboration', description: 'No real invitation.' } });
test('project invites keep origin/auth gates and malformed recipient IDs never reach the member lookup', async () => {
  for (const [auth, headers, expected] of [[null, {}, 401], [AUTH, { origin: 'https://other.invalid' }, 403]]) {
    const f = fixture({ auth });
    const response = await f.route('projects/invite').POST(f.request(inviteBody(ID), '/api/projects/invite', headers));
    assert.equal(response.status, expected); noCache(response); noEffects(f);
  }
  for (const id of INVALID_IDS) {
    const f = fixture({ auth: AUTH });
    const response = await f.route('projects/invite').POST(f.request(inviteBody(id), '/api/projects/invite'));
    assert.equal(response.status, 400); assert.match((await response.json()).error, /valid UUID/); noEffects(f);
  }
});

test('valid invite recipients reach a bounded missing-member check without creating an invitation or calling a chain', async () => {
  for (const id of VALID_IDS) {
    const f = fixture({ auth: AUTH });
    f.app.context.fetch = async (url, init) => {
      f.calls.fetch.push({ url: String(url), init });
      const target = new URL(url);
      assert.equal(target.origin, 'http://offline.invalid'); assert.equal(target.pathname, '/rest/v1/members');
      assert.equal(init.method ?? 'GET', 'GET');
      assert.equal(target.searchParams.get('id'), `in.(${MEMBER},${id})`);
      return Response.json([]);
    };
    const response = await f.route('projects/invite').POST(f.request(inviteBody(id), '/api/projects/invite'));
    assert.equal(response.status, 404); assert.match((await response.json()).error, /must both exist/);
    assert.equal(f.calls.fetch.length, 1); assert.equal(f.db.log.length, 0); assert.deepEqual(f.calls.effects, []);
  }
});

const twiddleCases = [
  ['twiddle', 'POST', { content: 'Fixture thought', parent_id: ID }],
  ['twiddle/[id]', 'GET', undefined],
  ['twiddle/[id]', 'PATCH', { content: 'Fixture edit' }],
  ['twiddle/[id]/react', 'GET', undefined],
  ['twiddle/[id]/react', 'POST', { reaction_type: 'question' }],
  ['twiddle/[id]/respond', 'POST', { thinker_key: 'socrates', voice: true, consentToVoiceGeneration: true, executeActions: true, consentToExecuteActions: true }],
];
test('every real Twiddle handler remains paused before authentication, data, model, voice or action work', async () => {
  for (const [path, method, body] of [...twiddleCases, ['twiddle', 'GET', undefined]]) {
    for (const id of [ID, ...INVALID_IDS]) {
      const f = fixture({ auth: AUTH });
      const response = await f.route(path)[method](f.request(body), context(id));
      assert.equal(response.status, 410, `${path}:${method}`); noCache(response);
      assert.equal(f.calls.auth, 0); assert.equal(f.calls.modelLimit, 0); noEffects(f);
    }
  }
});

test('dormant Twiddle UUID checks accept valid IDs and reject malformed IDs without any feature reactivation', async () => {
  for (const [path, method, body] of twiddleCases.filter(([, method]) => method !== 'GET')) {
    for (const id of [...VALID_IDS, ...INVALID_IDS]) {
      const f = fixture({ unpauseInFixture: true });
      const requestBody = path === 'twiddle' ? { ...body, parent_id: id } : body;
      const response = await f.route(path)[method](f.request(requestBody), context(id));
      assert.equal(response.status, VALID_IDS.includes(id) ? 401 : 400, `${path}:${id}`);
      assert.equal(f.calls.auth, VALID_IDS.includes(id) ? 1 : 0); noEffects(f);
    }
  }
});

test('dormant Twiddle response retains the model rate limit before reading content or calling providers', async () => {
  const f = fixture({ auth: AUTH, unpauseInFixture: true });
  const response = await f.route('twiddle/[id]/respond').POST(f.request({ thinker_key: 'socrates' }), context(ID));
  assert.equal(response.status, 429); assert.equal(f.calls.modelLimit, 1); noEffects(f);
});
