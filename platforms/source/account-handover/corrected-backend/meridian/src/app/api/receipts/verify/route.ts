import { NextResponse } from "next/server";
import { ready } from "@/lib/ready";
import { canonical, pastedReceipt, signingMaterial, verifyChain } from "@/lib/receipt";

export async function GET() {
  const material = signingMaterial();
  if (!material) {
    return NextResponse.json(
      { ok: false, error: "The signing key is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const { repo } = await ready();
  // No checkpoint argument: this route has no independent anchor, so completeness stays unknown.
  const report = verifyChain(await repo.auditChain(), material.publicPem);
  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const material = signingMaterial();
  if (!material) {
    return NextResponse.json(
      { ok: false, error: "The signing key is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  let body: { payload?: unknown; signature?: unknown };
  try {
    body = (await request.json()) as { payload?: unknown; signature?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Send JSON with payload and signature." }, { status: 400 });
  }
  const signature = typeof body.signature === "string" ? body.signature.trim() : "";
  const payload = typeof body.payload === "string" ? body.payload : body.payload ? canonical(body.payload) : "";
  if (!payload || !signature) {
    return NextResponse.json({ ok: false, error: "Payload and signature are required." }, { status: 400 });
  }
  const receipt = pastedReceipt(payload, signature, material.publicPem);
  const { repo } = await ready();
  // A request body is never read as a checkpoint. Caller JSON is not a trust source.
  const report = verifyChain(await repo.auditChain(), material.publicPem);
  return NextResponse.json(
    { receipt, ...report },
    { headers: { "Cache-Control": "no-store" } },
  );
}
