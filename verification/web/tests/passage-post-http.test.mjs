import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { passagePostApp, IDS } from './support/passage-post-app.mjs';
import { requestId, rpc, messageAction, messageDecide } from './support/message-db.mjs';

const pins = JSON.parse(await readFile(new URL('../../../lib/books/passage-indexes.json', import.meta.url), 'utf8'));
const pin = pins.find(value => value.bookId === 'apology');
const reference = { version: 1, bookId: pin.bookId, editionId: pin.editionId, blockIndex: 30, start: 0, end: 80 };
const path = `/api/circles/${IDS.circle}/passages`;
const sha = value => createHash('sha256').update(value, 'utf8').digest('hex');
const input = (overrides = {}) => ({ requestId: requestId(), reference, comment: 'I would like to discuss how this source presents the decision.', ...overrides });
const bodyOf = preview => ({ requestId: preview.requestId, reference: preview.reference, comment: preview.comment, contentHash: preview.contentHash, reviewKey: preview.reviewKey });
async function response(app, url, method = 'GET', body, status = 200, headers) {
  const res = await app.dispatch(url, method, body, headers);
  assert.equal(res.status, status);
  assert.match(res.headers.get('cache-control'), /private.*no-store/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  return res.json();
}
async function preview(app, value = input(), status = 200) {
  return response(app, path + '/preview', 'POST', value, status);
}
async function countMessages(app) {
  return Number((await app.db.query('SELECT count(*)::int n FROM seminar_messages')).rows[0].n);
}

test('canonical preview is read-only; exact post and retry save one whole immutable quoted body', async t => {
  const app = await passagePostApp(); t.after(() => app.close());
  const before = await countMessages(app);
  assert.deepEqual(await response(app, path), { circleId: IDS.circle });
  const reviewed = await preview(app);
  assert.equal(await countMessages(app), before);
  assert.equal(reviewed.source.quote.length, 80);
  assert.equal(reviewed.contentHash, sha(reviewed.content));
  assert.ok(reviewed.content.includes(reviewed.source.quote));
  assert.ok(reviewed.content.includes(reviewed.source.metadata.edition.attribution.replace(/\s+/gu, ' ').trim()));
  assert.ok(reviewed.content.endsWith(reviewed.source.readerHref));
  const sent = await response(app, path, 'POST', bodyOf(reviewed));
  assert.equal(sent.outcome, 'confirmed'); assert.equal(sent.replayed, false);
  assert.equal(sent.message.content, reviewed.content);
  const again = await response(app, path, 'POST', bodyOf(reviewed));
  assert.equal(again.message.id, sent.message.id); assert.equal(again.replayed, true);
  const changed = await preview(app, input({ requestId: reviewed.requestId, comment: 'A different deliberately reviewed comment using the same operation key.' }));
  assert.equal((await response(app, path, 'POST', bodyOf(changed), 409)).outcome, 'not_attempted');
  assert.equal(await countMessages(app), before + 1);
  const row = (await app.db.query('SELECT content,member_id FROM seminar_messages WHERE id=$1', [sent.message.id])).rows[0];
  assert.equal(row.member_id, IDS.reader); assert.equal(row.content, reviewed.content);
  const lookup = await response(app, path + '?requestId=' + reviewed.requestId);
  assert.equal(lookup.receipt.message.id, sent.message.id); assert.equal(lookup.receipt.replayed, true);
});

test('link-only source has full credits and no invented quotation', async t => {
  const app = await passagePostApp(); t.after(() => app.close());
  const reviewed = await preview(app, input({ reference: { ...reference, start: null, end: null } }));
  assert.equal(reviewed.source.quote, null);
  assert.match(reviewed.content, /Referenced source block \(no quotation\)/);
  assert.equal((await response(app, path, 'POST', bodyOf(reviewed))).message.content, reviewed.content);
});

test('caller actor, quote, source URL and extra fields cannot become canonical input', async t => {
  const app = await passagePostApp(); t.after(() => app.close());
  const before = await countMessages(app);
  for (const extra of [{ actor: IDS.author }, { quote: 'forged quotation' }, { sourceUrl: 'https://foreign.invalid' }]) {
    assert.equal((await preview(app, { ...input(), ...extra }, 400)).outcome, 'not_attempted');
  }
  const reviewed = await preview(app);
  await response(app, path, 'POST', { ...bodyOf(reviewed), content: 'Forged body.' }, 400);
  assert.equal(await countMessages(app), before);
});

test('review binding rejects account swaps, changed comments, changed hashes and changed UUIDs before insert', async t => {
  const app = await passagePostApp(); t.after(() => app.close());
  const reviewed = await preview(app), before = await countMessages(app);
  for (const change of [{ comment: 'A changed comment without a new review.' }, { requestId: requestId() }, { contentHash: '0'.repeat(64) }, { reviewKey: '0'.repeat(64) }]) {
    const refused = await response(app, path, 'POST', { ...bodyOf(reviewed), ...change }, 409);
    assert.equal(refused.outcome, 'not_attempted');
  }
  app.setActor(IDS.author);
  await response(app, path, 'POST', bodyOf(reviewed), 409);
  assert.equal(await countMessages(app), before);
});

test('known pin and real UTF-16 bounds are checked; forged and unsupported locators never save', async t => {
  const app = await passagePostApp(); t.after(() => app.close());
  await preview(app, input({ reference: { ...reference, editionId: reference.editionId.replace(/.$/, '0') } }), 409);
  await preview(app, input({ reference: { ...reference, blockIndex: pin.blockCount } }), 400);
  await preview(app, input({ reference: { ...reference, start: 9990, end: 9999 } }), 400);
  await preview(app, input({ reference: { ...reference, end: 601 } }), 400);
  const relativity = JSON.parse(await readFile(new URL('../../../content/great-books/relativity/passages.json', import.meta.url), 'utf8'));
  const nonText = relativity.blocks.findIndex(block => block.reason === 'non_text');
  assert.ok(nonText >= 0);
  await preview(app, input({ reference: { version: 1, bookId: relativity.bookId, editionId: relativity.editionId, blockIndex: nonText, start: 0, end: 1 } }), 400);
  assert.equal(app.calls.filter(value => value.rpc === 'soe_circle_passage_post').length, 0);
});

test('current access gates preview, posting and receipt reads; completed members keep wrap-up access', async t => {
  const app = await passagePostApp(); t.after(() => app.close());
  const reviewed = await preview(app);
  app.setActor(null); await response(app, path, 'GET', undefined, 401);
  app.setActor(IDS.newcomer); await response(app, path, 'GET', undefined, 403);
  app.setActor(IDS.reader);
  await app.db.query("UPDATE book_cohorts SET status='completed' WHERE id=$1", [IDS.circle]);
  assert.equal((await response(app, path, 'POST', bodyOf(reviewed))).outcome, 'confirmed');
  await app.db.query('DELETE FROM book_cohort_members WHERE cohort_id=$1 AND member_id=$2', [IDS.circle, IDS.reader]);
  await response(app, path, 'POST', bodyOf(reviewed), 403);
  await response(app, path + '?requestId=' + reviewed.requestId, 'GET', undefined, 403);
});

test('fresh SQL recheck refuses a Circle hidden after preview without saving a passage', async t => {
  const app = await passagePostApp(); t.after(() => app.close());
  const reviewed = await preview(app), before = await countMessages(app);
  await app.db.query('UPDATE book_cohorts SET circle_hidden=true WHERE id=$1', [IDS.circle]);
  await response(app, path, 'POST', bodyOf(reviewed), 404);
  await response(app, path + '?requestId=' + reviewed.requestId, 'GET', undefined, 404);
  assert.equal(await countMessages(app), before);
});

test('commit then lost reply is unknown; read-only lookup and explicit exact retry recover one save', async t => {
  const app = await passagePostApp(); t.after(() => app.close());
  const reviewed = await preview(app), before = await countMessages(app);
  let lost = false;
  app.transformRpc((name, args, result) => {
    if (name === 'soe_circle_passage_post' && !lost) { lost = true; throw Error('Synthetic lost committed reply'); }
    return result;
  });
  assert.equal((await response(app, path, 'POST', bodyOf(reviewed), 503)).outcome, 'unknown');
  assert.equal(await countMessages(app), before + 1);
  const found = await response(app, path + '?requestId=' + reviewed.requestId);
  assert.equal(found.receipt.message.content, reviewed.content);
  assert.equal((await response(app, path, 'POST', bodyOf(reviewed))).replayed, true);
  assert.equal(await countMessages(app), before + 1);
});

test('missing own receipt is explicit and read-only; another member cannot recover the post', async t => {
  const app = await passagePostApp(); t.after(() => app.close());
  const reviewed = await preview(app), before = await countMessages(app);
  const none = await response(app, path + '?requestId=' + reviewed.requestId);
  assert.equal(none.receipt, null); assert.equal(await countMessages(app), before);
  await response(app, path, 'POST', bodyOf(reviewed));
  app.setActor(IDS.author);
  assert.equal((await response(app, path + '?requestId=' + reviewed.requestId)).receipt, null);
});

test('post safety hash covers quotation and credits; hidden and withdrawn receipt projections retain no original text', async t => {
  const app = await passagePostApp(); t.after(() => app.close());
  const reviewed = await preview(app), saved = await response(app, path, 'POST', bodyOf(reviewed));
  const message = saved.message.id;
  const original = await rpc(app.db, 'soe_circle_message_state', [IDS.reader, IDS.circle, message]);
  assert.equal(original.contentHash, reviewed.contentHash);
  await messageAction(app.db, { actor: IDS.author, message, reason: 'harassment', note: 'Synthetic private report.' });
  await messageDecide(app.db, { actor: IDS.reviewer, message, excerpt: reviewed.source.quote.slice(0, 20) });
  const held = await response(app, path + '?requestId=' + reviewed.requestId);
  assert.equal(held.receipt.message.visibility, 'hidden'); assert.equal(held.receipt.message.content, null);
  assert.equal(JSON.stringify(held).includes(reviewed.source.quote), false);
  const hiddenRetry = await response(app, path, 'POST', bodyOf(reviewed));
  assert.equal(hiddenRetry.message.visibility, 'hidden'); assert.equal(hiddenRetry.message.content, null);
  await messageAction(app.db, { actor: IDS.reader, message, action: 'withdraw' });
  const withdrawn = await response(app, path + '?requestId=' + reviewed.requestId);
  assert.equal(withdrawn.receipt.message.visibility, 'withdrawn'); assert.equal(withdrawn.receipt.message.content, null);
});

test('origin and byte-stream checks happen before any write or source preview', async t => {
  const app = await passagePostApp(); t.after(() => app.close());
  const value = input();
  assert.equal((await response(app, path + '/preview', 'POST', value, 403, { origin: 'https://foreign.invalid' })).outcome, 'not_attempted');
  const request = body => new Request('https://offline.invalid' + path + '/preview', { method: 'POST', headers: { origin: 'https://offline.invalid', 'content-type': 'application/json' }, body });
  const large = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('界'.repeat(5000))); controller.close(); } });
  const huge = new Request('https://offline.invalid' + path + '/preview', { method: 'POST', headers: { origin: 'https://offline.invalid' }, body: large, duplex: 'half' });
  const tooLarge = await app.dispatchRequest(huge); assert.equal(tooLarge.status, 413); assert.equal((await tooLarge.json()).outcome, 'not_attempted');
  const invalidUtf8 = await app.dispatchRequest(request(new Uint8Array([0xc3, 0x28])));
  assert.equal(invalidUtf8.status, 400);
  assert.equal(app.calls.filter(call => call.rpc === 'soe_circle_passage_post').length, 0);
});

test('response identity and exact body are verified; malformed committed replies stay unknown', async t => {
  const app = await passagePostApp(); t.after(() => app.close());
  const reviewed = await preview(app);
  app.transformRpc((name, args, result) => name === 'soe_circle_passage_post' && !result.error ? { data: { ...result.data, requestId: requestId() }, error: null } : result);
  assert.equal((await response(app, path, 'POST', bodyOf(reviewed), 503)).outcome, 'unknown');
  app.transformRpc(null);
  assert.equal((await response(app, path + '?requestId=' + reviewed.requestId)).receipt.message.content, reviewed.content);
  const another = await preview(app);
  app.transformRpc((name, args, result) => name === 'soe_circle_passage_post' && !result.error
    ? { data: { ...result.data, message: { ...result.data.message, content: 'An unrelated returned body.' } }, error: null } : result);
  assert.equal((await response(app, path, 'POST', bodyOf(another), 503)).outcome, 'unknown');
});

test('strict receipt query and missing schema fail closed with private errors', async t => {
  const app = await passagePostApp(); t.after(() => app.close());
  await response(app, path + '?requestId=' + requestId() + '&requestId=' + requestId(), 'GET', undefined, 400);
  await response(app, path + '?actor=' + IDS.reader, 'GET', undefined, 400);
  app.transformRpc((name, args, result) => name === 'soe_circle_passage_access' ? { data: null, error: { code: '42883', message: 'PRIVATE_DB_DETAILS' } } : result);
  const refused = await preview(app, input(), 503);
  assert.equal(refused.outcome, 'not_attempted'); assert.equal(JSON.stringify(refused).includes('PRIVATE_DB_DETAILS'), false);
});

test('canonical display-name bounds preserve Unicode and refuse malformed or email-like names', async t => {
  const app = await passagePostApp(); t.after(() => app.close());
  app.setDisplayName('A'.repeat(199) + '🙂');
  const first = await preview(app);
  assert.equal((await response(app, path, 'POST', bodyOf(first))).message.member_name, 'A'.repeat(199));
  for (const name of ['Malformed\ud800', 'private@example.invalid']) {
    app.setDisplayName(name);
    const reviewed = await preview(app);
    assert.equal((await response(app, path, 'POST', bodyOf(reviewed))).message.member_name, 'Explorer');
  }
});
