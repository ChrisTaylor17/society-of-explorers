import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe, matchesPromptAtlasProPriceTerms } from "@/lib/billing/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function customerId(value: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

async function syncSubscription(
  subscription: Stripe.Subscription,
  eventId: string,
  eventCreated: number,
) {
  const memberId = subscription.metadata.soe_member_id;
  const customer = customerId(subscription.customer);
  const product = subscription.metadata.product;
  const item = subscription.items.data[0];
  const price = item?.price;
  const expectedPriceId = process.env.STRIPE_PROMPTS_PRO_PRICE_ID;
  if (!expectedPriceId) throw new Error("Prompt Atlas price configuration is missing.");

  if (!memberId || !customer || product !== "prompt_atlas") {
    console.warn("[billing] subscription is missing SoE member metadata", subscription.id);
    return;
  }
  if (!price) {
    console.warn("[billing] subscription is missing a price", subscription.id);
    return;
  }

  const eligiblePrice =
    subscription.items.data.length === 1 &&
    !subscription.items.has_more &&
    item?.quantity === 1 &&
    matchesPromptAtlasProPriceTerms(price, expectedPriceId);
  if (!eligiblePrice) {
    console.warn("[billing] subscription no longer matches Prompt Atlas terms", subscription.id);
  }

  const active = eligiblePrice && ["active", "trialing"].includes(subscription.status);
  const periodEnd = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((value): value is number => typeof value === "number")
    .sort((left, right) => right - left)[0];

  const { data: applied, error } = await getSupabaseAdmin().rpc(
    "sync_prompt_entitlement",
    {
      p_member_id: memberId,
      p_plan: active ? "explorer_pro" : "free",
      p_stripe_customer_id: customer,
      p_stripe_subscription_id: subscription.id,
      p_stripe_price_id: price.id,
      p_subscription_status: subscription.status,
      p_current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      p_cancel_at_period_end: subscription.cancel_at_period_end,
      p_stripe_event_created: eventCreated,
      p_stripe_event_id: eventId,
    },
  );
  if (error) throw new Error("Prompt Atlas entitlement persistence failed.");
  if (!applied) console.info("[billing] ignored stale subscription event", eventId);
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
        if (session.metadata?.product !== "prompt_atlas") break;
        const memberId = session.metadata?.soe_member_id || session.client_reference_id;
        const customer = customerId(session.customer);
        if (memberId && customer) {
          const { error } = await getSupabaseAdmin().from("prompt_entitlements").upsert(
            { member_id: memberId, stripe_customer_id: customer },
            { onConflict: "member_id" },
          );
          if (error) throw new Error("Prompt Atlas customer persistence failed.");
        }
        if (session.subscription) {
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;
          await syncSubscription(
            await getStripe().subscriptions.retrieve(subscriptionId),
            event.id,
            event.created,
          );
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(
          await getStripe().subscriptions.retrieve(event.data.object.id),
          event.id,
          event.created,
        );
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
