import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedMember } from "@/lib/auth/session";
import { FALLBACK_PROMPTS } from "@/lib/prompts/catalog";
import { PROMPT_CATEGORIES, type PromptRecord } from "@/lib/prompts/types";
import { getSupabaseAdmin, hasSupabaseAdminConfig } from "@/lib/supabase/admin";

const createPromptSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(320),
  category: z.enum(PROMPT_CATEGORIES),
  promptText: z.string().trim().min(10).max(8000),
  visibility: z.enum(["public", "unlisted", "private"]).default("public"),
  tags: z.array(z.string().trim().min(1).max(32)).max(8).default([]),
});

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
}

export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category");
  const sort = request.nextUrl.searchParams.get("sort") || "trending";

  if (!hasSupabaseAdminConfig()) {
    const filtered = category && PROMPT_CATEGORIES.includes(category as never)
      ? FALLBACK_PROMPTS.filter((prompt) => prompt.category === category)
      : FALLBACK_PROMPTS;
    return NextResponse.json({ prompts: filtered, source: "seed" });
  }

  const admin = getSupabaseAdmin();
  let query = admin
    .from("prompts")
    .select(
      "id, slug, title, description, category, prompt_text, tags, usage_count, created_by, is_featured, created_at",
    )
    .eq("visibility", "public")
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString())
    .limit(80);

  if (category && PROMPT_CATEGORIES.includes(category as never)) {
    query = query.eq("category", category);
  }
  query = sort === "new"
    ? query.order("created_at", { ascending: false })
    : query.order("usage_count", { ascending: false });

  const { data, error } = await query;
  if (error) {
    console.error("[prompts] discovery query failed", error.message);
    return NextResponse.json({ prompts: FALLBACK_PROMPTS, source: "seed" });
  }

  const member = await getAuthenticatedMember(request).catch(() => null);
  const favorites = new Set<string>();
  if (member) {
    const { data: rows } = await admin
      .from("prompt_favorites")
      .select("prompt_id")
      .eq("member_id", member.id);
    rows?.forEach((row) => favorites.add(row.prompt_id));
  }

  const prompts = (data as PromptRecord[]).map((prompt) => ({
    ...prompt,
    favorited: favorites.has(prompt.id),
  }));
  return NextResponse.json({ prompts, source: "database" });
}

export async function POST(request: NextRequest) {
  const member = await getAuthenticatedMember(request);
  if (!member) {
    return NextResponse.json({ error: "Sign in to create a prompt." }, { status: 401 });
  }

  const parsed = createPromptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Prompt details are incomplete.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  const baseSlug = slugify(parsed.data.title) || "new-prompt";
  const slug = `${baseSlug}-${crypto.randomUUID().slice(0, 6)}`;
  const { data, error } = await admin
    .from("prompts")
    .insert({
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      prompt_text: parsed.data.promptText,
      visibility: parsed.data.visibility,
      tags: parsed.data.tags,
      slug,
      created_by: member.id,
      published_at: parsed.data.visibility === "public" ? new Date().toISOString() : null,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[prompts] create failed", error.message);
    return NextResponse.json({ error: "The prompt could not be saved." }, { status: 500 });
  }
  return NextResponse.json({ prompt: data }, { status: 201 });
}

