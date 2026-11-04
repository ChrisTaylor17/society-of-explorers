import { ErrorNote } from "@/components/Shell";
import { listAudit, logPublicKey } from "@/lib/domain";
import { stamp } from "@/lib/format";
import { requirePerson } from "@/lib/session";

export const metadata = { title: "Audit" };

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { repo, person } = await requirePerson();
  const { error } = await searchParams;
  const [events, publicKey] = await Promise.all([listAudit(repo, person.id), logPublicKey()]);
  return (
    <>
      <p className="eyebrow">Signed log</p>
      <h1>Grants and revocations.</h1>
      <p className="lede">Each grant and revoke has an Ed25519 receipt signed by a key that lives in the server environment. A broken or reordered link can be detected. A deleted suffix cannot, because this demo has no independent checkpoint. Nothing is written to a blockchain, and there is no token. Check a receipt on the verify page.</p>
      <ErrorNote error={error} />
      <details className="card">
        <summary>Current log public key</summary>
        <pre className="receipt">{publicKey}</pre>
      </details>
      <div className="stack" style={{ marginTop: "0.9rem" }}>
        {events.length === 0 ? <p className="card">No grants or revocations for you yet.</p> : null}
        {events.map((event) => (
          <article className="card" key={event.id}>
            <div className="row">
              <span className={`status ${event.verdict.signatureOk && event.verdict.currentKey ? "valid" : "invalid"}`}>
                {event.verdict.signatureOk && event.verdict.currentKey
                  ? "Signature matches the current log key"
                  : event.verdict.signatureOk
                    ? "Signature matches a different key"
                    : "Signature does not check out"}
              </span>
              <span className="meta">{stamp(event.at)}</span>
            </div>
            <h2 style={{ fontSize: "1.45rem", marginTop: "0.6rem" }}>{event.statement}</h2>
            <details>
              <summary>Signed receipt</summary>
              <p className="meta">Payload bytes are what was signed. The signature is Ed25519, base64. Copy both to the verify page.</p>
              <p className="meta">Payload</p>
              <pre className="receipt">{event.payload}</pre>
              <p className="meta">Signature</p>
              <pre className="receipt">{event.signature}</pre>
            </details>
          </article>
        ))}
      </div>
    </>
  );
}
