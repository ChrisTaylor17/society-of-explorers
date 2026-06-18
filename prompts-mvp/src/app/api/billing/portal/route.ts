import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/auth/session";
import { getStripe, siteUrl } from "@/lib/billing/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const member = await getAuthenticatedMember(request);
  if (!member) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { data } = await getSupabaseAdmin()
    .from("prompt_entitlements")
    .select("stripe_customer_id")
    .eq("member_id", member.id)
    .maybeSingle<{ stripe_customer_id: string | null }>();
  if (!data?.stripe_customer_id) {
    return NextResponse.json({ error: "No billing account was found." }, { status: 404 });
  }

  const portal = await getStripe().billingPortal.sessions.create({
    customer: data.stripe_customer_id,
    return_url: siteUrl(),
  });
  return NextResponse.json({ url: portal.url });
}

