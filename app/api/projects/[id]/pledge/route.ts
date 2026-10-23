import Stripe from 'stripe';
import { NextRequest } from 'next/server';
import {
  CAPITAL_CAMPAIGN_SLUG,
  PLEDGE_TYPES,
  PROJECT_PLEDGE_TIERS,
  dollarsToCents,
  getTierByLabelOrAmount,
} from '@/lib/capital/campaign';
import { blockLocalLiveStripeCheckout, getCheckoutBaseUrl } from '@/lib/capital/checkoutSafety';
import { recordPendingPledge } from '@/lib/capital/pledgeLedger';
import { privateJson } from '@/lib/http/routeError';
import { PROJECT_ID_PATTERN } from '@/lib/projects/publicProject';
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

function sanitizeUtm(value: unknown) {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value)
    .filter(([key, item]) => UTM_KEYS.has(key) && typeof item === 'string' && item.trim())
    .map(([key, item]) => [key, boundedText(item, 120)]);

  return entries.length > 0 ? Object.fromEntries(entries) : null;
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  if (!PROJECT_ID_PATTERN.test(projectId)) return privateJson({ error: 'Project not found' }, { status: 404 });

  const body = await safeRequestJson(req);
  if (!isRecord(body)) return privateJson({ error: 'Invalid body' }, { status: 400 });

  const tier = boundedText(body.tier, 120);
  const email = normalizeEmail(body.email);
  const source = boundedText(body.source, 80) || 'project_page';
  const sanitizedUtm = sanitizeUtm(body.utm);
  if (!tier || !email) return privateJson({ error: 'Missing fields' }, { status: 400 });

  const amountNumber = Number(body.amount);
  if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
    return privateJson({ error: 'Invalid pledge amount' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: project } = await supabase.from('projects').select('title').eq('id', projectId).single();
  const projectTitle = project?.title || 'Society of Explorers Project';
  const tierDefinition = getTierByLabelOrAmount(PROJECT_PLEDGE_TIERS, String(tier), amountNumber);
  const tierLabel = tierDefinition?.name || String(tier);
  const tierId = tierDefinition?.id || String(tierLabel).toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const amountCents = dollarsToCents(amountNumber);
  const baseUrl = getCheckoutBaseUrl(req);
  const blocked = blockLocalLiveStripeCheckout(req, getStripeKey(), baseUrl, 'Project pledge checkout');
  if (blocked) return blocked;

  const session = await getStripe().checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    customer_email: email,
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: `${projectTitle} - ${tierLabel} Pledge`,
          description: `Patronage pledge for ${projectTitle}`,
        },
        unit_amount: amountCents,
      },
      quantity: 1,
    }],
    metadata: {
      type: 'project_pledge',
      pledge_type: PLEDGE_TYPES.PROJECT,
      campaign_slug: CAPITAL_CAMPAIGN_SLUG,
      projectId,
      project_id: projectId,
      tier_id: tierId,
      tier_label: tierLabel,
      tier: tierLabel,
      amount: String(amountNumber),
      amount_cents: String(amountCents),
      source,
      ...(sanitizedUtm ? { utm: JSON.stringify(sanitizedUtm) } : {}),
    },
    success_url: `${baseUrl}/projects/${projectId}?success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/projects/${projectId}`,
  });

  try {
    await recordPendingPledge({
      supabase,
      stripeSessionId: session.id,
      checkoutUrl: session.url,
      pledgeType: PLEDGE_TYPES.PROJECT,
      campaignSlug: CAPITAL_CAMPAIGN_SLUG,
      projectId,
      tierId,
      tierLabel,
      amountCents,
      email,
      metadata: {
        source,
        utm: sanitizedUtm,
      },
    });
  } catch {
    console.warn('[projects/pledge] pledge ledger write skipped');
  }

  return privateJson({ url: session.url });
}
