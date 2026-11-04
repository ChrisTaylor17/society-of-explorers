import assert from "node:assert/strict";
import { test } from "node:test";
import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createMobileClient } from "../../../mobile/src/client.ts";
import { createShellActions } from "../../../mobile/src/shell-actions.ts";
import { createHttp } from "../src/http.js";
import { createWorld } from "../src/world.js";
import { PLAN_ID, request, signIn, write } from "../tests/helpers.js";
import { createLocalPrototypePort } from "./mobile-local-port.ts";

async function boot() {
  const world = createWorld({ allowFaults: false });
  const server = createHttp(world);
  const { url } = await server.listen(0);
  return { world, url, stop: () => server.close() };
}

async function pair(url: string, guestFetcher: typeof fetch = fetch) {
  const guestSession = await signIn(url, "jules");
  const hostSession = await signIn(url, "ada");
  const guest = createMobileClient(createLocalPrototypePort({ url, token: guestSession.token, personId: "jules", fetcher: guestFetcher }));
  const host = createMobileClient(createLocalPrototypePort({ url, token: hostSession.token, personId: "ada" }));
  const guestShell = createShellActions(guest);
  const hostShell = createShellActions(host);
  await guest.boot(); await host.boot();
  await guest.reviewPlan(PLAN_ID);
  await guestShell.requestJoin(PLAN_ID);
  const accepted = await write(url, hostSession.token, "accept", "ada", "host-accept", { planId: PLAN_ID, requesterId: "jules" });
  assert.equal(accepted.body.status, "committed");
  await guest.refresh();
  await host.reviewPlan(PLAN_ID); await host.refresh();
  return { guest, host, guestShell, hostShell, guestSession, hostSession };
}

test("actual mobile controllers use two HTTP sessions for mutual consent and immediate next-read revocation", async () => {
  const { url, stop } = await boot();
  try {
    const p = await pair(url);
    assert.equal(p.guest.heldRelay(), null); assert.equal(p.host.heldRelay(), null);
    await p.guestShell.acceptDisclosure();
    assert.equal(p.guest.heldRelay(), null);
    await p.host.refresh(); assert.equal(p.host.heldRelay(), null);
    await p.hostShell.acceptDisclosure(); await p.guest.refresh();
    assert.equal(p.guest.heldRelay(), "relay:ada.linden");
    assert.equal(p.host.heldRelay(), "relay:jules.okonkwo");
    assert.equal(p.guest.screen().demoLabel, "Synthetic demo");
    const alreadySeen = p.guest.screen().relay.value;
    const outsiderSession = await signIn(url, "mina");
    const outsider = await request(url, `/api/plans/${PLAN_ID}`, { token: outsiderSession.token });
    assert.equal(outsider.body.data.other.contact, null);
    const start = performance.now();
    await p.hostShell.revokeContact();
    const committedAfterMs = performance.now() - start;
    await p.guest.refresh();
    const firstDeniedRefreshMs = performance.now() - start;
    assert.equal(p.host.heldRelay(), null); assert.equal(p.guest.heldRelay(), null);
    assert.equal(p.guest.screen().relay.value, null);
    for (let read = 0; read < 10; read += 1) {
      const denied = await request(url, `/api/plans/${PLAN_ID}`, { token: p.guestSession.token });
      assert.equal(denied.body.data.other.contact, null);
    }
    assert.equal(alreadySeen, "relay:ada.linden", "Revocation cannot erase an already returned copy.");
    const trace = {
      scope: "Synthetic local Node HTTP integration; actual reviewed mobile controllers; no native UI/runtime claim",
      steps: ["discover", "visibility", "join", "host accept", "one-sided grant withheld", "mutual grants visible", "outsider withheld", "host revoke", "guest next refresh withheld", "10 subsequent HTTP reads withheld"],
      revokeCompletedAfterMs: committedAfterMs,
      guestFirstDeniedRefreshAfterStartMs: firstDeniedRefreshMs,
      pollingDelayAfterRevokeCompletionMs: firstDeniedRefreshMs - committedAfterMs,
      observedPostRevokeReadsWithoutContact: 11,
      priorCopyRecallClaimed: false,
      tokensOrPasscodesRecorded: false,
    };
    if (process.env.SOE_LOCAL_E2E_TRACE) await writeFile(process.env.SOE_LOCAL_E2E_TRACE, JSON.stringify(trace, null, 2) + "\n");
  } finally { await stop(); }
});

test("a lost committed join response reconciles by lookup without a second POST", async () => {
  const { url, stop } = await boot();
  try {
    const session = await signIn(url, "jules");
    let joins = 0;
    const lossy: typeof fetch = async (input, init) => {
      const response = await fetch(input, init);
      if (String(input).endsWith("/api/writes/join")) { joins += 1; throw new Error("Synthetic response loss after server commit"); }
      return response;
    };
    const client = createMobileClient(createLocalPrototypePort({ url, token: session.token, personId: "jules", fetcher: lossy }));
    await client.boot(); await client.reviewPlan(PLAN_ID);
    await client.requestJoin(PLAN_ID, "lost-join");
    assert.equal(client.screen().truthful, "unknown");
    await client.refresh(); assert.equal(client.screen().truthful, "unknown");
    await client.reconcile("join", "lost-join");
    assert.equal(client.ledgerEntries()[0].status, "committed");
    assert.equal(joins, 1);
  } finally { await stop(); }
});

test("a grant response arriving after background cannot restore contact until foreground", async () => {
  const { url, stop } = await boot();
  let delay = false;
  let release!: () => void;
  let started!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const seen = new Promise<void>(resolve => { started = resolve; });
  const delayed: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    if (delay && String(input).endsWith("/api/writes/grant")) { started(); await wait; }
    return response;
  };
  try {
    const p = await pair(url, delayed);
    await p.guestShell.acceptDisclosure(); await p.hostShell.acceptDisclosure(); await p.guest.refresh();
    assert.equal(p.guest.heldRelay(), "relay:ada.linden");
    await p.guestShell.revokeContact();
    delay = true;
    const pending = p.guestShell.acceptDisclosure();
    await seen;
    p.guest.releaseRelay(); release(); await pending;
    assert.equal(p.guest.heldRelay(), null);
    await p.guest.refresh(); assert.equal(p.guest.heldRelay(), null);
    await p.guest.foregroundRefresh(); assert.equal(p.guest.heldRelay(), "relay:ada.linden");
  } finally { release(); await stop(); }
});

test("expired HTTP sessions clear a previously visible mobile relay", async () => {
  const { world, url, stop } = await boot();
  try {
    const p = await pair(url);
    await p.guestShell.acceptDisclosure(); await p.hostShell.acceptDisclosure(); await p.guest.refresh();
    assert.equal(p.guest.heldRelay(), "relay:ada.linden");
    world.setNow(() => Date.now() + 8 * 24 * 60 * 60 * 1000);
    await p.guest.refresh();
    assert.equal(p.guest.screen().phase, "expired-session");
    assert.equal(p.guest.heldRelay(), null);
  } finally { await stop(); }
});

test("the integration bridge refuses remote and unverified destinations", async () => {
  const token = "a".repeat(64);
  for (const url of ["https://example.com", "http://localhost:8787", "http://127.0.0.1:8787/api", "http://127.0.0.1:8787/?x=1", "http://name@127.0.0.1:8787"]) {
    assert.throws(() => createLocalPrototypePort({ url, token, personId: "jules" }), /explicit http/);
  }
  let posts = 0;
  const wrongServer: typeof fetch = async (_input, init) => {
    if (init?.method === "POST") posts += 1;
    assert.equal(init?.redirect, "error");
    return new Response(JSON.stringify({ status: "ok", prototype: false }), { status: 200 });
  };
  const port = createLocalPrototypePort({ url: "http://127.0.0.1:8787", token, personId: "jules", fetcher: wrongServer });
  const result = await port.requestJoin({ personId: "jules", idempotencyKey: "never-send", payloadHash: "unused", body: { planId: PLAN_ID } });
  assert.equal(result.status, "unavailable");
  assert.equal(posts, 0);
});

test("an actual HTTP redirect cannot forward a synthetic write or session to another listener", async () => {
  let trapRequests = 0;
  const trap = createServer((_request, response) => { trapRequests += 1; response.end("unexpected"); });
  await new Promise<void>(resolve => { trap.listen(0, "127.0.0.1", resolve); });
  const trapAddress = trap.address();
  assert.ok(trapAddress && typeof trapAddress !== "string");
  const redirector = createServer((request, response) => {
    if (request.url === "/api/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "ok", prototype: true }));
    } else {
      response.writeHead(307, { location: `http://127.0.0.1:${trapAddress.port}/trap` });
      response.end();
    }
  });
  try {
    await new Promise<void>(resolve => { redirector.listen(0, "127.0.0.1", resolve); });
    const address = redirector.address();
    assert.ok(address && typeof address !== "string");
    const port = createLocalPrototypePort({ url: `http://127.0.0.1:${address.port}`, token: "a".repeat(64), personId: "jules" });
    const result = await port.requestJoin({ personId: "jules", idempotencyKey: "redirect-test", payloadHash: "unused", body: { planId: PLAN_ID } });
    assert.equal(result.status, "ambiguous");
    assert.equal(trapRequests, 0);
  } finally {
    await Promise.all([trap, redirector].map(server => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))));
  }
});
