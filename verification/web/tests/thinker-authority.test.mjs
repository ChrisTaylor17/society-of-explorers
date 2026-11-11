import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {offlineApp} from './support/offline-app.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const REQUEST = '33333333-3333-4333-8333-333333333333';
const EVENT = '44444444-4444-4444-8444-444444444444';
const PROJECT = '55555555-5555-4555-8555-555555555555';
const COMMUNITY = '66666666-6666-4666-8666-666666666666';

function fixture({reply = 'A synthetic source-backed suggestion.', communityPrompt, communityError = false,
  actor = A, allowed = true, limited = false, memory = null, shared = null} = {}) {
  const app = offlineApp({root: ROOT});
  const db = app.fakes.resetDb({
    members: [{id: A, display_name: 'Ada', project_description: 'Keep this goal', exp_tokens: 3},
      {id: B, display_name: 'Jules', exp_tokens: 7}],
    projects: [{id: PROJECT, member_id: B, narrative_log: [{text: 'Keep this history'}]}],
    community_members: [{member_id: A, community_id: COMMUNITY}],
    agent_spending_limits: [],
    salon_messages: [],
  });
  const calls = {provider: [], rewards: [], feed: [], memory: [], auth: 0};
  const noop = async () => undefined;
  app.setMock('@/lib/supabase/admin', () => ({getSupabaseAdmin: () => db}));
  db.rpc = async (name, params) => {
    calls.rewards.push({name, params});
    return {data: {requestId: REQUEST, eventId: EVENT, amount: params.p_is_reaction ? 4 : 8, replayed: false}, error: null};
  };
  app.setMock('@/lib/getAuthenticatedMember', () => ({getAuthenticatedMember: async () => {
    calls.auth++; return actor ? {memberId: actor, member: db.rows('members').find(m => m.id === actor)} : null;
  }}));
  app.setMock('@/lib/ai/anthropic', () => ({
    createAnthropicClient: () => ({messages: {stream: args => {
      calls.provider.push(args); let onText;
      return {on: (_kind, callback) => {onText = callback;}, finalMessage: async () => {
        for (const chunk of Array.isArray(reply) ? reply : [reply]) onText(chunk);
        return {usage: {input_tokens: 0, output_tokens: 0}};
      }};
    }}}), resolveClaudeModel: () => 'SYNTHETIC_ONLY', logClaudeUsage: () => {},
  }));
  app.setMock('@/lib/rateLimit', () => ({limitModelCall: () => limited ? new Response('{}', {status: 429}) : null}));
  app.setMock('@/lib/salons/access', () => ({memberCanUseSharedSalon: async () => allowed}));
  app.setMock('@/lib/governance/hats', () => ({checkPermission: async () => allowed}));
  app.setMock('@/lib/community/getCommunity', () => ({getCommunityThinkerPrompts: async () => {
    if (communityError) throw new Error('Synthetic unavailable community');
    return communityPrompt === undefined ? {} : {socrates: communityPrompt};
  }}));
  app.setMock('@/lib/thinkerMemory', () => ({getMemory: async () => memory, recordInteraction: noop}));
  app.setMock('@/lib/memory/embeddings', () => ({storeConversationEmbedding: noop}));
  app.setMock('@/lib/memory/sharedMemory', () => ({getThinkerContext: async () => shared,
    storeEpisode: async value => {calls.memory.push(value);}, extractMemory: noop}));
  app.setMock('@/lib/feed/activityFeed', () => ({emitActivity: async value => {calls.feed.push(value);}}));
  // The production parser/action/disbursement modules are NOT mocked. A regression
  // that reconnects them performs observable writes in this disposable FakeDb.
  const route = app.load('app/api/thinker/route.ts');
  const body = overrides => ({requestId: REQUEST, thinkerId: 'socrates', message: 'Help me plan the next test.',
    isCouncilMode: true, ...overrides});
  const post = overrides => {
    const request = app.fakes.makeReq(body(overrides), {url: 'http://localhost/api/thinker'});
    request.signal = new AbortController().signal;
    return route.POST(request);
  };
  return {app, db, calls, post};
}

async function read(response) {
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  const text = await response.text();
  const events = text.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
  return {events, done: events.findLast(event => event.done), text};
}

test('model-written actions cannot change another project, the member goal, points, tasks or activity', async () => {
  const actions = [
    {type: 'narrate_project', data: {project_id: PROJECT, text: 'UNAPPROVED_CHANGE'}},
    {type: 'update_goal', data: {goal: 'UNAPPROVED_GOAL'}},
    {type: 'award_exp', data: {amount: 500, reason: 'Unapproved discretionary award'}},
    {type: 'create_project_task', data: {project_id: PROJECT, title: 'Unapproved bounty', reward_amount: 500}},
    {type: 'save_note', data: {content: 'Unapproved note'}},
    {type: 'schedule_ritual', data: {ritualId: 'unapproved-ritual'}},
    {type: 'create_artifact_prompt', data: {prompt: 'Unapproved artifact'}},
    {type: 'create_task', data: {title: 'Unapproved task'}},
    {type: 'verify_task', data: {task_id: PROJECT}},
    {type: 'celebrate_graduation', data: {member_id: B}},
  ];
  for (const isCouncilMode of [true, false]) {
    const app = fixture({reply: 'I suggest a project update.|||ACTIONS|||' + JSON.stringify(actions)});
    const before = JSON.stringify(app.db.tables);
    const result = await read(await app.post({isCouncilMode, salonId: `private-${A}`}));
    // Normalize the VM realm, not the data: every stored field must still match.
    assert.deepEqual(JSON.parse(JSON.stringify(app.db.rows('projects'))), JSON.parse(before).projects);
    assert.deepEqual(JSON.parse(JSON.stringify(app.db.rows('members'))), JSON.parse(before).members);
    assert.deepEqual(app.calls.feed, []);
    assert.equal(app.db.log.filter(row => row.op !== 'select' && row.table !== 'salon_messages').length, 0);
    assert.deepEqual(result.done.actionReview, {status: 'not_executed'});
    assert.equal('actions' in result.done, false);
    assert.match(result.done.response, /No action was executed/);
    assert.equal(result.events.some(event => Array.isArray(event.actions)), false);
    assert.doesNotMatch(result.text, /UNAPPROVED_CHANGE|UNAPPROVED_GOAL|Unapproved bounty|\|\|\|ACTIONS\|\|\|/);
    assert.match(result.events.map(event => event.delta || '').join(''), /No action was executed/);
    assert.equal(result.events.find(event => event.type === 'actions').results[0].success, false);
    assert.equal(app.calls.rewards.length, 1);
    assert.equal(app.calls.rewards[0].name, 'soe_thinker_reward_award');
    assert.equal(app.calls.rewards[0].params.p_actor, A);
    assert.equal(result.done.expAwarded, 8);
    assert.equal(app.calls.memory.length, 0, 'A model reply cannot authorize durable memory');
  }
});

test('invalid or fragmented action payloads remain unexecuted and produce an honest final reply', async () => {
  for (const payload of ['not JSON', '[null,1,"unknown"]', '{}', '[]', '[{"type":"update_goal","data":null}]']) {
    const app = fixture({reply: ['A proposal.|||ACT', 'IONS|||', payload]});
    const result = await read(await app.post());
    assert.deepEqual(result.done.actionReview, {status: 'not_executed'});
    assert.match(result.done.response, /^A proposal\./);
    assert.match(result.done.response, /No action was executed/);
    assert.equal(app.db.log.some(row => row.op !== 'select'), false);
    assert.deepEqual(app.calls.feed, []);
  }
});

test('delta-only clients see the review notice and no commands at every marker split', async () => {
  const marker = '|||ACTIONS|||';
  for (let cut = 0; cut <= marker.length; cut++) {
    const app = fixture({reply: ['A proposal.' + marker.slice(0, cut), marker.slice(cut),
      '{"type":"award_exp","data":{"amount":500}}', 'ignored trailing text']});
    const result = await read(await app.post());
    const shown = result.events.map(event => event.delta || '').join('');
    assert.equal(shown, result.done.response);
    assert.doesNotMatch(shown, /award_exp|ACTIONS|ignored trailing text/);
    assert.equal(app.db.log.some(row => row.op !== 'select'), false);
  }
});

test('ordinary streamed text including incomplete marker-like text is preserved', () => {
  const app = offlineApp({root: ROOT});
  const {createGuideTextStream} = app.load('lib/claude/guideTextStream.ts');
  for (const chunks of [['Read ', 'Psalm 22.'], ['A |', 'B ||', ' C'], ['Literal |||ACT'], ['', 'Σ', ' — a question.']]) {
    const stream = createGuideTextStream();
    assert.equal(chunks.map(chunk => stream.push(chunk)).join('') + stream.finish(), chunks.join(''));
    assert.equal(stream.finish(), '');
  }
});

const checkGuidance = prompt => {
  assert.match(prompt, /AI guide inspired by/);
  assert.match(prompt, /evidence, interpretation and speculation/);
  assert.match(prompt, /no independent spending/);
  assert.match(prompt, /Do not emit/);
  assert.doesNotMatch(prompt, /economic actor with spending authority|co-founder with spending authority|You hold \$EXP|headquartered at 92B|\[trimmed for speed\]/);
};

test('the real direct and council routes deliver each persona plus current project facts and final authority guidance', async () => {
  const approaches = {socrates: /assumption/, plato: /structure/, nietzsche: /bold/, aurelius: /control/, einstein: /analogy/, jobs: /experience/};
  for (const [thinkerId, approach] of Object.entries(approaches)) {
    for (const isCouncilMode of [false, true]) {
      const app = fixture(); const result = await read(await app.post({thinkerId, isCouncilMode, salonId: `private-${A}`}));
      const prompt = app.calls.provider[0].system;
      checkGuidance(prompt); assert.match(prompt, approach);
      assert.match(prompt, /Root Kernel.*optional, free/);
      assert.match(prompt, /Christadelphian/);
      assert.match(prompt, /Consilience.*possible/);
      assert.match(prompt, /historical|Historical/);
      assert.match(prompt, /\/join/);
      assert.equal(result.done.response, 'A synthetic source-backed suggestion.');
      assert.equal('actionReview' in result.done, false);
      assert.ok(prompt.length < 3300, `Bounded base prompt: ${thinkerId} ${prompt.length}`);
    }
  }
});

test('community overrides, previous council replies and long member memory cannot remove final guide instructions', async () => {
  const supplied = 'SYNTHETIC_CONTEXT_' + 'x'.repeat(4500);
  for (const isCouncilMode of [true, false]) {
    const app = fixture({communityPrompt: supplied, memory: supplied, shared: supplied});
    await read(await app.post({isCouncilMode, community: 'synthetic-community', salonId: `private-${A}`,
      councilContext: [{thinker: 'Plato', response: 'ANOTHER_SYNTHETIC_REPLY'}]}));
    const prompt = app.calls.provider[0].system;
    checkGuidance(prompt);
    assert.ok(prompt.lastIndexOf('GUIDE RESPONSE RULES') > prompt.lastIndexOf('SYNTHETIC_CONTEXT_'));
    assert.ok(prompt.lastIndexOf('GUIDE RESPONSE RULES') > prompt.lastIndexOf('ANOTHER_SYNTHETIC_REPLY'));
  }
});

test('unknown thinkers and unavailable community prompts retain bounded factual fallback guidance', async () => {
  for (const overrides of [{thinkerId: 'unknown'}, {community: 'synthetic-community'}]) {
    const app = fixture({communityError: true}); await read(await app.post(overrides));
    checkGuidance(app.calls.provider[0].system);
    assert.match(app.calls.provider[0].system, /Root Kernel/);
  }
});

test('full profiles retain current facts and guidance for legacy consumers without pretending to be historical people', () => {
  const app = offlineApp({root: ROOT});
  const {THINKER_PROFILES, buildSystemPrompt} = app.load('lib/claude/thinkers.ts');
  for (const id of [...Object.keys(THINKER_PROFILES), 'unknown']) {
    const prompt = buildSystemPrompt(id); checkGuidance(prompt);
    assert.match(prompt, /Christadelphian/);
    assert.doesNotMatch(prompt, /you.re alive now|brilliant person alive today/);
  }
});

test('authentication, community/salon access and rate limits still stop before the model', async () => {
  for (const [options, overrides, status] of [
    [{actor: null}, {}, 401], [{allowed: false}, {community: 'synthetic-community'}, 403],
    [{allowed: false}, {isCouncilMode: false, salonId: 'someone-elses-salon'}, 403],
    [{limited: true}, {}, 429], [{}, {demo: true}, 410], [{}, {requestId: 'bad'}, 400],
  ]) {
    const app = fixture(options); const response = await app.post(overrides);
    assert.equal(response.status, status); assert.equal(app.calls.provider.length, 0);
    assert.equal(app.calls.rewards.length, 0);
    assert.equal(app.db.log.some(row => row.op !== 'select'), false);
  }
});

test('fixed reaction rewards and the silent response path keep their existing behavior', async () => {
  const reaction = fixture(); const response = await read(await reaction.post({isReaction: true}));
  assert.equal(response.done.expAwarded, 4);
  assert.equal(reaction.calls.provider[0].max_tokens, 80);
  const silent = fixture({reply: 'SILENT'}); const result = await read(await silent.post());
  assert.equal(result.done.silent, true); assert.equal(silent.calls.rewards.length, 0);
  assert.equal(silent.db.log.some(row => row.op !== 'select'), false);
});
