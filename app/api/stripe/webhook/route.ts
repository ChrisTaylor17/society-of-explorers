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
import { findAuthUserIdByEmail } from '@/lib/payments/memberLookup';
import { markEventProcessed, wasEventProcessed } from '@/lib/payments/webhookIdempotency';
import { isLegacyBillingCandidate, processLegacyBillingEvent } from '@/lib/payments/legacyBilling';
import { readWebhookBody, WebhookBodyFailure } from '@/lib/payments/readWebhookBody';
import { privateJson } from '@/lib/http/routeError';

export const runtime = 'nodejs';

let stripe: Stripe | null = null;

function getStripe(stripeKey: string): Stripe {
  if (!stripe) stripe = new Stripe(stripeKey, { apiVersion: '2026-03-25.dahlia', maxNetworkRetries: 1 });
  return stripe;
}

export async function POST(req: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!stripeKey || !webhookSecret) {
    console.error('Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET');
    return NextResponse.json({ error: 'Misconfigured' }, { status: 500 });
  }

  const sig = req.headers.get('stripe-signature') ?? '';
  let body: Uint8Array;
  try { body = await readWebhookBody(req); }
  catch (error) { return privateJson({ error: 'Invalid webhook body.' }, { status: error instanceof WebhookBodyFailure ? error.status : 400 }); }

  let event: Stripe.Event;
  try {
    event = getStripe(stripeKey).webhooks.constructEvent(Buffer.from(body), sig, webhookSecret);
  } catch {
    return privateJson({ error: 'Webhook verification failed.' }, { status: 400 });
  }
  if (!event || typeof event.id !== 'string' || typeof event.type !== 'string' || typeof event.livemode !== 'boolean'
    || !event.data || !event.data.object || typeof event.data.object !== 'object' || Array.isArray(event.data.object)) {
    return privateJson({ error: 'Invalid webhook event.' }, { status: 400 });
  }

  // Optional support never grants a historical AI/lifetime tier. Its dedicated
  // processor owns supporter events, including cancellations delivered to an
  // older endpoint during a coordinated rollout. Refuse cross-product effects
  // before any member lookup or legacy receipt write.
  const eventObject = event.data.object as { metadata?: { type?: string } };
  if (eventObject.metadata?.type === 'soe_supporter_v1') {
    return NextResponse.json({ received: true, ignored: 'supporter_event' });
  }

  // Strict membership reconciliation owns all legacy financial effects. Capital
  // pledges keep their separate compatibility processing below.
  const legacyEvent = { id: event.id, type: event.type, livemode: event.livemode, account: event.account,
    data: { object: event.data.object as unknown as Record<string, unknown> } };
  if (isLegacyBillingCandidate(legacyEvent)) {
    try { return privateJson(await processLegacyBillingEvent(legacyEvent, body)); }
    catch { return privateJson({ error: 'Legacy membership reconciliation could not be verified or persisted.' }, { status: 503 }); }
  }

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

        // Unclassified checkout sessions do not establish membership ownership.
        outcome = 'ignored';
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
