import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/auth/session";
import {
  PROMPT_ATLAS_FREE_MONTHLY_RUNS,
  PROMPT_ATLAS_PRO_MONTHLY_RUNS,
  promptAtlasSubscriptionBlocksCheckout,
} from "@/lib/billing/plan";
import type { PromptBillingState } from "@/lib/prompts/types";
import { getSupabaseAdmin, hasSupabaseAdminConfig } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const member = await getAuthenticatedMember(request);
  if (!member || !hasSupabaseAdminConfig()) {
    return NextResponse.json(
      {
        member: null,
        entitlement: {
          plan: "free",
          billingState: "none",
          canManageBilling: false,
          canStartCheckout: true,
          currentPeriodEnd: null,
          runsUsed: 0,
          runsLimit: PROMPT_ATLAS_FREE_MONTHLY_RUNS,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const admin = getSupabaseAdmin();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const reservationCutoff = new Date(Date.now() - 10 * 60 * 1000);
  const activeReservationStart = new Date(
    Math.max(monthStart.getTime(), reservationCutoff.getTime()),
  );

  const [
    { data: entitlement },
    { count: completedCount },
    { count: pendingReservationCount },
    { count: providerStartedCount },
  ] = await Promise.all([
    admin
      .from("prompt_entitlements")
      .select(
        "plan, stripe_subscription_id, subscription_status, current_period_end, cancel_at_period_end",
      )
      .eq("member_id", member.id)
      .maybeSingle(),
    admin
      .from("prompt_runs")
      .select("id", { count: "exact", head: true })
      .eq("member_id", member.id)
      .eq("status", "completed")
      .gte("created_at", monthStart.toISOString()),
    admin
      .from("prompt_runs")
      .select("id", { count: "exact", head: true })
      .eq("member_id", member.id)
      .eq("status", "reserved")
      .is("provider_started_at", null)
      .gte("created_at", activeReservationStart.toISOString()),
    admin
      .from("prompt_runs")
      .select("id", { count: "exact", head: true })
      .eq("member_id", member.id)
      .eq("status", "reserved")
      .not("provider_started_at", "is", null)
      .gte("created_at", monthStart.toISOString()),
  ]);

  const isPro =
    entitlement?.plan === "explorer_pro" &&
    ["active", "trialing"].includes(entitlement.subscription_status) &&
    (!entitlement.current_period_end || new Date(entitlement.current_period_end) > new Date());
  const hasSubscription = Boolean(entitlement?.stripe_subscription_id);
  const checkoutBlocked = Boolean(
    hasSubscription && promptAtlasSubscriptionBlocksCheckout(entitlement?.subscription_status),
  );
  const currentPeriodEnd =
    hasSubscription && typeof entitlement?.current_period_end === "string"
      ? entitlement.current_period_end
      : null;
  const billingState: PromptBillingState = !hasSubscription
    ? "none"
    : isPro
      ? entitlement?.cancel_at_period_end
        ? "access_ends"
        : entitlement?.subscription_status === "trialing"
          ? "trial_ends"
          : "renews"
      : checkoutBlocked
        ? "attention"
        : "inactive";

  return NextResponse.json(
    {
      member,
      entitlement: {
        plan: isPro ? "explorer_pro" : "free",
        billingState,
        canManageBilling: hasSubscription,
        canStartCheckout: !checkoutBlocked,
        currentPeriodEnd,
        runsUsed:
          (completedCount || 0) +
          (pendingReservationCount || 0) +
          (providerStartedCount || 0),
        runsLimit: isPro
          ? PROMPT_ATLAS_PRO_MONTHLY_RUNS
          : PROMPT_ATLAS_FREE_MONTHLY_RUNS,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
