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
  // $9.99/mo Digital → member
  // Fill in: 'price_XXXXX': 'member',

  // $99/mo Salon → patron
  // Fill in: 'price_XXXXX': 'patron',

  // $499 one-time Founding → founding
  // Fill in: 'price_XXXXX': 'founding',
};

// Fallback: map amount to tier if price ID not in TIER_MAP
function tierFromAmount(amountCents: number | null, interval: string | null): string {
  if (!amountCents) return 'member';
  const dollars = amountCents / 100;
  if (dollars >= 499) return 'founding';
  if (dollars >= 99) return 'patron';
  return 'member';
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
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

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

        if (!email) {
          console.warn('checkout.session.completed: no email found');
          break;
        }

        // Determine tier from line items
        let tier = 'member';
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

        let tier = 'member';
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
