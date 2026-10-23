import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/auth/session";
import {
  blockLocalLiveStripe,
  checkoutBaseUrl,
  getStripe,
  isStripeCheckoutUrl,
  isPromptAtlasProCheckoutPrice,
} from "@/lib/billing/stripe";
import { promptAtlasSubscriptionBlocksCheckout } from "@/lib/billing/plan";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function checkoutJson(body: Record<string, string>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: NextRequest) {
  const member = await getAuthenticatedMember(request);
  if (!member) {
    return checkoutJson({ error: "Sign in before upgrading." }, 401);
  }

  const priceId = process.env.STRIPE_PROMPTS_PRO_PRICE_ID;
  if (!priceId) {
    return checkoutJson({ error: "The Pro plan is not configured yet." }, 503);
  }

  const baseUrl = checkoutBaseUrl(request);
  const blocked = blockLocalLiveStripe(request, baseUrl, "Prompt Atlas checkout");
  if (blocked) return blocked;

  const admin = getSupabaseAdmin();
  const { data: entitlement, error: entitlementError } = await admin
    .from("prompt_entitlements")
    .select("stripe_customer_id, stripe_subscription_id, subscription_status")
    .eq("member_id", member.id)
    .maybeSingle<{
      stripe_customer_id: string | null;
      stripe_subscription_id: string | null;
      subscription_status: string;
    }>();
  if (entitlementError) {
    return checkoutJson({ error: "Billing is unavailable right now." }, 503);
  }
  if (
    entitlement?.stripe_subscription_id &&
    promptAtlasSubscriptionBlocksCheckout(entitlement.subscription_status)
  ) {
    return checkoutJson(
      {
        error: "A Prompt Atlas subscription already exists. Manage the existing plan instead.",
        code: "subscription_exists",
      },
      409,
    );
  }

  let stripe: ReturnType<typeof getStripe>;
  try {
    stripe = getStripe();
    const price = await stripe.prices.retrieve(priceId);
    if (!isPromptAtlasProCheckoutPrice(price, priceId)) {
      return checkoutJson(
        { error: "The configured plan does not match the advertised monthly terms." },
        503,
      );
    }
  } catch (priceError) {
    console.error(
      "[billing] price validation failed",
      priceError instanceof Error ? priceError.name : "unknown",
    );
    return checkoutJson({ error: "Billing is unavailable right now." }, 503);
  }

  try {
    let customerId = entitlement?.stripe_customer_id || null;
    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          email: member.email || undefined,
          name: member.displayName,
          metadata: { soe_member_id: member.id, product: "prompt_atlas" },
        },
        { idempotencyKey: `prompt-atlas:customer:${member.id}` },
      );
      customerId = customer.id;
      const { error: customerError } = await admin.from("prompt_entitlements").upsert(
        { member_id: member.id, stripe_customer_id: customerId },
        { onConflict: "member_id" },
      );
      if (customerError) {
        return checkoutJson({ error: "Billing is unavailable right now." }, 503);
      }
    }

    const checkoutWindow = Math.floor(Date.now() / (30 * 60 * 1000));
    const checkout = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        client_reference_id: member.id,
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: true,
        success_url: `${baseUrl}/?billing=success`,
        cancel_url: `${baseUrl}/?billing=cancelled`,
        subscription_data: {
          metadata: { soe_member_id: member.id, product: "prompt_atlas" },
        },
        metadata: { soe_member_id: member.id, product: "prompt_atlas" },
      },
      { idempotencyKey: `prompt-atlas:checkout:${member.id}:${checkoutWindow}` },
    );

    if (!checkout.url || !isStripeCheckoutUrl(checkout.url)) {
      return checkoutJson({ error: "Billing is unavailable right now." }, 502);
    }
    return checkoutJson({ url: checkout.url });
  } catch (checkoutError) {
    console.error(
      "[billing] checkout session failed",
      checkoutError instanceof Error ? checkoutError.name : "unknown",
    );
    return checkoutJson({ error: "Billing is unavailable right now." }, 502);
  }
}
