import { NextResponse } from "next/server";
import { agentPreview, listAgents, listPermissionViews } from "@/lib/domain";
import { currentContext } from "@/lib/session";

export async function GET() {
  const { person, repo } = await currentContext();
  if (!person) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const [permissions, agents] = await Promise.all([
    listPermissionViews(repo, person.id),
    listAgents(repo, person.id),
  ]);
  const previews = (
    await Promise.all(agents.map((agent) => agentPreview(repo, person.id, agent.id)))
  ).filter((item) => item !== null);
  return NextResponse.json(
    { permissions, agents: previews },
    { headers: { "Cache-Control": "no-store" } },
  );
}
