"use client";

import { useState } from "react";
import { chainStatusText } from "@/lib/format";

type Result = {
  error?: string;
  receipt?: { signatureValid: boolean; signerTrusted: boolean };
  links?: { ok: boolean; checked: number; brokenAt: number | null; reason: string | null };
  unsupported?: { count: number; trusted: false };
  completeness?: { status: "unknown" | "prefix" | "exact" | "mismatch"; reason: string | null };
};

export function VerifyForm() {
  const [payload, setPayload] = useState("");
  const [signature, setSignature] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/receipts/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload, signature }),
    });
    setResult((await response.json()) as Result);
  }

  return (
    <form className="card" onSubmit={onSubmit} style={{ marginTop: "0.9rem" }}>
      <h2>One receipt</h2>
      <p>Paste the payload bytes and the base64 signature from the audit page. The check uses the server's current public key and also walks the stored chain.</p>
      <div className="field">
        <label htmlFor="payload">Payload</label>
        <textarea id="payload" value={payload} onChange={(event) => setPayload(event.target.value)} rows={8} />
      </div>
      <div className="field">
        <label htmlFor="signature">Signature</label>
        <textarea id="signature" value={signature} onChange={(event) => setSignature(event.target.value)} rows={3} />
      </div>
      <button className="primary" type="submit">Verify</button>
      {result?.error ? <p className="error" role="alert">{result.error}</p> : null}
      {result && !result.error && result.receipt && result.links && result.unsupported && result.completeness ? (
        <div role="status">
          <p className={result.receipt.signatureValid ? undefined : "error"}>
            {result.receipt.signatureValid
              ? "Signature: valid under the configured log key."
              : "Signature: not valid under the configured log key."}
            {" "}
            {result.receipt.signerTrusted
              ? "Signer: trusted as that configured key."
              : "Signer: not trusted. Only the configured log key is accepted for a pasted receipt."}
          </p>
          <p className={result.links.ok ? undefined : "error"}>
            {chainStatusText({ links: result.links, unsupported: result.unsupported, completeness: result.completeness })}
          </p>
        </div>
      ) : null}
    </form>
  );
}
