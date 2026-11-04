import assert from "node:assert/strict";
import { test } from "node:test";
import { PLAN_ID, assertNoRelay, boot, request, signIn, write } from "./helpers.js";

test("discover, join, host accept, mutual grants, then revoke future access", async () => {
  const { url, stop } = await boot();
  try {
    const jules = await signIn(url, "jules");
    const ada = await signIn(url, "ada");
    const mina = await signIn(url, "mina");

    const discovered = await request(url, "/api/plans", { token: jules.token });
    assert.equal(discovered.status, 200);
    assert.equal(discovered.cache, "no-store");
    assert.equal(discovered.body.data[0].id, PLAN_ID);
    assert.equal(discovered.body.data[0].title, "Saturday riverside walk");
    assert.deepEqual(discovered.body.data[0].sharedWindows, ["Saturday morning"]);
    assert.deepEqual(discovered.body.data[0].sharedInterests, []);
    assertNoRelay(discovered.body);

    const before = await request(url, `/api/plans/${PLAN_ID}`, { token: jules.token });
    assert.equal(before.body.data.invitationStatus, "none");
    assert.equal(before.body.data.contactAccess, "hidden");
    assert.equal(before.body.data.other.contact, null);
    assertNoRelay(before.body);

    const joined = await write(url, jules.token, "join", "jules", "join-1", { planId: PLAN_ID });
    assert.equal(joined.body.status, "committed");
    assert.equal(joined.body.data.invitationId, "invite-jules-riverside");
    const waiting = await request(url, `/api/plans/${PLAN_ID}`, { token: jules.token });
    assert.equal(waiting.body.data.invitationStatus, "invited");
    assert.equal(waiting.body.data.other.contact, null);
    assert.match(waiting.body.data.other.contactReason, /Accept the plan before any relay/);
    assertNoRelay(waiting.body);

    const guestAccept = await write(url, jules.token, "accept", "jules", "accept-guest", {
      planId: PLAN_ID,
      requesterId: "jules",
    });
    assert.equal(guestAccept.body.status, "rejected");
    assert.match(guestAccept.body.error, /Only the plan host can accept/);
    const strangerAccept = await write(url, mina.token, "accept", "mina", "accept-mina", {
      planId: PLAN_ID,
      requesterId: "jules",
    });
    assert.equal(strangerAccept.body.status, "rejected");
    assert.match(strangerAccept.body.error, /Only the plan host can accept/);

    const accepted = await write(url, ada.token, "accept", "ada", "accept-1", {
      planId: PLAN_ID,
      requesterId: "jules",
    });
    assert.equal(accepted.body.status, "committed");
    const acceptedView = await request(url, `/api/plans/${PLAN_ID}`, { token: jules.token });
    assert.equal(acceptedView.body.data.invitationStatus, "accepted");
    assert.equal(acceptedView.body.data.contactAccess, "hidden");
    assert.equal(acceptedView.body.data.other.contact, null);
    assert.match(acceptedView.body.data.other.contactReason, /both of you accept disclosure/i);
    assertNoRelay(acceptedView.body);

    const early = await write(url, mina.token, "grant", "mina", "grant-mina", { planId: PLAN_ID, otherId: "ada" });
    assert.equal(early.body.status, "rejected");

    const julesGrant = await write(url, jules.token, "grant", "jules", "grant-1", { planId: PLAN_ID, otherId: "ada" });
    assert.equal(julesGrant.body.status, "committed");
    const oneSided = await request(url, `/api/plans/${PLAN_ID}`, { token: jules.token });
    assert.equal(oneSided.body.data.contactAccess, "hidden");
    assert.equal(oneSided.body.data.other.contact, null);
    assert.match(oneSided.body.data.other.contactReason, /until they accept too/);
    assertNoRelay(oneSided.body);
    const adaOneSided = await request(url, `/api/plans/${PLAN_ID}`, { token: ada.token });
    assert.equal(adaOneSided.body.data.other.contact, null);
    assertNoRelay(adaOneSided.body);

    const adaGrant = await write(url, ada.token, "grant", "ada", "grant-ada", {
      planId: PLAN_ID,
      otherId: "jules",
    });
    assert.equal(adaGrant.body.status, "committed");
    const open = await request(url, `/api/plans/${PLAN_ID}`, { token: jules.token });
    assert.equal(open.body.data.contactAccess, "visible");
    assert.equal(open.body.data.other.contact, "relay:ada.linden");
    assert.match(open.body.data.other.contactReason, /Both of you accepted/);
    const hostOpen = await request(url, `/api/plans/${PLAN_ID}`, { token: ada.token });
    assert.equal(hostOpen.body.data.other.contact, "relay:jules.okonkwo");
    const stranger = await request(url, `/api/plans/${PLAN_ID}`, { token: mina.token });
    assert.equal(stranger.body.data.role, "visitor");
    assert.equal(stranger.body.data.other.contact, null);
    assertNoRelay(stranger.body);
    const review = await request(url, `/api/plans/${PLAN_ID}/visibility`, { token: jules.token });
    assert.equal(review.body.data.rows.at(-1).access, "Not recalled by a revoke");
    assert.equal(review.body.data.rows.find((row) => row.field === "Relay handle").access, "Visible for this read");

    const stolen = await write(url, mina.token, "revoke", "mina", "revoke-mina", {
      permissionId: open.body.data.other.myGrantId,
    });
    assert.equal(stolen.body.status, "rejected");
    assert.match(stolen.body.error, /only revoke access you granted/i);

    const revoked = await write(url, jules.token, "revoke", "jules", "revoke-1", {
      permissionId: open.body.data.other.myGrantId,
    });
    assert.equal(revoked.body.status, "committed");
    assert.equal(revoked.body.data.limit, open.body.data.revocationLimit);
    const after = await request(url, `/api/plans/${PLAN_ID}`, { token: jules.token });
    assert.equal(after.body.data.contactAccess, "revoked");
    assert.equal(after.body.data.other.contact, null);
    assert.match(after.body.data.other.contactReason, /You revoked contact/);
    assertNoRelay(after.body);
    const adaAfter = await request(url, `/api/plans/${PLAN_ID}`, { token: ada.token });
    assert.equal(adaAfter.body.data.other.contact, null);
    assertNoRelay(adaAfter.body);
    assert.match(JSON.stringify(after.body), /cannot erase information someone already saw/);
    assert.equal(open.body.data.other.contact, "relay:ada.linden");
  } finally {
    await stop();
  }
});
