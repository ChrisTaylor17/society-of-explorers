import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryFixture, A, B, id, source } from './support/guide-memory-fixture.mjs';

test('review defaults off and preparation never enrolls pending candidates in recall', async () => {
  const f = memoryFixture();
  assert.equal((await f.service.view(A)).enabled, false);
  assert.equal(await f.service.context(A, 'socrates'), null);
  assert.equal(f.calls.provider, 0); assert.equal(f.calls.commits, 0);
  const result = await f.prepare();
  assert.equal(result.outcome, 'prepared'); assert.equal(result.view.candidates.length, 2);
  assert.equal(result.view.memories.length, 0); assert.equal(result.view.enabled, false);
  await f.service.execute(A, await f.command({ action: 'set-enabled', enabled: true }));
  assert.equal(await f.service.context(A, 'socrates'), null);
  assert.equal(f.calls.provider, 1);
});

test('accept persists exactly the reviewed edit with provenance; replay does not duplicate it', async () => {
  const f = memoryFixture(); const { view } = await f.prepare();
  const command = await f.command({ action: 'accept', candidateId: view.candidates[0].id, text: 'Finish the synthetic prototype by Friday.' });
  const saved = await f.service.execute(A, command);
  assert.equal(saved.view.memories.length, 1); assert.equal(saved.view.memories[0].text, command.text);
  assert.equal(saved.view.memories[0].memberId, A); assert.equal(saved.view.memories[0].scope, 'private-guide');
  assert.equal(saved.view.memories[0].sourceRevision, 'revision-1'); assert.equal(saved.view.memories[0].edited, true);
  const permission = saved.view.memories[0].preparationConsent;
  assert.equal(permission.memberId, A); assert.equal(permission.sourceId, saved.view.memories[0].sourceId);
  assert.equal(permission.providerName, f.provider.name); assert.equal(permission.destination, f.provider.destination);
  assert.equal(permission.purpose, f.mod.MEMORY_REVIEW_PURPOSE); assert.equal(permission.allowOneRequest, true);
  assert.deepEqual(Array.from(permission.allowedCategories), ['objective', 'constraint', 'decision', 'commitment']);
  assert.equal(saved.view.enabled, false); assert.equal(await f.service.context(A, 'socrates'), null);
  const replay = await f.service.execute(A, command);
  assert.equal(replay.replayed, true); assert.equal(replay.view.memories.length, 1);
  await assert.rejects(f.service.execute(A, { ...command, text: 'A different request' }), error => error.code === 'conflict');
  const reopened = new f.mod.ReviewedMemoryService(f.repository, f.provider);
  assert.equal((await reopened.view(A)).memories[0].text, command.text);
  await f.service.execute(A, await f.command({ action: 'set-enabled', enabled: true }));
  assert.match(await f.service.context(A, 'socrates'), /synthetic prototype by Friday/);
  assert.equal(await f.service.context(A, 'plato'), null); assert.equal(await f.service.context(B, 'socrates'), null);
});

test('reject, cancel and forget remove eligible notes without silently enabling memory', async () => {
  const f = memoryFixture(); let { view } = await f.prepare();
  await f.service.execute(A, await f.command({ action: 'reject', candidateId: view.candidates[0].id }));
  assert.equal((await f.service.view(A)).candidates.length, 1); assert.equal((await f.service.view(A)).memories.length, 0);
  await f.service.execute(A, await f.command({ action: 'cancel' }));
  assert.equal((await f.service.view(A)).candidates.length, 0);
  ({ view } = await f.prepare());
  const result = await f.service.execute(A, await f.command({ action: 'accept', candidateId: view.candidates[0].id, text: view.candidates[0].text }));
  await f.service.execute(A, await f.command({ action: 'set-enabled', enabled: true }));
  const forgotten = await f.command({ action: 'forget', memoryId: result.view.memories[0].id });
  await f.service.execute(A, forgotten); assert.equal(await f.service.context(A, 'socrates'), null);
  assert.equal((await f.service.execute(A, forgotten)).replayed, true);
});

test('cancelled in-flight preparation discards late output and cannot be replayed into saved memory', async () => {
  const f = memoryFixture(); let release;
  f.controls.prepare = input => new Promise(resolve => { release = () => resolve([{ category: 'decision', text: 'Late output', sourceMessageId: input.messages[0].id }]); });
  const command = await f.prepareCommand();
  const pending = f.service.execute(A, command);
  while (!release) await new Promise(resolve => setTimeout(resolve, 1));
  await f.service.execute(A, await f.command({ action: 'cancel' }));
  release(); await assert.rejects(pending, error => error.code === 'expired');
  assert.equal((await f.service.view(A)).memories.length, 0); assert.equal((await f.service.view(A)).candidates.length, 0);
  assert.equal((await f.service.execute(A, command)).outcome, 'cancelled'); assert.equal(f.calls.provider, 1);
});

test('member, source, purpose, provider and explicit one-call permission bind preparation', async () => {
  for (const change of [s => ({ ...s, memberId: B }), s => ({ ...s, visibility: 'shared' }),
    s => ({ ...s, messages: [{ ...s.messages[0], authorMemberId: B }] }), s => ({ ...s, revision: 'revision-2' })]) {
    const f = memoryFixture(); f.setSource(change(source()));
    await assert.rejects(f.prepare(), error => error.code === 'conflict'); assert.equal(f.calls.provider, 0);
  }
  for (const bad of [{ purpose: 'other' }, { providerId: 'unapproved' }, { providerName: 'Unapproved provider name' },
    { destination: 'an undisclosed destination' }, { allowOneRequest: false }, { version: 'old' }]) {
    const f = memoryFixture(), command = await f.prepareCommand(); command.consent = { ...command.consent, ...bad };
    await assert.rejects(f.service.execute(A, command), error => error.code === 'invalid'); assert.equal(f.calls.provider, 0);
  }
});

test('a destination change with the same provider ID requires fresh permission before transmission', async () => {
  const f = memoryFixture(), command = await f.prepareCommand();
  f.provider.destination = 'a changed synthetic destination';
  await assert.rejects(f.service.execute(A, command), error => error.code === 'invalid');
  assert.equal(f.calls.provider, 0); assert.equal(f.calls.commits, 0);
  const accepted = await f.prepare();
  assert.equal(accepted.view.candidates[0].preparationConsent.destination, f.provider.destination);
  assert.equal(f.calls.provider, 1);
});

test('stale source, expired candidate and stale revision cannot be accepted', async () => {
  for (const condition of ['source', 'expiry', 'version']) {
    const f = memoryFixture(); const { view } = await f.prepare();
    const command = await f.command({ action: 'accept', candidateId: view.candidates[0].id, text: view.candidates[0].text });
    if (condition === 'source') f.setSource({ ...source(), revision: 'revision-2' });
    if (condition === 'expiry') f.setNow(Date.parse('2026-11-10T15:01:00Z'));
    if (condition === 'version') await f.service.execute(A, await f.command({ action: 'set-enabled', enabled: false }));
    await assert.rejects(f.service.execute(A, command), error => ['conflict', 'expired'].includes(error.code));
    assert.equal((await f.service.view(A)).memories.length, 0);
  }
});

test('failed or malformed suggestions never save memory and never retry automatically', async () => {
  for (const result of ['failure', [{ category: 'emotion', text: 'Unreviewable profiling', sourceMessageId: 'synthetic-message-1' }],
    [{ category: 'objective', text: 'Forged source', sourceMessageId: 'another-member-message' }]]) {
    const f = memoryFixture(); f.controls.prepare = async () => { if (result === 'failure') throw Error('synthetic provider failure'); return result; };
    await assert.rejects(f.prepare());
    const view = await f.service.view(A); assert.equal(view.memories.length, 0); assert.equal(view.candidates.length, 0);
    assert.equal(view.preparing, false); assert.equal(f.calls.provider, 1);
  }
});

test('suggestion allowance is reserved before calls and cannot be reset by unrelated actions', async () => {
  const f = memoryFixture();
  for (let i = 0; i < 5; i++) await f.prepare();
  for (let i = 0; i < 70; i++) await f.service.execute(A, await f.command({ action: 'cancel' }));
  await assert.rejects(f.prepare(), error => error.code === 'unavailable');
  assert.equal(f.calls.provider, 5);
  f.setNow(Date.parse('2026-11-10T15:31:00Z'));
  await f.prepare(); assert.equal(f.calls.provider, 6);
});

test('persistence failure stays unconfirmed; lost readback can be recovered with exact replay', async () => {
  const f = memoryFixture(); const { view } = await f.prepare();
  const command = await f.command({ action: 'accept', candidateId: view.candidates[0].id, text: view.candidates[0].text });
  f.controls.failCommit = true;
  await assert.rejects(f.service.execute(A, command), error => error.code === 'unconfirmed');
  assert.equal((await f.service.view(A)).memories.length, 0);
  f.controls.failCommit = false; f.controls.failReadback = true;
  await assert.rejects(f.service.execute(A, command), error => error.code === 'unconfirmed');
  const replay = await f.service.execute(A, command);
  assert.equal(replay.replayed, true); assert.equal(replay.view.memories.length, 1);
  assert.equal(f.calls.provider, 1);
});

test('concurrent accepts use atomic revisions and cannot duplicate the same candidate', async () => {
  const f = memoryFixture(); const { view } = await f.prepare();
  const first = await f.command({ action: 'accept', candidateId: view.candidates[0].id, text: 'First reviewed text' });
  const second = { ...first, requestId: id(), text: 'Competing text' };
  const results = await Promise.allSettled([f.service.execute(A, first), f.service.execute(A, second)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await f.service.view(A)).memories.length, 1);
});

test('source removal and revocation exclude recall, including revocation during source checks', async () => {
  const f = memoryFixture(); const { view } = await f.prepare();
  await f.service.execute(A, await f.command({ action: 'accept', candidateId: view.candidates[0].id, text: view.candidates[0].text }));
  await f.service.execute(A, await f.command({ action: 'set-enabled', enabled: true }));
  f.setSource(null); assert.equal(await f.service.context(A, 'socrates'), null); f.setSource(source());
  let release;
  f.controls.onSource = () => new Promise(resolve => { release = resolve; });
  const reading = f.service.context(A, 'socrates');
  while (!release) await new Promise(resolve => setTimeout(resolve, 1));
  await f.service.execute(A, await f.command({ action: 'set-enabled', enabled: false }));
  release(); assert.equal(await reading, null);
});

test('actual HTTP handlers enforce origin, authentication, strict body and private receipts', async () => {
  const f = memoryFixture();
  const initial = await f.handlers.GET(new Request('http://localhost/api/thinker/memory/review', { headers: f.authHeaders() }));
  assert.equal(initial.status, 200); assert.equal((await initial.json()).enabled, false);
  assert.match(initial.headers.get('cache-control'), /private.*no-store/);
  f.setActor(null); assert.equal((await f.post(await f.prepareCommand())).status, 401); f.setActor(A);
  assert.equal((await f.handlers.GET(new Request('http://localhost/api/thinker/memory/review', { headers: { 'x-synthetic-deny-origin': '1' } }))).status, 403);
  const forged = { ...await f.prepareCommand(), memberId: B };
  assert.equal((await f.post(forged)).status, 400); assert.equal(f.calls.provider, 0);
  assert.equal((await f.post({ ...await f.prepareCommand(), padding: 'x'.repeat(17_000) })).status, 400);
  const prepared = await f.post(await f.prepareCommand()); assert.equal(prepared.status, 200);
  const candidate = (await prepared.json()).view.candidates[0];
  const saved = await f.post(await f.command({ action: 'accept', candidateId: candidate.id, text: 'Reviewed by authenticated actor.' }));
  assert.equal(saved.status, 200); assert.equal((await saved.json()).view.memories[0].memberId, A);
});

test('a stale viewed member cannot enable, cancel or change another authenticated member workspace', async () => {
  const f = memoryFixture(); const command = await f.command({ action: 'set-enabled', enabled: true });
  f.setActor(B);
  for (const action of [command, { ...command, action: 'cancel', requestId: id() }]) {
    const response = await f.post(action); assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'identity_changed');
  }
  assert.equal((await f.service.view(B)).enabled, false); assert.equal(f.calls.commits, 0);
  const withoutIntent = await f.handlers.GET(new Request('http://localhost/api/thinker/memory/review'));
  assert.equal(withoutIntent.status, 401);
});

test('runtime is unavailable without an adapter and old shortcuts cannot call any provider or database', async () => {
  const f = memoryFixture();
  assert.equal(f.app.load('lib/memory/reviewRuntime.ts').getReviewedMemoryService(), null);
  const handlers = f.http.createMemoryReviewHandlers({ service: null, authenticate: async () => { throw Error('Unexpected identity read'); }, originAllowed: () => true });
  assert.equal((await handlers.GET(new Request('http://localhost/api/thinker/memory/review'))).status, 503);
  for (const route of ['app/api/thinker/memory/route.ts', 'app/api/thinker/extract-facts/route.ts']) {
    const response = await f.app.load(route).POST(); assert.equal(response.status, 410);
    assert.equal((await response.json()).memoryReviewRequired, true);
  }
  f.app.context.process.env.CRON_SECRET = 'synthetic-cron';
  const proactive = f.app.load('app/api/cron/proactive/route.ts');
  assert.equal((await proactive.GET(new Request('http://localhost/api/cron/proactive'))).status, 401);
  const stopped = await proactive.GET(new Request('http://localhost/api/cron/proactive', { headers: { authorization: 'Bearer synthetic-cron' } }));
  assert.equal(stopped.status, 503); assert.equal((await stopped.json()).processed, 0);
  assert.equal(f.calls.provider, 0); assert.equal(f.calls.commits, 0);
});
