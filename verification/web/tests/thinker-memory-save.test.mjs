import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {offlineApp} from './support/offline-app.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const dependencies = createRequire(path.resolve('../../package.json'));
const {PostgrestClient} = dependencies('@supabase/postgrest-js');
const MEMBER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const KEY = 'SYNTHETIC_EMBEDDING_KEY';
const vector = () => Array.from({length: 1536}, (_, i) => i / 1536);
const embedding = () => ({object: 'list', model: 'text-embedding-3-small',
  data: [{object: 'embedding', index: 0, embedding: vector()}]});
const reply = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: {'content-type': 'application/json'},
});
const rejection = () => reply({code: '42501', message: 'PRIVATE_DATABASE_DETAIL', details: 'PRIVATE_ROW'}, 403);
const confirmedRow = body => ({member_id: body.member_id, thinker_key: body.thinker_key, message_role: body.message_role});

function fixture({actor = MEMBER, key = KEY, provider, database, helper} = {}) {
  const app = offlineApp({root: ROOT});
  const calls = {provider: [], database: [], auth: 0};
  const warnings = [];
  app.context.console = {warn: (...values) => warnings.push(values.join(' ')), log: () => {}};
  if (key !== undefined) app.context.process.env.OPENAI_API_KEY = key;
  app.context.fetch = async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/embeddings');
    const body = JSON.parse(options.body);
    calls.provider.push({url, body, authorization: new Headers(options.headers).get('authorization')});
    return provider ? provider(body) : reply(embedding());
  };
  const client = new PostgrestClient('https://synthetic-memory.invalid/rest/v1', {
    fetch: async (input, options) => {
      const url = new URL(String(input));
      assert.equal(url.origin, 'https://synthetic-memory.invalid');
      assert.equal(url.pathname, '/rest/v1/thinker_conversation_embeddings');
      assert.equal(options.method, 'POST');
      const headers = new Headers(options.headers);
      assert.equal(headers.has('authorization'), false);
      assert.equal(headers.has('apikey'), false);
      const body = JSON.parse(options.body);
      calls.database.push({url, method: options.method, headers, body});
      return database ? database(body) : reply(confirmedRow(body), 201);
    },
  });
  app.setMock('@/lib/supabase/admin', () => ({getSupabaseAdmin: () => client}));
  app.setMock('@/lib/getAuthenticatedMember', () => ({getAuthenticatedMember: async () => {
    calls.auth++; return actor ? {memberId: actor} : null;
  }}));
  if (helper) app.setMock('@/lib/memory/embeddings', () => ({storeConversationEmbedding: helper}));
  const route = app.load('app/api/thinker/memory/route.ts');
  const post = (body = {thinkerKey: 'socrates', messages: [{role: 'user', content: 'Synthetic first'}]}) =>
    route.POST(new Request('http://localhost/api/thinker/memory', {method: 'POST', body: JSON.stringify(body)}));
  return {app, calls, warnings, post, route};
}

const storeInput = {memberId: MEMBER, thinkerKey: 'socrates', role: 'user', content: 'Synthetic first'};
const store = (app, overrides = {}) => app.app.load('lib/memory/embeddings.ts').storeConversationEmbedding({...storeInput, ...overrides});
async function checkStored(app, expected = 'unconfirmed') {
  const result = await store(app);
  assert.equal(result.status, expected);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|SYNTHETIC_EMBEDDING_KEY|Synthetic first/);
  return result;
}

test('retired unreviewed endpoint returns no save receipt or provider/database work for any caller', async () => {
  for (const actor of [MEMBER, OTHER, null]) for (const body of [null, {}, {memberId: OTHER, thinkerKey: 'socrates', messages: [{role: 'user', content: 'Synthetic first'}]}]) {
    const app = fixture({actor}); const response = await app.post(body);
    assert.equal(response.status, 410); assert.match(response.headers.get('cache-control'), /private.*no-store/);
    assert.equal((await response.json()).memoryReviewRequired, true);
    assert.equal(app.calls.auth, 0); assert.equal(app.calls.provider.length, 0); assert.equal(app.calls.database.length, 0);
  }
});

test('retained embedding helper does not turn database rejection into success', async () => {
  const app = fixture({database: rejection}); await checkStored(app);
  assert.equal(app.calls.database.length, 1);
  assert.doesNotMatch(app.warnings.join('\n'), /PRIVATE_DATABASE_DETAIL|PRIVATE_ROW|SYNTHETIC_EMBEDDING_KEY/);
});

test('helper outcomes distinguish each confirmed and failed write without retrying', async () => {
  const app = fixture({database: body => body.message_role === 'user' ? reply(confirmedRow(body), 201) : rejection()});
  const results = await Promise.all([store(app), store(app, {role: 'assistant'})]);
  assert.deepEqual(results.map(r => r.status), ['stored', 'unconfirmed']);
  assert.equal(app.calls.provider.length, 2); assert.equal(app.calls.database.length, 2);
});

test('a lost acknowledgement after simulated commit remains unconfirmed', async () => {
  const committed = [];
  const app = fixture({database: body => {committed.push(body); throw new Error('PRIVATE_LOST_ACK');}});
  await checkStored(app); assert.equal(committed.length, 1); assert.equal(app.calls.database.length, 1);
});

test('empty, malformed and mismatched acknowledgements cannot become saved', async () => {
  for (const value of [null, [], {}, [{member_id: MEMBER}], 'PRIVATE_BAD_BODY',
    {member_id: OTHER, thinker_key: 'socrates', message_role: 'user'},
    {member_id: MEMBER, thinker_key: 'different', message_role: 'user'},
    {member_id: MEMBER, thinker_key: 'socrates', message_role: 'assistant'}]) {
    const app = fixture({database: () => reply(value, 201)}); await checkStored(app);
  }
  await checkStored(fixture({database: () => new Response(null, {status: 204})}));
});

test('confirmed helper writes use the installed query/parser and bounded acknowledgement metadata', async () => {
  const app = fixture(); await checkStored(app, 'stored');
  const call = app.calls.database[0];
  assert.equal(call.url.searchParams.get('select'), 'member_id,thinker_key,message_role');
  assert.match(call.headers.get('prefer'), /return=representation/);
  assert.equal(call.headers.get('accept'), 'application/vnd.pgrst.object+json');
  assert.equal(call.body.member_id, MEMBER); assert.equal(call.body.content, 'Synthetic first');
  assert.equal(call.body.embedding.length, 1536); assert.equal(app.calls.provider[0].authorization, 'Bearer ' + KEY);
});

test('provider HTTP, transport and JSON failures prevent helper writes', async () => {
  for (const provider of [() => reply({error: 'PRIVATE_PROVIDER_ERROR'}, 500),
    () => {throw new Error('PRIVATE_PROVIDER_TRANSPORT');}, () => new Response('{invalid JSON', {status: 200})]) {
    const app = fixture({provider}); await checkStored(app); assert.equal(app.calls.database.length, 0);
    assert.doesNotMatch(app.warnings.join('\n'), /PRIVATE_PROVIDER_|SYNTHETIC_EMBEDDING_KEY/);
  }
});

test('malformed embedding metadata or vectors remain refused before a write', async () => {
  const valid = embedding();
  for (const body of [null, {}, {data: []}, {...valid, model: 'wrong-model'},
    {...valid, data: [...valid.data, ...valid.data]}, {...valid, data: [{...valid.data[0], index: 1}]},
    {...valid, data: [{...valid.data[0], object: 'wrong-object'}]},
    ...[null, [], [1, 2, 3], 'base64', vector().map((n, i) => i ? n : '0'),
      vector().map((n, i) => i ? n : null)].map(value => ({...valid, data: [{...valid.data[0], embedding: value}]}))]) {
    const app = fixture({provider: () => reply(body)}); await checkStored(app); assert.equal(app.calls.database.length, 0);
  }
  const app = fixture({provider: () => ({ok: true, json: async () => ({...valid,
    data: [{...valid.data[0], embedding: vector().map((n, i) => i ? n : Infinity)}]})})});
  await checkStored(app); assert.equal(app.calls.database.length, 0);
});

test('missing or blank provider configuration still causes no embedding request', async () => {
  for (const key of ['', '   ']) {
    const app = fixture({key}); await checkStored(app);
    assert.equal(app.calls.provider.length, 0); assert.equal(app.calls.database.length, 0);
  }
  const app = fixture(); delete app.app.context.process.env.OPENAI_API_KEY; await checkStored(app);
  assert.equal(app.calls.provider.length, 0); assert.equal(app.calls.database.length, 0);
});
