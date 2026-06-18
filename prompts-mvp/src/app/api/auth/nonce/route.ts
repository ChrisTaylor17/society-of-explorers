import { generateNonce } from "siwe";
import { NextResponse } from "next/server";

export async function GET() {
  const nonce = generateNonce();
  const response = NextResponse.json({ nonce });
  response.cookies.set("soe_siwe_nonce", nonce, {
    httpOnly: true,
    maxAge: 60 * 10,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
