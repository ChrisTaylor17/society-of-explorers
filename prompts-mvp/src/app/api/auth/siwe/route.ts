import { NextRequest, NextResponse } from "next/server";
import { SiweMessage } from "siwe";
import { z } from "zod";
import { createWalletSession } from "@/lib/auth/wallet-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const bodySchema = z.object({
  message: z.string().min(1).max(4000),
  signature: z.string().min(32).max(2048),
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  const nonce = request.cookies.get("soe_siwe_nonce")?.value;
  if (!parsed.success || !nonce) {
    return NextResponse.json({ error: "The wallet sign-in request expired." }, { status: 400 });
  }

  try {
    const message = new SiweMessage(parsed.data.message);
    const domain =
      request.headers.get("x-forwarded-host") || request.headers.get("host") || undefined;
    const result = await message.verify({
      signature: parsed.data.signature,
      nonce,
      domain,
    });
    if (!result.success) {
      return NextResponse.json({ error: "The wallet signature is invalid." }, { status: 401 });
    }

    const address = result.data.address.toLowerCase();
    const admin = getSupabaseAdmin();
    const { data: existing } = await admin
      .from("members")
      .select("id, display_name")
      .eq("wallet_address", address)
      .maybeSingle<{ id: string; display_name: string | null }>();

    let member = existing;
    if (!member) {
      const { data: created, error } = await admin
        .from("members")
        .insert({
          wallet_address: address,
          display_name: `${address.slice(0, 6)}...${address.slice(-4)}`,
          exp_tokens: 0,
        })
        .select("id, display_name")
        .single<{ id: string; display_name: string | null }>();
      if (error) throw error;
      member = created;
    }

    const session = member ? await createWalletSession(member.id) : null;
    if (!session) throw new Error("Wallet sessions are not configured.");

    const response = NextResponse.json({
      member: {
        id: member!.id,
        displayName: member!.display_name || "Explorer",
        email: null,
      },
    });
    response.cookies.set("soe_wallet_id", session, {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    response.cookies.set("soe_siwe_nonce", "", {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch (error) {
    console.error("[auth] SIWE failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Wallet sign-in could not be verified." }, { status: 400 });
  }
}

