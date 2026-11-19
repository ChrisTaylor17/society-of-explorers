import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/prompts/[id]/favorite">,
) {
  const member = await getAuthenticatedMember(request);
  if (!member) {
    return NextResponse.json({ error: "Sign in to save prompts." }, { status: 401 });
  }
  const { id } = await context.params;
  const { error } = await getSupabaseAdmin()
    .from("prompt_favorites")
    .upsert({ member_id: member.id, prompt_id: id }, { onConflict: "member_id,prompt_id" });

  if (error) return NextResponse.json({ error: "Could not save the prompt." }, { status: 500 });
  return NextResponse.json({ favorited: true });
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext<"/api/prompts/[id]/favorite">,
) {
  const member = await getAuthenticatedMember(request);
  if (!member) {
    return NextResponse.json({ error: "Sign in to manage prompts." }, { status: 401 });
  }
  const { id } = await context.params;
  const { error } = await getSupabaseAdmin()
    .from("prompt_favorites")
    .delete()
    .eq("member_id", member.id)
    .eq("prompt_id", id);

  if (error) return NextResponse.json({ error: "Could not remove the prompt." }, { status: 500 });
  return NextResponse.json({ favorited: false });
}

