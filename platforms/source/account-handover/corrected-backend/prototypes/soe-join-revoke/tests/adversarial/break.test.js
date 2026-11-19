import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { test } from "node:test";
import { createHttp } from "../../src/http.js";
import { payloadHash } from "../../src/hash.js";
import { createWorld } from "../../src/world.js";
import { PLAN_ID, assertNoRelay, boot, request, signIn, write } from "../helpers.js";

const HANDLES = ["relay:", "ada.linden", "jules.okonkwo", "mina.cho"];
const PASSCODES = ["synthetic-ada", "synthetic-jules", "synthetic-mina"];

function textOf(body) {
  return JSON.stringify(body);
}

function assertNoHandles(body, label) {
  const text = textOf(body);
  for (const needle of [...HANDLES, ...PASSCODES]) {
    assert.equal(text.includes(needle), false, `${label} leaked ${needle}: ${text}`);
  }
}

function assertOnlyCounterparty(body, expected, forbidden, label) {
  const text = textOf(body);
  assert.equal(body.data.other.contact, expected, label);
  for (const needle of forbidden) assert.equal(text.includes(needle), false, `${label} leaked ${needle}`);
  for (const needle of PASSCODES) assert.equal(text.includes(needle), false, `${label} leaked ${needle}`);
}

async function mutual(url, jules, ada) {
  await write(url, jules.token, "join", "jules", "join-1", { planId: PLAN_ID });
  await write(url, ada.token, "accept", "ada", "accept-1", { planId: PLAN_ID, requesterId: "jules" });
  const julesGrant = await write(url, jules.token, "grant", "jules", "grant-j", { planId: PLAN_ID, otherId: "ada" });
  const adaGrant = await write(url, ada.token, "grant", "ada", "grant-a", { planId: PLAN_ID, otherId: "jules" });
  return { julesGrant, adaGrant };
}

test("stranger, non-host, and pre-accept responses never carry a relay or the guest name", async () => {
  const { url, stop } = await boot();
  try {
    const jules = await signIn(url, "jules");
    const ada = await signIn(url, "ada");
    const mina = await signIn(url, "mina");
    const phases = [];
    const capture = async (label) => {
      for (const [who, token] of [
        ["jules", jules.token],
        ["ada", ada.token],
        ["mina", mina.token],
      ]) {
        for (const path of [`/api/plans`, `/api/plans/${PLAN_ID}`, `/api/plans/${PLAN_ID}/visibility`]) {
          const result = await request(url, path, { token });
          phases.push({ label, who, path, result });
        }
      }
    };
    await capture("before-join");
    const joined = await write(url, jules.token, "join", "jules", "join-1", { planId: PLAN_ID });
    assertNoHandles(joined.body, "join");
    const earlyGrant = await write(url, jules.token, "grant", "jules", "grant-early", { planId: PLAN_ID, otherId: "ada" });
    assert.equal(earlyGrant.body.status, "rejected");
    assertNoHandles(earlyGrant.body, "grant before accept");
    const guestAccept = await write(url, jules.token, "accept", "jules", "accept-guest", {
      planId: PLAN_ID,
      requesterId: "jules",
    });
    assert.equal(guestAccept.status, 403);
    assertNoHandles(guestAccept.body, "guest accept");
    const spoof = await write(url, jules.token, "accept", "ada", "accept-spoof", {
      planId: PLAN_ID,
      requesterId: "jules",
    });
    assert.equal(spoof.body.status, "rejected");
    assert.equal(textOf(spoof.body).includes("relay:"), false);
    const minaAccept = await write(url, mina.token, "accept", "mina", "accept-mina", {
      planId: PLAN_ID,
      requesterId: "jules",
    });
    assert.equal(minaAccept.body.status, "rejected");
    assert.match(minaAccept.body.error, /Only the plan host/);
    assertNoHandles(minaAccept.body, "mina accept");
    await capture("after-join");
    await write(url, ada.token, "accept", "ada", "accept-1", { planId: PLAN_ID, requesterId: "jules" });
    const minaGrant = await write(url, mina.token, "grant", "mina", "grant-mina", { planId: PLAN_ID, otherId: "jules" });
    assert.equal(minaGrant.body.status, "rejected");
    assertNoHandles(minaGrant.body, "mina grant");
    const adaToMina = await write(url, ada.token, "grant", "ada", "grant-mina", { planId: PLAN_ID, otherId: "mina" });
    assert.equal(adaToMina.body.status, "rejected");
    assertNoHandles(adaToMina.body, "host grant to stranger");
    await capture("after-accept");
    await write(url, jules.token, "grant", "jules", "grant-j", { planId: PLAN_ID, otherId: "ada" });
    await capture("one-grant");
    await write(url, ada.token, "grant", "ada", "grant-a", { planId: PLAN_ID, otherId: "jules" });
    await capture("mutual");
    const open = phases.find((item) => item.label === "mutual" && item.who === "jules" && item.path === `/api/plans/${PLAN_ID}`);
    const stolen = await write(url, mina.token, "revoke", "mina", "revoke-steal", {
      permissionId: open.result.body.data.other.myGrantId,
    });
    assert.equal(stolen.body.status, "rejected");
    assertNoHandles(stolen.body, "stolen revoke");
    const guessed = await write(url, mina.token, "revoke", "mina", "revoke-guess", { permissionId: "grant-1" });
    assert.equal(guessed.body.status, "rejected");
    assert.equal(guessed.body.error, stolen.body.error);
    assertNoHandles(guessed.body, "guessed revoke");
    await write(url, jules.token, "revoke", "jules", "revoke-1", {
      permissionId: open.result.body.data.other.myGrantId,
    });
    await capture("after-revoke");

    for (const item of phases) {
      const body = item.result.body;
      const raw = textOf(body);
      if (item.who === "mina") {
        assertNoHandles(body, `${item.label} ${item.path}`);
        assert.equal(/Jules|Okonkwo/.test(raw), false, `guest name leaked to mina at ${item.label} ${item.path}: ${raw}`);
        assert.equal(body.data?.other?.contact ?? null, null);
      }
      if (item.label !== "mutual" || item.who === "mina") assertNoHandles(body, `${item.who} ${item.label} ${item.path}`);
      if (item.label === "mutual" && item.who === "jules" && item.path === `/api/plans/${PLAN_ID}`) {
        assertOnlyCounterparty(body, "relay:ada.linden", ["jules.okonkwo", "mina.cho"], "jules mutual");
      }
      if (item.label === "mutual" && item.who === "ada" && item.path === `/api/plans/${PLAN_ID}`) {
        assertOnlyCounterparty(body, "relay:jules.okonkwo", ["ada.linden", "mina.cho"], "ada mutual");
      }
      if (item.label === "mutual" && item.path.endsWith("/visibility")) assertNoHandles(body, `visibility ${item.who}`);
    }

    const julesPlan = phases.find((item) => item.label === "after-join" && item.who === "jules" && item.path === `/api/plans/${PLAN_ID}`);
    assert.equal(julesPlan.result.body.data.sharedWindows.includes("Sunday afternoon"), false);
    assert.equal(textOf(julesPlan.result.body).includes("Quiet cafes"), false);
    assert.equal(textOf(julesPlan.result.body).includes("Wednesday evening"), false);
    const adaPlan = phases.find((item) => item.label === "after-join" && item.who === "ada" && item.path === `/api/plans/${PLAN_ID}`);
    assert.equal(textOf(adaPlan.result.body).includes("Drawing"), false);
    assert.equal(textOf(adaPlan.result.body).includes("Wednesday evening"), false);
    assert.match(textOf(adaPlan.result.body), /Jules Okonkwo/);
  } finally {
    await stop();
  }
});

test("idempotency keys do not collide across people or endpoints", async () => {
  const { url, stop } = await boot();
  try {
    const jules = await signIn(url, "jules");
    const ada = await signIn(url, "ada");
    const mina = await signIn(url, "mina");
    const key = "shared-key";
    const joined = await write(url, jules.token, "join", "jules", key, { planId: PLAN_ID });
    assert.equal(joined.body.status, "committed");
    const hostJoin = await write(url, ada.token, "join", "ada", key, { planId: PLAN_ID });
    assert.equal(hostJoin.body.status, "rejected");
    assert.match(hostJoin.body.error, /already the host/);
    assert.notEqual(hostJoin.body.data?.invitationId, joined.body.data.invitationId);
    const accepted = await write(url, ada.token, "accept", "ada", key, { planId: PLAN_ID, requesterId: "jules" });
    assert.equal(accepted.body.status, "committed");
    assert.equal(accepted.body.data.invitationId, joined.body.data.invitationId);
    const replayJoin = await write(url, jules.token, "join", "jules", key, { planId: PLAN_ID });
    assert.equal(replayJoin.body.data.invitationId, joined.body.data.invitationId);
    assert.equal(replayJoin.body.status, "committed");
    const adaLookup = await request(url, "/api/lookup", {
      method: "POST",
      token: ada.token,
      body: { personId: "jules", endpoint: "join", key, payloadHash: payloadHash({ planId: PLAN_ID }) },
    });
    assert.equal(adaLookup.body.status, "conflict");
    assertNoHandles(adaLookup.body, "cross-user lookup");
    const adaOwn = await request(url, "/api/lookup", {
      method: "POST",
      token: ada.token,
      body: { personId: "ada", endpoint: "join", key, payloadHash: payloadHash({ planId: PLAN_ID }) },
    });
    assert.equal(adaOwn.body.status, "absent");
    const injected = await request(url, "/api/lookup", {
      method: "POST",
      token: mina.token,
      body: {
        personId: "mina",
        endpoint: "jules\u0000join",
        key,
        payloadHash: payloadHash({ planId: PLAN_ID }),
      },
    });
    assert.equal(injected.body.status, "absent");
    assertNoHandles(injected.body, "separator injection");
    const host = await request(url, `/api/plans/${PLAN_ID}`, { token: ada.token });
    assert.equal(host.body.data.joinCount, 1);
    assertNoHandles(host.body, "host before grants");
  } finally {
    await stop();
  }
});

test("replaying a grant key after revoke does not restore contact", async () => {
  const { url, stop } = await boot();
  try {
    const jules = await signIn(url, "jules");
    const ada = await signIn(url, "ada");
    const mina = await signIn(url, "mina");
    await mutual(url, jules, ada);
    const open = await request(url, `/api/plans/${PLAN_ID}`, { token: jules.token });
    await write(url, jules.token, "revoke", "jules", "revoke-1", { permissionId: open.body.data.other.myGrantId });
    const replay = await write(url, jules.token, "grant", "jules", "grant-j", { planId: PLAN_ID, otherId: "ada" });
    assert.equal(replay.body.status, "committed");
    assertNoHandles(replay.body, "grant replay");
    for (const token of [jules.token, ada.token, mina.token]) {
      const later = await request(url, `/api/plans/${PLAN_ID}`, { token });
      assertNoHandles(later.body, "after grant replay");
      const review = await request(url, `/api/plans/${PLAN_ID}/visibility`, { token });
      assertNoHandles(review.body, "visibility after grant replay");
    }
    const again = await write(url, jules.token, "grant", "jules", "grant-j-new", { planId: PLAN_ID, otherId: "ada" });
    assert.equal(again.body.status, "committed");
    const restored = await request(url, `/api/plans/${PLAN_ID}`, { token: ada.token });
    assert.equal(restored.body.data.other.contact, "relay:jules.okonkwo");
    await write(url, ada.token, "revoke", "ada", "revoke-ada", { permissionId: restored.body.data.other.myGrantId });
    const hidden = await request(url, `/api/plans/${PLAN_ID}`, { token: jules.token });
    assert.equal(hidden.body.data.other.contact, null);
    assertNoHandles(hidden.body, "after counterparty revoke");
    assert.equal(
      hidden.body.data.other.contactReason,
      "You accepted disclosure. It stays hidden until they accept too.",
    );
  } finally {
    await stop();
  }
});

test("deleted account token cannot read, sign in again, or recover prior writes", async () => {
  const { url, stop } = await boot();
  try {
    const jules = await signIn(url, "jules");
    const ada = await signIn(url, "ada");
    const mina = await signIn(url, "mina");
    await mutual(url, jules, ada);
    const seen = await request(url, `/api/plans/${PLAN_ID}`, { token: ada.token });
    assert.equal(seen.body.data.other.contact, "relay:jules.okonkwo");
    const deleted = await write(url, jules.token, "delete-account", "jules", "delete-1", {});
    assert.equal(deleted.body.status, "committed");
    const retry = await write(url, jules.token, "delete-account", "jules", "delete-1", {});
    assert.equal(retry.body.status, "committed");
    assertNoHandles(retry.body, "delete replay");

    const plan = await request(url, `/api/plans/${PLAN_ID}`, { token: jules.token });
    assert.equal(plan.body.status, "rejected");
    const discover = await request(url, "/api/plans", { token: jules.token });
    assert.equal(discover.body.status, "rejected");
    const resign = await request(url, "/api/session", {
      method: "POST",
      body: { magicName: "jules", passcode: "synthetic-jules" },
    });
    assert.equal(resign.body.status, "rejected");
    const freshGrant = await write(url, jules.token, "grant", "jules", "grant-after-delete", {
      planId: PLAN_ID,
      otherId: "ada",
    });
    assert.equal(freshGrant.body.status, "rejected");
    assert.match(freshGrant.body.error, /deleted/);
    assertNoHandles(freshGrant.body, "fresh grant after delete");

    const grantReplay = await write(url, jules.token, "grant", "jules", "grant-j", { planId: PLAN_ID, otherId: "ada" });
    assert.equal(grantReplay.body.status, "rejected", textOf(grantReplay.body));
    assertNoHandles(grantReplay.body, "grant replay after delete");
    const lookup = await request(url, "/api/lookup", {
      method: "POST",
      token: jules.token,
      body: {
        personId: "jules",
        endpoint: "grant",
        key: "grant-j",
        payloadHash: payloadHash({ planId: PLAN_ID, otherId: "ada" }),
      },
    });
    assert.notEqual(lookup.body.status, "recorded", textOf(lookup.body));
    assertNoHandles(lookup.body, "lookup after delete");

    const host = await request(url, `/api/plans/${PLAN_ID}`, { token: ada.token });
    assert.equal(host.body.data.other.contact, null);
    assertNoHandles(host.body, "host after guest delete");
    const stranger = await request(url, `/api/plans/${PLAN_ID}`, { token: mina.token });
    assertNoHandles(stranger.body, "stranger after delete");
    assert.equal(/Jules|Okonkwo/.test(textOf(stranger.body)), false);
    const acceptReplay = await write(url, ada.token, "accept", "ada", "accept-1", {
      planId: PLAN_ID,
      requesterId: "jules",
    });
    assertNoHandles(acceptReplay.body, "accept replay");
    const hostAgain = await request(url, `/api/plans/${PLAN_ID}`, { token: ada.token });
    assert.equal(hostAgain.body.data.other.contact, null);
    assertNoHandles(hostAgain.body, "host after accept replay");
  } finally {
    await stop();
  }
});

test("deletion copy claims a seen relay only after a response contained one", async () => {
  const { url, stop } = await boot();
  try {
    const jules = await signIn(url, "jules");
    const ada = await signIn(url, "ada");
    await mutual(url, jules, ada);
    await write(url, jules.token, "delete-account", "jules", "delete-1", {});
    const host = await request(url, `/api/plans/${PLAN_ID}`, { token: ada.token });
    assert.equal(host.body.data.other.contact, null);
    assertNoHandles(host.body, "delete before any plan read");
    assert.doesNotMatch(host.body.data.other.contactReason, /already saw/);
    assert.match(host.body.data.other.contactReason, /Future contact access is off/);
  } finally {
    await stop();
  }
});

test("a plan read that returned a relay is still described as already seen after deletion", async () => {
  const { url, stop } = await boot();
  try {
    const jules = await signIn(url, "jules");
    const ada = await signIn(url, "ada");
    await mutual(url, jules, ada);
    const seen = await request(url, `/api/plans/${PLAN_ID}`, { token: ada.token });
    assert.equal(seen.body.data.other.contact, "relay:jules.okonkwo");
    await write(url, jules.token, "delete-account", "jules", "delete-1", {});
    const host = await request(url, `/api/plans/${PLAN_ID}`, { token: ada.token });
    assert.equal(host.body.data.other.contact, null);
    assertNoHandles(host.body, "delete after read");
    assert.match(host.body.data.other.contactReason, /already saw stays with them/);
  } finally {
    await stop();
  }
});

test("deleting the host after mutual acceptance hides later contact reads", async () => {
  const { url, stop } = await boot();
  try {
    const jules = await signIn(url, "jules");
    const ada = await signIn(url, "ada");
    const mina = await signIn(url, "mina");
    await mutual(url, jules, ada);
    await write(url, ada.token, "delete-account", "ada", "delete-ada", {});
    const guest = await request(url, `/api/plans/${PLAN_ID}`, { token: jules.token });
    assert.equal(guest.body.data.other.contact, null);
    assertNoHandles(guest.body, "guest after host delete");
    const cards = await request(url, "/api/plans", { token: jules.token });
    assert.equal(cards.body.data.length, 0);
    assertNoHandles(cards.body, "discover after host delete");
    const stranger = await request(url, `/api/plans/${PLAN_ID}`, { token: mina.token });
    assertNoHandles(stranger.body, "stranger after host delete");
    const resigned = await request(url, "/api/session", {
      method: "POST",
      body: { magicName: ["ada"], passcode: "synthetic-ada" },
    });
    assert.equal(resigned.body.status, "rejected");
    assertNoHandles(resigned.body, "array magic name after delete");
  } finally {
    await stop();
  }
});

test("pending deletion frees the seat and a replaced token cannot write or look up", async () => {
  const { url, stop } = await boot();
  try {
    const jules = await signIn(url, "jules");
    const ada = await signIn(url, "ada");
    const mina = await signIn(url, "mina");
    await write(url, jules.token, "join", "jules", "join-1", { planId: PLAN_ID, note: "relay:ada.linden" });
    await write(url, jules.token, "delete-account", "jules", "delete-1", {});
    const joined = await write(url, mina.token, "join", "mina", "join-mina", { planId: PLAN_ID });
    assert.equal(joined.body.status, "committed");
    const host = await request(url, `/api/plans/${PLAN_ID}`, { token: ada.token });
    assert.equal(host.body.data.other.personId, "mina");
    assert.equal(/Jules|Okonkwo|jules/.test(textOf(host.body)), false);
    assertNoHandles(host.body, "host sees the new guest only");
    const oldWrite = await write(url, jules.token, "grant", "jules", "nope", { planId: PLAN_ID, otherId: "ada" });
    assert.equal(oldWrite.body.status, "rejected");
    const replacement = await signIn(url, "ada");
    const replacedMina = await signIn(url, "mina");
    const staleMina = await request(url, "/api/plans", { token: mina.token });
    assert.equal(staleMina.status, 401);
    assert.equal(staleMina.body.status, "expired-session");
    const stale = await request(url, "/api/lookup", {
      method: "POST",
      token: ada.token,
      body: { personId: "ada", endpoint: "accept", key: "missing", payloadHash: "abc" },
    });
    assert.equal(stale.status, 404);
    assert.equal(stale.body.status, "unavailable");
    assert.equal(stale.body.blocker, "Session expired.");
    const live = await request(url, "/api/plans", { token: replacement.token });
    assert.equal(live.body.status, "ok");
    const minaLive = await request(url, "/api/plans", { token: replacedMina.token });
    assert.equal(minaLive.body.status, "ok");
  } finally {
    await stop();
  }
});

test("token boundaries, bad input, and production fault header do not reveal contact", async () => {
  const world = createWorld({ allowFaults: false });
  const http = createHttp(world);
  const { url } = await http.listen(0);
  const logs = [];
  const originals = ["log", "info", "warn", "error", "debug"].map((level) => [level, console[level]]);
  for (const [level, fn] of originals) {
    console[level] = (...args) => {
      logs.push(args.map(String).join(" "));
      fn.apply(console, args);
    };
  }
  try {
    const missing = await request(url, `/api/plans/${PLAN_ID}?access_token=relay:ada.linden`);
    assert.equal(missing.status, 401);
    assertNoHandles(missing.body, "query token");
    const wrongScheme = await request(url, "/api/plans", { token: "" });
    assert.equal(wrongScheme.status, 401);
    const lower = await fetch(`${url}/api/plans`, { headers: { authorization: "bearer nope" } });
    assert.equal(lower.status, 401);
    const jules = await signIn(url, "jules");
    assert.equal(jules.token.length, 64);
    assert.match(jules.token, /^[0-9a-f]+$/);
    const prefix = await request(url, "/api/plans", { token: jules.token.slice(0, 63) });
    assert.equal(prefix.body.status, "expired-session");
    const flipped = `${jules.token.slice(0, -1)}${jules.token.endsWith("a") ? "b" : "a"}`;
    const almost = await request(url, "/api/plans", { token: flipped });
    assert.equal(almost.body.status, "expired-session");
    const expiry = Date.parse(jules.expiresAt);
    world.setNow(() => expiry - 1);
    const still = await request(url, `/api/plans/${PLAN_ID}`, { token: jules.token });
    assert.equal(still.body.status, "ok");
    assertNoHandles(still.body, "one ms before expiry");
    world.setNow(() => expiry);
    const dead = await request(url, `/api/plans/${PLAN_ID}`, { token: jules.token });
    assert.equal(dead.status, 401);
    world.setNow(() => Date.now());
    const again = await signIn(url, "jules");
    const reflected = await request(url, "/api/session", {
      method: "POST",
      body: { magicName: "nobody", passcode: "relay:ada.linden" },
    });
    assert.equal(reflected.body.status, "rejected");
    assertNoHandles(reflected.body, "passcode reflection");
    const notJson = await fetch(`${url}/api/writes/join`, {
      method: "POST",
      headers: { authorization: `Bearer ${again.token}`, "content-type": "application/json" },
      body: "relay:ada.linden",
    });
    const notJsonBody = await notJson.json();
    assert.equal(notJson.status, 400);
    assertNoHandles(notJsonBody, "invalid json");
    const badHash = await request(url, "/api/writes/join", {
      method: "POST",
      token: again.token,
      body: { personId: "jules", idempotencyKey: "bad-hash", payloadHash: "00", body: { planId: PLAN_ID } },
    });
    assert.equal(badHash.body.status, "rejected");
    assertNoHandles(badHash.body, "bad hash");
    const dropped = await write(url, again.token, "join", "jules", "fault-key", { planId: PLAN_ID }, "drop-before");
    assert.equal(dropped.body.status, "committed");
    assert.equal(dropped.body.data.invitationId, "invite-jules-riverside");
    const longKey = await write(url, again.token, "grant", "jules", "k".repeat(201), { planId: PLAN_ID, otherId: "ada" });
    assert.equal(longKey.body.status, "rejected");
    const polluted = await write(url, again.token, "grant", "jules", "proto", {
      planId: PLAN_ID,
      otherId: "ada",
      __proto__: { admin: true },
    });
    assert.equal(polluted.body.status, "rejected");
    assert.equal(Object.prototype.admin, undefined);
    const encoded = await fetch(`${url}/api/plans/%`);
    const encodedBody = await encoded.json();
    assertNoHandles(encodedBody, "bad encoding");
    const health = await request(url, "/api/health");
    assert.equal(health.body.status, "ok");
    assert.equal(logs.some((line) => HANDLES.some((needle) => line.includes(needle))), false, logs.join("\n"));
  } finally {
    for (const [level, fn] of originals) console[level] = fn;
    await http.close();
  }
});

test("parallel revoke, delete, and stranger reads never hand a relay to mina", async () => {
  const { url, stop } = await boot();
  try {
    const jules = await signIn(url, "jules");
    const ada = await signIn(url, "ada");
    const mina = await signIn(url, "mina");
    await mutual(url, jules, ada);
    const open = await request(url, `/api/plans/${PLAN_ID}`, { token: jules.token });
    const grantId = open.body.data.other.myGrantId;
    const tasks = [];
    for (let i = 0; i < 20; i += 1) {
      tasks.push(request(url, `/api/plans/${PLAN_ID}`, { token: mina.token }));
      tasks.push(request(url, `/api/plans/${PLAN_ID}/visibility`, { token: mina.token }));
      tasks.push(request(url, `/api/plans/${PLAN_ID}`, { token: ada.token }));
      tasks.push(request(url, `/api/plans/${PLAN_ID}`, { token: jules.token }));
      tasks.push(write(url, mina.token, "accept", "mina", `accept-${i}`, { planId: PLAN_ID, requesterId: "jules" }));
      tasks.push(write(url, mina.token, "revoke", "mina", `revoke-${i}`, { permissionId: grantId }));
    }
    tasks.push(write(url, jules.token, "revoke", "jules", "revoke-final", { permissionId: grantId }));
    tasks.push(write(url, jules.token, "delete-account", "jules", "delete-final", {}));
    const results = await Promise.all(tasks);
    for (const item of results) {
      const raw = textOf(item.body);
      if (item.body?.data?.role === "visitor" || item.body?.error?.includes("Only the plan host") || item.body?.error?.includes("only revoke")) {
        assertNoHandles(item.body, "raced stranger");
      }
      if (/Mina Cho/.test(item.body?.data?.viewerName || "") && item.body?.data?.role === "visitor") {
        assertNoHandles(item.body, "mina raced read");
        assert.equal(/Jules|Okonkwo/.test(raw), false, raw);
      }
    }
    const later = await request(url, `/api/plans/${PLAN_ID}`, { token: ada.token });
    assert.equal(later.body.data.other.contact, null);
    assertNoHandles(later.body, "ada after raced delete");
    const minaLater = await request(url, `/api/plans/${PLAN_ID}`, { token: mina.token });
    assertNoHandles(minaLater.body, "mina after raced delete");
  } finally {
    await stop();
  }
});

test("sign-in timing differs for an unknown magic name", async () => {
  const { url, stop } = await boot();
  try {
    const time = async (body) => {
      const started = performance.now();
      const result = await request(url, "/api/session", { method: "POST", body });
      return { ms: performance.now() - started, status: result.body.status };
    };
    await time({ magicName: "jules", passcode: "warmup" });
    const unknown = [];
    const wrong = [];
    for (let i = 0; i < 3; i += 1) {
      unknown.push(await time({ magicName: "nobody", passcode: "synthetic-jules" }));
      wrong.push(await time({ magicName: "jules", passcode: "not-the-passcode" }));
    }
    const unknownMed = unknown.map((item) => item.ms).sort((a, b) => a - b)[1];
    const wrongMed = wrong.map((item) => item.ms).sort((a, b) => a - b)[1];
    assert.equal(unknown[0].status, "rejected");
    assert.equal(wrong[0].status, "rejected");
    console.log(`sign-in median ms unknown=${unknownMed.toFixed(1)} wrong-passcode=${wrongMed.toFixed(1)}`);
  } finally {
    await stop();
  }
});
