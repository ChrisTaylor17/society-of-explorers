import assert from 'node:assert/strict';
import { lstat } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../../', import.meta.url);
for (const name of ['app/api/exp/award/route.ts', 'lib/http/routeError.ts', 'tests/security/fakes.ts',
  'verification/web/tests/support/offline-app.mjs']) {
  const leaf = await lstat(new URL(name, root));
  assert(leaf.isFile() && (!leaf.size || leaf.blocks), 'Refuse unavailable local source ' + name);
}
assert(process.execArgv.some(argument => argument.endsWith('/deny-build-network.cjs')));
const { offlineApp } = await import('./support/offline-app.mjs');

test('legacy award requests fail before reading client input, checking identity or accessing the database', async () => {
  const app = offlineApp();
  let accessAttempts = 0;
  const forbidden = () => {
    accessAttempts++;
    throw new Error('A retired endpoint must never ask for account or database access');
  };
  app.setMock('@/lib/getAuthenticatedMember', forbidden);
  app.setMock('@/lib/supabase/admin', forbidden);
  const route = app.load('app/api/exp/award/route.ts');
  for (const body of ['{"amount":50,"reason":"great_books_section","bookId":"unverified-book","section":"invented"}', '{']) {
    const request = new Request('https://soe.invalid/api/exp/award', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    });
    const response = await route.POST(request);
    assert.equal(response.status, 410);
    assert.deepEqual(await response.json(), { error: 'Direct reading awards are unavailable.' });
    assert.match(response.headers.get('cache-control'), /private.*no-store/);
    assert.equal(request.bodyUsed, false);
  }
  assert.equal(accessAttempts, 0);
});
