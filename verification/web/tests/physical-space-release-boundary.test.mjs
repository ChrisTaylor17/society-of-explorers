import assert from 'node:assert/strict';
import test from 'node:test';
import { offlineApp } from './support/offline-app.mjs';

const routes = [
  ['92b/checkout', 'POST'], ['92b/pledge', 'POST'], ['92b/propose', 'POST'],
  ['92b/progress', 'GET'], ['salons/cities', 'GET'], ['salons/propose', 'POST'], ['salons/support', 'POST'],
];
const expected = {
  code: 'PHYSICAL_SPACE_ON_HOLD',
  error: 'Physical-space fundraising and city-interest submissions are not open in this pilot.',
  alternatives: { pilot: '/salons/pilot', onlineCircles: '/circles?format=online' },
};
function fixture() {
  const app = offlineApp(), attempts = [];
  const refused = name => () => { attempts.push(name); throw new Error('Unexpected operation: ' + name); };
  app.setMock('stripe', () => class Stripe { constructor() { refused('Stripe client')(); } });
  app.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: refused('database') }));
  app.setMock('@/lib/email/resend', () => ({ getResend: refused('email') }));
  app.setMock('@/lib/capital/pledgeLedger', () => ({ recordPendingPledge: refused('ledger write'), getNinetyTwoBProgressFromLedger: refused('ledger read') }));
  app.setMock('@/lib/leads/publicLeadCapture', () => ({
    boundedLeadText: refused('lead parsing'), normalizeLeadEmail: refused('lead email'),
    safePublicLeadRequestJson: refused('lead body'), sendPublicLeadNotification: refused('notification'),
  }));
  app.context.fetch = refused('network');
  app.context.process.env = new Proxy({ CAPITAL_CAMPAIGN_ENABLED: 'true', CAPITAL_LEAD_EMAIL_NOTIFICATIONS_ENABLED: 'true', SOE_PHYSICAL_SPACES_ENABLED: 'true' }, {
    get(_target, key) { return refused('environment ' + String(key))(); },
  });
  return { app, attempts };
}
for (const [path, method] of routes) {
  test(`${method} ${path} stays on hold before body, credentials or external effects`, async t => {
    for (const mode of ['anonymous', 'claimed-approval-and-identity', 'unreadable-request']) {
      await t.test(mode, async () => {
        const f = fixture();
        const headers = mode === 'claimed-approval-and-identity' ? {
          authorization: 'Bearer NONISSUED_FIXTURE', cookie: 'soe_wallet_id=NONISSUED_FIXTURE',
          origin: 'https://foreign.invalid', 'x-campaign-approved': 'true',
        } : {};
        const real = new Request('https://soe.fixture.invalid/api/' + path + '?approved=true&enabled=true', {
          method, headers, ...(method === 'POST' ? { body: '{private-invalid-body', } : {}),
        });
        const unreadable = new Proxy({}, { get() { throw new Error('Request must not be read'); } });
        const response = await f.app.load('app/api/' + path + '/route.ts')[method](mode === 'unreadable-request' ? unreadable : real);
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), expected, 'No false receipt, checkout URL, zero total or empty-city success');
        assert.equal(real.bodyUsed, false);
        assert.match(response.headers.get('cache-control'), /private.*no-store/);
        assert.equal(response.headers.get('surrogate-control'), 'no-store');
        assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
        assert.equal(response.headers.get('retry-after'), null);
        assert.equal(response.headers.get('set-cookie'), null);
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.deepEqual(f.attempts, [], 'No synchronous or deferred data, credential, provider or notification work');
      });
    }
  });
}
