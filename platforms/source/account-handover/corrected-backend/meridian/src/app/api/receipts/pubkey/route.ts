import { NextResponse } from "next/server";
import { logPublicKey } from "@/lib/domain";

export async function GET() {
  const publicKey = await logPublicKey();
  if (!publicKey) {
    return NextResponse.json(
      { ok: false, error: "The signing key is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { ok: true, publicKey },
    { headers: { "Cache-Control": "no-store" } },
  );
}
