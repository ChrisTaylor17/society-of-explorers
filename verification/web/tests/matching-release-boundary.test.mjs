import assert from 'node:assert/strict';
import test from 'node:test';
import { offlineApp } from './support/offline-app.mjs';

const routes = [
  ['world/match', 'GET'], ['match', 'POST'], ['match/generate', 'POST'],
  ['match/history', 'GET'], ['match/respond', 'POST'],
  ['communities/[slug]/questionnaire', 'GET'], ['communities/[slug]/questionnaire', 'POST'],
  ['communities/[slug]/matches', 'GET'], ['communities/[slug]/matches', 'POST'],
];
const expected = {
  code: 'MATCHING_NOT_AVAILABLE', error: 'Scored matching is not available in this release.',
  alternatives: { people: '/members', salons: '/book-salons' },
};
function fixture() {
  const app = offlineApp();
  const attempts = [];
  const refused = name => () => { attempts.push(name); throw new Error('Unexpected private operation: ' + name); };
  app.setMock('@/lib/getAuthenticatedMember', () => ({ getAuthenticatedMember: refused('identity'), getAuthenticatedEdgeMember: refused('edge identity') }));
  app.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: refused('database') }));
  app.setMock('@/lib/matching', () => app.load('lib/matching/index.ts'));
  app.context.fetch = refused('network');
  // Neither a request nor an environment variable can reopen unreviewed scoring.
  Object.assign(app.context.process.env, { SOE_MATCHING_ENABLED: 'true', NEXT_PUBLIC_MATCHING_ENABLED: 'true', ENABLE_LEGACY_MATCHING: '1' });
  return { app, attempts };
}
for (const [path, method] of routes) {
  test(`${method} ${path} is unavailable before private work for every caller`, async t => {
    for (const mode of ['anonymous', 'claimed-session-and-override', 'unreadable-request']) {
      await t.test(mode, async () => {
        const f = fixture();
        const headers = mode === 'claimed-session-and-override' ? {
          authorization: 'Bearer NONISSUED_TEST_TOKEN', cookie: 'soe_wallet_id=NONISSUED_TEST_COOKIE',
          origin: 'https://foreign.invalid', 'x-matching-enabled': 'true',
        } : {};
        const real = new Request('https://soe.fixture.invalid/api/' + path.replace('[slug]', 'unknown') + '?enabled=true', {
          method, headers, ...(method === 'POST' ? { body: '{malformed-sensitive-input', } : {}),
        });
        const unreadable = new Proxy({}, { get() { throw new Error('The request must not be read'); } });
        const params = { then() { throw new Error('Community existence must not be resolved'); } };
        const response = await f.app.load('app/api/' + path + '/route.ts')[method](mode === 'unreadable-request' ? unreadable : real, { params });
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), expected);
        assert.equal(real.bodyUsed, false);
        assert.match(response.headers.get('cache-control'), /private.*no-store/);
        assert.equal(response.headers.get('surrogate-control'), 'no-store');
        assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
        assert.equal(response.headers.get('retry-after'), null, 'No promised reopening time');
        assert.equal(response.headers.get('set-cookie'), null, 'No identity mutation');
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.deepEqual(f.attempts, [], 'No synchronous or deferred identity, private data or network operation');
      });
    }
  });
}
test('direct internal generation is refused before data access; pure historical calculations remain preserved', async () => {
  const f = fixture();
  const matching = f.app.load('lib/matching/index.ts');
  await assert.rejects(matching.runMatching('fictional-community', 'fictional-member'), /not available in this release/);
  assert.deepEqual(f.attempts, []);
  // Preservation check only, not evidence that this heuristic measures ideology.
  assert.equal(matching.computePhilosophicalVector({ q: 'abcdefgh' }, [{ id: 'q', philosophical_axis: 'politics' }]).politics, 2);
});
