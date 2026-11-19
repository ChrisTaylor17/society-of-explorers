import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {offlineApp} from './support/offline-app.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const dependencies = createRequire(path.resolve('../../package.json'));
const Anthropic = dependencies('@anthropic-ai/sdk').default;
const MEMBER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const REQUEST = '33333333-3333-4333-8333-333333333333';
const EVENT = '44444444-4444-4444-8444-444444444444';

function providerStream(text = 'Synthetic complete answer.', fail = false) {
  const events = [
    {type: 'message_start', message: {id: 'msg_synthetic', type: 'message', role: 'assistant',
      model: 'claude-sonnet-4-6', content: [], stop_reason: null, stop_sequence: null,
      usage: {input_tokens: 1, output_tokens: 0}}},
    {type: 'content_block_start', index: 0, content_block: {type: 'text', text: ''}},
    {type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text}},
    ...(fail ? [{type: 'error', error: {type: 'api_error', message: 'PRIVATE_SYNTHETIC_STREAM_ERROR'}}] : [
      {type: 'content_block_stop', index: 0},
      {type: 'message_delta', delta: {stop_reason: 'end_turn', stop_sequence: null}, usage: {output_tokens: 2}},
      {type: 'message_stop'},
    ]),
  ];
  return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''),
    {headers: {'content-type': 'text/event-stream'}});
}

function unavailable() {
  return new Response(JSON.stringify({type: 'error', error: {type: 'overloaded_error', message: 'PRIVATE_SYNTHETIC_HTTP_ERROR'}}),
    {status: 500, headers: {'content-type': 'application/json', 'retry-after-ms': '1'}});
}

export function providerFixture({transport, initialPoints = 3, realSalonAccess = false, realMemoryReads = false, reviewedContext} = {}) {
  const app = offlineApp({root: ROOT});
  app.context.process.env.ANTHROPIC_API_KEY = 'SYNTHETIC_KEY_ONLY';
  app.context.console = {warn: () => {}, log: () => {}, info: () => {}};
  // Shorten only the application's retry delay, not the SDK or reward timeouts.
  app.context.setTimeout = (callback, delay, ...args) => setTimeout(callback, delay === 2000 ? 1 : delay, ...args);
  const db = app.fakes.resetDb({members: [
    {id: MEMBER, display_name: 'Synthetic Ada', exp_tokens: initialPoints},
    {id: OTHER, display_name: 'Synthetic Jules', exp_tokens: initialPoints},
  ], salon_messages: []});
  let actor = MEMBER;
  const calls = {http: [], embeddings: [], episodes: [], extraction: [], legacy: [], rewards: [], receiptReads: [],
    legacyReads: [], sharedReads: [], retrievalEmbeddings: [], memoryMatches: []};
  const receipts = new Map();
  db.rpc = async (name, params) => {
    if (realMemoryReads && ['match_facts', 'match_episodes'].includes(name)) {
      calls.memoryMatches.push({name, memberId: params.match_member_id});
      const table = name === 'match_facts' ? 'user_semantic_memory' : 'user_episodic_memory';
      return {data: db.rows(table).filter(row => row.member_id === params.match_member_id), error: null};
    }
    if (name === 'soe_thinker_reward_receipt') {
      calls.receiptReads.push(params);
      const receipt = receipts.get(params.p_request_id);
      return {data: receipt ? {...receipt, replayed: true} : null, error: null};
    }
    assert.equal(name, 'soe_thinker_reward_award'); calls.rewards.push(params);
    const previous = receipts.get(params.p_request_id);
    if (previous) return {data: {...previous, replayed: true}, error: null};
    const receipt = {requestId: params.p_request_id, eventId: EVENT, amount: params.p_is_reaction ? 4 : 8, replayed: false};
    receipts.set(params.p_request_id, receipt);
    db.rows('members').find(member => member.id === params.p_actor).exp_tokens += receipt.amount;
    return {data: receipt, error: null};
  };
  class SyntheticTransportClient extends Anthropic {
    constructor(options) {
      super({...options, baseURL: 'https://synthetic-guide.invalid', timeout: 2000, logLevel: 'off',
        fetch: async (input, options) => {
          assert.equal(new URL(String(input)).origin, 'https://synthetic-guide.invalid');
          const headers = new Headers(options.headers);
          assert.equal(headers.get('x-api-key'), 'SYNTHETIC_KEY_ONLY');
          const call = {body: JSON.parse(options.body), retryCount: headers.get('x-stainless-retry-count'), signal: options.signal};
          calls.http.push(call);
          return transport ? transport(calls.http.length, call) : providerStream();
        }});
    }
  }
  app.setMock('@anthropic-ai/sdk', () => SyntheticTransportClient);
  app.setMock('@/lib/supabase/admin', () => ({getSupabaseAdmin: () => db}));
  app.setMock('@/lib/getAuthenticatedMember', () => ({getAuthenticatedMember: async () => actor
    ? {memberId: actor, member: db.rows('members').find(member => member.id === actor)} : null}));
  if (!realSalonAccess) app.setMock('@/lib/salons/access', () => ({memberCanUseSharedSalon: async () => true}));
  app.setMock('@/lib/governance/hats', () => ({checkPermission: async () => true}));
  app.setMock('@/lib/community/getCommunity', () => ({getCommunityThinkerPrompts: async () => ({})}));
  app.setMock('@/lib/thinkerMemory', () => ({getMemory: async (...values) => {
    calls.legacyReads.push(values);
    return realMemoryReads ? app.load('lib/thinkerMemory.ts').getMemory(...values) : null;
  },
    recordInteraction: async (...values) => {calls.legacy.push(values);}}));
  const embeddingDouble = {generateEmbedding: async text => {
    calls.retrievalEmbeddings.push(text); return Array(1536).fill(0.01);
  }, storeConversationEmbedding: async value => {
    calls.embeddings.push(value); return {status: 'stored'};
  }};
  app.setMock('@/lib/memory/embeddings', () => embeddingDouble);
  if (realMemoryReads) app.setMock('./embeddings', () => embeddingDouble);
  app.setMock('@/lib/memory/sharedMemory', () => ({getThinkerContext: async (...values) => {
    calls.sharedReads.push(values);
    return realMemoryReads ? app.load('lib/memory/sharedMemory.ts').getThinkerContext(...values) : '';
  },
    storeEpisode: async value => {calls.episodes.push(value);},
    extractMemory: async (...values) => {calls.extraction.push(values);}}));
  app.setMock('@/lib/feed/activityFeed', () => ({emitActivity: async () => {}}));
  if (reviewedContext) app.setMock('@/lib/memory/reviewRuntime', () => ({getReviewedGuideContext: reviewedContext}));
  // The actual provider factory, SDK stream parser/retries, route and limiter run.
  const guide = app.load('app/api/thinker/route.ts');
  const memory = app.load('app/api/thinker/memory/route.ts');
  const limiter = app.load('lib/rateLimit.ts');
  const post = (overrides = {}, signal) => guide.POST(new Request('http://localhost/api/thinker', {
    method: 'POST', signal, body: JSON.stringify({requestId: REQUEST, thinkerId: 'socrates', message: 'Synthetic question',
      isCouncilMode: true, ...overrides}),
  }));
  const postMemory = (overrides = {}) => memory.POST(new Request('http://localhost/api/thinker/memory', {
    method: 'POST', body: JSON.stringify({thinkerKey: 'socrates', messages: [{role: 'user', content: 'Synthetic note'}], ...overrides}),
  }));
  return {app, db, calls, post, postMemory, guide, limiter, setActor: value => {actor = value;}};
}

async function readStream(response) {
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  const text = await response.text();
  assert.doesNotMatch(text, /PRIVATE_SYNTHETIC_|SYNTHETIC_KEY_ONLY/);
  const events = text.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
  return {events, done: events.findLast(event => event.done), shown: events.map(event => event.delta || '').join('')};
}

test('repeated provider failures use at most the two explicit attempts, without hidden SDK retries', async () => {
  const app = providerFixture({transport: unavailable});
  const result = await readStream(await app.post());
  assert.equal(app.calls.http.length, 2);
  assert.deepEqual(app.calls.http.map(call => call.retryCount), ['0', '0']);
  assert.equal(result.done.error, 'Stream failed');
  assert.equal(app.calls.rewards.length, 0); assert.equal(app.calls.embeddings.length, 0);
});

test('a failure before any text can retry once and preserve a single complete answer', async () => {
  const app = providerFixture({transport: attempt => attempt === 1 ? unavailable() : providerStream()});
  const result = await readStream(await app.post());
  assert.equal(app.calls.http.length, 2);
  assert.equal(result.shown, 'Synthetic complete answer.');
  assert.equal(result.done.response, result.shown);
  assert.equal(app.calls.rewards.length, 1);
  assert.equal(app.calls.embeddings.length, 0);
});

test('a failed partial answer is never concatenated with a second attempt or saved as complete', async () => {
  const app = providerFixture({transport: attempt => attempt === 1 ? providerStream('Synthetic partial answer.', true) : providerStream('Different second answer.')});
  const result = await readStream(await app.post({isCouncilMode: false, salonId: `private-${MEMBER}`}));
  assert.equal(app.calls.http.length, 1);
  assert.equal(result.shown, 'Synthetic partial answer.');
  assert.equal(result.done.error, 'Stream failed');
  assert.equal(result.done.response, undefined);
  assert.equal(app.calls.rewards.length, 0); assert.equal(app.calls.embeddings.length, 0);
  assert.equal(app.calls.episodes.length, 0); assert.equal(app.calls.legacy.length, 0);
  assert.equal(app.db.rows('salon_messages').filter(row => row.sender_type === 'thinker').length, 0);
});

test('even buffered non-visible text prevents an automatic retry', async () => {
  const app = providerFixture({transport: attempt => attempt === 1 ? providerStream('|||ACT', true) : providerStream()});
  const result = await readStream(await app.post());
  assert.equal(app.calls.http.length, 1);
  assert.equal(result.shown, ''); assert.equal(result.done.error, 'Stream failed');
  assert.equal(app.calls.rewards.length, 0);
});

test('an already-aborted request cannot dispatch a model request', async () => {
  const controller = new AbortController(); controller.abort();
  const app = providerFixture();
  const result = await readStream(await app.post({}, controller.signal));
  assert.equal(app.calls.http.length, 0); assert.equal(result.done.error, 'Stream failed');
  assert.equal(app.calls.rewards.length, 0);
});

test('request abort reaches the in-flight SDK request and never triggers a second attempt', async () => {
  let started;
  const ready = new Promise(resolve => {started = resolve;});
  const app = providerFixture({transport: (_attempt, call) => new Promise((_resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('SYNTHETIC_UNWIRED_ABORT')), 30);
    call.signal.addEventListener('abort', () => {clearTimeout(timer); reject(new DOMException('Synthetic abort', 'AbortError'));}, {once: true});
    started();
  })});
  const controller = new AbortController();
  const response = await app.post({}, controller.signal);
  await ready; controller.abort();
  const result = await readStream(response);
  assert.equal(app.calls.http.length, 1); assert.equal(result.done.error, 'Stream failed');
  assert.equal(app.calls.rewards.length, 0); assert.equal(app.calls.embeddings.length, 0);
});

test('retired memory batches never call embeddings or consume the ordinary reply allowance', async () => {
  const app = providerFixture(); const request = new Request('http://localhost');
  for (let i = 0; i < app.limiter.LIMITS.member.max - 1; i++) app.limiter.limitModelCall(request, MEMBER);
  const responses = await Promise.all([app.postMemory(), app.postMemory({memberId: OTHER}), app.postMemory({messages: []})]);
  assert.deepEqual(responses.map(response => response.status), [410, 410, 410]);
  assert.equal(app.calls.embeddings.length, 0);
  await readStream(await app.post());
  assert.equal((await app.post()).status, 429);
});

test('receipt confirmation never regenerates an answer or repeats memory work', async t => {
  const app = providerFixture({initialPoints: 8});
  const countWork = () => Object.fromEntries(Object.entries(app.calls)
    .filter(([name]) => name !== 'receiptReads').map(([name, calls]) => [name, calls.length]));
  await readStream(await app.post());
  await readStream(await app.post({requestId: '55555555-5555-4555-8555-555555555555'}));
  // Observe a repeated POST without making today's duplicate work a required
  // invariant. A later durable request ledger should be able to reduce it.
  await readStream(await app.post());
  const before = countWork();
  t.diagnostic(JSON.stringify({kind: 'synthetic-replay-observation', beforeReceiptRead: before,
    note: 'Background helpers and reward storage are doubles; these counts are not real provider charges.'}));
  const response = await app.guide.GET(new Request(`http://localhost/api/thinker?requestId=${REQUEST}`));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  assert.equal((await response.json()).status, 'confirmed');
  assert.deepEqual(countWork(), before);
  assert.equal(app.calls.receiptReads.length, 1);
});
