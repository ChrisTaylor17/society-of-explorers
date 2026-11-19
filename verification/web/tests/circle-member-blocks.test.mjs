import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { sourceLoader } from '../../../platforms/tests/load-source.mjs';
import { createCircleMemberBlocksApp, text } from './support/circle-member-blocks-app.mjs';

const load = sourceLoader();
const { createCircleHost } = load('platforms/native/src/circles/host.ts');
const { messageBlockInput, parseMessageBlockReceipt, parseMessageSafetyState } = load('lib/circles/message-moderation.ts');

async function request(app, path, { token = app.ACCESS.author, body, origin = app.ORIGIN } = {}) {
  const response = await app.dispatch(path, { method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: 'Bearer ' + token, origin }, body });
  assert.match(response.headers.get('cache-control'), /no-store/);
  return { status: response.status, body: await response.json() };
}

test('real HTTP and SQL bind a reviewed Circle block to account, origin, exact post and private receipt', async t => {
  const app = await createCircleMemberBlocksApp();
  t.after(() => app.close());
  const { status, body: state } = await request(app, app.statePath);
  assert.equal(status, 200);
  assert.equal(state.message.publicProfileId, app.targetId);
  assert.deepEqual(state.blockReview, { memberId: app.viewerId, revision: 0 });
  assert.equal(parseMessageSafetyState({ ...state, message: { ...state.message, is_mine: true }, canReport: false }), null);
  const input = messageBlockInput(state, randomUUID());
  assert(input);
  const refused = async (body, expected, options = {}) => {
    assert.equal((await request(app, app.statePath, { body, ...options })).status, expected);
    assert.equal(await app.ownedBlock(), null);
  };
  await refused({ ...input, peerId: app.targetId }, 400);
  await refused({ ...input, contentHash: 'a'.repeat(64) }, 409);
  await refused(input, 403, { origin: 'https://cross-origin.example.test' });
  await refused(input, 401, { token: app.TOKENS.outsider });
  const saved = await request(app, app.statePath, { body: input });
  assert.equal(saved.status, 200);
  assert.deepEqual(Object.keys(saved.body).sort(), ['blockId','blockedByMe','circleId','messageId','requestId','revision']);
  assert(parseMessageBlockReceipt(saved.body, input, app.circleId, app.postId));
  assert.equal(parseMessageBlockReceipt({ ...saved.body, messageId: app.otherPostId }, input, app.circleId, app.postId), null);
  assert.deepEqual(await request(app, app.statePath, { body: input }), saved);
  assert.equal((await app.ownedBlock()).blockId, saved.body.blockId);

  const thread = await request(app, app.archive + '?message=' + app.thirdReplyId);
  assert.equal(thread.status, 200);
  assert.equal(thread.body.root.visibility, 'unavailable');
  assert.equal(thread.body.root.content, null);
  assert.equal(thread.body.root.publicProfileId, null);
  assert.equal(thread.body.focus.content, text.independent);
  const archive = await request(app, app.archive);
  assert.equal(archive.status, 200);
  assert(!JSON.stringify(archive.body).includes(text.target));
  const conversation = await request(app, '/api/book-salons/' + app.circleId);
  assert.equal(conversation.status, 200);
  assert.deepEqual(new Set(conversation.body.messages.map(post => post.id)), new Set([app.viewerPostId, app.thirdReplyId]));
  assert.equal((await request(app, app.statePath)).status, 404);
  const reciprocal = await request(app, app.archive + '?message=' + app.viewerPostId, { token: app.TOKENS.other });
  assert.equal(reciprocal.body.focus.content, null);

  await app.unblock();
  assert.equal((await request(app, app.statePath)).body.blockReview.revision, 2);
  assert.equal((await request(app, app.statePath, { body: input })).status, 409);
});

test('phone and Quest shared host preserve only the exact retry after a committed block loses its reply', async t => {
  const app = await createCircleMemberBlocksApp();
  t.after(() => app.close());
  const writes = [];
  let loseReply = true;
  const host = createCircleHost({ circleId: app.circleId, origin: app.ORIGIN,
    owner: { scope: () => 'synthetic-viewer', subscribe: () => () => {}, bearer: async () => app.ACCESS.author },
    newRequestId: async () => randomUUID(), transport: async (url, init) => {
      const requestUrl = new URL(url);
      const response = await app.dispatch(requestUrl.pathname + requestUrl.search, {
        method: init.method, headers: { ...init.headers, origin: app.ORIGIN }, body: init.body, signal: init.signal,
      });
      if (init.method === 'POST') {
        writes.push(init.body);
        if (loseReply) { loseReply = false; throw Error('Lost synthetic confirmation'); }
      }
      return { status: response.status, url, redirected: false, json: () => response.json() };
    } });
  t.after(() => host.close());
  host.connect();
  await host.openArchive();
  assert.equal(host.model().archive.phase, 'ready');
  await host.messageOpen(app.postId);
  assert.equal(host.model().archive.page, null);
  assert.equal(host.model().messageSafety.canBlock, false);
  await host.messageSubmit('block');
  assert.equal(writes.length, 0);
  host.messageConfirm(true);
  assert.equal(host.model().messageSafety.canBlock, true);
  await host.messageSubmit('block');
  assert(await app.ownedBlock());
  assert.equal(host.model().messageSafety.phase, 'unknown');
  assert.equal(host.model().messageSafety.state, null);
  assert(!JSON.stringify(host.model()).includes(text.target));
  assert.equal(host.model().messageSafety.canCheck, false);
  await host.messageRefresh();
  assert.equal(host.model().messageSafety.phase, 'unknown');
  assert.equal(writes.length, 1);
  await host.messageRetry();
  assert.equal(host.model().messageSafety.phase, 'confirmed');
  assert.equal(host.model().messageSafety.state, null);
  assert.deepEqual(writes, [writes[0], writes[0]]);
  await host.openArchive();
  assert.equal(host.model().archive.phase, 'ready');
  assert.equal(host.model().archive.page.items.find(item => item.id === app.postId).content, null);
  assert.equal(host.model().archive.page.items.find(item => item.id === app.thirdReplyId).content, text.independent);
});
