import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";

export const GENESIS_HASH = "0".repeat(64);

export type ReceiptBody = {
  v: 1;
  eventId: string;
  seq: number;
  prevHash: string;
  action: "grant" | "revoke";
  statement: string;
  actorId: string;
  actorName: string;
  granteeKind: "person" | "agent";
  granteeId: string;
  granteeName: string;
  scope: string;
  resourceId: string;
  resourceLabel: string;
  at: string;
};

export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(obj[key])}`).join(",")}}`;
}

export function generateLogKey(): { publicPem: string; privatePem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privatePem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

export function publicPemFromPrivate(privatePem: string): string {
  const privateKey = createPrivateKey(privatePem);
  const publicKey = createPublicKey(privateKey);
  return publicKey.export({ type: "spki", format: "pem" }).toString();
}

/** The log key lives only in the environment. A missing or unreadable key fails closed. */
export function signingMaterial(): { privatePem: string; publicPem: string } | null {
  const raw = process.env.MERIDIAN_SIGNING_PRIVATE_KEY?.trim();
  const privatePem = raw?.replace(/\\n/g, "\n");
  if (!privatePem) return null;
  try {
    return { privatePem, publicPem: publicPemFromPrivate(privatePem) };
  } catch {
    return null;
  }
}

export function nextChainHash(prevHash: string, payload: string, signature: string): string {
  return createHash("sha256").update(prevHash).update("\n").update(payload).update("\n").update(signature).digest("hex");
}

export type ChainRow = {
  seq: number | null;
  prev_hash: string | null;
  payload: string;
  signature: string;
  public_key: string;
};

/**
 * Checkpoint trust model. This module does not authenticate checkpoints and
 * does not create one from the log key or the same database.
 *
 * A checkpoint may be supplied only by a caller that already trusts it from an
 * independent source. Required fields:
 * - source: the literal "independent" (any other value is ignored)
 * - chainId: identity of the log, compared with expectedChainId from that same caller
 * - publicKeyPem: must equal the verification key; the checkpoint does not choose the key
 * - length: number of linked receipts committed
 * - headHash: nextChainHash of the last committed linked receipt
 * - extent: "prefix" means that committed prefix is present; "exact" means the linked
 *   log is that length and no longer
 *
 * No checkpoint: completeness is unknown. A valid shorter prefix is not proof the
 * suffix is still there. Trust provisioning is a later decision; this demo has none.
 */
export type IndependentCheckpoint = {
  source: "independent";
  chainId: string;
  publicKeyPem: string;
  length: number;
  headHash: string;
  extent: "prefix" | "exact";
};

export type ChainReport = {
  links: {
    ok: boolean;
    checked: number;
    brokenAt: number | null;
    reason: "missing link" | "sequence" | "prev_hash" | "payload" | "payload link" | "signature" | "untrusted signer" | null;
  };
  /** Legacy-shaped rows left out of the walk. trusted is always false. */
  unsupported: { count: number; trusted: false };
  completeness:
    | { status: "unknown"; reason: "no-independent-checkpoint" }
    | { status: "prefix"; reason: null }
    | { status: "exact"; reason: null }
    | { status: "mismatch"; reason: "checkpoint key" | "checkpoint chain" | "checkpoint length" | "short" | "head" | "extra" | "links" };
  /** Null when no independent checkpoint was supplied. This module never sets authenticatedByThisModule to true. */
  checkpoint: { authenticatedByThisModule: false; chainId: string; extent: "prefix" | "exact" } | null;
};

export type VerifyChainOptions = {
  independentCheckpoint?: IndependentCheckpoint | null;
  expectedChainId?: string;
};

function payloadRecord(payload: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(payload) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function signedPayloadHasChainLink(body: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(body, "seq") || Object.prototype.hasOwnProperty.call(body, "prevHash");
}

/** Legacy means the signed payload predates chain fields. Null storage columns are not evidence. */
function isLegacyReceipt(row: ChainRow): boolean {
  if (row.seq != null || row.prev_hash != null) return false;
  const body = payloadRecord(row.payload);
  if (!body || signedPayloadHasChainLink(body)) return false;
  return verifyReceipt(row.payload, row.signature, row.public_key);
}

function judgeCompleteness(
  heads: string[],
  linkedCount: number,
  linksOk: boolean,
  currentPublicKey: string,
  checkpoint: IndependentCheckpoint | null,
  expectedChainId: string | undefined,
): ChainReport["completeness"] {
  if (!checkpoint || checkpoint.source !== "independent") {
    return { status: "unknown", reason: "no-independent-checkpoint" };
  }
  if (checkpoint.publicKeyPem !== currentPublicKey) return { status: "mismatch", reason: "checkpoint key" };
  if (!expectedChainId || checkpoint.chainId !== expectedChainId) return { status: "mismatch", reason: "checkpoint chain" };
  if (!Number.isInteger(checkpoint.length) || checkpoint.length < 1) return { status: "mismatch", reason: "checkpoint length" };
  if (checkpoint.length > heads.length) return { status: "mismatch", reason: "short" };
  if (heads[checkpoint.length - 1] !== checkpoint.headHash) return { status: "mismatch", reason: "head" };
  if (checkpoint.extent === "prefix") return { status: "prefix", reason: null };
  if (!linksOk) return { status: "mismatch", reason: "links" };
  if (linkedCount > checkpoint.length) return { status: "mismatch", reason: "extra" };
  if (linkedCount < checkpoint.length) return { status: "mismatch", reason: "short" };
  return { status: "exact", reason: null };
}

export function verifyChain(rows: ChainRow[], currentPublicKey: string, options?: VerifyChainOptions): ChainReport {
  const supplied = options?.independentCheckpoint;
  const checkpoint = supplied?.source === "independent" ? supplied : null;
  const unsupportedCount = rows.filter((row) => isLegacyReceipt(row)).length;
  const linked = rows.filter((row) => !isLegacyReceipt(row));
  const heads: string[] = [];
  let expectedPrev = GENESIS_HASH;
  let expectedSeq = 1;
  let links: ChainReport["links"] = { ok: true, checked: linked.length, brokenAt: null, reason: null };
  for (let index = 0; index < linked.length; index += 1) {
    const row = linked[index];
    const stop = (reason: ChainReport["links"]["reason"]): boolean => {
      links = { ok: false, checked: index, brokenAt: index, reason };
      return true;
    };
    if (row.seq == null && row.prev_hash == null) {
      const body = payloadRecord(row.payload);
      if (!body) {
        stop("payload");
        break;
      }
      if (!signedPayloadHasChainLink(body)) {
        stop("signature");
        break;
      }
      stop("missing link");
      break;
    }
    if (row.seq == null || row.prev_hash == null) {
      stop("missing link");
      break;
    }
    if (row.seq !== expectedSeq) {
      stop("sequence");
      break;
    }
    if (row.prev_hash !== expectedPrev) {
      stop("prev_hash");
      break;
    }
    let body: { prevHash?: string; seq?: number };
    try {
      body = JSON.parse(row.payload) as { prevHash?: string; seq?: number };
    } catch {
      stop("payload");
      break;
    }
    if (body.prevHash !== expectedPrev || body.seq !== expectedSeq) {
      stop("payload link");
      break;
    }
    const verdict = assessReceipt(row.payload, row.signature, row.public_key, currentPublicKey);
    if (!verdict.signatureOk) {
      stop("signature");
      break;
    }
    if (!verdict.currentKey) {
      stop("untrusted signer");
      break;
    }
    expectedPrev = nextChainHash(row.prev_hash, row.payload, row.signature);
    heads.push(expectedPrev);
    expectedSeq += 1;
  }
  return {
    links,
    unsupported: { count: unsupportedCount, trusted: false },
    completeness: judgeCompleteness(heads, linked.length, links.ok, currentPublicKey, checkpoint, options?.expectedChainId),
    checkpoint: checkpoint
      ? { authenticatedByThisModule: false, chainId: checkpoint.chainId, extent: checkpoint.extent }
      : null,
  };
}

/** A pasted receipt is checked only against the configured log key. There is no separate success flag. */
export function pastedReceipt(
  payload: string,
  signature: string,
  currentPublicKey: string,
): { signatureValid: boolean; signerTrusted: boolean } {
  const signatureValid = verifyReceipt(payload, signature, currentPublicKey);
  return { signatureValid, signerTrusted: signatureValid };
}

export function signPayload(privatePem: string, payload: string): string {
  const key: KeyObject = createPrivateKey(privatePem);
  return sign(null, Buffer.from(payload), key).toString("base64");
}

export function verifyReceipt(
  payload: string,
  signatureB64: string,
  publicKeyPem: string,
): boolean {
  try {
    const key = createPublicKey(publicKeyPem);
    return verify(null, Buffer.from(payload), key, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

export type ReceiptVerdict = {
  signatureOk: boolean;
  currentKey: boolean;
  valid: boolean;
};

/** A receipt counts only when the signature matches the current Meridian log key. */
export function assessReceipt(
  payload: string,
  signature: string,
  embeddedPublicKey: string,
  currentPublicKey: string,
): ReceiptVerdict {
  const signatureOk = verifyReceipt(payload, signature, embeddedPublicKey);
  const currentKey = embeddedPublicKey === currentPublicKey;
  return { signatureOk, currentKey, valid: signatureOk && currentKey };
}
