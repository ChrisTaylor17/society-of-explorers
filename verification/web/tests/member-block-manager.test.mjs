import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { sourceLoader } from '../../../platforms/tests/load-source.mjs';
import { createCircleMemberBlocksApp, text } from './support/circle-member-blocks-app.mjs';
import { asRole } from './support/circle-live-db.mjs';

const load = sourceLoader();
const { MEMBER_BLOCKS_PATH: path } = load('lib/members/direct-message.ts');
const { messageBlockInput } = load('lib/circles/message-moderation.ts');
const { createMemberBlocks } = load('platforms/shared/member-blocks.ts');
const { createNativeMemberPorts } = load('platforms/native/src/circles/native-ports.ts');
const generation = 'aa000000-0000-4000-8000-000000000001';

async function request(app, endpoint, { body, token = app.ACCESS.author, origin = app.ORIGIN, headers = {} } = {}) {
  const response = await app.dispatch(endpoint, { method: body ? 'POST' : 'GET', body,
    headers: { Authorization: 'Bearer ' + token, origin, ...headers } });
  assert.match(response.headers.get('cache-control'), /no-store/);
  return { status: response.status, body: await response.json() };
}

async function blockAuthor(app) {
  const state = await request(app, app.statePath);
  assert.equal(state.status, 200);
  const body = messageBlockInput(state.body, randomUUID());
  const result = await request(app, app.statePath, { body });
  assert.equal(result.status, 200);
  return result.body;
}

test('the owner endpoint lists and removes only the current account’s reviewed block', async t => {
  const app = await createCircleMemberBlocksApp();
  t.after(() => app.close());
  const saved = await blockAuthor(app);
  const result = await request(app, path);
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.body).sort(), ['items', 'memberId', 'nextCursor']);
  assert.equal(result.body.memberId, app.viewerId);
  const item = result.body.items[0];
  assert.deepEqual(Object.keys(item).sort(), ['blockId', 'changedAt', 'label', 'revision']);
  assert.equal(item.blockId, saved.blockId);
  assert.equal(item.revision, 1);
  assert.equal((await request(app, path, { token: app.TOKENS.other })).body.items.length, 0);
  for (const query of ['?after=', '?after=' + saved.blockId + '&after=' + saved.blockId, '?peerId=' + app.targetId]) {
    assert.equal((await request(app, path + query)).status, 400);
  }
  const body = { expectedMemberId: app.viewerId, blockId: item.blockId, expectedRevision: item.revision, requestId: randomUUID() };
  assert.equal((await request(app, path, { body, token: app.TOKENS.other })).status, 401);
  assert.equal((await request(app, path, { body: { ...body, expectedMemberId: app.targetId }, token: app.TOKENS.other })).status, 404);
  assert.equal((await request(app, path, { body, origin: 'https://sibling.invalid' })).status, 403);
  assert.equal((await request(app, path, { body: { ...body, blocked: false } })).status, 400);
  assert.equal((await request(app, path, { body: { ...body, expectedRevision: 0 } })).status, 400);
  assert.equal((await request(app, path + '?after=' + item.blockId, { body })).status, 400);
  assert.equal((await app.ownedBlock()).blockId, saved.blockId);

  const success = await request(app, path, { body });
  assert.deepEqual(success, { status: 200, body: { requestId: body.requestId, blockId: item.blockId, blockedByMe: false, revision: 2 } });
  assert.deepEqual(await request(app, path, { body }), success);
  assert.deepEqual((await request(app, path)).body.items, []);
  assert.equal((await request(app, app.archive + '?message=' + app.postId)).body.focus.content, text.target);

  await blockAuthor(app);
  assert.equal((await request(app, path, { body })).status, 409);
  assert.equal((await app.ownedBlock()).revision, 3);
});

async function nativePorts(origin, deliver, policy = 'owner-member-blocks-v1') {
  const storageKey = 'test-block-manager-' + randomUUID();
  const calls = [];
  const bridge = {
    capabilities: async () => ({ version: 2, origin, storageKey, storageGeneration: generation,
      redirectPolicy: 'reject-before-send', storagePolicy: 'os-protected', requestIdPolicy: 'os-random-uuid', memberBlocksPolicy: policy }),
    begin: async () => { calls.push({ kind: 'begin' }); return 'fixture-handle'; },
    send: async (_id, input) => { calls.push({ kind: 'send', ...input }); return deliver(input); },
    cancel: async () => {}, read: async () => null, write: async () => {}, remove: async () => {},
    resetAccountStorage: async () => ({}), newRequestId: async () => randomUUID(),
  };
  const ports = await createNativeMemberPorts(bridge, { origin, storageKey, timeoutMs: 2000 });
  return { ports, calls };
}

test('the optional phone transport refuses general messages, malformed pages and arbitrary writes before allocating a native request', async () => {
  const origin = 'https://native-member-blocks.invalid';
  const deliver = ({ url }) => ({ status: 200, url, redirected: false, body: '{}' });
  const earlier = await nativePorts(origin, deliver, 'unknown-policy');
  assert.equal(earlier.ports.memberBlocksTransport, undefined);
  const { ports, calls } = await nativePorts(origin, deliver);
  const endpoint = origin + path;
  const headers = { Authorization: 'Bearer NONISSUED_BLOCK_MANAGER' };
  const read = { method: 'GET', headers, cache: 'no-store', redirect: 'error', credentials: 'omit', signal: new AbortController().signal };
  const input = { expectedMemberId: randomUUID(), blockId: randomUUID(), expectedRevision: 1, requestId: randomUUID() };
  const post = body => ({ ...read, method: 'POST', body, headers: { ...headers, 'Content-Type': 'application/json' } });
  const transport = ports.memberBlocksTransport;
  assert(transport);
  for (const [url, init] of [
    [endpoint + '?', read], [endpoint + '?after=' + input.blockId + '&extra=1', read],
    [endpoint + '?after=' + input.blockId.toUpperCase(), read], [endpoint + '?after=' + input.blockId, post(JSON.stringify(input))],
    [origin + '/api/message?blocked=1', read], [origin + '/api/members/profile', read],
    [endpoint, post(JSON.stringify({ ...input, peerId: randomUUID() }))], [endpoint, post(JSON.stringify(input, null, 2))],
    [endpoint, post(JSON.stringify({ ...input, expectedRevision: 0 }))], [endpoint, post(JSON.stringify({ ...input, expectedRevision: Number.MAX_SAFE_INTEGER }))],
    [endpoint, { ...read, headers: {} }], [endpoint, { ...read, redirect: 'follow' }],
  ]) await assert.rejects(transport(url, init));
  await assert.rejects(ports.transport(endpoint, read));
  assert.deepEqual(calls, []);
  await transport(endpoint, read);
  await transport(endpoint + '?after=' + input.blockId, read);
  await transport(endpoint, post(JSON.stringify(input)));
  assert.equal(calls.filter(call => call.kind === 'send').length, 3);
});

test('a phone review uses the approved transport and the exact retry after SQL commits', async t => {
  const app = await createCircleMemberBlocksApp();
  t.after(() => app.close());
  const { blockId } = await blockAuthor(app);
  let loseReply = true;
  const { ports, calls } = await nativePorts(app.ORIGIN, async input => {
    const response = await app.dispatch(new URL(input.url).pathname + new URL(input.url).search, {
      method: input.method, body: input.body, headers: { Authorization: 'Bearer ' + input.bearer, origin: app.ORIGIN },
    });
    if (input.method === 'POST' && loseReply) {
      assert.equal(response.status, 200); loseReply = false; throw Error('Lost synthetic response');
    }
    return { status: response.status, url: input.url, redirected: false, body: await response.text() };
  });
  const controller = createMemberBlocks({ origin: app.ORIGIN, memberId: app.viewerId,
    owner: { scope: () => 'viewer', subscribe: () => () => {}, bearer: async () => app.ACCESS.author },
    transport: ports.memberBlocksTransport, newRequestId: ports.newRequestId, initialOnline: true });
  controller.connect();
  assert.deepEqual(calls, []);
  await controller.load();
  assert.equal(controller.model().page.items[0].blockId, blockId);
  controller.review(blockId, 0);
  await controller.unblock();
  assert.equal(calls.filter(call => call.method === 'POST').length, 0);
  controller.review(blockId, 1);
  assert(controller.model().review);
  await controller.unblock();
  assert.equal(controller.model().page, null);
  assert(controller.model().canRetry);
  assert.equal(controller.model().canLoad, false);
  assert.equal(await app.ownedBlock(), null);
  await controller.retry();
  assert.match(controller.model().message, /^Unblocked\./);
  const writes = calls.filter(call => call.method === 'POST');
  assert.equal(writes.length, 2);
  assert.equal(writes[0].body, writes[1].body);
  await controller.load();
  assert.equal(controller.model().page.items.length, 0);
});

test('a response held across inactivity or a different owner cannot refill the private list', async () => {
  const ownerId = randomUUID();
  let scope = 'first', listener = () => {};
  let calls = 0, held, signal;
  const controller = createMemberBlocks({ origin: 'https://private-list.invalid', memberId: ownerId,
    initialOnline: true, owner: { scope: () => scope, subscribe: fn => { listener = fn; return () => {}; }, bearer: async () => 'NONISSUED_FIXTURE' },
    transport: async (url, init) => {
      calls++;
      signal = init.signal;
      await new Promise(resolve => { held = resolve; });
      return { status: 200, url, redirected: false, json: async () => ({ memberId: ownerId, items: [], nextCursor: null }) };
    } });
  controller.connect();
  for (const retire of [() => controller.activity(false), () => { scope = 'second'; listener(); }]) {
    const read = controller.load();
    while (!held) await new Promise(resolve => setImmediate(resolve));
    retire();
    assert(signal.aborted);
    held(); held = undefined;
    await read;
    assert.equal(controller.model().page, null);
    controller.activity(true);
  }
  assert.equal(calls, 2);
});

test('the phone controller pages an older block list without duplicate or foreign rows', async t => {
  const app = await createCircleMemberBlocksApp();
  t.after(() => app.close());
  const peers = await app.db.query(`INSERT INTO public.members(id,display_name)
    SELECT gen_random_uuid(),'Synthetic preexisting block' FROM generate_series(1,27) RETURNING id`);
  for (const peer of peers.rows) {
    await asRole(app.db, 'service_role', tx => tx.query(
      'SELECT public.soe_direct_message_set_block($1,$2,NULL,true,0,$3)', [app.viewerId, peer.id, randomUUID()]));
  }
  let member = app.viewerId;
  const controller = createMemberBlocks({ origin: app.ORIGIN, memberId: app.viewerId,
    initialOnline: true, owner: { scope: () => 'viewer', subscribe: () => () => {}, bearer: async () => app.ACCESS.author },
    transport: async (url, init) => {
      const endpoint = new URL(url);
      const response = await app.dispatch(endpoint.pathname + endpoint.search, {
        method: init.method, headers: init.headers, signal: init.signal,
      });
      return { status: response.status, url, redirected: false, json: async () => ({ ...await response.json(), memberId: member }) };
    } });
  controller.connect();
  await controller.load();
  const first = controller.model().page;
  assert.equal(first.items.length, 25);
  assert.equal(first.nextCursor, first.items.at(-1).blockId);
  await controller.next();
  const last = controller.model().page;
  assert.equal(last.items.length, 2);
  assert.equal(last.nextCursor, null);
  assert.equal(new Set([...first.items, ...last.items].map(item => item.blockId)).size, 27);
  member = app.targetId;
  await controller.load();
  assert.equal(controller.model().page, null);
});
