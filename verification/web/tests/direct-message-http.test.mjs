import test from 'node:test';
import assert from 'node:assert/strict';
import { directMessageApp, ids, origin, sibling } from './support/direct-message-app.mjs';

async function fixture(t) {
  const app = await directMessageApp();
  t.after(() => app.close());
  const send = (method, data, options = {}) => app.dispatch(app.request(method, {
    peer: options.peer, query: options.query, body: typeof data === 'string' ? data : data === undefined ? undefined : JSON.stringify(data),
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

test('an exact block closes both message paths and preserves the unrelated conversation', async t => {
  const f = await fixture(t);
  const key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaab01';
  const block = { blocked: true, peerId: ids.bob, expectedRevision: 0, requestId: key };
  const owner = { 'x-soe-expected-member': ids.alice };
  const save = await f.send('PUT', block, { headers: owner });
  assert.equal(save.status, 200);
  const receipt = await save.json();
  assert.equal(receipt.requestId, key);
  assert.equal(receipt.revision, 1);
  assert.equal(receipt.blockedByMe, true);
  assert.deepEqual(await (await f.send('PUT', block, { headers: owner })).json(), receipt);
  const alice = await (await f.send('GET', undefined, { peer: ids.bob })).json();
  assert.deepEqual(alice, { messages: [], contact: {
    blockId: receipt.blockId, blockedByMe: true, revision: 1, canMessage: false,
  } });
  const asBob = { cookie: f.cookies[ids.bob], 'x-soe-expected-member': ids.bob };
  const bob = await (await f.send('GET', undefined, { peer: ids.alice, headers: asBob })).json();
  assert.deepEqual(bob, { messages: [], contact: {
    blockId: null, blockedByMe: false, revision: 0, canMessage: false,
  } });
  for (const [headers, recipientId] of [[owner, ids.bob], [asBob, ids.alice]]) {
    assert.equal((await f.send('POST', { recipientId, content: 'A blocked send' }, { headers })).status, 403);
  }
  assert.equal((await f.send('PATCH', { peerId: ids.bob, messageIds: [ids.incoming] })).status, 403);
  assert.deepEqual(await (await f.send('GET')).json(), { unreadCount: 1 });
  const retained = await (await f.send('GET', undefined, { peer: ids.carol })).json();
  assert.equal(retained.messages[0].id, ids.other);
  assert.equal(retained.contact.canMessage, true);
  assert.deepEqual(await f.flags(), [[ids.incoming,false],[ids.outgoing,false],[ids.other,false]]);
});

test('private block management uses an opaque reference and stale replay cannot undo a later unblock', async t => {
  const f = await fixture(t);
  const as = id => ({ cookie: f.cookies[id], 'x-soe-expected-member': id });
  const action = (id, body) => f.send('PUT', body, { headers: as(id) });
  const read = (id, peer) => f.send('GET', undefined, { peer, headers: as(id) });
  const key = n => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaab' + n.toString(16).padStart(2, '0');
  const set = (peerId, requestId) => ({ blocked: true, peerId, requestId, expectedRevision: 0 });
  const aliceBlock = set(ids.bob, key(2));
  const alice = await (await action(ids.alice, aliceBlock)).json();
  const bob = await (await action(ids.bob, set(ids.alice, key(3)))).json();
  const removal = (receipt, requestId) => ({ blocked: false, blockId: receipt.blockId, requestId, expectedRevision: receipt.revision });
  assert.equal((await action(ids.carol, removal(alice, key(4)))).status, 404);
  await f.db.query("UPDATE members SET profile_visibility='private',display_name='Private name' WHERE id=$1", [ids.bob]);
  const list = await (await f.send('GET', undefined, { query: '?blocked=1' })).json();
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].blockId, alice.blockId);
  assert.equal(list.items[0].label, 'Explorer');
  assert.doesNotMatch(JSON.stringify(list), new RegExp('Private name|' + ids.bob));
  assert.deepEqual(await (await f.send('GET', undefined, { query: '?blocked=1', headers: as(ids.carol) })).json(),
    { items: [], nextCursor: null });

  const removeAlice = removal(alice, key(5));
  const cleared = await action(ids.alice, removeAlice);
  assert.equal(cleared.status, 200);
  const receipt = await cleared.json();
  assert.equal(receipt.revision, 2);
  assert.deepEqual(await (await action(ids.alice, removeAlice)).json(), receipt);
  assert.equal((await action(ids.alice, aliceBlock)).status, 409);
  assert.equal((await (await read(ids.alice, ids.bob)).json()).contact.canMessage, false);
  assert.equal((await action(ids.bob, removal(bob, key(6)))).status, 200);
  const current = await (await read(ids.alice, ids.bob)).json();
  assert.equal(current.contact.canMessage, true);
  assert.deepEqual(current.messages.map(message => message.id), [ids.incoming, ids.outgoing]);
});

test('a block write needs exact account and origin, and browser roles have no block or message-table authority', async t => {
  const f = await fixture(t);
  const input = { blocked: true, peerId: ids.bob, expectedRevision: 0, requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaab07' };
  assert.equal((await f.send('PUT', input)).status, 401);
  assert.equal((await f.send('PUT', input, { headers: { 'x-soe-expected-member': ids.carol } })).status, 401);
  assert.equal((await f.send('PUT', input, { headers: { 'x-soe-expected-member': ids.alice, origin: sibling } })).status, 403);
  assert.equal((await f.send('PUT', { ...input, peerId: ids.alice }, { headers: { 'x-soe-expected-member': ids.alice } })).status, 400);
  assert.equal((await f.send('GET', undefined, { query: '?blocked=1&after=invalid' })).status, 400);
  for (const role of ['anon','authenticated','service_role']) {
    await assert.rejects(f.db.transaction(async tx => {
      await tx.exec('SET LOCAL ROLE ' + role);
      return tx.query('SELECT * FROM direct_messages');
    }), { code: '42501' });
    await assert.rejects(f.db.transaction(async tx => {
      await tx.exec('SET LOCAL ROLE ' + role);
      return tx.query('SELECT * FROM soe_member_safety_private.member_blocks');
    }), { code: '42501' });
  }
  for (const role of ['anon','authenticated']) {
    await assert.rejects(f.db.transaction(async tx => {
      await tx.exec('SET LOCAL ROLE ' + role);
      return tx.query('SELECT public.soe_direct_message_read($1,$2)', [ids.alice,ids.bob]);
    }), { code: '42501' });
  }
});
