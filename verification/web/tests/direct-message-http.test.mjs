import test from 'node:test';
import assert from 'node:assert/strict';
import { directMessageApp, ids, origin, sibling } from './support/direct-message-app.mjs';

async function fixture(t) {
  const app = await directMessageApp();
  t.after(() => app.close());
  const send = (method, data, options = {}) => app.dispatch(app.request(method, {
    peer: options.peer, body: typeof data === 'string' ? data : data === undefined ? undefined : JSON.stringify(data),
    headers: { cookie: app.cookies[ids.alice], origin, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', ...options.headers },
  }));
  return { ...app, send };
}

test('a sibling form cannot send under a signed wallet session', async t => {
  const f = await fixture(t);
  const res = await f.send('POST', JSON.stringify({ recipientId: ids.bob, content: 'Forged form text', padding: '=' }) + '\r\n',
    { headers: { origin: sibling, 'sec-fetch-site': 'same-site', 'content-type': 'text/plain' } });
  assert.equal(res.status, 403);
  assert.match(res.headers.get('cache-control'), /private.*no-store/);
  assert.deepEqual(f.calls, []);
});

test('a signed conversation GET is read-only and returns only the two participants and message fields', async t => {
  const f = await fixture(t);
  const before = await f.flags();
  const res = await f.send('GET', undefined, { peer: ids.bob, headers: { origin: sibling, 'sec-fetch-site': 'same-site' } });
  assert.equal(res.status, 200);
  assert.deepEqual(await f.flags(), before);
  assert.match(res.headers.get('cache-control'), /private.*no-store/);
  const { messages } = await res.json();
  assert.deepEqual(messages.map(row => row.id), [ids.incoming, ids.outgoing]);
  assert.deepEqual(Object.keys(messages[0]).sort(), ['content', 'created_at', 'id', 'read', 'recipient_id', 'sender_id']);
});

test('a scoped mark-read changes only the selected incoming row even with unseen, outgoing and other-thread rows', async t => {
  const f = await fixture(t);
  await f.seed(ids.new, ids.bob, ids.alice, 'Arrived after the read');
  const body = { peerId: ids.bob, messageIds: [ids.incoming, ids.outgoing, ids.other] };
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await f.send('PATCH', body, { headers: { 'x-soe-expected-member': ids.alice } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  }
  assert.deepEqual(await f.flags(), [[ids.incoming, true], [ids.outgoing, false], [ids.other, false], [ids.new, false]]);
  const count = await f.send('GET');
  assert.deepEqual(await count.json(), { unreadCount: 2 });
});

test('a mark-read with a wrong expected account, an unsigned request or a sibling origin has no effect', async t => {
  const f = await fixture(t);
  const body = { peerId: ids.bob, messageIds: [ids.incoming] };
  for (const [headers, status] of [
    [{ 'x-soe-expected-member': ids.carol }, 401],
    [{ cookie: 'soe_auth_provider=signed_out' }, 401],
    [{ origin: sibling, 'sec-fetch-site': 'same-site' }, 403],
  ]) assert.equal((await f.send('PATCH', body, { headers })).status, status);
  assert.deepEqual(await f.flags(), [[ids.incoming, false], [ids.outgoing, false], [ids.other, false]]);
});

test('invalid or oversized writes fail closed and an allowed send uses the verified member', async t => {
  const f = await fixture(t);
  assert.equal((await f.send('PATCH', { peerId: ids.bob, messageIds: Array(101).fill(ids.incoming) })).status, 400);
  assert.equal((await f.send('PATCH', { peerId: ids.bob, messageIds: ['invalid'] })).status, 400);
  assert.equal((await f.send('POST', { recipientId: ids.bob, content: 'x'.repeat(12_001) })).status, 413);
  const message = { recipientId: ids.bob, content: ' A prepared question ', senderId: ids.carol };
  assert.equal((await f.send('POST', message, { headers: { 'x-soe-expected-member': ids.carol } })).status, 401);
  assert.equal((await f.send('POST', message, { headers: { 'x-soe-expected-member': ids.alice } })).status, 200);
  assert.deepEqual((await f.db.query("SELECT sender_id,recipient_id,content FROM direct_messages WHERE content='A prepared question'")).rows,
    [{ sender_id: ids.alice, recipient_id: ids.bob, content: 'A prepared question' }]);
});
