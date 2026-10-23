// G2: /api/checkout returns stable error codes, refuses live keys outside production,
// and creates the same Checkout Session as before in production.
import { test, expect, beforeEach } from 'bun:test';
import { installMocks, makeReq } from '../security/fakes';

const created: any[] = [];
let member: any = null;
let nextUrl = 'https://checkout.stripe.com/c/pay/cs_test_fake';
const stripeKeysUsed: string[] = [];

class FakeStripe {
  checkout = { sessions: { create: async (args: any) => { created.push(args); return { url: nextUrl }; } } };
  constructor(key: string) { stripeKeysUsed.push(key); }
}

installMocks({
  stripe: () => ({ default: FakeStripe }),
  '@/lib/getAuthenticatedMember': () => ({ getAuthenticatedMember: async () => member }),
});

const route = await import('../../app/api/checkout/route.ts');
const ENV_KEYS = ['VERCEL_ENV', 'STRIPE_SECRET_KEY', 'STRIPE_TEST_SECRET_KEY', 'STRIPE_PRICE_SEEKER', 'STRIPE_PRICE_ORACLE', 'STRIPE_TEST_PRICE_SEEKER', 'NEXT_PUBLIC_SITE_URL', 'SITE_URL'];

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  created.length = 0;
  stripeKeysUsed.length = 0;
  member = { member: { id: 'm1', email: 'Ada@Example.test' } };
  nextUrl = 'https://checkout.stripe.com/c/pay/cs_test_fake';
});

const post = (body: any, url = 'https://preview.example.test/api/checkout') => route.POST(makeReq(body, { url, headers: { origin: new URL(url).origin } }));

test('G2a unknown tier is rejected with a code', async () => {
  const r = await post({ tier: 'emperor' });
  expect(r.status).toBe(400);
  expect((await r.json()).code).toBe('unknown_tier');
});

test('G2b signed-out request gets 401 sign_in_required before any Stripe work', async () => {
  member = null;
  process.env.STRIPE_TEST_SECRET_KEY = 'sk_test_FAKE';
  const r = await post({ tier: 'seeker' });
  expect(r.status).toBe(401);
  expect((await r.json()).code).toBe('sign_in_required');
  expect(created.length).toBe(0);
});

test('G2c member without email gets 409 email_required', async () => {
  member = { member: { id: 'm1', email: null } };
  const r = await post({ tier: 'seeker' });
  expect(r.status).toBe(409);
  expect((await r.json()).code).toBe('email_required');
});

test('G2d preview with no key returns 503 checkout_unconfigured (was an opaque 502)', async () => {
  process.env.VERCEL_ENV = 'preview';
  process.env.STRIPE_PRICE_SEEKER = 'price_live_seeker';
  const r = await post({ tier: 'seeker' });
  expect(r.status).toBe(503);
  expect((await r.json()).code).toBe('checkout_unconfigured');
  expect(r.headers.get('cache-control')).toContain('no-store');
});

test('G2e preview refuses a live key and never constructs Stripe with it', async () => {
  process.env.VERCEL_ENV = 'preview';
  process.env.STRIPE_SECRET_KEY = 'sk_live_FAKE';
  process.env.STRIPE_PRICE_SEEKER = 'price_live_seeker';
  const r = await post({ tier: 'seeker' });
  expect(r.status).toBe(503);
  expect((await r.json()).code).toBe('checkout_unconfigured');
  expect(stripeKeysUsed).not.toContain('sk_live_FAKE');
  expect(created.length).toBe(0);
});

test('G2f preview test key without a test price returns tier_unavailable', async () => {
  process.env.VERCEL_ENV = 'preview';
  process.env.STRIPE_TEST_SECRET_KEY = 'sk_test_FAKE';
  process.env.STRIPE_PRICE_SEEKER = 'price_live_seeker';
  const r = await post({ tier: 'seeker' });
  expect(r.status).toBe(503);
  expect((await r.json()).code).toBe('tier_unavailable');
});

test('G2g preview test checkout uses the test key and test price', async () => {
  process.env.VERCEL_ENV = 'preview';
  process.env.STRIPE_TEST_SECRET_KEY = 'sk_test_FAKE';
  process.env.STRIPE_TEST_PRICE_SEEKER = 'price_test_seeker';
  const r = await post({ tier: 'seeker' });
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ url: nextUrl, mode: 'test' });
  expect(stripeKeysUsed.at(-1)).toBe('sk_test_FAKE');
  expect(created[0].line_items).toEqual([{ price: 'price_test_seeker', quantity: 1 }]);
  expect(created[0].mode).toBe('subscription');
  expect(created[0].customer_email).toBe('ada@example.test');
});

test('G2h production session shape: unchanged apart from the added member reference (oracle is one-time)', async () => {
  process.env.VERCEL_ENV = 'production';
  process.env.STRIPE_SECRET_KEY = 'sk_live_FAKE';
  process.env.STRIPE_PRICE_ORACLE = 'price_live_oracle';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://app.example.test';
  nextUrl = 'https://checkout.stripe.com/c/pay/cs_live_fake';
  const r = await post({ tier: 'oracle' }, 'https://app.example.test/api/checkout');
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ url: nextUrl });
  expect(created[0]).toEqual({
    mode: 'payment',
    line_items: [{ price: 'price_live_oracle', quantity: 1 }],
    success_url: 'https://app.example.test/salon?welcome=1',
    cancel_url: 'https://app.example.test/join',
    customer_email: 'ada@example.test',
    client_reference_id: 'm1',
    metadata: { type: 'membership', tier: 'oracle', tier_id: 'oracle', tier_label: 'ORACLE', source: 'join_page', member_id: 'm1' },
  });
});

test('G2j subscriptions carry the member reference on the subscription too', async () => {
  process.env.VERCEL_ENV = 'production';
  process.env.STRIPE_SECRET_KEY = 'sk_live_FAKE';
  process.env.STRIPE_PRICE_SEEKER = 'price_live_seeker';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://app.example.test';
  nextUrl = 'https://checkout.stripe.com/c/pay/cs_live_fake2';
  member = { memberId: '33333333-3333-4333-8333-333333333333', member: { id: '33333333-3333-4333-8333-333333333333', email: 'ada@example.test' } };
  const r = await post({ tier: 'seeker' }, 'https://app.example.test/api/checkout');
  expect(r.status).toBe(200);
  expect(created[0].mode).toBe('subscription');
  expect(created[0].client_reference_id).toBe('33333333-3333-4333-8333-333333333333');
  expect(created[0].subscription_data).toEqual({ metadata: { type: 'membership', tier: 'seeker', member_id: '33333333-3333-4333-8333-333333333333' } });
});

test('G2i a non-Stripe redirect from Stripe is refused', async () => {
  process.env.VERCEL_ENV = 'preview';
  process.env.STRIPE_TEST_SECRET_KEY = 'sk_test_FAKE';
  process.env.STRIPE_TEST_PRICE_SEEKER = 'price_test_seeker';
  nextUrl = 'https://evil.example.test/pay';
  const r = await post({ tier: 'seeker' });
  expect(r.status).toBe(502);
  expect((await r.json()).code).toBe('checkout_failed');
});
