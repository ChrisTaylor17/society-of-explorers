import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {offlineApp} from './support/offline-app.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MEMBER = '11111111-1111-4111-8111-111111111111';
const TRIGGER = '22222222-2222-4222-8222-222222222222';
const SECRET = 'SYNTHETIC_CRON_ONLY_'.repeat(3);

function proactiveFixture({secret, emailEnabled = false, hasTrigger = true} = {}) {
  const app = offlineApp({root: ROOT});
  if (secret !== undefined) app.context.process.env.CRON_SECRET = secret;
  app.context.process.env.PROACTIVE_EMAIL_NOTIFICATIONS_ENABLED = String(emailEnabled);
  const db = app.fakes.resetDb({
    members: [{id: MEMBER, display_name: 'Synthetic Ada', supabase_auth_id: MEMBER}],
    proactive_triggers: hasTrigger ? [{id: TRIGGER, member_id: MEMBER, status: 'pending',
      suggested_thinker: 'socrates', context_summary: 'SYNTHETIC_PRIVATE_CONTEXT', trigger_type: 'goal_checkin',
      scheduled_for: '2026-01-01T00:00:00.000Z'}] : [],
  });
  const calls = {database: 0, identity: 0, context: 0, model: 0, email: 0};
  db.auth.admin = {getUserById: async () => {
    calls.identity++; return {data: {user: {email: 'synthetic@example.invalid'}}};
  }};
  app.setMock('@/lib/supabase/admin', () => ({getSupabaseAdmin: () => {calls.database++; return db;}}));
  app.setMock('@/lib/memory/sharedMemory', () => ({getThinkerContext: async () => {
    calls.context++; return 'Synthetic eligible context';
  }}));
  app.setMock('@/lib/ai/anthropic', () => ({createAnthropicClient: () => ({messages: {create: async () => {
    calls.model++; return {content: [{type: 'text', text: 'Synthetic check-in.'}]};
  }}}), resolveClaudeModel: () => 'SYNTHETIC_MODEL'}));
  app.setMock('@/lib/email/resend', () => ({getResend: () => ({emails: {send: async () => {
    calls.email++; return {data: {id: 'SYNTHETIC_EMAIL_RECEIPT'}};
  }}})}));
  const {GET} = app.load('app/api/cron/proactive/route.ts');
  const get = authorization => GET(new Request('http://localhost/api/cron/proactive', {
    headers: authorization === undefined ? {} : {authorization},
  }));
  return {app, db, calls, get};
}

test('missing cron configuration refuses the literal missing-secret token before every data/provider operation', async () => {
  const app = proactiveFixture();
  const response = await app.get('Bearer undefined');
  assert.equal(response.status, 401);
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  assert.deepEqual(app.calls, {database: 0, identity: 0, context: 0, model: 0, email: 0});
  assert.equal(app.db.log.length, 0);
  assert.equal(app.db.rows('proactive_triggers')[0].status, 'pending');
  assert.doesNotMatch(await response.text(), /SYNTHETIC_PRIVATE_CONTEXT|synthetic@example|undefined/);
});

test('empty/whitespace configuration, missing headers and wrong tokens all refuse before initialization', async () => {
  for (const [secret, header] of [['', 'Bearer'], ['   ', 'Bearer'], ['\t\n', 'Bearer'],
    [undefined, undefined], [SECRET, undefined], [SECRET, 'Bearer wrong'], [SECRET, 'Basic ' + SECRET],
    [SECRET, 'Bearer undefined']]) {
    const app = proactiveFixture({secret});
    const response = await app.get(header);
    assert.equal(response.status, 401);
    assert.deepEqual(app.calls, {database: 0, identity: 0, context: 0, model: 0, email: 0});
    assert.equal(app.db.log.length, 0);
  }
});

test('even an authenticated job cannot activate legacy check-ins or email without their separate workflow', async () => {
  for (const emailEnabled of [false, true]) for (const hasTrigger of [false, true]) {
    const app = proactiveFixture({secret: SECRET, emailEnabled, hasTrigger});
    const response = await app.get('Bearer ' + SECRET);
    assert.equal(response.status, 503); assert.equal((await response.json()).processed, 0);
    assert.deepEqual(app.calls, {database: 0, identity: 0, context: 0, model: 0, email: 0});
    assert.equal(app.db.log.length, 0);
    if (hasTrigger) assert.equal(app.db.rows('proactive_triggers')[0].status, 'pending');
  }
});

test('an active field cannot override any conflicting exclusion or unapproved memory state', () => {
  const app = offlineApp({root: ROOT});
  const {canUseMemoryInAI} = app.load('lib/memory/retrievalPolicy.ts');
  for (const excluded of ['corrected', 'retracted', 'do_not_use', 'suppressed', 'deleted', 'forgotten', 'expired', 'pending', 'unknown', '']) {
    for (const field of ['status', 'state', 'consent_state']) {
      assert.equal(canUseMemoryInAI({status: 'active', state: 'active', consent_state: 'active', [field]: excluded}), false,
        `${field}=${excluded} must veto active metadata`);
    }
  }
  assert.equal(canUseMemoryInAI({status: 'active', consent_state: ' DO_NOT_USE '}), false);
  for (const value of [false, 0, [], {}]) assert.equal(canUseMemoryInAI({status: 'active', consent_state: value}), false);
});

test('legacy metadata absence and explicit active facts retain their existing expiry behavior', () => {
  const app = offlineApp({root: ROOT});
  const {canUseMemoryInAI, filterUsableMemoryRows} = app.load('lib/memory/retrievalPolicy.ts');
  const good = [{id: 'legacy'}, {id: 'null', status: null}, {id: 'active', status: ' ACTIVE ', state: 'active', consent_state: null},
    {id: 'future', status: 'active', valid_until: '2099-01-01T00:00:00.000Z'}];
  for (const row of good) assert.equal(canUseMemoryInAI(row), true);
  const bad = [null, undefined, false, [], 'active',
    {status: 'active', valid_until: '2000-01-01T00:00:00.000Z'}, {valid_until: 'invalid'}, {suppressed_at: '2000-01-01'}];
  for (const row of bad) assert.equal(canUseMemoryInAI(row), false);
  assert.equal(JSON.stringify(filterUsableMemoryRows([...good, ...bad])), JSON.stringify(good));
});

test('the actual context builder excludes conflicting fact metadata before constructing the AI context', async () => {
  const app = offlineApp({root: ROOT});
  const db = app.fakes.resetDb({user_profile_summary: []});
  const calls = [];
  db.rpc = async (name, params) => {
    calls.push({name, params});
    return {data: name === 'match_facts' ? [
      {category: 'goal', key: 'current', value: 'ELIGIBLE_CURRENT_FACT', status: 'active', similarity: 0.9},
      {category: 'identity', key: 'retracted', value: 'RETRACTED_MUST_NOT_RECALL', status: 'active', consent_state: 'do_not_use', similarity: 0.9},
      {category: 'goal', key: 'pending', value: 'PENDING_MUST_NOT_RECALL', status: 'pending', similarity: 0.9},
    ] : [], error: null};
  };
  app.setMock('@/lib/supabase/admin', () => ({getSupabaseAdmin: () => db}));
  app.setMock('./embeddings', () => ({generateEmbedding: async () => [0, 1, 0]}));
  app.setMock('@/lib/ai/anthropic', () => ({createAnthropicClient: () => {throw Error('No model in recall fixture');},
    resolveClaudeModel: () => 'SYNTHETIC', logClaudeUsage: () => {}}));
  const {getThinkerContext} = app.load('lib/memory/sharedMemory.ts');
  const result = await getThinkerContext(MEMBER, 'socrates', 'Synthetic question');
  assert.match(result, /ELIGIBLE_CURRENT_FACT/);
  assert.doesNotMatch(result, /RETRACTED_MUST_NOT_RECALL|PENDING_MUST_NOT_RECALL/);
  assert.deepEqual(calls.map(call => call.name), ['match_facts', 'match_episodes']);
  assert.equal(calls.every(call => call.params.match_member_id === MEMBER), true);
  assert.equal(db.log.some(row => row.op !== 'select'), false);
});
