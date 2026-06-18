import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/auth/session";
import { getStripe, siteUrl } from "@/lib/billing/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const member = await getAuthenticatedMember(request);
  if (!member) {
    return NextResponse.json({ error: "Sign in before upgrading." }, { status: 401 });
  }

  const priceId = process.env.STRIPE_PROMPTS_PRO_PRICE_ID;
  if (!priceId) {
    return NextResponse.json({ error: "The unlimited plan is not configured yet." }, { status: 503 });
  }

  const admin = getSupabaseAdmin();
  const { data: entitlement } = await admin
    .from("prompt_entitlements")
    .select("stripe_customer_id")
    .eq("member_id", member.id)
    .maybeSingle<{ stripe_customer_id: string | null }>();

  const stripe = getStripe();
  let customerId = entitlement?.stripe_customer_id || null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: member.email || undefined,
      name: member.displayName,
      metadata: { soe_member_id: member.id, product: "prompt_atlas" },
    });
    customerId = customer.id;
    await admin.from("prompt_entitlements").upsert(
      { member_id: member.id, stripe_customer_id: customerId },
      { onConflict: "member_id" },
    );
  }

  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: member.id,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${siteUrl()}/?billing=success`,
    cancel_url: `${siteUrl()}/?billing=cancelled`,
    subscription_data: {
      metadata: { soe_member_id: member.id, product: "prompt_atlas" },
    },
    metadata: { soe_member_id: member.id, product: "prompt_atlas" },
  });

  if (!checkout.url) {
    return NextResponse.json({ error: "Stripe returned no checkout URL." }, { status: 502 });
  }
  return NextResponse.json({ url: checkout.url });
}

