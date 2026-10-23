import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import {
  NINETY_TWO_B_TIERS,
  PLEDGE_TYPES,
  PROJECT_PLEDGE_TIERS,
  getTierByLabelOrAmount,
} from '@/lib/capital/campaign';
import { recordPaidPledge } from '@/lib/capital/pledgeLedger';
import { capitalWebhookEmailSkipReason } from '@/lib/capital/webhookSafety';
import { getResend } from '@/lib/email/resend';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { findAuthUserIdByEmail, findMembersForPayment, type MemberTarget } from '@/lib/payments/memberLookup';
import { resolveMembershipTier, shouldPreserveExistingTier, type PriceFacts } from '@/lib/payments/membershipTier';
import { markEventProcessed, wasEventProcessed } from '@/lib/payments/webhookIdempotency';

export const runtime = 'nodejs';

let stripe: Stripe | null = null;

function getStripe(stripeKey: string): Stripe {
  if (!stripe) stripe = new Stripe(stripeKey, { apiVersion: '2026-03-25.dahlia', maxNetworkRetries: 1 });
  return stripe;
}

type MembershipOutcome = 'updated' | 'preserved_lifetime' | 'no_member';

// Membership entitlements are keyed by price id (see lib/payments/membershipTier.ts).
// Unknown, missing or $0 prices never grant a paid tier: they are logged and skipped.
function membershipTierOrNull(facts: PriceFacts, context: string): string | null {
  const resolved = resolveMembershipTier(facts);
  if (resolved.ok) {
    if (resolved.via === 'exact_amount') console.warn(`[webhook] ${context}: price id not configured, matched published price for ${resolved.tier}`);
    return resolved.tier;
  }
  console.warn(`[webhook] ${context}: skipped, ${resolved.reason} does not map to a membership tier`);
  return null;
}

async function updateMemberTier(target: MemberTarget, tier: string): Promise<MembershipOutcome> {
  const supabaseAdmin = getSupabaseAdmin();
  const match = await findMembersForPayment(supabaseAdmin, target);
  if (!match) return 'no_member';

  const writable = match.rows.filter((row) => !shouldPreserveExistingTier(row.tier, tier));
  if (!writable.length) {
    console.log(`[webhook] Lifetime membership kept; ${tier} not applied (matched by ${match.via})`);
    return 'preserved_lifetime';
  }

  const updateData: Record<string, string> = { tier };
  if (target.customerId) updateData.stripe_customer_id = target.customerId;
  const { data: updatedMembers, error } = await supabaseAdmin
    .from('members')
    .update(updateData)
    .in('id', writable.map((row) => row.id))
    .select('id');
  if (error) throw new Error('Membership entitlement write failed');
  if (!updatedMembers?.length) return 'no_member';
  console.log(`[webhook] Membership entitlement updated: ${tier} (matched by ${match.via})`);
  return 'updated';
}

function customerIdOf(value: string | { id: string } | null | undefined): string | undefined {
  if (!value) return undefined;
  return typeof value === 'string' ? value : value.id;
}

async function customerEmail(stripe: Stripe, customerId: string): Promise<string | null> {
  const customer = await stripe.customers.retrieve(customerId);
  if ((customer as Stripe.DeletedCustomer).deleted) return null;
  return (customer as Stripe.Customer).email ?? null;
}

// Subscription states that still entitle the member to the paid tier.
const ENTITLED_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due']);
// States after which the paid tier ends.
const ENDED_SUBSCRIPTION_STATUSES = new Set(['canceled', 'incomplete_expired']);

function subscriptionPriceFacts(subscription: Stripe.Subscription): PriceFacts {
  const price = subscription.items?.data?.[0]?.price;
  return {
    priceId: price?.id ?? null,
    amountCents: price?.unit_amount ?? null,
    interval: price?.recurring?.interval ?? null,
  };
}

async function activeMembershipTierForCustomer(stripe: Stripe, customerId: string, excludeSubscriptionId: string): Promise<string | null> {
  const list = await stripe.subscriptions.list({ customer: customerId, status: 'active', limit: 10 });
  for (const other of list.data) {
    if (other.id === excludeSubscriptionId) continue;
    const resolved = resolveMembershipTier(subscriptionPriceFacts(other));
    if (resolved.ok) return resolved.tier;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!stripeKey || !webhookSecret) {
    console.error('Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET');
    return NextResponse.json({ error: 'Misconfigured' }, { status: 500 });
  }

  const sig = req.headers.get('stripe-signature') ?? '';
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe(stripeKey).webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Webhook verification failed';
    console.error('Stripe webhook sig error:', msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  console.log('Stripe webhook event:', event.type);

  let outcome = 'processed';
  let idempotencyAvailable = false;
  try {
    // Idempotency on Stripe event id: a redelivered, already-processed event is acknowledged without side effects.
    const seen = await wasEventProcessed(getSupabaseAdmin(), event.id);
    idempotencyAvailable = seen.available;
    if (seen.processed) {
      console.log(`[webhook] Duplicate Stripe event ignored: ${event.type}`);
      return NextResponse.json({ received: true, duplicate: true });
    }

    switch (event.type) {
      case 'checkout.session.async_payment_succeeded':
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const email = session.customer_details?.email || session.customer_email;
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;

        // --- 92B PLEDGE HANDLING ---
        if (session.metadata?.type === '92b_pledge') {
          const supabaseAdmin = getSupabaseAdmin();
          const pledgeTier = session.metadata.tier_label || session.metadata.tier || 'Pledge';
          const pledgeAmount = Number(session.metadata.amount || (session.amount_total || 0) / 100);
          console.log(`[webhook] 92B pledge: ${pledgeTier} $${pledgeAmount} from ${email}`);

          const ledger = await recordPaidPledge({
            supabase: supabaseAdmin,
            session,
            pledgeType: PLEDGE_TYPES.NINETY_TWO_B,
          });

          if (!ledger.isNew) {
            console.log(`[webhook] Duplicate 92B pledge ignored: ${session.id}`);
            break;
          }

          await supabaseAdmin.from('founding_interest').insert({
            name: email || 'Unknown',
            email: email?.toLowerCase() || '',
            why: `[92B Pledge PAID] ${pledgeTier} - $${pledgeAmount}`,
            created_at: new Date().toISOString(),
          });

          // Award bonus EXP if member exists
          if (email) {
            let authUserId: string | null = null;
            try {
              authUserId = await findAuthUserIdByEmail(supabaseAdmin, email);
            } catch {
              console.warn('[webhook] Pledge EXP skipped: member lookup failed');
            }
            if (authUserId) {
              const { data: member } = await supabaseAdmin.from('members').select('id, exp_tokens').eq('supabase_auth_id', authUserId).single();
              if (member) {
                const tierDefinition = getTierByLabelOrAmount(NINETY_TWO_B_TIERS, pledgeTier, pledgeAmount);
                const expBonus = tierDefinition?.exp || (pledgeAmount >= 500 ? 1000 : pledgeAmount >= 100 ? 200 : 50);
                await supabaseAdmin.from('members').update({ exp_tokens: (member.exp_tokens || 0) + expBonus }).eq('id', member.id);
                await supabaseAdmin.from('exp_events').insert({ member_id: member.id, amount: expBonus, reason: `92B pledge: ${pledgeTier}` });
              }
            }
          }

          // Notify Chris only for approved live-mode capital webhook notifications.
          const notificationSkipReason = capitalWebhookEmailSkipReason(event);
          if (notificationSkipReason) {
            console.log(`[webhook] 92B pledge notification email skipped: ${notificationSkipReason}`);
          } else if (process.env.RESEND_API_KEY) {
            try {
              const resend = getResend();
              await resend.emails.send({
                from: 'Society of Explorers <notifications@societyofexplorers.com>',
                to: 'chris@societyofexplorers.com',
                subject: `92B PLEDGE RECEIVED: ${pledgeTier} - $${pledgeAmount}`,
                html: `<div style="background:#000;color:#f5f0e8;padding:40px;font-family:Georgia,serif;"><h2 style="color:#c9a84c;">New 92B Pledge!</h2><p>Tier: ${pledgeTier}</p><p>Amount: $${pledgeAmount}</p><p>Email: ${email}</p></div>`,
              });
            } catch {}
          } else {
            console.warn('[webhook] 92B pledge notification email allowed but RESEND_API_KEY is missing.');
          }
          break;
        }

        // --- PROJECT PLEDGE HANDLING ---
        if (session.metadata?.type === 'project_pledge') {
          const supabaseAdmin = getSupabaseAdmin();
          const projectId = session.metadata.projectId || session.metadata.project_id;
          const pledgeAmount = Number(session.metadata.amount || (session.amount_total || 0) / 100);
          const pledgeTier = session.metadata.tier_label || session.metadata.tier || 'Pledge';
          console.log(`[webhook] Project pledge: ${pledgeTier} $${pledgeAmount} for ${projectId} from ${email}`);
          if (!projectId) {
            console.warn(`[webhook] Project pledge missing project id: ${session.id}`);
            break;
          }

          const ledger = await recordPaidPledge({
            supabase: supabaseAdmin,
            session,
            pledgeType: PLEDGE_TYPES.PROJECT,
            projectId,
          });

          if (!ledger.isNew) {
            console.log(`[webhook] Duplicate project pledge ignored: ${session.id}`);
            break;
          }

          // Increment project funding
          const { data: project } = await supabaseAdmin.from('projects').select('amount_raised, backer_count').eq('id', projectId).single();
          if (project) {
            await supabaseAdmin.from('projects').update({
              amount_raised: (project.amount_raised || 0) + pledgeAmount,
              backer_count: (project.backer_count || 0) + 1,
              updated_at: new Date().toISOString(),
            }).eq('id', projectId);
          }

          // Record in founding_interest
          await supabaseAdmin.from('founding_interest').insert({
            name: email || 'Unknown',
            email: email?.toLowerCase() || '',
            why: `[Project Pledge PAID] ${pledgeTier} - $${pledgeAmount} for project ${projectId}`,
            created_at: new Date().toISOString(),
          });

          // Award EXP
          if (email) {
            let authUserId: string | null = null;
            try {
              authUserId = await findAuthUserIdByEmail(supabaseAdmin, email);
            } catch {
              console.warn('[webhook] Pledge EXP skipped: member lookup failed');
            }
            if (authUserId) {
              const { data: member } = await supabaseAdmin.from('members').select('id, exp_tokens').eq('supabase_auth_id', authUserId).single();
              if (member) {
                const tierDefinition = getTierByLabelOrAmount(PROJECT_PLEDGE_TIERS, pledgeTier, pledgeAmount);
                const expBonus = tierDefinition?.exp || (pledgeAmount >= 500 ? 1000 : pledgeAmount >= 100 ? 200 : 50);
                await supabaseAdmin.from('members').update({ exp_tokens: (member.exp_tokens || 0) + expBonus }).eq('id', member.id);
                await supabaseAdmin.from('exp_events').insert({ member_id: member.id, amount: expBonus, reason: `Project pledge: ${pledgeTier} for ${projectId}` });
              }
            }
          }

          // Notify Chris only for approved live-mode capital webhook notifications.
          const notificationSkipReason = capitalWebhookEmailSkipReason(event);
          if (notificationSkipReason) {
            console.log(`[webhook] Project pledge notification email skipped: ${notificationSkipReason}`);
          } else if (process.env.RESEND_API_KEY) {
            try {
              const resend = getResend();
              await resend.emails.send({
                from: 'Society of Explorers <notifications@societyofexplorers.com>',
                to: 'chris@societyofexplorers.com',
                subject: `Project Pledge: ${pledgeTier} $${pledgeAmount}`,
                html: `<div style="background:#000;color:#f5f0e8;padding:40px;font-family:Georgia,serif;"><h2 style="color:#c9a84c;">New Project Pledge!</h2><p>Project: ${projectId}</p><p>Tier: ${pledgeTier}</p><p>Amount: $${pledgeAmount}</p><p>Email: ${email}</p></div>`,
              });
            } catch {}
          } else {
            console.warn('[webhook] Project pledge notification email allowed but RESEND_API_KEY is missing.');
          }
          break;
        }

        // --- MEMBERSHIP SUBSCRIPTION HANDLING ---
        if (session.metadata?.type !== 'membership') {
          console.log(`[webhook] Ignored non-membership checkout session type: ${session.metadata?.type || 'unclassified'}`);
          break;
        }

        if (session.payment_status === 'unpaid') {
          console.log('[webhook] Membership checkout not paid yet; waiting for async_payment_succeeded');
          outcome = 'awaiting_payment';
          break;
        }

        const memberId = session.metadata?.member_id || session.client_reference_id || null;
        if (!email && !memberId && !customerId) {
          throw new Error('Paid membership checkout is missing an email');
        }

        // Determine tier from the purchased price. A Stripe API failure is retried
        // (500), never guessed from the amount.
        const stripe = getStripe(stripeKey);
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
        const item = lineItems.data[0];
        const tier = membershipTierOrNull(
          {
            priceId: item?.price?.id ?? null,
            amountCents: item?.price?.unit_amount ?? item?.amount_total ?? null,
            interval: item?.price?.recurring?.interval ?? null,
          },
          'Membership checkout',
        );
        if (!tier) {
          outcome = 'skipped_unknown_price';
          break;
        }

        console.log(`[webhook] Membership checkout completed: ${tier}`);
        const result = await updateMemberTier({ memberId, customerId, email }, tier);
        if (result === 'no_member') throw new Error('Paid membership has no matching member');
        outcome = result;
        break;
      }

      case 'customer.subscription.updated': {
        const stripe = getStripe(stripeKey);
        const eventSubscription = event.data.object as Stripe.Subscription;
        // Events can arrive out of order; act on the subscription as it is now.
        const subscription = await stripe.subscriptions.retrieve(eventSubscription.id);
        const customerId = customerIdOf(subscription.customer);
        if (!customerId) {
          console.warn('[webhook] Subscription update without a customer skipped');
          outcome = 'skipped_no_customer';
          break;
        }

        if (ENDED_SUBSCRIPTION_STATUSES.has(subscription.status)) {
          console.log(`[webhook] Subscription update reports ${subscription.status}; handled as cancellation`);
          const replacement = await activeMembershipTierForCustomer(stripe, customerId, subscription.id);
          const email = await customerEmail(stripe, customerId);
          const result = await updateMemberTier(
            { memberId: subscription.metadata?.member_id, customerId, email },
            replacement || 'free',
          );
          if (result === 'no_member') throw new Error('Cancelled membership has no matching member');
          outcome = result;
          break;
        }

        if (!ENTITLED_SUBSCRIPTION_STATUSES.has(subscription.status)) {
          console.log(`[webhook] Subscription status ${subscription.status} leaves membership unchanged`);
          outcome = 'skipped_status';
          break;
        }

        const tier = membershipTierOrNull(subscriptionPriceFacts(subscription), 'Subscription update');
        if (!tier) {
          outcome = 'skipped_unknown_price';
          break;
        }

        const email = await customerEmail(stripe, customerId);
        const result = await updateMemberTier({ memberId: subscription.metadata?.member_id, customerId, email }, tier);
        if (result === 'no_member') throw new Error('Paid membership has no matching member');
        outcome = result;
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = customerIdOf(subscription.customer);
        if (!customerId) {
          outcome = 'skipped_no_customer';
          break;
        }

        // Another active membership subscription on the same customer keeps its tier.
        const stripe = getStripe(stripeKey);
        const replacement = await activeMembershipTierForCustomer(stripe, customerId, subscription.id);
        const nextTier = replacement || 'free';

        let result = await updateMemberTier({ memberId: subscription.metadata?.member_id, customerId }, nextTier);
        if (result === 'no_member') {
          // Fallback: look up email when the customer id was not attached locally.
          const email = await customerEmail(stripe, customerId);
          if (email) result = await updateMemberTier({ customerId, email }, nextTier);
        }
        if (result === 'no_member') {
          throw new Error('Cancelled membership has no matching member');
        }
        console.log(`[webhook] Membership subscription ended; tier now ${nextTier === 'free' ? 'free' : nextTier}`);
        outcome = result;
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
        outcome = 'ignored';
    }

    if (idempotencyAvailable) await markEventProcessed(getSupabaseAdmin(), event, outcome);
  } catch {
    console.error('[webhook] Stripe event processing failed');
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
