import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/auth/session";
import { getSupabaseAdmin, hasSupabaseAdminConfig } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const member = await getAuthenticatedMember(request);
  if (!member || !hasSupabaseAdminConfig()) {
    return NextResponse.json(
      { member: null, entitlement: { plan: "free", runsUsed: 0, runsLimit: 5 } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const admin = getSupabaseAdmin();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [{ data: entitlement }, { count }] = await Promise.all([
    admin
      .from("prompt_entitlements")
      .select("plan, subscription_status, current_period_end")
      .eq("member_id", member.id)
      .maybeSingle(),
    admin
      .from("prompt_runs")
      .select("id", { count: "exact", head: true })
      .eq("member_id", member.id)
      .in("status", ["reserved", "completed"])
      .gte("created_at", monthStart.toISOString()),
  ]);

  const isPro =
    entitlement?.plan === "explorer_pro" &&
    ["active", "trialing"].includes(entitlement.subscription_status) &&
    (!entitlement.current_period_end || new Date(entitlement.current_period_end) > new Date());

  return NextResponse.json(
    {
      member,
      entitlement: {
        plan: isPro ? "explorer_pro" : "free",
        runsUsed: count || 0,
        runsLimit: isPro ? null : 5,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

