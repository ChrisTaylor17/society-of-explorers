import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/billing/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function customerId(value: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const memberId = subscription.metadata.soe_member_id;
  const customer = customerId(subscription.customer);
  if (!memberId || !customer) {
    console.warn("[billing] subscription is missing SoE member metadata", subscription.id);
    return;
  }

  const active = ["active", "trialing"].includes(subscription.status);
  const periodEnd = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((value): value is number => typeof value === "number")
    .sort((left, right) => right - left)[0];

  await getSupabaseAdmin().from("prompt_entitlements").upsert(
    {
      member_id: memberId,
      plan: active ? "explorer_pro" : "free",
      stripe_customer_id: customer,
      stripe_subscription_id: subscription.id,
      stripe_price_id: subscription.items.data[0]?.price.id || null,
      subscription_status: subscription.status,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end,
    },
    { onConflict: "member_id" },
  );
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET_PROMPTS;
  if (!signature || !secret) {
    return NextResponse.json({ error: "Webhook configuration is missing." }, { status: 503 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(await request.text(), signature, secret);
  } catch (error) {
    console.error("[billing] invalid webhook signature", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const memberId = session.metadata?.soe_member_id || session.client_reference_id;
        const customer = customerId(session.customer);
        if (memberId && customer) {
          await getSupabaseAdmin().from("prompt_entitlements").upsert(
            { member_id: memberId, stripe_customer_id: customer },
            { onConflict: "member_id" },
          );
        }
        if (typeof session.subscription === "string") {
          await syncSubscription(await getStripe().subscriptions.retrieve(session.subscription));
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object);
        break;
      default:
        break;
    }
  } catch (error) {
    console.error("[billing] webhook processing failed", event.id, error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

