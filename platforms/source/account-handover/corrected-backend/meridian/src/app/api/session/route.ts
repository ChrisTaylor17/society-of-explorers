import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { rotateIfDue } from "@/lib/domain";
import { ready } from "@/lib/ready";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

export async function POST() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ ok: false }, { status: 401 });
  const { repo } = await ready();
  const rotated = await rotateIfDue(repo, token);
  if (!rotated) return NextResponse.json({ ok: false }, { status: 401 });
  if (rotated.rotated) jar.set(SESSION_COOKIE, rotated.token, sessionCookieOptions());
  return NextResponse.json(
    { ok: true, rotated: rotated.rotated },
    { headers: { "Cache-Control": "no-store" } },
  );
}
