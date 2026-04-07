import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Map Stripe price IDs to membership tiers.
// UPDATE THESE with your actual Stripe price IDs from the dashboard.
// You can find them in Stripe → Products → each product → Price ID (starts with price_)
// For Payment Links, check the link config for the associated price.
const TIER_MAP: Record<string, string> = {
  [process.env.STRIPE_PRICE_SEEKER!]: 'seeker',
  [process.env.STRIPE_PRICE_SCHOLAR!]: 'scholar',
  [process.env.STRIPE_PRICE_PHILOSOPHER!]: 'philosopher',
};

// Fallback: map amount to tier if price ID not in TIER_MAP
function tierFromAmount(amountCents: number | null, interval: string | null): string {
  if (!amountCents) return 'seeker';
  const dollars = amountCents / 100;
  if (dollars >= 499) return 'philosopher';
  if (dollars >= 99) return 'scholar';
  return 'seeker';
}

async function updateMemberTier(email: string, tier: string, stripeCustomerId?: string) {
  // Try by email first (matches Supabase auth email)
  const updateData: Record<string, any> = { tier };
  if (stripeCustomerId) updateData.stripe_customer_id = stripeCustomerId;

  // Find member by Supabase auth email
  const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
  const authUser = authUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

  if (authUser) {
    const { error } = await supabaseAdmin
      .from('members')
      .update(updateData)
      .eq('supabase_auth_id', authUser.id);
    if (!error) {
      console.log(`Updated member tier: ${email} → ${tier}`);
      return;
    }
  }

  // Fallback: try by stripe_customer_id if we have it
  if (stripeCustomerId) {
    const { error } = await supabaseAdmin
      .from('members')
      .update(updateData)
      .eq('stripe_customer_id', stripeCustomerId);
    if (!error) {
      console.log(`Updated member tier by customer ID: ${stripeCustomerId} → ${tier}`);
      return;
    }
  }

  console.warn(`Could not find member to update tier: ${email}`);
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
    const stripe = new Stripe(stripeKey, { apiVersion: '2026-03-25.dahlia' });
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
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
          const pledgeTier = session.metadata.tier;
          const pledgeAmount = session.metadata.amount;
          console.log(`[webhook] 92B pledge: ${pledgeTier} $${pledgeAmount} from ${email}`);

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
                const expBonus = pledgeTier === 'RENAISSANCE FOUNDER' ? 1000 : pledgeTier === 'PATRON' ? 200 : 50;
                await supabaseAdmin.from('members').update({ exp_tokens: (member.exp_tokens || 0) + expBonus }).eq('id', member.id);
                await supabaseAdmin.from('exp_events').insert({ member_id: member.id, amount: expBonus, reason: `92B pledge: ${pledgeTier}` });
              }
            }
          }

          // Notify Chris
          if (process.env.RESEND_API_KEY) {
            try {
              const { Resend } = await import('resend');
              const resend = new Resend(process.env.RESEND_API_KEY);
              await resend.emails.send({
                from: 'Society of Explorers <notifications@societyofexplorers.com>',
                to: 'chris@societyofexplorers.com',
                subject: `92B PLEDGE RECEIVED: ${pledgeTier} - $${pledgeAmount}`,
                html: `<div style="background:#000;color:#f5f0e8;padding:40px;font-family:Georgia,serif;"><h2 style="color:#c9a84c;">New 92B Pledge!</h2><p>Tier: ${pledgeTier}</p><p>Amount: $${pledgeAmount}</p><p>Email: ${email}</p></div>`,
              });
            } catch {}
          }
          break;
        }

        // --- MEMBERSHIP SUBSCRIPTION HANDLING ---
        if (!email) {
          console.warn('checkout.session.completed: no email found');
          break;
        }

        // Determine tier from line items
        let tier = 'seeker';
        const stripe = new Stripe(stripeKey, { apiVersion: '2026-03-25.dahlia' });

        try {
          const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
          const item = lineItems.data[0];
          const priceId = item?.price?.id;

          if (priceId && TIER_MAP[priceId]) {
            tier = TIER_MAP[priceId];
          } else {
            // Fallback: use amount
            const amount = item?.amount_total || session.amount_total;
            const interval = item?.price?.recurring?.interval || null;
            tier = tierFromAmount(amount, interval);
          }
        } catch (e) {
          console.warn('Could not fetch line items, using amount fallback');
          tier = tierFromAmount(session.amount_total, null);
        }

        console.log(`Checkout completed: ${email} → tier: ${tier}, customer: ${customerId}`);
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
        if (priceId && TIER_MAP[priceId]) {
          tier = TIER_MAP[priceId];
        } else {
          tier = tierFromAmount(amount || null, interval);
        }

        // Look up email from Stripe customer
        if (customerId) {
          const stripe = new Stripe(stripeKey, { apiVersion: '2026-03-25.dahlia' });
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

        if (customerId) {
          // Set tier back to free
          const { error } = await supabaseAdmin
            .from('members')
            .update({ tier: 'free' })
            .eq('stripe_customer_id', customerId);

          if (error) {
            // Fallback: look up email
            const stripe = new Stripe(stripeKey, { apiVersion: '2026-03-25.dahlia' });
            const customer = await stripe.customers.retrieve(customerId);
            const email = (customer as Stripe.Customer).email;
            if (email) {
              await updateMemberTier(email, 'free', customerId);
            }
          } else {
            console.log(`Subscription deleted: customer ${customerId} → free`);
          }
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
    // Still return 200 so Stripe doesn't retry
  }

  return NextResponse.json({ received: true });
}
