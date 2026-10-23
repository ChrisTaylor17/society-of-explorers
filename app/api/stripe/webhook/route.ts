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

export const runtime = 'nodejs';

let stripe: Stripe | null = null;

function getStripe(stripeKey: string): Stripe {
  if (!stripe) stripe = new Stripe(stripeKey, { apiVersion: '2026-03-25.dahlia', maxNetworkRetries: 1 });
  return stripe;
}

// Map Stripe price IDs to membership tiers.
function getTierMap(): Record<string, string> {
  return Object.fromEntries(
    [
      [process.env.STRIPE_PRICE_SEEKER, 'seeker'],
      [process.env.STRIPE_PRICE_SCHOLAR, 'scholar'],
      [process.env.STRIPE_PRICE_PHILOSOPHER, 'philosopher'],
      [process.env.STRIPE_PRICE_ORACLE, 'oracle'],
    ].filter((entry): entry is [string, string] => Boolean(entry[0])),
  );
}

// Fallback: map amount to tier if price ID not in TIER_MAP
function tierFromAmount(amountCents: number | null, interval: string | null): string {
  if (!amountCents) return 'seeker';
  const dollars = amountCents / 100;
  if (!interval) return dollars >= 499 ? 'oracle' : 'seeker';
  if (dollars >= 99) return 'philosopher';
  if (dollars >= 49) return 'scholar';
  return 'seeker';
}

async function updateMemberTier(email: string, tier: string, stripeCustomerId?: string) {
  const supabaseAdmin = getSupabaseAdmin();
  // Try by email first (matches Supabase auth email)
  const updateData: Record<string, string> = { tier };
  if (stripeCustomerId) updateData.stripe_customer_id = stripeCustomerId;

  // Find member by Supabase auth email
  const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();
  if (authError) throw new Error('Membership auth lookup failed');
  const authUser = authUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

  if (authUser) {
    const { data: updatedMembers, error } = await supabaseAdmin
      .from('members')
      .update(updateData)
      .eq('supabase_auth_id', authUser.id)
      .select('id');
    if (error) throw new Error('Membership entitlement write failed');
    if (updatedMembers?.length) {
      console.log(`[webhook] Membership entitlement updated: ${tier}`);
      return;
    }
  }

  // Fallback: try by stripe_customer_id if we have it
  if (stripeCustomerId) {
    const { data: updatedMembers, error } = await supabaseAdmin
      .from('members')
      .update(updateData)
      .eq('stripe_customer_id', stripeCustomerId)
      .select('id');
    if (error) throw new Error('Membership entitlement write failed');
    if (updatedMembers?.length) {
      console.log(`[webhook] Membership entitlement updated by customer: ${tier}`);
      return;
    }
  }

  throw new Error('Paid membership has no matching member');
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

  try {
    switch (event.type) {
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
            const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
            const authUser = authUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
            if (authUser) {
              const { data: member } = await supabaseAdmin.from('members').select('id, exp_tokens').eq('supabase_auth_id', authUser.id).single();
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
            const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
            const authUser = authUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
            if (authUser) {
              const { data: member } = await supabaseAdmin.from('members').select('id, exp_tokens').eq('supabase_auth_id', authUser.id).single();
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

        if (!email) {
          throw new Error('Paid membership checkout is missing an email');
        }

        // Determine tier from line items
        let tier = 'seeker';
        const stripe = getStripe(stripeKey);
        const tierMap = getTierMap();

        try {
          const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
          const item = lineItems.data[0];
          const priceId = item?.price?.id;

          if (priceId && tierMap[priceId]) {
            tier = tierMap[priceId];
          } else {
            // Fallback: use amount
            const amount = item?.amount_total || session.amount_total;
            const interval = item?.price?.recurring?.interval || null;
            tier = tierFromAmount(amount, interval);
          }
        } catch {
          console.warn('Could not fetch line items, using amount fallback');
          tier = tierFromAmount(session.amount_total, null);
        }

        console.log(`[webhook] Membership checkout completed: ${tier}`);
        await updateMemberTier(email, tier, customerId || undefined);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
        const priceId = subscription.items.data[0]?.price?.id;
        const amount = subscription.items.data[0]?.price?.unit_amount;
        const interval = subscription.items.data[0]?.price?.recurring?.interval || null;

        let tier = 'seeker';
        const tierMap = getTierMap();
        if (priceId && tierMap[priceId]) {
          tier = tierMap[priceId];
        } else {
          tier = tierFromAmount(amount || null, interval);
        }

        // Look up email from Stripe customer
        if (customerId) {
          const stripe = getStripe(stripeKey);
          const customer = await stripe.customers.retrieve(customerId);
          const email = (customer as Stripe.Customer).email;
          if (email) {
            console.log(`Subscription updated: ${email} → tier: ${tier}`);
            await updateMemberTier(email, tier, customerId);
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
        const supabaseAdmin = getSupabaseAdmin();

        if (customerId) {
          // Set tier back to free
          const { data: updatedMembers, error } = await supabaseAdmin
            .from('members')
            .update({ tier: 'free' })
            .eq('stripe_customer_id', customerId)
            .select('id');

          if (error) throw new Error('Membership cancellation write failed');
          if (updatedMembers?.length) {
            console.log('[webhook] Membership subscription returned to free');
          } else {
            // Fallback: look up email when the customer id was not attached locally.
            const stripe = getStripe(stripeKey);
            const customer = await stripe.customers.retrieve(customerId);
            const email = (customer as Stripe.Customer).email;
            if (email) {
              await updateMemberTier(email, 'free', customerId);
            } else {
              throw new Error('Cancelled membership has no matching member');
            }
          }
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch {
    console.error('[webhook] Stripe event processing failed');
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
