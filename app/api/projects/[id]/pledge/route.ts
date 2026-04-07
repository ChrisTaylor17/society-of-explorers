import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const { tier, amount, email } = await req.json();

  if (!tier || !amount || !email) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const { data: project } = await supabase.from('projects').select('title').eq('id', projectId).single();
  const projectTitle = project?.title || 'Society of Explorers Project';

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    customer_email: email,
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: `${projectTitle} - ${tier} Pledge`,
          description: `Founding pledge for ${projectTitle}`,
        },
        unit_amount: amount * 100,
      },
      quantity: 1,
    }],
    metadata: {
      type: 'project_pledge',
      projectId,
      tier,
      amount: String(amount),
    },
    success_url: `https://www.societyofexplorers.com/projects/${projectId}?success=true`,
    cancel_url: `https://www.societyofexplorers.com/projects/${projectId}`,
  });

  return NextResponse.json({ url: session.url });
}
