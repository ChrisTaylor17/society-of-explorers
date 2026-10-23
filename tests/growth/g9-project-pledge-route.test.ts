// G9: the project pledge route accepts real project ids again, but in production it stays
// closed (503 pledges_not_live) until PROJECT_PLEDGES_LIVE_ENABLED=true. Preview with a
// test key creates a test Checkout Session. Stripe is faked; no network, no live keys.
import { test, expect, beforeEach } from 'bun:test';
import { installMocks, makeReq } from '../security/fakes';

const created: any[] = [];
const ledger: any[] = [];
class FakeStripe {
  key: string;
  constructor(key: string) { this.key = key; }
  checkout = { sessions: { create: async (args: any) => { created.push({ key: this.key, args }); return { id: 'cs_test_fixture_pledge', url: 'https://checkout.stripe.test/cs_test_fixture_pledge' }; } } };
}
const projectQuery = { select: () => projectQuery, eq: () => projectQuery, single: async () => ({ data: { title: 'Fixture Project' }, error: null }) };
installMocks({
  stripe: () => ({ default: FakeStripe }),
  '@/lib/supabase/admin': () => ({ getSupabaseAdmin: () => ({ from: () => projectQuery }) }),
  '@/lib/capital/pledgeLedger': () => ({ recordPendingPledge: async (row: any) => { ledger.push(row); } }),
});
const route = await import('../../app/api/projects/[id]/pledge/route.ts');

const PROJECT = '3f2b8c1e-9d4a-4f6b-a2c7-1e5d9b0f4a73';
const LIVE = ['sk', 'live', 'FAKE'].join('_');
const TEST = ['sk', 'test', 'FAKE'].join('_');
const KEYS = ['VERCEL_ENV', 'STRIPE_SECRET_KEY', 'STRIPE_TEST_SECRET_KEY', 'STRIPE_LIVE_SECRET_KEY', 'PROJECT_PLEDGES_LIVE_ENABLED', 'STRIPE_MODE', 'NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_APP_URL'];
function setEnv(env: Record<string, string>) { for (const k of KEYS) delete process.env[k]; Object.assign(process.env, env); }
const body = { tier: 'Supporter', amount: 50, email: 'patron@example.test' };
const call = (id: string, b: any = body) =>
  route.POST(makeReq(b, { url: `https://preview.example.test/api/projects/${id}/pledge`, headers: { host: 'preview.example.test' } }), { params: Promise.resolve({ id }) });

beforeEach(() => { created.length = 0; ledger.length = 0; });

test('G9a malformed project id is still a 404', async () => {
  setEnv({ VERCEL_ENV: 'preview', STRIPE_TEST_SECRET_KEY: TEST });
  expect((await call('not-a-uuid')).status).toBe(404);
  expect(created.length).toBe(0);
});

test('G9b production with a live key: valid id reaches the gate and returns 503 pledges_not_live, no session', async () => {
  setEnv({ VERCEL_ENV: 'production', STRIPE_SECRET_KEY: LIVE });
  const res = await call(PROJECT);
  expect(res.status).toBe(503);
  expect((await res.json()).code).toBe('pledges_not_live');
  expect(created.length).toBe(0);
});

test('G9c preview with no test key: 503 pledges_unconfigured, never falls back to a live key', async () => {
  setEnv({ VERCEL_ENV: 'preview', STRIPE_SECRET_KEY: LIVE });
  const res = await call(PROJECT);
  expect(res.status).toBe(503);
  expect((await res.json()).code).toBe('pledges_unconfigured');
  expect(created.length).toBe(0);
});

test('G9d preview with a test key: creates a test Checkout Session with project metadata and records it pending', async () => {
  setEnv({ VERCEL_ENV: 'preview', STRIPE_TEST_SECRET_KEY: TEST });
  const res = await call(PROJECT);
  expect(res.status).toBe(200);
  expect((await res.json()).url).toContain('cs_test_fixture_pledge');
  expect(created[0].key).toBe(TEST);
  expect(created[0].args.metadata).toEqual(expect.objectContaining({ type: 'project_pledge', project_id: PROJECT, amount_cents: '5000' }));
  expect(ledger[0]).toEqual(expect.objectContaining({ stripeSessionId: 'cs_test_fixture_pledge', projectId: PROJECT, amountCents: 5000 }));
});

test('G9e bad bodies are rejected before any Stripe call', async () => {
  setEnv({ VERCEL_ENV: 'preview', STRIPE_TEST_SECRET_KEY: TEST });
  expect((await call(PROJECT, { tier: 'x', amount: 0, email: 'a@example.test' })).status).toBe(400);
  expect((await call(PROJECT, { tier: 'x', amount: 10, email: 'nope' })).status).toBe(400);
  expect(created.length).toBe(0);
});
