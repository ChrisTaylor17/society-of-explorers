import test from 'node:test';
import assert from 'node:assert/strict';
import {providerFixture} from './thinker-provider-retries.test.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const SALON = '66666666-6666-4666-8666-666666666666';
const privateFields = ['bio','discipline','skills','project_description','seeking','philosophy'];
const memoryMarkers = ['LEGACY','SUMMARY','GOAL','COMMITMENT','EMOTION','FACT','EPISODE'];
function fixture(actor = A, mode = 'general') {
  const app = providerFixture({realSalonAccess: true, realMemoryReads: true}); app.setActor(actor);
  for (const memberId of [A, B]) {
    const suffix = memberId === A ? 'A' : 'B';
    const member = app.db.rows('members').find(m => m.id === memberId);
    for (const key of privateFields) member[key] = key === 'skills' ? [`PRIVATE_${suffix}_${key}`] : `PRIVATE_${suffix}_${key}`;
    app.db.rows('thinker_memory').push({member_id: memberId, thinker_id: 'socrates', summary: `PRIVATE_${suffix}_LEGACY`});
    app.db.rows('user_profile_summary').push({member_id: memberId, summary_text: `PRIVATE_${suffix}_SUMMARY`,
      active_goals: [{goal: `PRIVATE_${suffix}_GOAL`}], pending_commitments: [{commitment: `PRIVATE_${suffix}_COMMITMENT`}],
      current_emotional_state: `PRIVATE_${suffix}_EMOTION`});
    app.db.rows('user_semantic_memory').push({member_id: memberId, category: 'goal', key: 'Synthetic goal',
      value: `PRIVATE_${suffix}_FACT`, status: 'active', similarity: 0.9});
    app.db.rows('user_episodic_memory').push({member_id: memberId, thinker_id: 'plato', content: `PRIVATE_${suffix}_EPISODE`, similarity: 0.9});
  }
  if (mode === 'member') app.db.rows('salon_members').push({id: 'synthetic-membership', salon_id: SALON, member_id: actor});
  if (mode === 'guide') app.db.rows('salons').push({id: SALON, guide_member_id: actor});
  const salonId = mode === 'general' ? 'general' : mode === 'private' ? `private-${actor}` : SALON;
  app.db.rows('salon_messages').push({salon_id: salonId, sender_type: 'member', content: 'Earlier conversation in this salon', created_at: '2020-01-01T00:00:00Z'});
  return {...app, salonId};
}
async function complete(app, values = {}) {
  const response = await app.post({isCouncilMode: false, salonId: app.salonId, message: 'Current shared question', ...values});
  assert.equal(response.status, 200);
  const frames = (await response.text()).split('\n').filter(x => x.startsWith('data: ')).map(x => JSON.parse(x.slice(6)));
  const done = frames.findLast(x => x.done);
  assert.equal(done?.response, 'Synthetic complete answer.');
  assert.equal(app.calls.http.length, 1);
  return {done, request: app.calls.http[0].body};
}
function assertNoPrivateReads(app) {
  assert.equal(app.calls.legacyReads.length, 0);
  assert.equal(app.calls.sharedReads.length, 0);
  assert.equal(app.calls.retrievalEmbeddings.length, 0);
  assert.equal(app.calls.memoryMatches.length, 0);
  assert.equal(app.db.log.filter(q => ['thinker_memory','user_profile_summary','user_semantic_memory','user_episodic_memory'].includes(q.table)).length, 0);
}

test('shared replies exclude private profile and memory across general, member and guided salons', async t => {
  for (const actor of [A, B]) for (const mode of ['general','member','guide']) {
    const app = fixture(actor, mode); const {request, done} = await complete(app);
    const privateMarkers = request.system.match(/PRIVATE_[AB]_[A-Za-z_]+/g) || [];
    t.diagnostic(JSON.stringify({actor, mode, privateMarkers, destination: app.db.rows('salon_messages').find(m => m.sender_type === 'thinker')?.salon_id}));
    assert.deepEqual(privateMarkers, []);
    assertNoPrivateReads(app);
    assert.deepEqual(request.messages, [{role: 'user', content: 'Earlier conversation in this salon'}, {role: 'user', content: 'Current shared question'}]);
    assert.match(request.system, /shared salon/i);
    assert.equal(app.db.rows('salon_messages').find(m => m.sender_type === 'thinker').salon_id, app.salonId);
    assert.equal(done.reward.amount, 8);
    assert.equal(app.calls.embeddings.length, 0); assert.equal(app.calls.episodes.length, 0);
    assert.ok([...app.calls.embeddings, ...app.calls.episodes].every(v => v.memberId === actor));
  }
});

test('shared reaction mode also excludes private context while keeping its existing reward', async () => {
  const app = fixture(); const {request, done} = await complete(app, {isReaction: true});
  assert.doesNotMatch(request.system, /PRIVATE_[AB]_/); assertNoPrivateReads(app);
  assert.equal(done.reward.amount, 4); assert.equal(request.max_tokens, 80);
});

test('private conversations retain explicitly supplied member profile but never retrieve unreviewed legacy memory', async () => {
  for (const actor of [A, B]) for (const isReaction of [false, true]) {
    const app = fixture(actor, 'private'), suffix = actor === A ? 'A' : 'B';
    const {request} = await complete(app, {isReaction});
    for (const key of privateFields) assert.ok(request.system.includes(`PRIVATE_${suffix}_${key}`), key);
    for (const key of memoryMarkers) assert.ok(!request.system.includes(`PRIVATE_${suffix}_${key}`), key);
    assert.doesNotMatch(request.system, new RegExp(`PRIVATE_${suffix === 'A' ? 'B' : 'A'}_`));
    assertNoPrivateReads(app);
    assert.equal(app.calls.embeddings.length, 0); assert.equal(app.calls.episodes.length, 0);
    assert.equal(app.calls.legacy.length, 0); assert.equal(app.calls.extraction.length, 0);
    assert.equal(app.db.rows('salon_messages').find(m => m.sender_type === 'thinker').salon_id, `private-${actor}`);
  }
});

test('Council keeps current input and caller-supplied council context without private retrieval', async () => {
  const app = fixture(); const {request} = await complete(app, {isCouncilMode: true,
    councilContext: [{thinker: 'plato', response: 'Explicitly supplied council perspective'}]});
  assert.doesNotMatch(request.system, /PRIVATE_[AB]_/); assertNoPrivateReads(app);
  assert.match(request.system, /Explicitly supplied council perspective/);
  assert.deepEqual(request.messages, [{role: 'user', content: 'Current shared question'}]);
  assert.equal(app.db.rows('salon_messages').length, 1);
});

test('client flags cannot make a shared reply privately personalized', async () => {
  const app = fixture(); const {request} = await complete(app, {usePrivateContext: true, privateContext: true, memberId: B});
  assert.doesNotMatch(request.system, /PRIVATE_[AB]_/); assertNoPrivateReads(app);
});

test('permission denials occur before all private retrieval and provider use', async () => {
  for (const values of [{salonId: `private-${B}`}, {salonId: SALON}]) {
    const app = fixture(); const response = await app.post({isCouncilMode: false, ...values});
    assert.equal(response.status, 403); assertNoPrivateReads(app); assert.equal(app.calls.http.length, 0);
  }
  const app = fixture(); app.setActor(null);
  assert.equal((await app.post({isCouncilMode: false, salonId: 'general'})).status, 401); assertNoPrivateReads(app);
});

test('a member can still explicitly put personal information in the current shared message', async () => {
  const app = fixture(), message = 'I choose to discuss SYNTHETIC_PERSONAL_DETAIL here.';
  const {request} = await complete(app, {message});
  assert.deepEqual(request.messages.at(-1), {role: 'user', content: message});
  assert.equal(app.db.rows('salon_messages').filter(m => m.content === message).length, 1);
  assert.doesNotMatch(request.system, /PRIVATE_[AB]_/); assertNoPrivateReads(app);
});
