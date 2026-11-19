import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Repository, StoreKind } from "./db";
import { personForToken, type Person } from "./domain";
import { ready } from "./ready";

export const SESSION_COOKIE = "meridian_session";

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}

export async function currentContext(): Promise<{
  repo: Repository;
  kind: StoreKind;
  person: Person | null;
}> {
  const { repo, kind } = await ready();
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const person = token ? await personForToken(repo, token) : null;
  return { repo, kind, person };
}

export async function requirePerson(): Promise<{
  repo: Repository;
  kind: StoreKind;
  person: Person;
}> {
  const ctx = await currentContext();
  if (!ctx.person) redirect("/");
  return { repo: ctx.repo, kind: ctx.kind, person: ctx.person };
}
