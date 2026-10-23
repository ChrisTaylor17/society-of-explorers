import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { blockLocalLiveStripeCheckout, getCheckoutBaseUrl } from '@/lib/capital/checkoutSafety';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';

export const runtime = 'nodejs';

let stripe: Stripe | null = null;
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

function getStripeKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
  return key;
}

function getStripe() {
  const key = getStripeKey();
  if (!stripe) stripe = new Stripe(key, { apiVersion: '2026-03-25.dahlia', maxNetworkRetries: 1 });
  return stripe;
}

function getPriceMap(): Record<string, string | undefined> {
  return {
    seeker: process.env.STRIPE_PRICE_SEEKER,
    scholar: process.env.STRIPE_PRICE_SCHOLAR,
    philosopher: process.env.STRIPE_PRICE_PHILOSOPHER,
    oracle: process.env.STRIPE_PRICE_ORACLE,
  };
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
    return privateJson({ error: 'Unknown membership tier' }, 400);
  }

  const authenticated = await getAuthenticatedMember(req);
  if (!authenticated) {
    return privateJson({ error: 'Sign in before choosing a paid membership' }, 401);
  }

  const email = authenticated.member.email?.trim().toLowerCase();
  if (!email || email.length > 320 || !EMAIL_PATTERN.test(email)) {
    return privateJson({ error: 'Add a valid email to your member profile before checkout' }, 409);
  }

  const priceId = getPriceMap()[tier];
  if (!priceId) {
    return privateJson({ error: 'This membership tier is not available right now' }, 503);
  }

  try {
    const baseUrl = getCheckoutBaseUrl(req);
    const blocked = blockLocalLiveStripeCheckout(req, getStripeKey(), baseUrl, 'Membership checkout');
    if (blocked) return blocked;
    const isOneTime = tier === 'oracle';
    const session = await getStripe().checkout.sessions.create({
      mode: isOneTime ? 'payment' : 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/salon?welcome=1`,
      cancel_url: `${baseUrl}/join`,
      customer_email: email,
      metadata: {
        type: 'membership',
        tier,
        tier_id: tier,
        tier_label: String(tier).toUpperCase(),
        source: 'join_page',
      },
    });

    if (!isStripeCheckoutUrl(session.url)) {
      console.warn('[membership checkout] Stripe returned an invalid checkout destination');
      return privateJson({ error: 'Checkout is unavailable right now' }, 502);
    }

    return privateJson({ url: session.url });
  } catch {
    console.warn('[membership checkout] session creation failed');
    return privateJson({ error: 'Checkout is unavailable right now' }, 502);
  }
}
