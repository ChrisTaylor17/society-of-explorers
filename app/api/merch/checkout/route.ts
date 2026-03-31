import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/server';

// Stripe checkout session for merch purchases.
// On success, Stripe fires checkout.session.completed → /api/webhooks/stripe
// which creates the Printful fulfillment order.
//
// Required env vars:
//   STRIPE_SECRET_KEY        (Stripe Dashboard → Developers → API keys)
//   NEXT_PUBLIC_SITE_URL     (e.g. https://www.societyofexplorers.com)

export async function POST(req: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ error: 'STRIPE_SECRET_KEY not configured' }, { status: 503 });
  }

  const { productId, quantity = 1 } = await req.json();
  if (!productId) {
    return NextResponse.json({ error: 'productId is required' }, { status: 400 });
  }

  // Fetch the published product from merch_suggestions.
  const supabase = createServiceClient();
  const { data: product, error } = await supabase
    .from('merch_suggestions')
    .select('id, name, tagline, price, image_url, thinker_id, sync_variant_id')
    .eq('id', productId)
    .eq('status', 'live')
    .single();

  if (error || !product) {
    return NextResponse.json({ error: 'Product not found or not live' }, { status: 404 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2026-03-25.dahlia' });
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.societyofexplorers.com';

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: product.name,
          description: product.tagline ?? undefined,
          ...(product.image_url ? { images: [product.image_url] } : {}),
        },
        unit_amount: Math.round((product.price ?? 24) * 100),
      },
      quantity,
    }],
    mode: 'payment',
    shipping_address_collection: { allowed_countries: ['US', 'CA', 'GB', 'AU', 'DE', 'FR'] },
    success_url: `${baseUrl}/?merch_success=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${baseUrl}/`,
    metadata: {
      productId,
      quantity:        String(quantity),
      sync_variant_id: product.sync_variant_id ? String(product.sync_variant_id) : '',
    },
  });

  return NextResponse.json({ url: session.url });
}
