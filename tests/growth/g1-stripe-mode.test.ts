// G1: preview/local builds can only run Stripe in TEST mode; production is unchanged.
// Every key below is a fake placeholder, not a real Stripe key.
import { test, expect } from 'bun:test';
import { membershipPriceId, resolveStripeSecretKey, stripeKeyMode } from '../../lib/payments/stripeMode';

const LIVE = 'sk_live_FAKEPLACEHOLDER';
const TEST = 'sk_test_FAKEPLACEHOLDER';

test('G1a production uses STRIPE_SECRET_KEY exactly as before', () => {
  const r = resolveStripeSecretKey({ VERCEL_ENV: 'production', STRIPE_SECRET_KEY: LIVE, STRIPE_TEST_SECRET_KEY: TEST });
  expect(r).toEqual({ ok: true, key: LIVE, mode: 'live', environment: 'production' });
});

test('G1b production with no key reports unconfigured', () => {
  expect(resolveStripeSecretKey({ VERCEL_ENV: 'production' })).toMatchObject({ ok: false, reason: 'unconfigured' });
});

test('G1c preview never uses a live key', () => {
  const r = resolveStripeSecretKey({ VERCEL_ENV: 'preview', STRIPE_SECRET_KEY: LIVE });
  expect(r).toMatchObject({ ok: false, reason: 'live_key_outside_production' });
  expect(JSON.stringify(r)).not.toContain(LIVE);
  expect(resolveStripeSecretKey({ VERCEL_ENV: 'preview', STRIPE_SECRET_KEY: 'rk_live_FAKE' })).toMatchObject({ ok: false });
});

test('G1d preview prefers STRIPE_TEST_SECRET_KEY, else a test STRIPE_SECRET_KEY', () => {
  expect(resolveStripeSecretKey({ VERCEL_ENV: 'preview', STRIPE_SECRET_KEY: LIVE, STRIPE_TEST_SECRET_KEY: TEST })).toMatchObject({ ok: true, key: TEST, mode: 'test' });
  expect(resolveStripeSecretKey({ VERCEL_ENV: 'preview', STRIPE_SECRET_KEY: TEST })).toMatchObject({ ok: true, key: TEST, mode: 'test' });
  expect(resolveStripeSecretKey({ VERCEL_ENV: 'preview', STRIPE_TEST_SECRET_KEY: LIVE })).toMatchObject({ ok: false, reason: 'live_key_outside_production' });
});

test('G1e local builds (no VERCEL_ENV) are treated as non-production', () => {
  expect(resolveStripeSecretKey({ NODE_ENV: 'production', STRIPE_SECRET_KEY: LIVE })).toMatchObject({ ok: false, reason: 'live_key_outside_production' });
  expect(resolveStripeSecretKey({})).toMatchObject({ ok: false, reason: 'unconfigured' });
});

test('G1f key mode detection', () => {
  expect(stripeKeyMode(LIVE)).toBe('live');
  expect(stripeKeyMode('rk_test_x')).toBe('test');
  expect(stripeKeyMode('pk_test_x')).toBeNull();
});

test('G1g test mode needs explicit test prices outside production; production keeps live prices', () => {
  const env = { VERCEL_ENV: 'preview', STRIPE_PRICE_SEEKER: 'price_live_seeker', STRIPE_TEST_PRICE_SCHOLAR: 'price_test_scholar' };
  expect(membershipPriceId('seeker', 'test', env)).toBeUndefined();
  expect(membershipPriceId('scholar', 'test', env)).toBe('price_test_scholar');
  const prod = { VERCEL_ENV: 'production', STRIPE_PRICE_SEEKER: 'price_live_seeker', STRIPE_PRICE_ORACLE: 'price_live_oracle' };
  expect(membershipPriceId('seeker', 'live', prod)).toBe('price_live_seeker');
  expect(membershipPriceId('oracle', 'live', prod)).toBe('price_live_oracle');
  expect(membershipPriceId('scholar', 'live', prod)).toBeUndefined();
});
