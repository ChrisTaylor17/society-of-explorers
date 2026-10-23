import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { CAPITAL_CAMPAIGN_GOAL_DOLLARS } from '@/lib/capital/campaign';
import { getNinetyTwoBProgressFromLedger } from '@/lib/capital/pledgeLedger';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

let stripe: Stripe | null = null;
const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
  'Surrogate-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};

function progressJson(body: unknown) {
  return NextResponse.json(body, { headers: NO_STORE_HEADERS });
}

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!stripe) stripe = new Stripe(key, { apiVersion: '2026-03-25.dahlia', maxNetworkRetries: 1 });
  return stripe;
}

export async function GET() {
  try {
    const ledgerProgress = await getNinetyTwoBProgressFromLedger(
      getSupabaseAdmin(),
      CAPITAL_CAMPAIGN_GOAL_DOLLARS,
    );
    if (ledgerProgress) return progressJson(ledgerProgress);

    const stripeClient = getStripe();
    if (!stripeClient) {
      return progressJson({
        totalRaised: 0,
        backerCount: 0,
        goal: CAPITAL_CAMPAIGN_GOAL_DOLLARS,
        source: 'none',
      });
    }

    const sessions = await stripeClient.checkout.sessions.list({ limit: 100 });
    const pledges = sessions.data.filter(
      s => s.metadata?.type === '92b_pledge' && s.payment_status === 'paid'
    );
    const totalRaised = pledges.reduce((sum, s) => sum + (s.amount_total || 0), 0) / 100;
    const backerCount = pledges.length;
    return progressJson({
      totalRaised,
      backerCount,
      goal: CAPITAL_CAMPAIGN_GOAL_DOLLARS,
      source: 'stripe',
    });
  } catch {
    console.warn('[92b/progress] aggregate lookup failed');
    return progressJson({
      totalRaised: 0,
      backerCount: 0,
      goal: CAPITAL_CAMPAIGN_GOAL_DOLLARS,
      source: 'none',
    });
  }
}
