import Stripe from 'stripe';
import { NextRequest } from 'next/server';
import {
  CAPITAL_CAMPAIGN_SLUG,
  NINETY_TWO_B_TIERS,
  PLEDGE_TYPES,
  dollarsToCents,
  getTierById,
} from '@/lib/capital/campaign';
import { blockLocalLiveStripeCheckout, getCheckoutBaseUrl } from '@/lib/capital/checkoutSafety';
import { recordPendingPledge } from '@/lib/capital/pledgeLedger';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

let stripe: Stripe | null = null;
const UTM_KEYS = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function safeRequestJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function boundedText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function normalizeEmail(value: unknown) {
  const email = boundedText(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function normalizeAttributionToken(value: unknown) {
  const token = boundedText(value, 64).toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,63}$/.test(token) ? token : '';
}

function sanitizeUtm(value: unknown) {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value)
    .filter(([key]) => UTM_KEYS.has(key))
    .map(([key, item]) => [key, normalizeAttributionToken(item)])
    .filter(([, item]) => item);

  return entries.length > 0 ? Object.fromEntries(entries) : null;
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

export async function POST(req: NextRequest) {
  const body = await safeRequestJson(req);
  if (!isRecord(body)) return privateJson({ error: 'Invalid body' }, { status: 400 });

  const tierId = boundedText(body.tierId, 80).toLowerCase();
  const tierDefinition = getTierById(NINETY_TWO_B_TIERS, tierId);
  if (!tierDefinition) return privateJson({ error: 'Unknown pledge tier' }, { status: 400 });

  const email = normalizeEmail(body.email);
  if (!email) return privateJson({ error: 'Enter a valid email address' }, { status: 400 });

  const source = '92b_fund_page';
  const sanitizedUtm = sanitizeUtm(body.utm);
  const tierLabel = tierDefinition.name;
  const amountCents = dollarsToCents(tierDefinition.amount);

  try {
    const baseUrl = getCheckoutBaseUrl(req);
    const blocked = blockLocalLiveStripeCheckout(req, getStripeKey(), baseUrl, '92B patronage checkout');
    if (blocked) return blocked;

    const session = await getStripe().checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `92B Founding Node - ${tierLabel} Pledge`,
            description: 'Patronage pledge for the Society of Explorers first physical node if site terms and buildout are viable.',
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      }],
      metadata: {
        type: '92b_pledge',
        pledge_type: PLEDGE_TYPES.NINETY_TWO_B,
        campaign_slug: CAPITAL_CAMPAIGN_SLUG,
        tier_id: tierDefinition.id,
        tier_label: tierLabel,
        tier: tierLabel,
        amount: String(tierDefinition.amount),
        amount_cents: String(amountCents),
        source,
        ...(sanitizedUtm || {}),
      },
      success_url: `${baseUrl}/92b/fund?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/92b/fund`,
    });

    if (!isStripeCheckoutUrl(session.url)) {
      console.warn('[92b/checkout] Stripe returned an invalid checkout destination');
      return privateJson({ error: 'Checkout is unavailable right now' }, { status: 502 });
    }

    try {
      await recordPendingPledge({
        supabase: getSupabaseAdmin(),
        stripeSessionId: session.id,
        checkoutUrl: session.url,
        pledgeType: PLEDGE_TYPES.NINETY_TWO_B,
        campaignSlug: CAPITAL_CAMPAIGN_SLUG,
        tierId: tierDefinition.id,
        tierLabel,
        amountCents,
        email,
        metadata: {
          source,
          utm: sanitizedUtm,
        },
      });
    } catch {
      console.warn('[92b/checkout] pledge ledger write skipped');
    }

    return privateJson({ url: session.url });
  } catch {
    console.warn('[92b/checkout] session creation failed');
    return privateJson({ error: 'Checkout is unavailable right now' }, { status: 502 });
  }
}
