import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { makePerson, testRepo } from "./helpers";
import { resetWorld, seedIfEmpty } from "../src/lib/seed";
import type { Repository } from "../src/lib/db";

describe("reset", () => {
  let repo: Repository;

  beforeEach(async () => {
    repo = await testRepo();
    await seedIfEmpty(repo);
  });

  test("refuses a reset with no signed-in person", async () => {
    const result = await resetWorld(repo, null, process.env.MERIDIAN_RESET_SECRET ?? "");
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.error, /sign in/i);
    assert.equal(await repo.countPeople(), 5);
  });

  test("fails closed when the server secret is missing", async () => {
    const extra = await makePerson(repo, "extraone");
    const previous = process.env.MERIDIAN_RESET_SECRET;
    delete process.env.MERIDIAN_RESET_SECRET;
    try {
      const result = await resetWorld(repo, extra.person.id, previous ?? "");
      assert.equal(result.ok, false);
      assert.match(result.ok ? "" : result.error, /turned off/i);
    } finally {
      process.env.MERIDIAN_RESET_SECRET = previous;
    }
    assert.ok(await repo.credentials("extraone"));
  });

  test("rejects a wrong secret, including the old public phrase", async () => {
    const extra = await makePerson(repo, "extraone");
    const wrong = await resetWorld(repo, extra.person.id, "reset-the-grove");
    assert.equal(wrong.ok, false);
    assert.ok(await repo.credentials("extraone"));
    assert.equal(await repo.countPeople(), 6);
  });

  test("a signed-in person with the server secret reloads the five seeded people", async () => {
    const extra = await makePerson(repo, "extraone");
    const result = await resetWorld(repo, extra.person.id, process.env.MERIDIAN_RESET_SECRET ?? "");
    assert.equal(result.ok, true);
    assert.equal(await repo.countPeople(), 5);
    assert.equal(await repo.credentials("extraone"), undefined);
    assert.ok(await repo.credentials("ada"));
  });
});
