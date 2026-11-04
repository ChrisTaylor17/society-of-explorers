import assert from "node:assert/strict";
import { test } from "node:test";
import { DELETION_LIMIT } from "../src/copy.js";
import { PLAN_ID, assertNoRelay, boot, request, signIn, write } from "./helpers.js";

test("deleting an account withdraws a pending join and blocks host acceptance", async () => {
  const { url, stop } = await boot();
  try {
    const jules = await signIn(url, "jules");
    const ada = await signIn(url, "ada");
    await write(url, jules.token, "join", "jules", "join-1", { planId: PLAN_ID });
    const deleted = await write(url, jules.token, "delete-account", "jules", "delete-1", {});
    assert.equal(deleted.body.status, "committed");
    assert.equal(deleted.body.data.limit, DELETION_LIMIT);
    const retry = await write(url, jules.token, "delete-account", "jules", "delete-1", {});
    assert.equal(retry.body.status, "committed");
    assert.equal(retry.body.data.deleted, true);
    const accept = await write(url, ada.token, "accept", "ada", "accept-1", {
      planId: PLAN_ID,
      requesterId: "jules",
    });
    assert.equal(accept.body.status, "rejected");
    assert.match(accept.body.error, /withdrawn/);
    const host = await request(url, `/api/plans/${PLAN_ID}`, { token: ada.token });
    assert.equal(host.body.data.canAccept, false);
    assertNoRelay(host.body);
    const gone = await request(url, "/api/plans", { token: jules.token });
    assert.equal(gone.body.status, "rejected");
    assert.match(gone.body.error, /deleted/);
    const resign = await request(url, "/api/session", {
      method: "POST",
      body: { magicName: "jules", passcode: "synthetic-jules" },
    });
    assert.equal(resign.body.status, "rejected");
    assert.match(resign.body.error, /deleted/);
  } finally {
    await stop();
  }
});

test("deleting an account after mutual acceptance hides future contact reads", async () => {
  const { url, stop } = await boot();
  try {
    const jules = await signIn(url, "jules");
    const ada = await signIn(url, "ada");
    await write(url, jules.token, "join", "jules", "join-1", { planId: PLAN_ID });
    await write(url, ada.token, "accept", "ada", "accept-1", { planId: PLAN_ID, requesterId: "jules" });
    await write(url, jules.token, "grant", "jules", "grant-j", { planId: PLAN_ID, otherId: "ada" });
    await write(url, ada.token, "grant", "ada", "grant-a", { planId: PLAN_ID, otherId: "jules" });
    const seen = await request(url, `/api/plans/${PLAN_ID}`, { token: ada.token });
    assert.equal(seen.body.data.other.contact, "relay:jules.okonkwo");
    const alreadySeen = seen.body.data.other.contact;
    await write(url, jules.token, "delete-account", "jules", "delete-1", {});
    const later = await request(url, `/api/plans/${PLAN_ID}`, { token: ada.token });
    assert.equal(later.body.data.other.contact, null);
    assert.match(later.body.data.other.contactReason, /Future contact access is off/);
    assert.match(later.body.data.other.contactReason, /already saw stays with them/);
    assertNoRelay(later.body);
    assert.equal(alreadySeen, "relay:jules.okonkwo");
    const discover = await request(url, "/api/plans", { token: ada.token });
    assert.equal(discover.body.data.length, 1);
  } finally {
    await stop();
  }
});

test("deleting the host closes a pending join", async () => {
  const { url, stop } = await boot();
  try {
    const jules = await signIn(url, "jules");
    const ada = await signIn(url, "ada");
    await write(url, jules.token, "join", "jules", "join-1", { planId: PLAN_ID });
    await write(url, ada.token, "delete-account", "ada", "delete-ada", {});
    const accept = await write(url, ada.token, "accept", "ada", "accept-late", {
      planId: PLAN_ID,
      requesterId: "jules",
    });
    assert.equal(accept.body.status, "rejected");
    const guest = await request(url, `/api/plans/${PLAN_ID}`, { token: jules.token });
    assert.equal(guest.body.data.invitationStatus, "none");
    assertNoRelay(guest.body);
    const cards = await request(url, "/api/plans", { token: jules.token });
    assert.equal(cards.body.data.length, 0);
  } finally {
    await stop();
  }
});
