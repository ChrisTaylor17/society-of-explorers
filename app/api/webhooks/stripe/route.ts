import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

// Stripe webhook → Printful fulfillment.
//
// Required env vars:
//   STRIPE_SECRET_KEY            (Stripe Dashboard → Developers → API keys)
//   STRIPE_WEBHOOK_SECRET_MERCH  (Stripe Dashboard → Webhooks → signing secret)
//   PRINTFUL_API_KEY

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const stripeKey     = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_MERCH?.trim();
  const printfulKey   = process.env.PRINTFUL_API_KEY;

  if (!stripeKey || !webhookSecret || !printfulKey) {
    console.error('Missing env vars for Stripe webhook');
    return NextResponse.json({ error: 'Misconfigured' }, { status: 500 });
  }

  const sig  = req.headers.get('stripe-signature') ?? '';
  const body = await req.text();

  let event: Stripe.Event;
  try {
    const stripe = new Stripe(stripeKey, { apiVersion: '2026-03-25.dahlia' });
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Webhook verification failed';
    console.error('Stripe webhook error:', msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const syncVariantId = session.metadata?.sync_variant_id;
    const quantity      = parseInt(session.metadata?.quantity ?? '1', 10);
    const shipping = session.collected_information?.shipping_details;

    console.log('Stripe checkout completed:', session.id, '| sync_variant_id:', syncVariantId);

    if (!syncVariantId) {
      console.warn('No sync_variant_id in session metadata — cannot auto-fulfill');
      return NextResponse.json({ received: true });
    }

    if (!shipping?.address) {
      console.warn('No shipping address in session — cannot fulfill');
      return NextResponse.json({ received: true });
    }

    const addr = shipping.address;

    const printfulBody = {
      confirm: true,
      recipient: {
        name:         session.customer_details?.name ?? 'Customer',
        email:        session.customer_details?.email ?? '',
        address1:     addr.line1 ?? '',
        address2:     addr.line2 ?? '',
        city:         addr.city ?? '',
        state_code:   addr.state ?? '',
        country_code: addr.country ?? 'US',
        zip:          addr.postal_code ?? '',
      },
      items: [{ sync_variant_id: parseInt(syncVariantId, 10), quantity }],
      external_id: session.id,
    };

    const res = await fetch('https://api.printful.com/orders', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${printfulKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(printfulBody),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('Printful order failed:', data);
    } else {
      console.log('Printful order created:', data.result?.id, 'for Stripe session', session.id);
    }
  }

  return NextResponse.json({ received: true });
}
