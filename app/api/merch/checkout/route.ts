import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return NextResponse.json({ error: 'STRIPE_SECRET_KEY not configured' }, { status: 503 });

    const stripe = new Stripe(stripeKey, { apiVersion: '2026-03-25.dahlia', maxNetworkRetries: 1 });
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { productId, quantity = 1 } = await req.json();

    const { data: product, error } = await supabase
      .from('merch_suggestions')
      .select('name, price, image_url, sync_variant_id')
      .eq('id', productId)
      .single();

    if (error || !product) {
      console.error('Product fetch error:', error);
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // TEMPORARY: allow checkout even if sync_variant_id is missing (for testing)
    if (!product.sync_variant_id) {
      console.warn(`⚠️ Product ${productId} has no sync_variant_id — proceeding anyway for testing`);
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { 
            name: product.name,
            images: product.image_url ? [product.image_url] : [],
          },
          unit_amount: Math.round(product.price * 100),
        },
        quantity,
      }],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/merch/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/salon`,
      metadata: { 
        productId: productId.toString(), 
        quantity: quantity.toString()
      },
      shipping_address_collection: { allowed_countries: ['US'] },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Checkout failed';
    console.error('Checkout error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
