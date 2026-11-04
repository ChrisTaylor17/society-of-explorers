import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createSqliteExec, Repository } from "../src/lib/db";
import { chainStatusText } from "../src/lib/format";
import { grantAgentScope, listAgents } from "../src/lib/domain";
import {
  GENESIS_HASH,
  canonical,
  generateLogKey,
  nextChainHash,
  signPayload,
  verifyChain,
  verifyReceipt,
  type ChainRow,
  type IndependentCheckpoint,
} from "../src/lib/receipt";
import { makePerson } from "./helpers";

function signedRow(
  privatePem: string,
  publicPem: string,
  seq: number,
  prevHash: string,
): ChainRow {
  const payload = canonical({ v: 1, seq, prevHash, eventId: `event-${seq}` });
  const signature = signPayload(privatePem, payload);
  return { seq, prev_hash: prevHash, payload, signature, public_key: publicPem };
}

function tamperSignature(signature: string): string {
  const chars = signature.split("");
  const index = chars.findIndex((char) => char !== "=");
  chars[index] = chars[index] === "A" ? "B" : "A";
  return chars.join("");
}

function legacyRow(privatePem: string, publicPem: string, eventId: string): ChainRow {
  const payload = canonical({
    v: 1,
    eventId,
    action: "grant",
    statement: "Signed before the chain fields existed.",
  });
  return {
    seq: null,
    prev_hash: null,
    payload,
    signature: signPayload(privatePem, payload),
    public_key: publicPem,
  };
}

function clearBothLinkColumns(row: ChainRow): ChainRow {
  return { ...row, seq: null, prev_hash: null };
}

function validChain(length: number) {
  const { publicPem, privatePem } = generateLogKey();
  const rows: ChainRow[] = [];
  let prev = GENESIS_HASH;
  for (let seq = 1; seq <= length; seq += 1) {
    const row = signedRow(privatePem, publicPem, seq, prev);
    rows.push(row);
    prev = nextChainHash(row.prev_hash!, row.payload, row.signature);
  }
  return { publicPem, privatePem, rows };
}

function headAfter(rows: ChainRow[], length: number): string {
  let head = GENESIS_HASH;
  for (let index = 0; index < length; index += 1) {
    const row = rows[index];
    head = nextChainHash(row.prev_hash!, row.payload, row.signature);
  }
  return head;
}

/** A fixture the test already knows. Not an anchor, and not authenticated by verifyChain. */
function syntheticCheckpoint(
  rows: ChainRow[],
  publicPem: string,
  extent: "prefix" | "exact",
  length = rows.length,
): IndependentCheckpoint {
  return {
    source: "independent",
    chainId: "synthetic-chain",
    publicKeyPem: publicPem,
    length,
    headHash: headAfter(rows, length),
    extent,
  };
}

const UNKNOWN_COMPLETENESS = {
  status: "unknown" as const,
  reason: "no-independent-checkpoint" as const,
};

describe("receipt chain links", () => {
  test("a valid chain checks out", () => {
    const { publicPem, rows } = validChain(3);
    const result = verifyChain(rows, publicPem);
    assert.deepEqual(result, {
      links: { ok: true, checked: 3, brokenAt: null, reason: null },
      unsupported: { count: 0, trusted: false },
      completeness: UNKNOWN_COMPLETENESS,
      checkpoint: null,
    });
    assert.equal(Object.prototype.hasOwnProperty.call(result, "ok"), false);
  });

  test("a tampered link fails and the signature of that record still checks out", () => {
    const { publicPem, rows } = validChain(3);
    const tampered = rows.map((row, index) =>
      index === 1 ? { ...row, prev_hash: "ab".repeat(32) } : row,
    );
    const result = verifyChain(tampered, publicPem);
    assert.equal(result.links.ok, false);
    assert.equal(result.links.brokenAt, 1);
    assert.equal(result.links.reason, "prev_hash");
    assert.notEqual(result.links.reason, "signature");
    assert.equal(verifyReceipt(tampered[1].payload, tampered[1].signature, publicPem), true);
  });

  test("a missing link at record 0 is not a signature failure", () => {
    const { publicPem, rows } = validChain(2);
    const broken = rows.map((row, index) => (index === 0 ? { ...row, prev_hash: null } : row));
    const result = verifyChain(broken, publicPem);
    assert.equal(result.links.ok, false);
    assert.equal(result.links.checked, 0);
    assert.equal(result.links.brokenAt, 0);
    assert.equal(result.links.reason, "missing link");
    assert.notEqual(result.links.reason, "signature");
    assert.equal(verifyReceipt(broken[0].payload, broken[0].signature, publicPem), true);
  });

  test("a missing link later stays at that later record", () => {
    const { publicPem, rows } = validChain(3);
    const broken = rows.map((row, index) => (index === 2 ? { ...row, prev_hash: null } : row));
    const result = verifyChain(broken, publicPem);
    assert.equal(result.links.ok, false);
    assert.equal(result.links.brokenAt, 2);
    assert.equal(result.links.reason, "missing link");
    assert.notEqual(result.links.reason, "signature");
    assert.equal(verifyReceipt(broken[2].payload, broken[2].signature, publicPem), true);
  });

  test("a signed pre-chain payload stays outside the chain and is not reported as verified", () => {
    const { publicPem, privatePem, rows } = validChain(2);
    const legacy = legacyRow(privatePem, publicPem, "before-chain");
    assert.equal(verifyReceipt(legacy.payload, legacy.signature, publicPem), true);
    assert.equal(JSON.parse(legacy.payload).seq, undefined);
    assert.equal(JSON.parse(legacy.payload).prevHash, undefined);
    const result = verifyChain([legacy, ...rows], publicPem);
    assert.equal(result.links.ok, true);
    assert.equal(result.links.checked, 2);
    assert.equal(result.links.brokenAt, null);
    assert.equal(result.unsupported.count, 1);
    assert.equal(result.unsupported.trusted, false);
    assert.deepEqual(result.completeness, UNKNOWN_COMPLETENESS);
    assert.equal(Object.prototype.hasOwnProperty.call(result, "ok"), false);
    assert.equal(
      chainStatusText(result),
      "Links checked: 2 linked receipts consistent. Unsupported rows: 1. They are not verified, and a verifying signature does not make a legacy-shaped payload trusted history. Completeness: unknown. No independent checkpoint is configured, so a deleted suffix would not be detected.",
    );
  });

  test("an empty linked subset does not claim the excluded receipts were verified", () => {
    const { publicPem, privatePem } = generateLogKey();
    const rows = [legacyRow(privatePem, publicPem, "old-1"), legacyRow(privatePem, publicPem, "old-2")];
    const result = verifyChain(rows, publicPem);
    assert.deepEqual(result, {
      links: { ok: true, checked: 0, brokenAt: null, reason: null },
      unsupported: { count: 2, trusted: false },
      completeness: UNKNOWN_COMPLETENESS,
      checkpoint: null,
    });
    assert.equal(Object.prototype.hasOwnProperty.call(result, "ok"), false);
    assert.equal(
      chainStatusText(result),
      "Links checked: 0 linked receipts consistent. Unsupported rows: 2. They are not verified, and a verifying signature does not make a legacy-shaped payload trusted history. Completeness: unknown. No independent checkpoint is configured, so a deleted suffix would not be detected.",
    );
    assert.equal(chainStatusText(result).includes("Chain checks out"), false);
  });

  test("an invalid pre-chain signature is not excluded as legacy", () => {
    const { publicPem, privatePem, rows } = validChain(1);
    const legacy = legacyRow(privatePem, publicPem, "before-chain");
    const forged = { ...legacy, signature: tamperSignature(legacy.signature) };
    assert.equal(verifyReceipt(forged.payload, forged.signature, publicPem), false);
    const alone = verifyChain([forged], publicPem);
    assert.equal(alone.links.ok, false);
    assert.equal(alone.unsupported.count, 0);
    assert.equal(alone.links.brokenAt, 0);
    assert.equal(alone.links.reason, "signature");
    assert.notEqual(alone.links.reason, "missing link");
    const ahead = verifyChain([forged, ...rows], publicPem);
    assert.equal(ahead.links.ok, false);
    assert.equal(ahead.unsupported.count, 0);
    assert.equal(ahead.links.reason, "signature");
    assert.equal(ahead.links.brokenAt, 0);
  });

  test("a malformed row with empty link columns is not treated as legacy", () => {
    const { publicPem, rows } = validChain(1);
    const malformed: ChainRow = {
      seq: null,
      prev_hash: null,
      payload: "not-json",
      signature: "not-a-signature",
      public_key: publicPem,
    };
    const result = verifyChain([malformed, ...rows], publicPem);
    assert.equal(result.links.ok, false);
    assert.equal(result.unsupported.count, 0);
    assert.equal(result.links.brokenAt, 0);
    assert.equal(result.links.reason, "payload");
  });

  test("clearing both link columns on the last chained row is not a successful chain", () => {
    const { publicPem, rows } = validChain(3);
    const damaged = rows.map((row, index) => (index === rows.length - 1 ? clearBothLinkColumns(row) : row));
    const target = damaged[damaged.length - 1];
    assert.equal(target.seq, null);
    assert.equal(target.prev_hash, null);
    assert.equal(typeof JSON.parse(target.payload).seq, "number");
    assert.equal(typeof JSON.parse(target.payload).prevHash, "string");
    assert.equal(verifyReceipt(target.payload, target.signature, publicPem), true);
    const result = verifyChain(damaged, publicPem);
    assert.equal(result.links.ok, false);
    assert.equal(result.unsupported.count, 0);
    assert.equal(result.links.brokenAt, 2);
    assert.equal(result.links.reason, "missing link");
    assert.notEqual(result.links.reason, "signature");
    assert.equal(chainStatusText(result).startsWith("Links do not check out at record 2. missing link."), true);
    assert.deepEqual(result.completeness, UNKNOWN_COMPLETENESS);
    assert.equal(Object.prototype.hasOwnProperty.call(result, "ok"), false);
  });

  test("clearing both link columns on a single-row chain is not a successful chain", () => {
    const { publicPem, rows } = validChain(1);
    const damaged = [clearBothLinkColumns(rows[0])];
    assert.equal(verifyReceipt(damaged[0].payload, damaged[0].signature, publicPem), true);
    assert.equal(typeof JSON.parse(damaged[0].payload).prevHash, "string");
    const result = verifyChain(damaged, publicPem);
    assert.equal(result.links.ok, false);
    assert.equal(result.links.checked, 0);
    assert.equal(result.unsupported.count, 0);
    assert.equal(result.links.brokenAt, 0);
    assert.equal(result.links.reason, "missing link");
    assert.notEqual(result.links.reason, "signature");
  });

  test("clearing a later row's sequence is not reported as a missing link at record 0", async () => {
    const exec = createSqliteExec(":memory:");
    const repo = new Repository(exec);
    await repo.migrate();
    const ada = await makePerson(repo, "adaone");
    const agents = await listAgents(repo, ada.person.id);
    const extra = await grantAgentScope(repo, ada.person.id, agents[0].id, "draft_plans");
    assert.equal(extra.ok, true);
    const before = await repo.auditChain();
    assert.ok(before.length >= 2);
    const intact = verifyChain(before, before[0].public_key);
    assert.equal(intact.links.ok, true);
    assert.deepEqual(intact.completeness, UNKNOWN_COMPLETENESS);
    assert.equal(Object.prototype.hasOwnProperty.call(intact, "ok"), false);

    const later = before[before.length - 1];
    await exec.run("UPDATE audit_events SET seq = NULL WHERE id = ?", [later.id]);
    const after = await repo.auditChain();
    assert.equal(after[0].seq, 1);
    assert.equal(after[after.length - 1].id, later.id);
    assert.equal(after[after.length - 1].seq, null);

    const result = verifyChain(after, before[0].public_key);
    assert.equal(result.links.ok, false);
    assert.equal(result.links.reason, "missing link");
    assert.notEqual(result.links.reason, "signature");
    assert.equal(result.links.brokenAt, after.length - 1);
    assert.notEqual(result.links.brokenAt, 0);
    assert.equal(verifyReceipt(later.payload, later.signature, before[0].public_key), true);
  });

  test("clearing both stored columns on the last row keeps that signed receipt in the chain", async () => {
    const exec = createSqliteExec(":memory:");
    const repo = new Repository(exec);
    await repo.migrate();
    const ada = await makePerson(repo, "adaone");
    const agents = await listAgents(repo, ada.person.id);
    const extra = await grantAgentScope(repo, ada.person.id, agents[0].id, "draft_plans");
    assert.equal(extra.ok, true);
    const before = await repo.auditChain();
    const later = before[before.length - 1];
    const parsed = JSON.parse(later.payload) as { seq?: number; prevHash?: string };
    assert.equal(typeof parsed.seq, "number");
    assert.equal(typeof parsed.prevHash, "string");
    await exec.run("UPDATE audit_events SET seq = NULL, prev_hash = NULL WHERE id = ?", [later.id]);
    const after = await repo.auditChain();
    const stored = after.find((row) => row.id === later.id);
    assert.ok(stored);
    assert.equal(stored.seq, null);
    assert.equal(stored.prev_hash, null);
    assert.equal(stored.payload, later.payload);
    const result = verifyChain(after, before[0].public_key);
    assert.equal(result.links.ok, false);
    assert.equal(result.unsupported.count, 0);
    assert.equal(result.links.reason, "missing link");
    assert.equal(result.links.brokenAt, after.length - 1);
    assert.equal(verifyReceipt(stored.payload, stored.signature, before[0].public_key), true);
  });

  test("clearing both stored columns on the only chained row is not an empty success", async () => {
    const exec = createSqliteExec(":memory:");
    const repo = new Repository(exec);
    await repo.migrate();
    const ada = await makePerson(repo, "adaone");
    const before = await repo.auditChain();
    assert.ok(before.length >= 1);
    const only = before[0];
    await exec.run("DELETE FROM audit_events WHERE id != ?", [only.id]);
    await exec.run("UPDATE audit_events SET seq = NULL, prev_hash = NULL WHERE id = ?", [only.id]);
    const after = await repo.auditChain();
    assert.equal(after.length, 1);
    assert.equal(after[0].payload, only.payload);
    assert.equal(typeof JSON.parse(after[0].payload).seq, "number");
    const result = verifyChain(after, before[0].public_key);
    assert.equal(result.links.ok, false);
    assert.equal(result.links.checked, 0);
    assert.equal(result.unsupported.count, 0);
    assert.equal(result.links.brokenAt, 0);
    assert.equal(result.links.reason, "missing link");
    assert.equal(verifyReceipt(after[0].payload, after[0].signature, before[0].public_key), true);
    assert.equal(typeof ada.person.id, "string");
  });

  test("an empty chain has no linked receipts and unknown completeness", () => {
    const { publicPem } = generateLogKey();
    const result = verifyChain([], publicPem);
    assert.deepEqual(result.links, { ok: true, checked: 0, brokenAt: null, reason: null });
    assert.deepEqual(result.unsupported, { count: 0, trusted: false });
    assert.deepEqual(result.completeness, UNKNOWN_COMPLETENESS);
    assert.equal(result.checkpoint, null);
    assert.equal(Object.prototype.hasOwnProperty.call(result, "ok"), false);
  });

  test("deleting a suffix leaves valid signatures and links while completeness stays unknown", () => {
    const { publicPem, rows } = validChain(3);
    const prefix = rows.slice(0, 2);
    const result = verifyChain(prefix, publicPem);
    assert.equal(result.links.ok, true);
    assert.equal(result.links.checked, 2);
    assert.equal(result.links.reason, null);
    assert.equal(result.unsupported.count, 0);
    assert.deepEqual(result.completeness, UNKNOWN_COMPLETENESS);
    assert.equal(result.checkpoint, null);
    assert.equal(Object.prototype.hasOwnProperty.call(result, "ok"), false);
    for (const row of prefix) {
      assert.equal(verifyReceipt(row.payload, row.signature, publicPem), true);
    }
    assert.equal(chainStatusText(result).includes("deleted suffix would not be detected"), true);
    assert.equal(chainStatusText(result).includes("Chain checks out"), false);
  });

  test("rewriting a chained payload into a legacy shape and re-signing is not trusted history", () => {
    const { publicPem, privatePem, rows } = validChain(3);
    const legacyPayload = canonical({
      v: 1,
      eventId: "rewritten",
      action: "grant",
      statement: "Rewritten after the fact into a pre-chain shape.",
    });
    const rewritten: ChainRow = {
      seq: null,
      prev_hash: null,
      payload: legacyPayload,
      signature: signPayload(privatePem, legacyPayload),
      public_key: publicPem,
    };
    assert.equal(verifyReceipt(rewritten.payload, rewritten.signature, publicPem), true);
    const result = verifyChain([...rows.slice(0, 2), rewritten], publicPem);
    assert.equal(result.links.ok, true);
    assert.equal(result.links.checked, 2);
    assert.equal(result.unsupported.count, 1);
    assert.equal(result.unsupported.trusted, false);
    assert.deepEqual(result.completeness, UNKNOWN_COMPLETENESS);
    assert.equal(Object.prototype.hasOwnProperty.call(result, "ok"), false);

    const other = generateLogKey();
    const otherSigned: ChainRow = {
      ...rewritten,
      signature: signPayload(other.privatePem, legacyPayload),
      public_key: other.publicPem,
    };
    assert.equal(verifyReceipt(otherSigned.payload, otherSigned.signature, other.publicPem), true);
    assert.equal(verifyReceipt(otherSigned.payload, otherSigned.signature, publicPem), false);
    const foreign = verifyChain([...rows.slice(0, 2), otherSigned], publicPem);
    assert.equal(foreign.links.ok, true);
    assert.equal(foreign.unsupported.count, 1);
    assert.equal(foreign.unsupported.trusted, false);
    assert.deepEqual(foreign.completeness, UNKNOWN_COMPLETENESS);
  });

  test("a linked row re-signed by another key has a valid signature and an untrusted signer", () => {
    const { publicPem, rows } = validChain(2);
    const other = generateLogKey();
    const target = rows[1];
    const resigned: ChainRow = {
      ...target,
      signature: signPayload(other.privatePem, target.payload),
      public_key: other.publicPem,
    };
    assert.equal(verifyReceipt(resigned.payload, resigned.signature, other.publicPem), true);
    assert.equal(verifyReceipt(resigned.payload, resigned.signature, publicPem), false);
    const result = verifyChain([rows[0], resigned], publicPem);
    assert.equal(result.links.ok, false);
    assert.equal(result.links.reason, "untrusted signer");
    assert.notEqual(result.links.reason, "signature");
    assert.equal(result.links.brokenAt, 1);
    assert.equal(result.unsupported.count, 0);
    assert.deepEqual(result.completeness, UNKNOWN_COMPLETENESS);
  });
});

describe("synthetic checkpoint interface", () => {
  test("a suffix deletion is a short mismatch only when a synthetic exact checkpoint is supplied", () => {
    const { publicPem, rows } = validChain(3);
    const prefix = rows.slice(0, 2);
    const checkpoint = syntheticCheckpoint(rows, publicPem, "exact", 3);
    const result = verifyChain(prefix, publicPem, {
      independentCheckpoint: checkpoint,
      expectedChainId: "synthetic-chain",
    });
    assert.equal(result.links.ok, true);
    assert.equal(result.links.checked, 2);
    assert.deepEqual(result.completeness, { status: "mismatch", reason: "short" });
    assert.deepEqual(result.checkpoint, {
      authenticatedByThisModule: false,
      chainId: "synthetic-chain",
      extent: "exact",
    });
    assert.equal(Object.prototype.hasOwnProperty.call(result, "ok"), false);
  });

  test("an exact synthetic checkpoint matches only the full linked log", () => {
    const { publicPem, rows } = validChain(3);
    const result = verifyChain(rows, publicPem, {
      independentCheckpoint: syntheticCheckpoint(rows, publicPem, "exact"),
      expectedChainId: "synthetic-chain",
    });
    assert.equal(result.links.ok, true);
    assert.deepEqual(result.completeness, { status: "exact", reason: null });
    assert.equal(result.checkpoint?.authenticatedByThisModule, false);
    assert.match(chainStatusText(result), /did not authenticate that checkpoint/);
  });

  test("a prefix checkpoint reports the prefix and not the whole log", () => {
    const { publicPem, rows } = validChain(3);
    const result = verifyChain(rows, publicPem, {
      independentCheckpoint: syntheticCheckpoint(rows, publicPem, "prefix", 2),
      expectedChainId: "synthetic-chain",
    });
    assert.equal(result.links.ok, true);
    assert.equal(result.links.checked, 3);
    assert.deepEqual(result.completeness, { status: "prefix", reason: null });
    assert.equal(result.checkpoint?.extent, "prefix");
    assert.equal(result.checkpoint?.authenticatedByThisModule, false);
  });

  test("an exact checkpoint shorter than the linked log is extra", () => {
    const { publicPem, rows } = validChain(3);
    const result = verifyChain(rows, publicPem, {
      independentCheckpoint: syntheticCheckpoint(rows, publicPem, "exact", 2),
      expectedChainId: "synthetic-chain",
    });
    assert.equal(result.links.ok, true);
    assert.deepEqual(result.completeness, { status: "mismatch", reason: "extra" });
  });

  test("a later broken link keeps a matching prefix checkpoint as prefix and an exact one as links", () => {
    const { publicPem, rows } = validChain(3);
    const broken = rows.map((row, index) => (index === 2 ? { ...row, prev_hash: null } : row));
    const prefix = verifyChain(broken, publicPem, {
      independentCheckpoint: syntheticCheckpoint(rows, publicPem, "prefix", 2),
      expectedChainId: "synthetic-chain",
    });
    assert.equal(prefix.links.ok, false);
    assert.equal(prefix.links.brokenAt, 2);
    assert.deepEqual(prefix.completeness, { status: "prefix", reason: null });
    const exact = verifyChain(broken, publicPem, {
      independentCheckpoint: syntheticCheckpoint(rows, publicPem, "exact", 2),
      expectedChainId: "synthetic-chain",
    });
    assert.equal(exact.links.ok, false);
    assert.deepEqual(exact.completeness, { status: "mismatch", reason: "links" });
  });

  test("the wrong key or chain id does not bless the log", () => {
    const { publicPem, rows } = validChain(2);
    const other = generateLogKey();
    const wrongKey = verifyChain(rows, publicPem, {
      independentCheckpoint: { ...syntheticCheckpoint(rows, publicPem, "exact"), publicKeyPem: other.publicPem },
      expectedChainId: "synthetic-chain",
    });
    assert.equal(wrongKey.links.ok, true);
    assert.deepEqual(wrongKey.completeness, { status: "mismatch", reason: "checkpoint key" });
    assert.equal(wrongKey.checkpoint?.authenticatedByThisModule, false);

    const wrongChain = verifyChain(rows, publicPem, {
      independentCheckpoint: syntheticCheckpoint(rows, publicPem, "exact"),
      expectedChainId: "other-chain",
    });
    assert.equal(wrongChain.links.ok, true);
    assert.deepEqual(wrongChain.completeness, { status: "mismatch", reason: "checkpoint chain" });

    const missingId = verifyChain(rows, publicPem, {
      independentCheckpoint: syntheticCheckpoint(rows, publicPem, "exact"),
    });
    assert.deepEqual(missingId.completeness, { status: "mismatch", reason: "checkpoint chain" });
  });

  test("a caller-provided blob without an independent source stays completeness unknown", () => {
    const { publicPem, rows } = validChain(2);
    const blob = { ...syntheticCheckpoint(rows, publicPem, "exact"), source: "caller-json" };
    const result = verifyChain(rows, publicPem, {
      independentCheckpoint: blob as IndependentCheckpoint,
      expectedChainId: "synthetic-chain",
    });
    assert.equal(result.links.ok, true);
    assert.deepEqual(result.completeness, UNKNOWN_COMPLETENESS);
    assert.equal(result.checkpoint, null);
    assert.equal(Object.prototype.hasOwnProperty.call(result, "ok"), false);
  });

  test("an empty or all-legacy chain cannot satisfy a synthetic length", () => {
    const { publicPem, privatePem } = generateLogKey();
    const checkpoint: IndependentCheckpoint = {
      source: "independent",
      chainId: "synthetic-chain",
      publicKeyPem: publicPem,
      length: 1,
      headHash: "ab".repeat(32),
      extent: "exact",
    };
    const empty = verifyChain([], publicPem, { independentCheckpoint: checkpoint, expectedChainId: "synthetic-chain" });
    assert.deepEqual(empty.completeness, { status: "mismatch", reason: "short" });
    const legacy = verifyChain(
      [legacyRow(privatePem, publicPem, "old-1"), legacyRow(privatePem, publicPem, "old-2")],
      publicPem,
      { independentCheckpoint: checkpoint, expectedChainId: "synthetic-chain" },
    );
    assert.equal(legacy.links.ok, true);
    assert.equal(legacy.links.checked, 0);
    assert.equal(legacy.unsupported.trusted, false);
    assert.deepEqual(legacy.completeness, { status: "mismatch", reason: "short" });
  });
});

describe("individual receipt signatures", () => {
  test("a valid signature checks out", () => {
    const { publicPem, privatePem } = generateLogKey();
    const payload = canonical({ v: 1, eventId: "one", note: "synthetic" });
    const signature = signPayload(privatePem, payload);
    assert.equal(verifyReceipt(payload, signature, publicPem), true);
  });

  test("a tampered signature does not check out", () => {
    const { publicPem, privatePem } = generateLogKey();
    const payload = canonical({ v: 1, eventId: "one", note: "synthetic" });
    const signature = signPayload(privatePem, payload);
    const tampered = tamperSignature(signature);
    assert.notEqual(tampered, signature);
    assert.equal(verifyReceipt(payload, tampered, publicPem), false);
    assert.equal(verifyReceipt(payload + " ", signature, publicPem), false);
  });

  test("a chain-link failure is a different result from a signature failure", () => {
    const { publicPem, rows } = validChain(2);
    const linkFailure = verifyChain(
      rows.map((row, index) => (index === 0 ? { ...row, prev_hash: null } : row)),
      publicPem,
    );
    const signatureFailure = verifyChain(
      rows.map((row, index) => (index === 0 ? { ...row, signature: tamperSignature(row.signature) } : row)),
      publicPem,
    );
    assert.equal(linkFailure.links.reason, "missing link");
    assert.equal(signatureFailure.links.reason, "signature");
    assert.notEqual(linkFailure.links.reason, signatureFailure.links.reason);
    assert.equal(linkFailure.links.brokenAt, 0);
    assert.equal(signatureFailure.links.brokenAt, 0);
    assert.equal(linkFailure.completeness.status, "unknown");
    assert.equal(signatureFailure.completeness.status, "unknown");
    assert.equal(verifyReceipt(rows[0].payload, rows[0].signature, publicPem), true);
    assert.equal(verifyReceipt(rows[0].payload, tamperSignature(rows[0].signature), publicPem), false);
  });
});
