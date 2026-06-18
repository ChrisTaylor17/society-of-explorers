import { NextResponse } from "next/server";
import { FALLBACK_PROMPTS } from "@/lib/prompts/catalog";
import { getSupabaseAdmin, hasSupabaseAdminConfig } from "@/lib/supabase/admin";

export async function GET() {
  if (!hasSupabaseAdminConfig()) {
    return NextResponse.json({
      prompts: [...FALLBACK_PROMPTS]
        .sort((left, right) => right.usage_count - left.usage_count)
        .slice(0, 20),
      source: "seed",
    });
  }

  const { data, error } = await getSupabaseAdmin()
    .from("prompt_community_leaderboard")
    .select("*")
    .order("momentum", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: "Community prompts are unavailable." }, { status: 500 });
  return NextResponse.json({ prompts: data, source: "database" });
}

