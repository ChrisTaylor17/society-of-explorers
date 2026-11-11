import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { offlineApp } from './offline-app.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const INTENT = '33333333-3333-4333-8333-333333333333';
const OTHER_INTENT = '44444444-4444-4444-8444-444444444444';
const copy = value => JSON.parse(JSON.stringify(value));
let sequence = 0;
const id = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;
const source = () => ({ id: 'synthetic-private-source', revision: 'revision-1', memberId: A, visibility: 'private', thinkerId: 'socrates',
  label: 'Synthetic planning conversation', messages: [{ id: 'synthetic-message-1', authorMemberId: A, content: 'I want to finish a small prototype this week.' }] });

export function memoryFixture() {
  const app = offlineApp({ root: ROOT });
  const mod = app.load('lib/memory/reviewedMemory.ts');
  const http = app.load('lib/memory/reviewHttp.ts');
  let now = Date.parse('2026-11-10T14:30:00Z');
  let sourceValue = source();
  const states = new Map();
  const calls = { provider: 0, commits: 0, auth: 0 };
  const controls = { failCommit: false, failReadback: false, prepare: null, onSource: null };
  const repository = {
    async load(memberId) {
      if (controls.failReadback === 'armed') { controls.failReadback = false; throw Error('SYNTHETIC_READBACK_FAILURE'); }
      return states.has(memberId) ? copy(states.get(memberId)) : null;
    },
    async commit(memberId, revision, state) {
      calls.commits++;
      if (controls.failCommit) throw Error('SYNTHETIC_WRITE_FAILURE');
      if ((states.get(memberId)?.revision ?? 0) !== revision) return false;
      states.set(memberId, copy(state));
      if (controls.failReadback === true) controls.failReadback = 'armed';
      return true;
    },
    async source(memberId, sourceId) { if (controls.onSource) await controls.onSource(); return sourceValue && sourceValue.id === sourceId ? copy(sourceValue) : null; },
    async sources() { return sourceValue ? [copy(sourceValue)] : []; },
  };
  const provider = { id: 'synthetic-local', name: 'Local demonstration', destination: 'this local test only',
    async prepare(input) {
      calls.provider++;
      if (controls.prepare) return controls.prepare(input);
      return [{ category: 'objective', text: 'Finish a small prototype this week.', sourceMessageId: input.messages[0].id },
        { category: 'constraint', text: 'Keep the first experiment small.', sourceMessageId: input.messages[0].id }];
    } };
  const service = new mod.ReviewedMemoryService(repository, provider, () => now, id);
  let actor = A, intent = INTENT;
  const authHeaders = (member = A) => ({ 'x-soe-auth-intent': intent, 'x-soe-expected-member': member });
  const handlers = http.createMemoryReviewHandlers({ service, authenticate: async req => { calls.auth++; return req.headers.get('x-soe-auth-intent') === intent && req.headers.has('x-soe-expected-member') ? actor : null; },
    originAllowed: req => !req.headers.has('x-synthetic-deny-origin') });
  const command = async (action, memberId = A) => ({ requestId: id(), expectedRevision: (await service.view(memberId)).revision, ...action });
  const prepareCommand = () => command({ action: 'prepare', sourceId: 'synthetic-private-source', sourceRevision: 'revision-1',
    consent: { version: mod.MEMORY_REVIEW_VERSION, purpose: mod.MEMORY_REVIEW_PURPOSE, providerId: provider.id,
      providerName: provider.name, destination: provider.destination, allowOneRequest: true } });
  const prepare = async () => service.execute(A, await prepareCommand());
  const post = body => handlers.POST(new Request('http://localhost/api/thinker/memory/review', { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) }));
  return { app, mod, http, repository, provider, service, states, calls, controls, handlers, command, prepareCommand, prepare, post,
    authHeaders, getActor: () => actor, getIntent: () => intent, setIntent: value => { intent = value; },
    setActor: value => { actor = value; }, setSource: value => { sourceValue = value; }, setNow: value => { now = value; } };
}

export { A, B, INTENT, OTHER_INTENT, id, source };
