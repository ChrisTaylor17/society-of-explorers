import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/auth/session";
import {
  hasPromptAtlasOperatorAccessConfig,
  isPromptAtlasOperator,
} from "@/lib/operator/access";
import { normalizePromptAtlasOperatorMetrics } from "@/lib/operator/metrics";
import { getSupabaseAdmin, hasSupabaseAdminConfig } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Surrogate-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  Pragma: "no-cache",
  Vary: "Cookie, Authorization",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
};

function operatorJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: privateHeaders });
}

export async function GET(request: NextRequest) {
  const member = await getAuthenticatedMember(request);
  if (!member) {
    return operatorJson({ error: "Operator sign-in is required." }, 401);
  }
  if (!hasPromptAtlasOperatorAccessConfig()) {
    return operatorJson({ error: "Operator access is not configured." }, 503);
  }
  if (!isPromptAtlasOperator(member)) {
    return operatorJson({ error: "Operator access is required." }, 403);
  }
  if (!hasSupabaseAdminConfig()) {
    return operatorJson({ error: "Operator metrics are unavailable." }, 503);
  }

  const { data, error } = await getSupabaseAdmin().rpc(
    "get_prompt_atlas_operator_metrics",
  );
  if (error) {
    console.warn("[operator] aggregate metrics unavailable", error.code || "unknown");
    return operatorJson({ error: "Operator metrics are unavailable." }, 503);
  }

  const metrics = normalizePromptAtlasOperatorMetrics(data);
  if (!metrics) {
    console.warn("[operator] aggregate metrics response invalid");
    return operatorJson({ error: "Operator metrics are unavailable." }, 503);
  }

  return operatorJson({ metrics });
}
