import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { blockLocalLiveStripeCheckout, getCheckoutBaseUrl } from '@/lib/capital/checkoutSafety';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { membershipPriceId, resolveStripeSecretKey, type MembershipTierId } from '@/lib/payments/stripeMode';

export const runtime = 'nodejs';

let stripe: Stripe | null = null;
let stripeKeyInUse: string | null = null;
const MEMBERSHIP_TIERS = new Set(['seeker', 'scholar', 'philosopher', 'oracle']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Surrogate-Control': 'no-store',
};

function privateJson(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: PRIVATE_HEADERS });
}

function isStripeCheckoutUrl(value: string | null): value is string {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'checkout.stripe.com';
  } catch {
    return false;
  }
}

function getStripe(key: string) {
  if (!stripe || stripeKeyInUse !== key) {
    stripe = new Stripe(key, { apiVersion: '2026-03-25.dahlia', maxNetworkRetries: 1 });
    stripeKeyInUse = key;
  }
  return stripe;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return privateJson({ error: 'Invalid request body' }, 400);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return privateJson({ error: 'Invalid request body' }, 400);
  }

  const input = body as Record<string, unknown>;
  const tier = typeof input.tier === 'string' ? input.tier.trim().toLowerCase() : '';

  if (!MEMBERSHIP_TIERS.has(tier)) {
    return privateJson({ error: 'Unknown membership tier', code: 'unknown_tier' }, 400);
  }

  const authenticated = await getAuthenticatedMember(req);
  if (!authenticated) {
    return privateJson({ error: 'Sign in before choosing a paid membership', code: 'sign_in_required' }, 401);
  }

  const email = authenticated.member.email?.trim().toLowerCase();
  if (!email || email.length > 320 || !EMAIL_PATTERN.test(email)) {
    return privateJson({ error: 'Add a valid email to your member profile before checkout', code: 'email_required' }, 409);
  }

  const stripeKey = resolveStripeSecretKey();
  if (!stripeKey.ok) {
    if (stripeKey.reason === 'live_key_outside_production') {
      console.warn(`[membership checkout] refused a live Stripe key outside production (${stripeKey.environment})`);
    }
    return privateJson({ error: 'Paid checkout is not switched on for this site yet', code: 'checkout_unconfigured' }, 503);
  }

  const priceId = membershipPriceId(tier as MembershipTierId, stripeKey.mode);
  if (!priceId) {
    return privateJson({ error: 'This membership tier is not available right now', code: 'tier_unavailable' }, 503);
  }

  try {
    const baseUrl = getCheckoutBaseUrl(req);
    const blocked = blockLocalLiveStripeCheckout(req, stripeKey.key, baseUrl, 'Membership checkout');
    if (blocked) return blocked;
    const isOneTime = tier === 'oracle';
    const memberId = authenticated.memberId || authenticated.member.id;
    const session = await getStripe(stripeKey.key).checkout.sessions.create({
      mode: isOneTime ? 'payment' : 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/salon?welcome=1`,
      cancel_url: `${baseUrl}/join`,
      customer_email: email,
      // Lets the webhook find the member directly instead of searching auth users by email.
      client_reference_id: memberId,
      metadata: {
        type: 'membership',
        tier,
        tier_id: tier,
        tier_label: String(tier).toUpperCase(),
        source: 'join_page',
        member_id: memberId,
      },
      ...(isOneTime ? {} : { subscription_data: { metadata: { type: 'membership', tier, member_id: memberId } } }),
    });

    if (!isStripeCheckoutUrl(session.url)) {
      console.warn('[membership checkout] Stripe returned an invalid checkout destination');
      return privateJson({ error: 'Checkout is unavailable right now', code: 'checkout_failed' }, 502);
    }

    return privateJson(stripeKey.mode === 'test' ? { url: session.url, mode: 'test' } : { url: session.url });
  } catch {
    console.warn('[membership checkout] session creation failed');
    return privateJson({ error: 'Checkout is unavailable right now', code: 'checkout_failed' }, 502);
  }
}
