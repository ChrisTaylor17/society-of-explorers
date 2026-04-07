import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const { tier, amount, email } = await req.json();

  if (!tier || !amount || !email) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    customer_email: email,
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: `92B Salon - ${tier} Pledge`,
          description: 'Founding pledge for Society of Explorers physical salon at 92B South St, Boston',
        },
        unit_amount: amount * 100,
      },
      quantity: 1,
    }],
    metadata: {
      type: '92b_pledge',
      tier,
      amount: String(amount),
    },
    success_url: 'https://www.societyofexplorers.com/92b/fund?success=true',
    cancel_url: 'https://www.societyofexplorers.com/92b/fund',
  });

  return NextResponse.json({ url: session.url });
}
