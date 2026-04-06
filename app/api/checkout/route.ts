import { NextRequest } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';

const PRICE_MAP: Record<string, string> = {
  seeker: process.env.STRIPE_PRICE_SEEKER!,
  scholar: process.env.STRIPE_PRICE_SCHOLAR!,
  philosopher: process.env.STRIPE_PRICE_PHILOSOPHER!,
};

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-03-25.dahlia',
  });

  const { tier, email } = await req.json();

  const priceId = PRICE_MAP[tier];
  if (!priceId) {
    return Response.json({ error: 'Invalid tier' }, { status: 400 });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${req.nextUrl.origin}/salon?welcome=1`,
    cancel_url: `${req.nextUrl.origin}/join`,
    ...(email ? { customer_email: email } : {}),
    metadata: { tier },
  });

  return Response.json({ url: session.url });
}
