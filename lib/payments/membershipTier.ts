// Decide which membership tier a Stripe price grants.
//
// Rules (replacing the old amount-threshold guess that turned any missing or $0
// amount into a paid "seeker" tier):
//   1. A price id configured in STRIPE_PRICE_<TIER> or STRIPE_TEST_PRICE_<TIER> wins.
//   2. Otherwise only an exact match on a published price is accepted
//      ($19/$49/$99 per month, $499 one-time), so members on an older price id
//      for the same published price keep working.
//   3. Anything else (missing, $0, unknown price, other interval) grants nothing;
//      the caller logs it and skips.
import { LIVE_PRICE_ENV, MEMBERSHIP_TIER_IDS, TEST_PRICE_ENV, type MembershipTierId } from '@/lib/payments/stripeMode';

type Env = Record<string, string | undefined>;

export const PAID_TIERS: readonly MembershipTierId[] = MEMBERSHIP_TIER_IDS;
export const LIFETIME_TIER: MembershipTierId = 'oracle';

// Published prices, in cents. Keep in step with lib/join/content.ts.
const EXACT_PRICES: { tier: MembershipTierId; amountCents: number; interval: 'month' | null }[] = [
  { tier: 'seeker', amountCents: 1900, interval: 'month' },
  { tier: 'scholar', amountCents: 4900, interval: 'month' },
  { tier: 'philosopher', amountCents: 9900, interval: 'month' },
  { tier: 'oracle', amountCents: 49900, interval: null },
];

export interface PriceFacts {
  priceId?: string | null;
  amountCents?: number | null;
  interval?: string | null;
}

export type TierResolution =
  | { ok: true; tier: MembershipTierId; via: 'price_id' | 'exact_amount' }
  | { ok: false; reason: 'missing_price' | 'zero_amount' | 'unknown_price' };

export function tierForPriceId(priceId: string | null | undefined, env: Env = process.env): MembershipTierId | null {
  const id = priceId?.trim();
  if (!id) return null;
  for (const tier of MEMBERSHIP_TIER_IDS) {
    const live = env[LIVE_PRICE_ENV[tier]]?.trim();
    const test = env[TEST_PRICE_ENV[tier]]?.trim();
    if ((live && live === id) || (test && test === id)) return tier;
  }
  return null;
}

export function tierForExactAmount(amountCents: number | null | undefined, interval: string | null | undefined): MembershipTierId | null {
  if (typeof amountCents !== 'number' || !Number.isFinite(amountCents) || amountCents <= 0) return null;
  const normalizedInterval = interval || null;
  const match = EXACT_PRICES.find((p) => p.amountCents === amountCents && p.interval === normalizedInterval);
  return match ? match.tier : null;
}

export function resolveMembershipTier(facts: PriceFacts, env: Env = process.env): TierResolution {
  const byPrice = tierForPriceId(facts.priceId, env);
  if (byPrice) return { ok: true, tier: byPrice, via: 'price_id' };
  const byAmount = tierForExactAmount(facts.amountCents, facts.interval);
  if (byAmount) return { ok: true, tier: byAmount, via: 'exact_amount' };
  if (facts.priceId || (typeof facts.amountCents === 'number' && facts.amountCents > 0)) return { ok: false, reason: 'unknown_price' };
  if (facts.amountCents === 0) return { ok: false, reason: 'zero_amount' };
  return { ok: false, reason: 'missing_price' };
}

// A lifetime (one-time) membership is never replaced by a subscription tier or
// removed by a subscription cancellation.
export function shouldPreserveExistingTier(currentTier: string | null | undefined, nextTier: string): boolean {
  return currentTier === LIFETIME_TIER && nextTier !== LIFETIME_TIER;
}
