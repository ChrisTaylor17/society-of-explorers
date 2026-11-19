import test from 'node:test';
import assert from 'node:assert/strict';
import { providerFixture } from './thinker-provider-retries.test.mjs';
import { memoryFixture, A } from './support/guide-memory-fixture.mjs';

test('actual thinker handler rechecks reviewed recall before retry and excludes notes revoked after the first attempt', async () => {
  const memory = memoryFixture(); const prepared = await memory.prepare();
  await memory.service.execute(A, await memory.command({ action: 'accept', candidateId: prepared.view.candidates[0].id, text: 'SYNTHETIC_REVIEWED_NOTE' }));
  await memory.service.execute(A, await memory.command({ action: 'set-enabled', enabled: true }));
  let reads = 0;
  const app = providerFixture({ realSalonAccess: true,
    reviewedContext: async (member, thinker) => { reads++; return memory.service.context(member, thinker); },
    transport: async attempt => {
      if (attempt === 1) await memory.service.execute(A, await memory.command({ action: 'set-enabled', enabled: false }));
      return new Response(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Synthetic failure' } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    } });
  const response = await app.post({ isCouncilMode: false, salonId: `private-${A}` }); await response.text();
  assert.equal(app.calls.http.length, 2); assert.equal(reads, 2);
  assert.match(app.calls.http[0].body.system, /SYNTHETIC_REVIEWED_NOTE/);
  assert.doesNotMatch(app.calls.http[1].body.system, /SYNTHETIC_REVIEWED_NOTE/);
  assert.equal(app.calls.legacyReads.length, 0); assert.equal(app.calls.embeddings.length, 0);
});

test('reviewed private recall never enters shared salons or Council even when an adapter supplies it', async () => {
  for (const values of [{ isCouncilMode: true }, { isCouncilMode: false, salonId: 'general' }, { isCouncilMode: false, salonId: 'general', isReaction: true }]) {
    let reads = 0;
    const app = providerFixture({ reviewedContext: async () => { reads++; return 'SYNTHETIC_PRIVATE_NOTE'; } });
    const response = await app.post(values); await response.text();
    assert.equal(reads, 0); assert.doesNotMatch(app.calls.http[0].body.system, /SYNTHETIC_PRIVATE_NOTE/);
    assert.equal(app.calls.embeddings.length, 0); assert.equal(app.calls.episodes.length, 0); assert.equal(app.calls.extraction.length, 0);
  }
});
