import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { generateLogKey, signingMaterial, verifyChain } from "../src/lib/receipt";
import { grantAgentScope, listAgents } from "../src/lib/domain";
import { makePerson, testRepo } from "./helpers";
import type { Repository } from "../src/lib/db";

describe("signing key and receipt chain", () => {
  let repo: Repository;

  beforeEach(async () => {
    repo = await testRepo();
  });

  test("an escaped PEM in the environment still loads", () => {
    const previous = process.env.MERIDIAN_SIGNING_PRIVATE_KEY;
    const key = generateLogKey();
    process.env.MERIDIAN_SIGNING_PRIVATE_KEY = key.privatePem.replace(/\n/g, "\\n");
    try {
      assert.equal(signingMaterial()?.publicPem, key.publicPem);
    } finally {
      process.env.MERIDIAN_SIGNING_PRIVATE_KEY = previous;
    }
  });

  test("migrate deletes a private key planted in the database", async () => {
    await repo.plantSigner(generateLogKey().privatePem);
    assert.equal((await repo.storedPrivateKeys()).length, 1);
    await repo.migrate();
    assert.deepEqual(await repo.storedPrivateKeys(), []);
  });

  test("a missing signing key refuses a new grant and writes nothing", async () => {
    const ada = await makePerson(repo, "adaone");
    const agents = await listAgents(repo, ada.person.id);
    const before = await repo.auditChain();
    const previous = process.env.MERIDIAN_SIGNING_PRIVATE_KEY;
    delete process.env.MERIDIAN_SIGNING_PRIVATE_KEY;
    try {
      assert.equal(signingMaterial(), null);
      const result = await grantAgentScope(repo, ada.person.id, agents[0].id, "draft_plans");
      assert.equal(result.ok, false);
      assert.match(result.ok ? "" : result.error, /signing key/i);
    } finally {
      process.env.MERIDIAN_SIGNING_PRIVATE_KEY = previous;
    }
    assert.equal((await repo.auditChain()).length, before.length);
    const grants = await repo.permissionsForGrantor(ada.person.id);
    assert.equal(
      grants.some((row) => row.scope === "draft_plans" && row.status === "active"),
      false,
    );
  });

  test("the chain verifies, and a deletion or reorder does not", async () => {
    await makePerson(repo, "adaone");
    await makePerson(repo, "julesone");
    const rows = await repo.auditChain();
    assert.ok(rows.length >= 4);
    const key = signingMaterial()!.publicPem;
    const intact = verifyChain(rows, key);
    assert.equal(intact.links.ok, true);
    assert.equal(intact.links.checked, rows.length);
    assert.equal(intact.completeness.status, "unknown");
    assert.equal(Object.prototype.hasOwnProperty.call(intact, "ok"), false);

    const deleted = rows.filter((_, index) => index !== 1);
    const missing = verifyChain(deleted, key);
    assert.equal(missing.links.ok, false);

    const reordered = [rows[1], rows[0], ...rows.slice(2)];
    const swapped = verifyChain(reordered, key);
    assert.equal(swapped.links.ok, false);

    const tampered = rows.map((row, index) =>
      index === 1 ? { ...row, prev_hash: "f".repeat(64) } : row,
    );
    assert.equal(verifyChain(tampered, key).links.ok, false);
  });
});
