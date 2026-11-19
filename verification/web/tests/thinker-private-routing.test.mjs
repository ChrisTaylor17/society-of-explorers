import test from 'node:test';
import assert from 'node:assert/strict';
import {providerFixture} from './thinker-provider-retries.test.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const SALON = '66666666-6666-4666-8666-666666666666';
const ANSWER = 'Synthetic complete answer.';
const prompts = [
  'Here are my current tasks:\n[TODO] SYNTHETIC_PRIVATE_TASK café\n\nSpeak to me as Socrates.',
  'A member recorded a 15-second Waddle. Here is what they said: "SYNTHETIC_UNPUBLISHED_TRANSCRIPT". Respond in 1-2 sentences.',
];
const plain = value => JSON.parse(JSON.stringify(value));
const fixture = () => providerFixture({realSalonAccess: true});
const row = (salon, content, index = 0, role = 'member') => ({id: `seed-${salon}-${index}`, salon_id: salon,
  sender_type: role, thinker_id: role === 'thinker' ? 'plato' : null, content,
  created_at: new Date(1_600_000_000_000 + index * 1000).toISOString()});
async function complete(response) {
  assert.equal(response.status, 200);
  const frames = (await response.text()).split('\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6)));
  const done = frames.findLast(f => f.done);
  assert.equal(done?.response, ANSWER); assert.equal(done.error, undefined);
  return done;
}
function interceptDb(app, callback) {
  const from = app.db.from.bind(app.db);
  app.db.from = table => {
    const query = from(table), exec = query.exec.bind(query);
    query.exec = () => callback(table, query, exec);
    return query;
  };
}

test('a non-Council request must name its destination instead of silently choosing a shared salon', async () => {
  for (const salonId of [undefined, '', null]) {
    const app = fixture();
    const response = await app.post({isCouncilMode: false, salonId, message: prompts[0]});
    assert.equal(response.status, 400);
    assert.equal(app.calls.http.length, 0); assert.equal(app.db.log.length, 0);
  }
});

test('private task and unpublished voice prompts reach the provider exactly and their replies stay in the acting member salon', async () => {
  for (const actor of [A, B]) for (const message of prompts) {
    const app = fixture(); app.setActor(actor);
    const other = actor === A ? B : A;
    app.db.rows('salon_messages').push(row('general', 'SYNTHETIC_SHARED_HISTORY'),
      row(`private-${other}`, 'SYNTHETIC_OTHER_MEMBER_HISTORY'), row(`private-${actor}`, 'Own earlier question'),
      row(`private-${actor}`, 'Own earlier answer', 1, 'thinker'));
    await complete(await app.post({isCouncilMode: false, salonId: `private-${actor}`, message}));
    assert.equal(app.calls.http.length, 1);
    const messages = app.calls.http[0].body.messages;
    assert.deepEqual(messages.at(-1), {role: 'user', content: message});
    assert.equal(messages.filter(m => m.content === message).length, 1);
    assert.equal(messages[1].content, '[plato]: Own earlier answer');
    assert.doesNotMatch(JSON.stringify(messages), /SYNTHETIC_SHARED_HISTORY|SYNTHETIC_OTHER_MEMBER_HISTORY/);
    const replies = app.db.rows('salon_messages').filter(m => m.content === ANSWER);
    assert.equal(replies.length, 1); assert.equal(replies[0].salon_id, `private-${actor}`);
    assert.equal(app.db.rows('salon_messages').filter(m => m.content === message).length, 0,
      'Generated context keeps its previous exclusion from the salon member-message log');
    assert.equal(app.calls.legacy.length, 0, 'Moving generated context must not activate legacy transcript summaries');
    assert.ok([...app.calls.embeddings, ...app.calls.episodes].every(m => m.memberId === actor));
    app.setActor(other);
    const load = app.app.load('app/api/salon-message/load/route.ts');
    const shared = await load.GET(app.app.fakes.makeReq(undefined, {url: 'http://localhost/api/salon-message/load?salonId=general'}));
    const data = await shared.json();
    assert.equal(shared.status, 200); assert.equal(data.messages.length, 1);
    assert.equal(data.messages[0].content, 'SYNTHETIC_SHARED_HISTORY');
    const denied = await load.GET(app.app.fakes.makeReq(undefined, {url: `http://localhost/api/salon-message/load?salonId=private-${actor}`}));
    assert.equal(denied.status, 400);
  }
});

test('ordinary conversation keeps prior context and sends the current question exactly once even if member-message saving fails', async () => {
  for (const failSave of [false, true]) {
    const app = fixture(), message = 'SYNTHETIC_CURRENT_QUESTION';
    app.db.rows('salon_messages').push(row(`private-${A}`, 'Earlier question'));
    if (failSave) interceptDb(app, (table, query, exec) => table === 'salon_messages' && query.op === 'insert' && query.payload.sender_type === 'member'
      ? {data: null, error: {message: 'Synthetic insert failure'}} : exec());
    await complete(await app.post({isCouncilMode: false, salonId: `private-${A}`, message}));
    assert.deepEqual(app.calls.http[0].body.messages, [{role: 'user', content: 'Earlier question'}, {role: 'user', content: message}]);
    assert.equal(app.db.rows('salon_messages').filter(m => m.content === message).length, failSave ? 0 : 1);
    assert.equal(app.calls.legacy.length, 0, 'Ordinary conversation does not grant durable-memory consent');
  }
});

test('history is read before saving this question so a later interleaved message cannot replace the current prompt', async () => {
  const app = fixture(), message = 'SYNTHETIC_CURRENT_QUESTION';
  app.db.rows('salon_messages').push(row(`private-${A}`, 'Earlier question'));
  interceptDb(app, (table, query, exec) => {
    const result = exec();
    if (table === 'salon_messages' && query.op === 'insert' && query.payload.sender_type === 'member') {
      app.db.rows('salon_messages').push({...row(`private-${A}`, 'SYNTHETIC_LATER_QUESTION'), created_at: '2030-01-01T00:00:00Z'});
    }
    return result;
  });
  await complete(await app.post({isCouncilMode: false, salonId: `private-${A}`, message}));
  assert.deepEqual(app.calls.http[0].body.messages, [{role: 'user', content: 'Earlier question'}, {role: 'user', content: message}]);
});

test('a failed history read refuses before message saving or provider use instead of answering a different conversation', async () => {
  const app = fixture();
  interceptDb(app, (table, query, exec) => table === 'salon_messages' && query.op === 'select'
    ? {data: null, error: {message: 'SYNTHETIC_PRIVATE_DB_DETAIL'}} : exec());
  const response = await app.post({isCouncilMode: false, salonId: `private-${A}`, message: prompts[0]});
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /SYNTHETIC_PRIVATE_DB_DETAIL/);
  assert.equal(app.calls.http.length, 0); assert.equal(app.calls.rewards.length, 0);
  assert.equal(app.db.rows('salon_messages').length, 0);
});

test('the latest prior context plus current input stays within the existing fourteen-message limit', async () => {
  const app = fixture(), message = prompts[0];
  for (let i = 0; i < 30; i++) app.db.rows('salon_messages').push(row(`private-${A}`, 'Prior ' + i, i));
  await complete(await app.post({isCouncilMode: false, salonId: `private-${A}`, message}));
  const messages = app.calls.http[0].body.messages;
  assert.equal(messages.length, 14); assert.equal(messages[0].content, 'Prior 17');
  assert.equal(messages.at(-2).content, 'Prior 29'); assert.equal(messages.at(-1).content, message);
});

test('other-member private destinations and unknown shared salons are denied before provider or message work', async () => {
  for (const actor of [A, B]) for (const salonId of [`private-${actor === A ? B : A}`, SALON, 'unknown']) {
    const app = fixture(); app.setActor(actor);
    const response = await app.post({isCouncilMode: false, salonId});
    assert.equal(response.status, 403); assert.equal(app.calls.http.length, 0);
    assert.equal(app.db.log.filter(x => x.table === 'salon_messages').length, 0);
  }
});

test('explicit shared salons still use the real membership and guide access rules', async () => {
  for (const mode of ['general', 'member', 'guide']) {
    const app = fixture(), salonId = mode === 'general' ? 'general' : SALON;
    if (mode === 'member') app.db.rows('salon_members').push({id: 'membership', salon_id: SALON, member_id: A});
    if (mode === 'guide') app.db.rows('salons').push({id: SALON, guide_member_id: A});
    app.db.rows('salon_messages').push(row(salonId, 'Expected shared history'), row(`private-${A}`, 'SYNTHETIC_PRIVATE_HISTORY'));
    await complete(await app.post({isCouncilMode: false, salonId, message: 'Current shared question'}));
    assert.deepEqual(app.calls.http[0].body.messages, [{role: 'user', content: 'Expected shared history'}, {role: 'user', content: 'Current shared question'}]);
    assert.equal(app.db.rows('salon_messages').find(m => m.content === ANSWER).salon_id, salonId);
  }
});

test('Council remains isolated from salon history and writes while keeping its current question', async () => {
  const app = fixture(); app.db.rows('salon_messages').push(row('general', 'SYNTHETIC_SHARED_HISTORY'));
  await complete(await app.post({message: 'Council question'}));
  assert.deepEqual(app.calls.http[0].body.messages, [{role: 'user', content: 'Council question'}]);
  assert.equal(app.db.log.filter(x => x.table === 'salon_messages').length, 0);
  assert.deepEqual(plain(app.db.rows('salon_messages')).map(x => x.content), ['SYNTHETIC_SHARED_HISTORY']);
});
