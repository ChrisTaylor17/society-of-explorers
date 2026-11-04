import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import {
  personForToken,
  rotateIfDue,
  SESSION_ROTATE_MS,
  signIn,
} from "../src/lib/domain";
import { LOGIN_LIMIT, LOGIN_WINDOW_MS, SIGNUP_LIMIT, SIGNUP_WINDOW_MS, takeAttempt } from "../src/lib/limits";
import { makePerson, testRepo, unwrap } from "./helpers";
import type { Repository } from "../src/lib/db";

describe("abuse limits", () => {
  let repo: Repository;

  beforeEach(async () => {
    repo = await testRepo();
  });

  test("login attempts stop at the limit and resume after the window", async () => {
    const start = 1_700_000_000_000;
    for (let attempt = 0; attempt < LOGIN_LIMIT; attempt += 1) {
      assert.equal(await takeAttempt(repo, "login:ada", LOGIN_LIMIT, LOGIN_WINDOW_MS, start), true);
    }
    assert.equal(await takeAttempt(repo, "login:ada", LOGIN_LIMIT, LOGIN_WINDOW_MS, start + 1), false);
    assert.equal(
      await takeAttempt(repo, "login:ada", LOGIN_LIMIT, LOGIN_WINDOW_MS, start + LOGIN_WINDOW_MS),
      true,
    );
  });

  test("signup attempts stop at the limit", async () => {
    const start = 1_700_000_000_000;
    for (let attempt = 0; attempt < SIGNUP_LIMIT; attempt += 1) {
      assert.equal(await takeAttempt(repo, "signup-ip:local", SIGNUP_LIMIT, SIGNUP_WINDOW_MS, start), true);
    }
    assert.equal(
      await takeAttempt(repo, "signup-ip:local", SIGNUP_LIMIT, SIGNUP_WINDOW_MS, start + 1),
      false,
    );
  });

  test("a new sign-in replaces the previous token, and an old token rotates", async () => {
    const made = await makePerson(repo, "adaone");
    const first = unwrap(await signIn(repo, "adaone", "demo-pass"));
    const second = unwrap(await signIn(repo, "adaone", "demo-pass"));
    assert.notEqual(first.token, second.token);
    assert.equal(await personForToken(repo, first.token), null);
    assert.equal((await personForToken(repo, second.token))?.id, made.person.id);

    const early = await rotateIfDue(repo, second.token, new Date());
    assert.equal(early?.rotated, false);
    assert.equal(early?.token, second.token);

    const stale = new Date(Date.now() - SESSION_ROTATE_MS - 1000).toISOString();
    await repo.setSessionIssuedAt(second.token, stale);
    const rotated = await rotateIfDue(repo, second.token, new Date());
    assert.equal(rotated?.rotated, true);
    assert.ok(rotated);
    assert.notEqual(rotated.token, second.token);
    assert.equal(await personForToken(repo, second.token), null);
    assert.equal((await personForToken(repo, rotated.token))?.id, made.person.id);
  });
});
