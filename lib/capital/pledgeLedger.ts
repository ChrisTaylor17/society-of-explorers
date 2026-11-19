import { createHash } from 'crypto';
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CAPITAL_CAMPAIGN_SLUG, PLEDGE_TYPES, type PledgeType } from '@/lib/capital/campaign';

export interface PendingPledgeInput {
  supabase: SupabaseClient;
  stripeSessionId: string;
  checkoutUrl: string | null;
  pledgeType: PledgeType;
  campaignSlug?: string;
  projectId?: string | null;
  tierId?: string | null;
  tierLabel: string;
  amountCents: number;
  currency?: string;
  email?: string | null;
  metadata?: Record<string, unknown>;
}

export interface PaidPledgeInput {
  supabase: SupabaseClient;
  session: Stripe.Checkout.Session;
  pledgeType: PledgeType;
  projectId?: string | null;
}

export interface LedgerWriteResult {
  ledgerAvailable: boolean;
  isNew: boolean;
  id?: string;
}

export interface CampaignProgress {
  totalRaised: number;
  backerCount: number;
  goal: number;
  source: 'pledge_events' | 'stripe' | 'none';
}

type PledgeProgressRow = {
  amount_cents?: number | string | null;
  stripe_session_id?: string | null;
};

function isMissingLedgerError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42P01' || /pledge_events/i.test(error.message || '');
}

function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed || null;
}

function hashEmail(email: string | null | undefined): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return createHash('sha256').update(normalized).digest('hex');
}

export async function recordPendingPledge(input: PendingPledgeInput): Promise<LedgerWriteResult> {
  const email = normalizeEmail(input.email);
  const payload = {
    stripe_session_id: input.stripeSessionId,
    pledge_type: input.pledgeType,
    campaign_slug: input.campaignSlug || CAPITAL_CAMPAIGN_SLUG,
    project_id: input.projectId || null,
    tier_id: input.tierId || null,
    tier_label: input.tierLabel,
    amount_cents: input.amountCents,
    currency: input.currency || 'usd',
    patron_email: email,
    patron_email_hash: hashEmail(email),
    payment_status: 'checkout_created',
    checkout_url: input.checkoutUrl,
    metadata: input.metadata || {},
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await input.supabase
    .from('pledge_events')
    .upsert(payload, { onConflict: 'stripe_session_id' })
    .select('id')
    .single();

  if (error) {
    if (isMissingLedgerError(error)) return { ledgerAvailable: false, isNew: true };
    throw error;
  }

  return { ledgerAvailable: true, isNew: true, id: data?.id };
}

export async function recordPaidPledge(input: PaidPledgeInput): Promise<LedgerWriteResult> {
  const session = input.session;
  const metadata = session.metadata || {};
  const email = normalizeEmail(session.customer_details?.email || session.customer_email);
  const amountCents =
    session.amount_total ||
    Number(metadata.amount_cents || 0) ||
    Math.round(Number(metadata.amount || 0) * 100);
  const projectId = input.projectId || metadata.projectId || metadata.project_id || null;

  const { data: existing, error: existingError } = await input.supabase
    .from('pledge_events')
    .select('id, payment_status')
    .eq('stripe_session_id', session.id)
    .maybeSingle();

  if (existingError) {
    if (isMissingLedgerError(existingError)) return { ledgerAvailable: false, isNew: true };
    throw existingError;
  }

  const wasAlreadyPaid = ['paid', 'complete'].includes(String(existing?.payment_status || '').toLowerCase());
  const payload = {
    stripe_session_id: session.id,
    stripe_payment_intent_id:
      typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null,
    stripe_customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id || null,
    pledge_type: input.pledgeType,
    campaign_slug: metadata.campaign_slug || CAPITAL_CAMPAIGN_SLUG,
    project_id: projectId || null,
    tier_id: metadata.tier_id || null,
    tier_label: metadata.tier_label || metadata.tier || 'Pledge',
    amount_cents: amountCents,
    currency: session.currency || 'usd',
    patron_email: email,
    patron_email_hash: hashEmail(email),
    payment_status: session.payment_status || 'paid',
    metadata,
    paid_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await input.supabase
    .from('pledge_events')
    .upsert(payload, { onConflict: 'stripe_session_id' })
    .select('id')
    .single();

  if (error) {
    if (isMissingLedgerError(error)) return { ledgerAvailable: false, isNew: true };
    throw error;
  }

  return { ledgerAvailable: true, isNew: !wasAlreadyPaid, id: data?.id };
}

export async function getNinetyTwoBProgressFromLedger(
  supabase: SupabaseClient,
  goalDollars: number,
): Promise<CampaignProgress | null> {
  const { data, error } = await supabase
    .from('pledge_events')
    .select('amount_cents, stripe_session_id')
    .eq('pledge_type', PLEDGE_TYPES.NINETY_TWO_B)
    .eq('campaign_slug', CAPITAL_CAMPAIGN_SLUG)
    .in('payment_status', ['paid', 'complete']);

  if (error) {
    if (isMissingLedgerError(error)) return null;
    throw error;
  }

  const rows = (data || []) as PledgeProgressRow[];
  const totalCents = rows.reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);
  return {
    totalRaised: totalCents / 100,
    backerCount: rows.length,
    goal: goalDollars,
    source: 'pledge_events',
  };
}
