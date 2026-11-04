import { NextResponse } from "next/server";
import { getPlanView } from "@/lib/domain";
import { currentContext } from "@/lib/session";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { person, repo } = await currentContext();
  if (!person) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const plan = await getPlanView(repo, person.id, id);
  if (!plan) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(plan, { headers: { "Cache-Control": "no-store" } });
}
