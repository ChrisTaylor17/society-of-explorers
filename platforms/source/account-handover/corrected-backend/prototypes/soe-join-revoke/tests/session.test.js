import assert from "node:assert/strict";
import { test } from "node:test";
import { PLAN_ID, assertNoRelay, boot, request, signIn } from "./helpers.js";

test("a bad passcode is rejected and an expired token cannot read", async () => {
  const { world, url, stop } = await boot();
  try {
    const missing = await request(url, "/api/plans");
    assert.equal(missing.status, 401);
    assert.equal(missing.body.status, "expired-session");
    const wrong = await request(url, "/api/session", {
      method: "POST",
      body: { magicName: "jules", passcode: "nope" },
    });
    assert.equal(wrong.body.status, "rejected");
    assert.match(wrong.body.error, /do not match/);
    assertNoRelay(wrong.body);
    const jules = await signIn(url, "jules");
    const live = await request(url, `/api/plans/${PLAN_ID}`, { token: jules.token });
    assert.equal(live.body.status, "ok");
    world.setNow(() => Date.parse(jules.expiresAt) + 1);
    const expired = await request(url, `/api/plans/${PLAN_ID}`, { token: jules.token });
    assert.equal(expired.status, 401);
    assert.equal(expired.body.status, "expired-session");
    const lookup = await request(url, "/api/lookup", {
      method: "POST",
      token: jules.token,
      body: { personId: "jules", endpoint: "join", key: "missing", payloadHash: "abc" },
    });
    assert.equal(lookup.body.status, "unavailable");
    assert.equal(lookup.body.blocker, "Session expired.");
  } finally {
    await stop();
  }
});

test("a new sign-in replaces that person's older session token", async () => {
  const { url, stop } = await boot();
  try {
    const first = await signIn(url, "jules");
    const second = await signIn(url, "jules");
    const oldRead = await request(url, "/api/plans", { token: first.token });
    assert.equal(oldRead.body.status, "expired-session");
    const newRead = await request(url, "/api/plans", { token: second.token });
    assert.equal(newRead.body.status, "ok");
    const ada = await signIn(url, "ada");
    const adaRead = await request(url, "/api/plans", { token: ada.token });
    assert.equal(adaRead.body.status, "ok");
  } finally {
    await stop();
  }
});
