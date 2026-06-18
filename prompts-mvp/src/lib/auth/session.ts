import type { NextRequest } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin, hasSupabaseAdminConfig } from "@/lib/supabase/admin";
import { verifyWalletSession } from "./wallet-session";

export interface AuthenticatedMember {
  id: string;
  displayName: string;
  email: string | null;
}

interface MemberRow {
  id: string;
  display_name: string | null;
  supabase_auth_id: string | null;
}

async function memberForEmailUser(): Promise<AuthenticatedMember | null> {
  if (!hasSupabaseAdminConfig()) return null;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = getSupabaseAdmin();
  const { data: existing } = await admin
    .from("members")
    .select("id, display_name, supabase_auth_id")
    .eq("supabase_auth_id", user.id)
    .maybeSingle<MemberRow>();

  let member = existing;
  if (!member) {
    const displayName =
      user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Explorer";
    const { data: created, error } = await admin
      .from("members")
      .insert({
        supabase_auth_id: user.id,
        display_name: displayName,
        exp_tokens: 0,
      })
      .select("id, display_name, supabase_auth_id")
      .single<MemberRow>();
    if (error) throw error;
    member = created;
  }

  return member
    ? {
        id: member.id,
        displayName: member.display_name || "Explorer",
        email: user.email || null,
      }
    : null;
}

async function memberForWallet(request: NextRequest): Promise<AuthenticatedMember | null> {
  if (!hasSupabaseAdminConfig()) return null;
  const memberId = await verifyWalletSession(request.cookies.get("soe_wallet_id")?.value);
  if (!memberId) return null;

  const { data } = await getSupabaseAdmin()
    .from("members")
    .select("id, display_name")
    .eq("id", memberId)
    .maybeSingle<{ id: string; display_name: string | null }>();

  return data
    ? { id: data.id, displayName: data.display_name || "Explorer", email: null }
    : null;
}

export async function getAuthenticatedMember(
  request: NextRequest,
): Promise<AuthenticatedMember | null> {
  return (await memberForEmailUser()) || memberForWallet(request);
}

