import assert from "node:assert/strict";
import { test } from "node:test";
import { createNativeSession } from "../../../mobile/src/native-session.ts";
import { createMobileClient } from "../../../mobile/src/client.ts";
import { payloadHash } from "../../../mobile/src/hash.ts";
import { createLocalPrototypePort } from "./mobile-local-port.ts";
import { createWorld } from "../src/world.js";
import { PLAN as SYNTHETIC_PLAN } from "../src/synthetic.js";

// Deterministic controller/adapter tests. Responses come from the unchanged
// synthetic world in-process, not from a native runtime or a socket transport.
const PLAN = SYNTHETIC_PLAN.id;
type Delivery = { path: string; method: string; body: any; result: any };
type Hook = (delivery: Delivery) => Promise<any> | any;

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function harness() {
  const world = createWorld({ allowFaults: false });
  const calls: { path: string; method: string; endpoint?: string; key?: string }[] = [];
  let hook: Hook = delivery => delivery.result;
  let before: Hook = () => undefined;
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "http://127.0.0.1:8787");
    const path = url.pathname;
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const token = new Headers(init?.headers).get("authorization")?.replace(/^Bearer /, "") ?? "";
    calls.push({ path, method, endpoint: path.startsWith("/api/writes/") ? path.split("/").at(-1) : undefined, key: body?.idempotencyKey });
    await before({ path, method, body, result: undefined });
    let result: any;
    if (path === "/api/health") result = { status: "ok", prototype: true };
    else if (path === "/api/session") result = await world.signIn(body.magicName, body.passcode);
    else if (path === "/api/plans") result = await world.discover(token);
    else if (path === `/api/plans/${PLAN}/visibility`) result = await world.visibility(token, PLAN);
    else if (path === `/api/plans/${PLAN}`) result = await world.plan(token, PLAN);
    else if (path.startsWith("/api/writes/")) result = await world.write(token, path.split("/").at(-1), body);
    else if (path === "/api/lookup") result = await world.lookup(token, body);
    else throw new Error(`Unexpected test path ${path}`);
    result = await hook({ path, method, body, result });
    return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
  };
  const session = () => createNativeSession({ development: true, mode: "local-http", origin: "http://127.0.0.1:8787", fetcher });
  let serial = 0;
  const hostWrite = (token: string, endpoint: string, body: any) => world.write(token, endpoint, {
    personId: "ada", idempotencyKey: `adversarial-host-${++serial}`, payloadHash: payloadHash(body), body,
  });
  return { world, calls, fetcher, session, hostWrite, setHook: (next: Hook) => { hook = next; }, setBefore: (next: Hook) => { before = next; } };
}

async function accepted(h: ReturnType<typeof harness>) {
  const session = h.session();
  await session.client.boot();
  const ada = await h.world.signIn("ada", "synthetic-ada");
  assert.equal(ada.status, "ok");
  await session.client.reviewPlan(PLAN);
  await session.shell.requestJoin(PLAN);
  assert.equal((await h.hostWrite(ada.token, "accept", { planId: PLAN, requesterId: "jules" })).status, "committed");
  await session.client.refresh();
  return { session, ada };
}

async function mutual(h: ReturnType<typeof harness>) {
  const p = await accepted(h);
  await p.session.shell.acceptDisclosure();
  const hostGrant = await h.hostWrite(p.ada.token, "grant", { planId: PLAN, otherId: "jules" });
  assert.equal(hostGrant.status, "committed");
  await p.session.client.refresh();
  assert.equal(p.session.client.heldRelay(), "relay:ada.linden");
  return { ...p, hostGrantId: hostGrant.data.permissionId };
}

function hidden(session: ReturnType<typeof createNativeSession>) {
  assert.equal(session.client.heldRelay(), null);
  assert.equal(session.client.screen().relay.value, null);
  assert.doesNotMatch(JSON.stringify(session.client.screen()), /relay:ada\.linden|relay:jules\.okonkwo/);
}

test("a committed revoke receipt rejects a replayed pre-revoke visible response", async () => {
  const h = harness();
  const { session } = await mutual(h);
  let visible: any;
  h.setHook(d => { if (d.path === `/api/plans/${PLAN}` && d.result.status === "ok") visible = structuredClone(d.result); return d.result; });
  await session.client.refresh();
  h.setHook(d => d.path === `/api/plans/${PLAN}` ? structuredClone(visible) : d.result);
  await session.shell.revokeContact();
  hidden(session);
  assert.equal(session.client.screen().phase, "failed-refresh");
});

test("a recorded revoke lookup rejects an older duplicated contact response", async () => {
  const h = harness();
  const { session } = await mutual(h);
  let visible: any;
  h.setHook(d => { if (d.path === `/api/plans/${PLAN}` && d.result.status === "ok") visible = structuredClone(d.result); return d.result; });
  await session.client.refresh();
  h.setHook(d => { if (d.path === "/api/writes/revoke") throw new Error("Dropped after commit"); return d.result; });
  await session.shell.revokeContact();
  assert.equal(session.client.screen().truthful, "unknown"); hidden(session);
  const entry = session.client.ledgerEntries().find(row => row.endpoint === "revoke")!;
  h.setHook(d => d.path === `/api/plans/${PLAN}` ? structuredClone(visible) : d.result);
  await session.client.reconcile(entry.endpoint, entry.key);
  assert.equal(entry.status, "committed"); hidden(session);
});

test("a recognized expired session cannot be revived by a duplicated earlier response", async () => {
  const h = harness();
  const { session } = await mutual(h);
  let visible: any;
  h.setHook(d => { if (d.path === `/api/plans/${PLAN}` && d.result.status === "ok") visible = structuredClone(d.result); return d.result; });
  await session.client.refresh();
  h.world.setNow(() => Date.now() + 8 * 24 * 60 * 60 * 1000);
  await session.client.refresh();
  assert.equal(session.client.screen().phase, "expired-session"); hidden(session);
  const count = h.calls.length;
  h.setHook(d => d.path === `/api/plans/${PLAN}` ? structuredClone(visible) : d.result);
  await session.client.foregroundRefresh();
  assert.equal(session.client.screen().phase, "expired-session"); hidden(session);
  assert.equal(h.calls.length, count, "An expired controller must require a new session, not retry stale access.");
});

test("a fresh native session uses a distinct write intent after the old session granted and revoked", async () => {
  const h = harness();
  const { session: first } = await mutual(h);
  await first.shell.revokeContact(); hidden(first);
  const second = h.session();
  await second.client.boot(); await second.client.reviewPlan(PLAN); await second.client.refresh();
  assert.equal(second.client.screen().phase, "revoked");
  await second.shell.acceptDisclosure();
  assert.equal(second.client.heldRelay(), "relay:ada.linden", "New consent must not replay the first session's now-revoked grant receipt.");
  const grants = h.calls.filter(row => row.endpoint === "grant");
  assert.equal(grants.length, 2); assert.notEqual(grants[0].key, grants[1].key);
  assert.notEqual(first.client.ledgerEntries(), second.client.ledgerEntries());
  await first.client.refresh();
  assert.equal(first.client.screen().phase, "expired-session"); hidden(first);
  assert.equal(second.client.heldRelay(), "relay:ada.linden");
});

for (const endpoint of ["join", "grant", "revoke"] as const) {
  for (const lostAt of ["before", "after"] as const) {
    test(`${endpoint} response dropped ${lostAt} commit stays unknown without duplicate writes`, async () => {
      const h = harness();
      const session = endpoint === "join" ? h.session() : (await (endpoint === "grant" ? accepted(h) : mutual(h))).session;
      if (endpoint === "join") { await session.client.boot(); await session.client.reviewPlan(PLAN); }
      const fail: Hook = d => { if (d.path === `/api/writes/${endpoint}`) throw new Error(`Deliberate ${lostAt} loss`); return d.result; };
      if (lostAt === "before") h.setBefore(fail); else h.setHook(fail);
      const run = () => endpoint === "join" ? session.shell.requestJoin(PLAN) : endpoint === "grant" ? session.shell.acceptDisclosure() : session.shell.revokeContact();
      const prior = h.calls.filter(row => row.endpoint === endpoint).length;
      await run(); hidden(session); assert.equal(session.client.screen().truthful, "unknown");
      const entry = [...session.client.ledgerEntries()].reverse().find(row => row.endpoint === endpoint)!;
      await Promise.all([run(), run(), session.client.foregroundRefresh()]);
      hidden(session); assert.equal(session.client.screen().truthful, "unknown");
      assert.equal(h.calls.filter(row => row.endpoint === endpoint).length, prior + 1);
      h.setBefore(() => undefined); h.setHook(d => d.result);
      await session.client.reconcile(entry.endpoint, entry.key);
      hidden(session);
      assert.equal(entry.status, lostAt === "after" ? "committed" : "ambiguous");
      if (lostAt === "before") assert.equal(session.client.screen().truthful, "unknown");
      assert.equal(h.calls.filter(row => row.endpoint === endpoint).length, prior + 1);
    });
  }
}

test("revoke intent clears immediately while an older read occupies the controller queue", async () => {
  const h = harness(); const { session } = await mutual(h);
  const readStarted = deferred(); const releaseRead = deferred();
  const writeStarted = deferred(); const releaseWrite = deferred();
  h.setHook(async d => {
    if (d.path === `/api/plans/${PLAN}`) { readStarted.resolve(); await releaseRead.promise; }
    if (d.path === "/api/writes/revoke") { writeStarted.resolve(); await releaseWrite.promise; }
    return d.result;
  });
  const refresh = session.client.refresh(); await readStarted.promise;
  const revoke = session.shell.revokeContact(); hidden(session);
  releaseRead.resolve(); const readScreen = await refresh;
  assert.equal(readScreen.relay.value, null, "The returned delayed screen must stay hidden before the revoke receipt completes");
  await writeStarted.promise; hidden(session);
  releaseWrite.resolve(); await revoke; hidden(session);
});

test("a delayed grant receipt cannot override the other actor's later revoke", async () => {
  const h = harness(); const { session, ada } = await accepted(h);
  const hostGrant = await h.hostWrite(ada.token, "grant", { planId: PLAN, otherId: "jules" });
  const committed = deferred(); const deliver = deferred();
  h.setHook(async d => {
    if (d.path === "/api/writes/grant") { committed.resolve(); await deliver.promise; }
    return d.result;
  });
  const grant = session.shell.acceptDisclosure(); await committed.promise; hidden(session);
  assert.equal((await h.hostWrite(ada.token, "revoke", { permissionId: hostGrant.data.permissionId })).status, "committed");
  deliver.resolve(); await grant; hidden(session);
  assert.notEqual(session.client.screen().eyebrow, "Mutual acceptance");
});

test("duplicated and reordered pre-revoke responses cannot restore contact after observing the newer remote state", async () => {
  const h = harness(); const { session, ada, hostGrantId } = await mutual(h);
  let old: any;
  h.setHook(d => { if (d.path === `/api/plans/${PLAN}`) old = structuredClone(d.result); return d.result; });
  await session.client.refresh(); h.setHook(d => d.result);
  await h.hostWrite(ada.token, "revoke", { permissionId: hostGrantId });
  await session.client.refresh(); hidden(session);
  for (const duplicate of [old, old, { ...old, version: old.version - 1, data: { ...old.data, version: old.version - 1 } }]) {
    h.setHook(d => d.path === `/api/plans/${PLAN}` ? structuredClone(duplicate) : d.result);
    await session.client.foregroundRefresh(); hidden(session);
    assert.equal(session.client.screen().phase, "failed-refresh");
  }
  h.setHook(d => d.result); await session.client.refresh(); hidden(session);
});

for (const state of ["background", "inactive"]) {
  test(`${state} during a delayed read blocks late and queued reads until a valid foreground refresh`, async () => {
    const h = harness(); const { session } = await mutual(h);
    const readStarted = deferred(); const deliver = deferred(); let once = true;
    h.setHook(async d => {
      if (once && d.path === `/api/plans/${PLAN}`) { once = false; readStarted.resolve(); await deliver.promise; }
      return d.result;
    });
    const pending = session.client.refresh(); await readStarted.promise;
    session.activity(state); hidden(session);
    const foreground = session.activity("active"); assert.equal(foreground?.kind, "refresh");
    const queued = foreground?.kind === "refresh" ? foreground.run() : Promise.resolve();
    session.activity(state); deliver.resolve(); await pending; await queued; hidden(session);
    await session.client.refresh(); hidden(session);
    const next = session.activity("active"); if (next?.kind === "refresh") await next.run();
    assert.equal(session.client.heldRelay(), "relay:ada.linden");
  });
}

test("expiry after a delayed committed grant clears contact and blocks queued writes and lifecycle refreshes", async () => {
  const h = harness(); const { session, ada } = await accepted(h);
  await h.hostWrite(ada.token, "grant", { planId: PLAN, otherId: "jules" });
  const committed = deferred(); const deliver = deferred();
  h.setHook(async d => { if (d.path === "/api/writes/grant") { committed.resolve(); await deliver.promise; } return d.result; });
  const pending = session.shell.acceptDisclosure(); await committed.promise;
  h.world.setNow(() => Date.now() + 8 * 24 * 60 * 60 * 1000);
  deliver.resolve(); await pending; hidden(session);
  assert.equal(session.client.screen().phase, "expired-session");
  const count = h.calls.length;
  await Promise.all([session.client.boot(), session.client.reviewPlan(PLAN), session.shell.requestJoin(PLAN), session.client.foregroundRefresh()]);
  hidden(session); assert.equal(session.client.screen().phase, "expired-session");
  assert.equal(h.calls.length, count);
});

test("distinct synthetic actors isolate contacts, ledgers, high-water marks and write ownership", async () => {
  const h = harness(); const { session: guest, ada } = await mutual(h);
  const mina = await h.world.signIn("mina", "synthetic-mina");
  const hostPort = createLocalPrototypePort({ url: "http://127.0.0.1:8787", token: ada.token, personId: "ada", fetcher: h.fetcher });
  const outsiderPort = createLocalPrototypePort({ url: "http://127.0.0.1:8787", token: mina.token, personId: "mina", fetcher: h.fetcher });
  const host = createMobileClient(hostPort); const outsider = createMobileClient(outsiderPort);
  await Promise.all([host.boot(), outsider.boot()]);
  await Promise.all([host.reviewPlan(PLAN), outsider.reviewPlan(PLAN)]);
  await Promise.all([host.refresh(), outsider.refresh()]);
  assert.equal(host.heldRelay(), "relay:jules.okonkwo"); assert.equal(outsider.heldRelay(), null);
  assert.equal(guest.client.heldRelay(), "relay:ada.linden");
  const count = h.calls.length;
  const spoofed = await outsiderPort.revokeContact({ personId: "ada", idempotencyKey: "spoofed", payloadHash: "unused", body: { permissionId: "grant-1" } });
  assert.equal(spoofed.status, "rejected"); assert.equal(h.calls.length, count);
  assert.equal(outsider.ledgerEntries().length, 0);
  await guest.shell.revokeContact(); await host.refresh(); await outsider.refresh();
  hidden(guest); assert.equal(host.heldRelay(), null); assert.equal(outsider.heldRelay(), null);
});

for (const endpoint of ["grant", "revoke"] as const) {
  test(`duplicated controller ${endpoint} actions during a delayed committed response send one write`, async () => {
    const h = harness(); const { session } = await (endpoint === "grant" ? accepted(h) : mutual(h));
    const committed = deferred(); const deliver = deferred();
    h.setHook(async d => { if (d.path === `/api/writes/${endpoint}`) { committed.resolve(); await deliver.promise; } return d.result; });
    const count = h.calls.filter(row => row.endpoint === endpoint).length;
    const run = () => endpoint === "grant" ? session.shell.acceptDisclosure() : session.shell.revokeContact();
    const first = run(); await committed.promise;
    const duplicate = run(); hidden(session); deliver.resolve();
    await first; await duplicate;
    assert.equal(h.calls.filter(row => row.endpoint === endpoint).length, count + 1);
    hidden(session);
  });
}
