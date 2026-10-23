// lib/payments/stripeMode.ts
// Chooses which Stripe secret key a checkout may use, so preview and local builds
// can only ever run Stripe in TEST mode.
//
// - Production (VERCEL_ENV=production): uses STRIPE_SECRET_KEY exactly as before.
// - Everywhere else (preview, development, local): uses STRIPE_TEST_SECRET_KEY, or
//   STRIPE_SECRET_KEY only when it is a test key (sk_test_/rk_test_). A live key
//   outside production is refused, never used.
// - Test mode may use STRIPE_TEST_PRICE_<TIER> so live price ids are never mixed
//   with a test key.

export type StripeMode = 'live' | 'test';

export type StripeKeyResolution =
  | { ok: true; key: string; mode: StripeMode; environment: string }
  | { ok: false; reason: 'unconfigured' | 'live_key_outside_production'; environment: string };

type Env = Record<string, string | undefined>;

export function deploymentEnvironment(env: Env = process.env): string {
  return (env.VERCEL_ENV || (env.NODE_ENV === 'production' ? 'production-local' : env.NODE_ENV) || 'development').trim();
}

export function isProductionDeployment(env: Env = process.env): boolean {
  return env.VERCEL_ENV === 'production';
}

export function stripeKeyMode(key: string): StripeMode | null {
  if (/^(sk|rk)_live_/.test(key)) return 'live';
  if (/^(sk|rk)_test_/.test(key)) return 'test';
  return null;
}

export function resolveStripeSecretKey(env: Env = process.env): StripeKeyResolution {
  const environment = deploymentEnvironment(env);
  const primary = (env.STRIPE_SECRET_KEY || '').trim();

  if (isProductionDeployment(env)) {
    if (!primary) return { ok: false, reason: 'unconfigured', environment };
    return { ok: true, key: primary, mode: stripeKeyMode(primary) ?? 'live', environment };
  }

  const testKey = (env.STRIPE_TEST_SECRET_KEY || '').trim();
  if (testKey) {
    if (stripeKeyMode(testKey) !== 'test') return { ok: false, reason: 'live_key_outside_production', environment };
    return { ok: true, key: testKey, mode: 'test', environment };
  }
  if (!primary) return { ok: false, reason: 'unconfigured', environment };
  if (stripeKeyMode(primary) !== 'test') return { ok: false, reason: 'live_key_outside_production', environment };
  return { ok: true, key: primary, mode: 'test', environment };
}

export const MEMBERSHIP_TIER_IDS = ['seeker', 'scholar', 'philosopher', 'oracle'] as const;
export type MembershipTierId = (typeof MEMBERSHIP_TIER_IDS)[number];

const LIVE_PRICE_ENV: Record<MembershipTierId, string> = {
  seeker: 'STRIPE_PRICE_SEEKER',
  scholar: 'STRIPE_PRICE_SCHOLAR',
  philosopher: 'STRIPE_PRICE_PHILOSOPHER',
  oracle: 'STRIPE_PRICE_ORACLE',
};

const TEST_PRICE_ENV: Record<MembershipTierId, string> = {
  seeker: 'STRIPE_TEST_PRICE_SEEKER',
  scholar: 'STRIPE_TEST_PRICE_SCHOLAR',
  philosopher: 'STRIPE_TEST_PRICE_PHILOSOPHER',
  oracle: 'STRIPE_TEST_PRICE_ORACLE',
};

export function membershipPriceId(tier: MembershipTierId, mode: StripeMode, env: Env = process.env): string | undefined {
  if (mode === 'test') {
    const testPrice = env[TEST_PRICE_ENV[tier]]?.trim();
    if (testPrice) return testPrice;
    // A test key cannot use live price ids, and the id alone does not say which mode it
    // belongs to, so outside production an explicit STRIPE_TEST_PRICE_<TIER> is required.
    if (!isProductionDeployment(env)) return undefined;
  }
  return env[LIVE_PRICE_ENV[tier]]?.trim() || undefined;
}
