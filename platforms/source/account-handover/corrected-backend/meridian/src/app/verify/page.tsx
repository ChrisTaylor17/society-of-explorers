import { ErrorNote } from "@/components/Shell";
import { logPublicKey } from "@/lib/domain";
import { chainStatusText } from "@/lib/format";
import { signingMaterial, verifyChain } from "@/lib/receipt";
import { ready } from "@/lib/ready";
import { VerifyForm } from "@/components/VerifyForm";

export const metadata = { title: "Verify" };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const material = signingMaterial();
  const publicKey = await logPublicKey();
  const { repo } = await ready();
  const chain = material ? verifyChain(await repo.auditChain(), material.publicPem) : null;
  return (
    <>
      <p className="eyebrow">Receipts</p>
      <h1>Check a signature.</h1>
      <p className="lede">The public key comes from the server environment. Link checks, unsupported rows, and completeness are reported separately. There is no independent checkpoint, so a deleted suffix is not detected. A legacy-shaped payload is not trusted history. Revoking stops future sharing; it can't erase what was already seen.</p>
      <ErrorNote error={error} />
      {!publicKey ? <p className="error" role="alert">The signing key is not configured.</p> : null}
      {chain ? (
        <p className={chain.links.ok ? undefined : "error"} role="status">
          {chainStatusText(chain)}
        </p>
      ) : null}
      {publicKey ? (
        <details className="card">
          <summary>Public key</summary>
          <pre className="receipt">{publicKey}</pre>
        </details>
      ) : null}
      <VerifyForm />
    </>
  );
}
