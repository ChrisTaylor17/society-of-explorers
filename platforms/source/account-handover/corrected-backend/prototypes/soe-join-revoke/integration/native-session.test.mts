import assert from "node:assert/strict";
import { test } from "node:test";
import { createNativeSession } from "../../../mobile/src/native-session.ts";
import { createHttp } from "../src/http.js";
import { createWorld } from "../src/world.js";
import { PLAN_ID, signIn, write } from "../tests/helpers.js";

async function boot() {
  const world = createWorld({ allowFaults: false });
  const server = createHttp(world);
  const { url } = await server.listen(0);
  return { world, url, stop: () => server.close() };
}

async function accepted(url: string, fetcher: typeof fetch = fetch) {
  const session = createNativeSession({ development: true, mode: "local-http", origin: url, fetcher });
  await session.client.boot();
  assert.equal(session.mode, "local-http"); assert.equal(session.fixture, null);
  const ada = await signIn(url, "ada");
  await session.client.reviewPlan(PLAN_ID); await session.shell.requestJoin(PLAN_ID);
  const host = await write(url, ada.token, "accept", "ada", "native-host-accept", { planId: PLAN_ID, requesterId: "jules" });
  assert.equal(host.body.status, "committed");
  await session.client.refresh();
  return { session, ada };
}

async function mutual(url: string, fetcher: typeof fetch = fetch) {
  const p = await accepted(url, fetcher);
  await p.session.shell.acceptDisclosure();
  assert.equal(p.session.client.heldRelay(), null);
  const host = await write(url, p.ada.token, "grant", "ada", "native-host-grant", { planId: PLAN_ID, otherId: "jules" });
  assert.equal(host.body.status, "committed");
  await p.session.client.refresh();
  assert.equal(p.session.client.heldRelay(), "relay:ada.linden");
  return { ...p, hostGrantId: host.body.data.permissionId };
}

test("default and explicit fixture mode are labeled and send no HTTP requests", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls += 1; throw new Error("Must not send"); };
  for (const mode of [undefined, "fixture"]) {
    const session = createNativeSession({ development: true, mode, fetcher });
    assert.equal(session.mode, "fixture"); assert.ok(session.fixture);
    assert.match(session.label, /Fixture demo/);
    await session.client.boot(); assert.equal(session.client.screen().phase, "discover");
  }
  assert.equal(calls, 0);
});

test("release, unknown and invalid local configurations block without a fixture fallback or network", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls += 1; throw new Error("Must not send"); };
  for (const config of [
    { development: false, mode: "local-http", origin: "http://127.0.0.1:8787" },
    { development: true, mode: "unknown", origin: "http://127.0.0.1:8787" },
    { development: true, mode: "local-http", origin: "https://example.com" },
    { development: true, mode: "local-http", origin: undefined },
  ]) {
    const session = createNativeSession({ ...config, fetcher });
    assert.equal(session.mode, "blocked"); assert.equal(session.fixture, null);
    assert.equal(session.port.writesEnabled, false);
    await session.client.boot(); assert.equal(session.client.screen().phase, "live-blocked");
    assert.equal(session.client.heldRelay(), null);
  }
  assert.equal(calls, 0);
});

test("failed prototype proof never sends sign-in or silently swaps to the fixture", async () => {
  let posts = 0;
  const fetcher: typeof fetch = async (_input, init) => {
    if (init?.method === "POST") posts += 1;
    return new Response(JSON.stringify({ status: "ok", prototype: false }));
  };
  const session = createNativeSession({ development: true, mode: "local-http", origin: "http://127.0.0.1:8787", fetcher });
  await session.client.boot();
  assert.equal(session.mode, "local-http"); assert.equal(session.fixture, null);
  assert.equal(session.client.screen().phase, "live-blocked");
  assert.equal(session.client.heldRelay(), null); assert.equal(posts, 0);
});

test("the native session signs into the existing synthetic backend and withholds after the other actor revokes", async () => {
  const { url, stop } = await boot();
  try {
    const p = await mutual(url);
    const result = await write(url, p.ada.token, "revoke", "ada", "native-host-revoke", { permissionId: p.hostGrantId });
    assert.equal(result.body.status, "committed");
    await p.session.client.refresh();
    assert.equal(p.session.client.heldRelay(), null);
    assert.equal(p.session.client.screen().relay.value, null);
  } finally { await stop(); }
});

test("lost revoke response stays unknown and hidden until same-key lookup, without a second revoke", async () => {
  const { url, stop } = await boot();
  let revokes = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    if (String(input).endsWith("/api/writes/revoke")) { revokes += 1; throw new Error("Synthetic response lost after commit"); }
    return response;
  };
  try {
    const { session } = await mutual(url, fetcher);
    await session.shell.revokeContact();
    assert.equal(session.client.screen().truthful, "unknown");
    assert.equal(session.client.heldRelay(), null);
    await session.client.refresh();
    assert.equal(session.client.screen().truthful, "unknown"); assert.equal(session.client.heldRelay(), null);
    const entry = session.client.ledgerEntries().find(row => row.endpoint === "revoke");
    assert.ok(entry); await session.client.reconcile(entry.endpoint, entry.key);
    assert.equal(entry.status, "committed"); assert.equal(revokes, 1);
  } finally { await stop(); }
});

test("the App activity callback suppresses late grants and stale queued foreground work", async () => {
  const { url, stop } = await boot();
  let delay = false;
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const seen = new Promise<void>(resolve => { started = resolve; });
  const fetcher: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    if (delay && String(input).endsWith("/api/writes/grant")) { started(); await gate; }
    return response;
  };
  try {
    const { session } = await mutual(url, fetcher);
    await session.shell.revokeContact();
    delay = true; const granting = session.shell.acceptDisclosure(); await seen;
    assert.equal(session.activity("background")?.kind, "clear");
    assert.equal(session.client.heldRelay(), null);
    const foreground = session.activity("active"); assert.equal(foreground?.kind, "refresh");
    const queued = foreground?.kind === "refresh" ? foreground.run() : Promise.resolve();
    session.activity("inactive"); release(); await granting; await queued;
    assert.equal(session.client.heldRelay(), null);
    const active = session.activity("active"); assert.equal(active?.kind, "refresh");
    if (active?.kind === "refresh") await active.run();
    assert.equal(session.client.heldRelay(), "relay:ada.linden");
  } finally { release(); await stop(); }
});

test("an expired native session clears contact without automatic sign-in or credential rotation", async () => {
  const { world, url, stop } = await boot();
  let signs = 0;
  const fetcher: typeof fetch = async (input, init) => {
    if (String(input).endsWith("/api/session")) signs += 1;
    return fetch(input, init);
  };
  try {
    const { session } = await mutual(url, fetcher);
    world.setNow(() => Date.now() + 8 * 24 * 60 * 60 * 1000);
    await session.client.refresh();
    assert.equal(session.client.screen().phase, "expired-session"); assert.equal(session.client.heldRelay(), null);
    await session.client.boot(); assert.equal(session.client.screen().phase, "expired-session");
    assert.equal(signs, 1);
  } finally { await stop(); }
});
