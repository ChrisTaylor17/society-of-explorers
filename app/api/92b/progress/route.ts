import Stripe from 'stripe';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function GET() {
  try {
    const sessions = await stripe.checkout.sessions.list({ limit: 100 });
    const pledges = sessions.data.filter(
      s => s.metadata?.type === '92b_pledge' && s.payment_status === 'paid'
    );
    const totalRaised = pledges.reduce((sum, s) => sum + (s.amount_total || 0), 0) / 100;
    const backerCount = pledges.length;
    return NextResponse.json({ totalRaised, backerCount, goal: 120000 });
  } catch (err) {
    console.error('92B progress error:', err);
    return NextResponse.json({ totalRaised: 0, backerCount: 0, goal: 120000 });
  }
}
