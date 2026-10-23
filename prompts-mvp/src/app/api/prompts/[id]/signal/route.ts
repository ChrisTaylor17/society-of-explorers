import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function privateJson(payload: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Vary", "Cookie, Authorization");
  return NextResponse.json(payload, { ...init, headers });
}

async function isPublicPrompt(promptId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("prompts")
    .select("id")
    .eq("id", promptId)
    .eq("visibility", "public")
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString())
    .maybeSingle<{ id: string }>();

  if (error) {
    console.error("[prompts] signal prompt lookup failed", error.message);
    return false;
  }
  return Boolean(data);
}

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/prompts/[id]/signal">,
) {
  const member = await getAuthenticatedMember(request);
  if (!member) {
    return privateJson({ error: "Sign in to signal prompts." }, { status: 401 });
  }

  const { id } = await context.params;
  if (!(await isPublicPrompt(id))) {
    return privateJson({ error: "This prompt cannot receive community signal." }, { status: 404 });
  }

  const { error } = await getSupabaseAdmin()
    .from("prompt_votes")
    .upsert(
      { member_id: member.id, prompt_id: id, value: 1 },
      { onConflict: "member_id,prompt_id" },
    );

  if (error) {
    console.error("[prompts] signal failed", error.message);
    return privateJson({ error: "Could not signal the prompt." }, { status: 500 });
  }
  return privateJson({ signaled: true });
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext<"/api/prompts/[id]/signal">,
) {
  const member = await getAuthenticatedMember(request);
  if (!member) {
    return privateJson({ error: "Sign in to manage prompt signals." }, { status: 401 });
  }

  const { id } = await context.params;
  const { error } = await getSupabaseAdmin()
    .from("prompt_votes")
    .delete()
    .eq("member_id", member.id)
    .eq("prompt_id", id);

  if (error) {
    console.error("[prompts] signal removal failed", error.message);
    return privateJson({ error: "Could not remove the signal." }, { status: 500 });
  }
  return privateJson({ signaled: false });
}
