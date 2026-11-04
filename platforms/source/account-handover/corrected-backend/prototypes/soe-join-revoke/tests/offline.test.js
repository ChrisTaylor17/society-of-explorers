import assert from "node:assert/strict";
import { test } from "node:test";
import { createDevice } from "./client.js";
import { PLAN_ID, boot, request, signIn, write } from "./helpers.js";
import { payloadHash } from "../src/hash.js";

test("queued joins wait offline and replay once when the device is back", async () => {
  const { url, stop } = await boot();
  try {
    const jules = await signIn(url, "jules");
    const ada = await signIn(url, "ada");
    const device = createDevice({ url, token: jules.token, personId: "jules" });
    device.setOnline(false);
    const queued = await device.write("join", "join-offline", { planId: PLAN_ID });
    assert.equal(queued.status, "offline");
    assert.equal(device.queued(), 1);
    const untouched = await request(url, `/api/plans/${PLAN_ID}`, { token: ada.token });
    assert.equal(untouched.body.data.invitationStatus, "none");
    device.setOnline(true);
    const flushed = await device.flush();
    assert.equal(flushed.length, 1);
    assert.equal(flushed[0].status, "committed");
    assert.equal(flushed[0].data.invitationId, "invite-jules-riverside");
    const replay = await device.write("join", "join-offline", { planId: PLAN_ID });
    assert.equal(replay.data.invitationId, flushed[0].data.invitationId);
    const host = await request(url, `/api/plans/${PLAN_ID}`, { token: ada.token });
    assert.equal(host.body.data.joinCount, 1);
  } finally {
    await stop();
  }
});

test("a lost committed response is recovered by lookup and is not written twice", async () => {
  const { url, stop } = await boot();
  try {
    const jules = await signIn(url, "jules");
    const ada = await signIn(url, "ada");
    const device = createDevice({ url, token: jules.token, personId: "jules" });
    const lost = await device.write("join", "join-lost", { planId: PLAN_ID }, "drop-after");
    assert.equal(lost.status, "committed");
    assert.equal(lost.reconciled, true);
    assert.equal(lost.data.invitationId, "invite-jules-riverside");
    const found = await request(url, "/api/lookup", {
      method: "POST",
      token: jules.token,
      body: {
        personId: "jules",
        endpoint: "join",
        key: "join-lost",
        payloadHash: payloadHash({ planId: PLAN_ID }),
      },
    });
    assert.equal(found.body.status, "recorded");
    assert.equal(found.body.result.data.invitationId, lost.data.invitationId);
    const host = await request(url, `/api/plans/${PLAN_ID}`, { token: ada.token });
    assert.equal(host.body.data.joinCount, 1);
  } finally {
    await stop();
  }
});

test("a dropped request is absent until the device sends it again", async () => {
  const { url, stop } = await boot();
  try {
    const jules = await signIn(url, "jules");
    const ada = await signIn(url, "ada");
    const dropped = await write(url, jules.token, "join", "jules", "join-drop", { planId: PLAN_ID }, "drop-before");
    assert.equal(dropped.body.status, "ambiguous");
    const absent = await request(url, "/api/lookup", {
      method: "POST",
      token: jules.token,
      body: {
        personId: "jules",
        endpoint: "join",
        key: "join-drop",
        payloadHash: payloadHash({ planId: PLAN_ID }),
      },
    });
    assert.equal(absent.body.status, "absent");
    const hostBefore = await request(url, `/api/plans/${PLAN_ID}`, { token: ada.token });
    assert.equal(hostBefore.body.data.canAccept, false);
    const sent = await write(url, jules.token, "join", "jules", "join-drop", { planId: PLAN_ID });
    assert.equal(sent.body.status, "committed");
    const hostAfter = await request(url, `/api/plans/${PLAN_ID}`, { token: ada.token });
    assert.equal(hostAfter.body.data.joinCount, 1);
    assert.equal(hostAfter.body.data.canAccept, true);
  } finally {
    await stop();
  }
});

test("a queued join is not replayed after the session expires", async () => {
  const { world, url, stop } = await boot();
  try {
    const jules = await signIn(url, "jules");
    const device = createDevice({ url, token: jules.token, personId: "jules" });
    device.setOnline(false);
    await device.write("join", "join-late", { planId: PLAN_ID });
    const expiry = Date.parse(jules.expiresAt);
    world.setNow(() => expiry + 1);
    device.setOnline(true);
    const flushed = await device.flush();
    assert.equal(flushed[0].status, "expired-session");
    assert.equal(device.queued(), 1);
    const ada = await signIn(url, "ada");
    const host = await request(url, `/api/plans/${PLAN_ID}`, { token: ada.token });
    assert.equal(host.body.data.invitationStatus, "none");
  } finally {
    await stop();
  }
});
