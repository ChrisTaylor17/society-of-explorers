import test from 'node:test';
import assert from 'node:assert/strict';
import { offlineApp } from './support/offline-app.mjs';

function fixture() {
  const app = offlineApp(); let forbiddenImports = 0;
  for (const name of ['@/lib/supabase/admin', '@/lib/auth/getSession', '@/lib/getAuthenticatedMember']) {
    app.setMock(name, () => { forbiddenImports++; throw Error('Closed recognition must not import database or auth authority'); });
  }
  return { route: app.load('app/api/leaderboard/route.ts'), get forbiddenImports() { return forbiddenImports; } };
}
const expected = { error: 'Leaderboard unavailable.', code: 'leaderboard_unavailable' };

test('actual public GET closes recognition with exact503 and no database/auth imports or DTO', async () => {
  const f = fixture();
  const response = await f.route.GET();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), expected);
  assert.equal(f.forbiddenImports, 0);
  assert.equal(response.headers.get('set-cookie'), null);
});

test('actual closed response applies private no-store, noindex and credential-vary headers', async () => {
  const response = await fixture().route.GET();
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  assert.equal(response.headers.get('surrogate-control'), 'no-store');
  assert.match(response.headers.get('vary'), /Cookie/); assert.match(response.headers.get('vary'), /Authorization/);
  assert.match(response.headers.get('x-robots-tag'), /noindex/);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
});

test('repeated anonymous and credential-bearing requests never select members or return stale rankings', async () => {
  const f = fixture();
  for (const headers of [{}, { Cookie: 'fixture=NONISSUED', Authorization: 'Bearer NONISSUED_FIXTURE' }]) {
    const response = await f.route.GET(new Request('https://fixture.invalid/api/leaderboard', { headers }));
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), expected);
  }
  assert.equal(f.forbiddenImports, 0);
});
