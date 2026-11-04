import { NextResponse } from "next/server";
import { currentStoreKind } from "@/lib/db";
import { ready } from "@/lib/ready";

export async function GET() {
  const { repo, kind } = await ready();
  const people = await repo.countPeople();
  return NextResponse.json(
    {
      ok: true,
      store: kind,
      people,
      ephemeral: currentStoreKind() === "ephemeral-sqlite",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
