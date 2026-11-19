import assert from 'node:assert/strict';
import test from 'node:test';
import { publicFeedFixture, COMMUNITY, OTHER_COMMUNITY, OWNER, OTHER, EVENT, LEGACY, CREATED, summary } from './support/public-feed-fixture.mjs';
const plain = value => JSON.parse(JSON.stringify(value));

test('The actual feed route selects only the reviewed copy and returns exactly five public fields', async t => {
  const f = await publicFeedFixture(t); await f.seed();
  await f.seed(LEGACY, { metadata: { private_secret: 'PRIVATE_LEGACY' } });
  const response = await f.GET(f.request('?limit=50')), body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body, { schema: 'soe-public-activity-v1', events: [{ id: EVENT, event_type: summary.event_type, title: summary.title, description: summary.description, created_at: CREATED }] });
  assert(!JSON.stringify(body).includes('PRIVATE_'));
  assert.deepEqual(Object.keys(body.events[0]).sort(), ['created_at','description','event_type','id','title']);
  const request = f.calls.find(c => c.table === 'activity_feed');
  assert.equal(request.query.select, 'id,community_id,is_public,created_at,public_feed:metadata->public_feed');
  assert.equal(request.query['metadata->public_feed->>version'], 'eq.1');
  assert.equal(request.query.community_id, 'eq.' + COMMUNITY); assert.equal(request.query.is_public, 'eq.true');
  assert(!JSON.stringify(request.response).includes('PRIVATE_'));
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  assert.equal(response.headers.get('surrogate-control'), 'no-store');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
});

test('Different communities, legacy public defaults, withdrawals and before/limit filters are enforced in SQL', async t => {
  const f = await publicFeedFixture(t); await f.seed();
  await f.seed(LEGACY, { community_id: OTHER_COMMUNITY, created_at: '2026-11-08T05:00:00Z' });
  assert.deepEqual((await (await f.GET(f.request('?before=2026-11-08T05%3A59%3A00Z'))).json()).events, []);
  assert.equal((await (await f.GET(f.request('?community=another-community&limit=1'))).json()).events[0].id, LEGACY);
  await f.db.query('UPDATE activity_feed SET is_public=false WHERE id=$1', [EVENT]);
  assert.deepEqual((await (await f.GET(f.request())).json()).events, []);
  assert.deepEqual((await (await f.GET(f.request('?community=missing-community'))).json()).events, []);
});

test('Unknown, duplicate, oversized and malformed request parameters fail before any database client is created', async t => {
  const f = await publicFeedFixture(t);
  for (const query of ['?community=', '?community=private/name', '?limit=0', '?limit=101', '?limit=30junk', '?limit=1&limit=2', '?before=2026-02-30T00:00:00Z', '?before=invalid', '?member_id=' + OWNER, '?community=' + 'a'.repeat(81)]) {
    assert.equal((await f.GET(f.request(query))).status, 400, query);
  }
  assert.equal(f.clientCreations, 0); assert.deepEqual(f.calls, []);
});

test('Defensive projection drops malformed or wrong-community rows and ignores injected raw fields', async t => {
  const f = await publicFeedFixture(t); await f.seed();
  f.responseMutator = (table, rows) => table === 'activity_feed' ? [
    { ...rows[0], member_id: OTHER, agent_key: 'PRIVATE_INJECTION', title: 'PRIVATE_TITLE_INJECTION', metadata: { secret: 'PRIVATE' } },
    { ...rows[0], id: LEGACY, community_id: OTHER_COMMUNITY },
    { ...rows[0], id: LEGACY, is_public: false },
    { ...rows[0], id: LEGACY, public_feed: { ...summary, extra: 'PRIVATE' } },
    { ...rows[0], id: LEGACY, public_feed: { ...summary, title: 'a'.repeat(201) } },
    { ...rows[0], id: LEGACY, public_feed: null },
  ] : rows;
  const response = await f.GET(f.request()); assert.equal(response.status, 200);
  const body = await response.json(); assert.equal(body.events.length, 1); assert.equal(body.events[0].title, summary.title);
  assert(!JSON.stringify(body).includes('PRIVATE'));
});

test('Provider/database failures return generic no-store errors without exception or schema content', async t => {
  const f = await publicFeedFixture(t); await f.seed();
  for (const failure of ['communities', 'activity_feed', 'throw']) {
    f.failure = failure; const response = await f.GET(f.request()); assert(response.status >= 500);
    assert(!JSON.stringify(await response.json()).includes('PRIVATE')); assert.match(response.headers.get('cache-control'), /no-store/);
  }
});

test('The actual routine logger writes private events even against the legacy public database default', async t => {
  const f = await publicFeedFixture(t);
  await f.activity.emitActivity({ communityId: COMMUNITY, memberId: OWNER, agentKey: 'private-guide', eventType: 'task_created', title: 'Private task', metadata: { purpose: 'owner' } });
  const { rows } = await f.db.query('SELECT member_id,is_public,metadata FROM activity_feed');
  assert.deepEqual(rows, [{ member_id: OWNER, is_public: false, metadata: { purpose: 'owner' } }]);
  const count = f.calls.length;
  await assert.rejects(f.activity.emitActivity({ eventType: 'task_created', title: 'Should not publish', isPublic: true }), /separately reviewed/);
  await assert.rejects(f.activity.emitActivity({ eventType: 'task_created', title: 'Should not smuggle', metadata: { public_feed: summary } }), /separately reviewed/);
  assert.equal(f.calls.length, count); assert.deepEqual((await (await f.GET(f.request())).json()).events, []);
});

test('Other members cannot send a legacy public event or private event to the model', async t => {
  const f = await publicFeedFixture(t); await f.seed(EVENT, { metadata: {} });
  assert.equal(await f.activity.generateSocialDraft(EVENT, OTHER, 'twitter'), null);
  await f.db.query('UPDATE activity_feed SET metadata=$1,is_public=false WHERE id=$2', [JSON.stringify({ public_feed: summary }), EVENT]);
  assert.equal(await f.activity.generateSocialDraft(EVENT, OTHER, 'twitter'), null);
  assert.deepEqual(f.providerCalls, []); assert.equal((await f.db.query('SELECT * FROM social_posts')).rows.length, 0);
});

test('Public social drafting uses only the reviewed copy and saves a draft under the requesting member', async t => {
  const f = await publicFeedFixture(t); await f.seed();
  const result = await f.activity.generateSocialDraft(EVENT, OTHER, 'twitter'); assert.equal(result.content, 'A synthetic provider draft.');
  assert.equal(f.providerCalls.length, 1); const prompt = JSON.stringify(f.providerCalls[0]);
  assert(prompt.includes(summary.title) && prompt.includes(summary.description)); assert(!prompt.includes('PRIVATE_'));
  const rows = (await f.db.query('SELECT member_id,source_event_id,status FROM social_posts')).rows;
  assert.deepEqual(rows, [{ member_id: OTHER, source_event_id: EVENT, status: 'draft' }]);
  assert.equal(f.calls.filter(c => c.table === 'activity_feed' && c.query['metadata->public_feed->>version']).length, 2);
});

test('Withdrawal or changed review while the model is working prevents saving the stale draft', async t => {
  const f = await publicFeedFixture(t); await f.seed();
  f.beforeProviderReturn = () => f.db.query('UPDATE activity_feed SET is_public=false WHERE id=$1', [EVENT]);
  assert.equal(await f.activity.generateSocialDraft(EVENT, OTHER, 'twitter'), null);
  await f.db.query('UPDATE activity_feed SET is_public=true WHERE id=$1', [EVENT]);
  f.beforeProviderReturn = () => f.db.query("UPDATE activity_feed SET metadata=jsonb_set(metadata,'{public_feed,reviewed_at}','\"2026-11-08T06:02:00.000Z\"'::jsonb) WHERE id=$1", [EVENT]);
  assert.equal(await f.activity.generateSocialDraft(EVENT, OTHER, 'twitter'), null);
  assert.equal(f.providerCalls.length, 2); assert.equal((await f.db.query('SELECT * FROM social_posts')).rows.length, 0);
});

test('The event owner retains the existing own-event draft path with current owner rechecks', async t => {
  const f = await publicFeedFixture(t); await f.seed(EVENT, { metadata: {}, is_public: false });
  assert(await f.activity.generateSocialDraft(EVENT, OWNER, 'linkedin'));
  assert(JSON.stringify(f.providerCalls[0]).includes('PRIVATE_RAW_TITLE'));
  assert(f.calls.filter(c => c.table === 'activity_feed').every(c => c.query.member_id === 'eq.' + OWNER));
  f.beforeProviderReturn = () => f.db.query('UPDATE activity_feed SET member_id=$1 WHERE id=$2', [OTHER, EVENT]);
  assert.equal(await f.activity.generateSocialDraft(EVENT, OWNER, 'linkedin'), null);
  assert.equal((await f.db.query('SELECT * FROM social_posts')).rows.length, 1);
});

test('Browser contract rejects legacy raw rows, extra fields, invalid copy and duplicate records', async t => {
  const f = await publicFeedFixture(t); await f.seed(); const body = await (await f.GET(f.request())).json();
  assert.deepEqual(plain(f.public.parsePublicActivityReply(body)), body.events);
  for (const bad of [{ events: body.events }, { ...body, secret: 'PRIVATE' },
    { ...body, events: [{ ...body.events[0], member_id: OWNER }] },
    { ...body, events: [body.events[0], body.events[0]] },
    { ...body, events: [{ ...body.events[0], title: '\ud800' }] },
    { ...body, events: [{ ...body.events[0], created_at: '2026-02-30T12:00:00Z' }] }]) {
    assert.equal(f.public.parsePublicActivityReply(bad), null);
  }
});
