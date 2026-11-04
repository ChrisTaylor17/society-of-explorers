import assert from "node:assert/strict";
import { test } from "node:test";
import { PLAN_ID, assertNoRelay, boot, request, signIn, write } from "./helpers.js";

async function mutual(url, jules, ada) {
  await write(url, jules.token, "join", "jules", "join-1", { planId: PLAN_ID });
  await write(url, ada.token, "accept", "ada", "accept-1", { planId: PLAN_ID, requesterId: "jules" });
  await write(url, jules.token, "grant", "jules", "grant-j", { planId: PLAN_ID, otherId: "ada" });
  await write(url, ada.token, "grant", "ada", "grant-a", { planId: PLAN_ID, otherId: "jules" });
}

test("revoke racing a fetch never returns contact at or after the revoke version", async () => {
  const { url, stop } = await boot();
  try {
    const jules = await signIn(url, "jules");
    const ada = await signIn(url, "ada");
    await mutual(url, jules, ada);
    const open = await request(url, `/api/plans/${PLAN_ID}`, { token: jules.token });
    assert.equal(open.body.data.other.contact, "relay:ada.linden");
    const grantId = open.body.data.other.myGrantId;
    const raced = await Promise.all([
      write(url, jules.token, "revoke", "jules", "revoke-race", { permissionId: grantId }),
      request(url, `/api/plans/${PLAN_ID}`, { token: ada.token }),
      request(url, `/api/plans/${PLAN_ID}`, { token: jules.token }),
      request(url, `/api/plans/${PLAN_ID}`, { token: ada.token }),
    ]);
    const revoke = raced[0].body;
    assert.equal(revoke.status, "committed");
    for (const item of raced.slice(1)) {
      if (item.body.version >= revoke.version) assertNoRelay(item.body);
    }
    const later = await request(url, `/api/plans/${PLAN_ID}`, { token: ada.token });
    assert.equal(later.body.version >= revoke.version, true);
    assert.equal(later.body.data.other.contact, null);
    assertNoRelay(later.body);
    assert.equal(open.body.data.other.contact, "relay:ada.linden");
  } finally {
    await stop();
  }
});

test("host accept racing a fetch does not reveal a relay", async () => {
  const { url, stop } = await boot();
  try {
    const jules = await signIn(url, "jules");
    const ada = await signIn(url, "ada");
    await write(url, jules.token, "join", "jules", "join-1", { planId: PLAN_ID });
    const raced = await Promise.all([
      write(url, ada.token, "accept", "ada", "accept-race", { planId: PLAN_ID, requesterId: "jules" }),
      request(url, `/api/plans/${PLAN_ID}`, { token: jules.token }),
      request(url, `/api/plans/${PLAN_ID}`, { token: ada.token }),
      write(url, jules.token, "revoke", "jules", "revoke-none", { permissionId: "grant-missing" }),
    ]);
    assert.equal(raced[0].body.status, "committed");
    assert.equal(raced[3].body.status, "rejected");
    assertNoRelay(raced[0].body);
    assertNoRelay(raced[1].body);
    assertNoRelay(raced[2].body);
    const after = await request(url, `/api/plans/${PLAN_ID}`, { token: jules.token });
    assert.equal(after.body.data.invitationStatus, "accepted");
    assert.equal(after.body.data.other.contact, null);
    assertNoRelay(after.body);
  } finally {
    await stop();
  }
});

test("a grant that would reveal contact loses to a concurrent revoke", async () => {
  const { url, stop } = await boot();
  try {
    const jules = await signIn(url, "jules");
    const ada = await signIn(url, "ada");
    await write(url, jules.token, "join", "jules", "join-1", { planId: PLAN_ID });
    await write(url, ada.token, "accept", "ada", "accept-1", { planId: PLAN_ID, requesterId: "jules" });
    const julesGrant = await write(url, jules.token, "grant", "jules", "grant-j", { planId: PLAN_ID, otherId: "ada" });
    const raced = await Promise.all([
      write(url, ada.token, "grant", "ada", "grant-a", { planId: PLAN_ID, otherId: "jules" }),
      write(url, jules.token, "revoke", "jules", "revoke-j", { permissionId: julesGrant.body.data.permissionId }),
      request(url, `/api/plans/${PLAN_ID}`, { token: ada.token }),
      request(url, `/api/plans/${PLAN_ID}`, { token: jules.token }),
    ]);
    const revoke = raced[1].body;
    assert.equal(revoke.status, "committed");
    for (const item of raced) {
      if (item.body.version >= revoke.version && item.body.data?.other) assertNoRelay(item.body);
      if (item.body.version >= revoke.version && item.body.data?.contact) assert.fail("contact leaked");
    }
    const later = await request(url, `/api/plans/${PLAN_ID}`, { token: ada.token });
    assert.equal(later.body.data.other.contact, null);
    assertNoRelay(later.body);
  } finally {
    await stop();
  }
});
