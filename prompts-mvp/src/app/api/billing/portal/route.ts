import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/auth/session";
import {
  blockLocalLiveStripe,
  checkoutBaseUrl,
  getStripe,
  isStripePortalUrl,
} from "@/lib/billing/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function portalJson(body: Record<string, string>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: NextRequest) {
  const member = await getAuthenticatedMember(request);
  if (!member) return portalJson({ error: "Sign in first." }, 401);

  const baseUrl = checkoutBaseUrl(request);
  const blocked = blockLocalLiveStripe(request, baseUrl, "Prompt Atlas billing portal");
  if (blocked) return blocked;

  const { data, error } = await getSupabaseAdmin()
    .from("prompt_entitlements")
    .select("stripe_customer_id")
    .eq("member_id", member.id)
    .maybeSingle<{ stripe_customer_id: string | null }>();
  if (error) {
    return portalJson({ error: "Billing is unavailable right now." }, 503);
  }
  if (!data?.stripe_customer_id) {
    return portalJson({ error: "No billing account was found." }, 404);
  }

  try {
    const portal = await getStripe().billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: baseUrl,
    });
    if (!isStripePortalUrl(portal.url)) {
      return portalJson({ error: "Billing is unavailable right now." }, 502);
    }
    return portalJson({ url: portal.url });
  } catch (portalError) {
    console.error(
      "[billing] portal session failed",
      portalError instanceof Error ? portalError.name : "unknown",
    );
    return portalJson({ error: "Billing is unavailable right now." }, 502);
  }
}
