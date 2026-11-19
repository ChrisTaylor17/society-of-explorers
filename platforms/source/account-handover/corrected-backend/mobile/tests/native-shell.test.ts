import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { relayLifecycleForAppActivity } from "../src/app-state.ts";
import { createMobileClient } from "../src/client.ts";
import { createFixturePort, HOST, PLAN_ID } from "../src/fixture.ts";
import type { MeridianPort } from "../src/port.ts";
import { createShellActions } from "../src/shell-actions.ts";

async function visibleClient() {
  const port = createFixturePort();
  const client = createMobileClient(port);
  await client.boot();
  await client.requestJoin(PLAN_ID, "shell-join");
  port.scriptHostAcceptsPlan();
  await client.refresh();
  await client.acceptDisclosure("shell-grant");
  port.scriptHostGrantsContact();
  await client.refresh();
  assert.equal(client.heldRelay(), HOST.relay);
  return { port, client };
}

function delayPlan(port: ReturnType<typeof createFixturePort>) {
  let signalStart!: () => void;
  const started = new Promise<void>((resolve) => {
    signalStart = resolve;
  });
  let finish!: (value: Awaited<ReturnType<MeridianPort["plan"]>>) => void;
  const delayed = new Promise<Awaited<ReturnType<MeridianPort["plan"]>>>((resolve) => {
    finish = resolve;
  });
  port.plan = () => {
    signalStart();
    return delayed;
  };
  return { started, finish };
}

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === ".expo") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path));
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(path);
  }
  return out;
}

describe("native shell boundaries", () => {
  test("background and inactive clear, and foreground only refreshes", () => {
    assert.equal(relayLifecycleForAppActivity("background"), "clear");
    assert.equal(relayLifecycleForAppActivity("inactive"), "clear");
    assert.equal(relayLifecycleForAppActivity("active"), "refresh");
    assert.equal(relayLifecycleForAppActivity("unknown"), "leave");
    assert.equal(relayLifecycleForAppActivity("extension"), "leave");
  });

  test("an in-flight plan read cannot restore a relay released in the background", async () => {
    const { port, client } = await visibleClient();
    const response = await port.plan(PLAN_ID);
    const attempts = port.writeAttempts;
    const { started, finish } = delayPlan(port);
    const inFlight = client.refresh();
    await started;
    const released = client.releaseRelay();
    assert.equal(released.phase, "loading");
    assert.equal(released.relay.value, null);
    assert.notEqual(released.phase, "offline");
    finish(response);
    await inFlight;
    assert.equal(client.screen().phase, "mutual");
    assert.equal(client.screen().relay.state, "withheld");
    assert.equal(client.screen().relay.value, null);
    assert.match(client.screen().relay.note, /not written to disk/i);
    assert.equal(client.heldRelay(), null);
    assert.equal(port.writeAttempts, attempts);
    await client.refresh();
    assert.equal(client.heldRelay(), null);
    assert.equal(client.screen().relay.value, null);
    await client.foregroundRefresh();
    assert.equal(client.heldRelay(), HOST.relay);
    assert.equal(client.screen().relay.state, "memory");
    assert.equal(port.writeAttempts, attempts);
  });

  test("foreground refresh leaves an ambiguous revoke unknown and does not send it again", async () => {
    const { port, client } = await visibleClient();
    port.failNext("revoke", "drop-before");
    const unknown = await client.revokeContact("shell-revoke");
    assert.equal(unknown.truthful, "unknown");
    assert.equal(unknown.phase, "join-ambiguous");
    assert.equal(client.heldRelay(), null);
    const attempts = port.writeAttempts;
    assert.equal(relayLifecycleForAppActivity("background"), "clear");
    client.releaseRelay();
    assert.equal(relayLifecycleForAppActivity("active"), "refresh");
    const refreshed = await client.refresh();
    assert.equal(refreshed.truthful, "unknown");
    assert.equal(refreshed.phase, "join-ambiguous");
    assert.equal(refreshed.title, "Revoke not confirmed");
    assert.equal(client.heldRelay(), null);
    assert.equal(port.writeAttempts, attempts);
    assert.equal(client.ledgerEntries().find((entry) => entry.key === "shell-revoke")?.status, "ambiguous");
  });

  test("a grant completing after background cannot restore the held relay before foreground", async () => {
    const { port, client } = await visibleClient();
    await client.revokeContact("setup-revoke");
    assert.equal(client.heldRelay(), null);
    const original = port.acceptDisclosure.bind(port);
    let signal!: () => void;
    const started = new Promise<void>((resolve) => {
      signal = resolve;
    });
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    port.acceptDisclosure = async (request) => {
      signal();
      await gate;
      return original(request);
    };
    const granting = client.acceptDisclosure("new-grant-intent");
    await started;
    assert.equal(relayLifecycleForAppActivity("background"), "clear");
    assert.equal(relayLifecycleForAppActivity("inactive"), "clear");
    client.releaseRelay();
    assert.equal(client.heldRelay(), null);
    finish();
    await granting;
    assert.equal(client.heldRelay(), null);
    assert.equal(client.screen().relay.value, null);
    assert.equal(port.grantCount(), 3);
    await client.foregroundRefresh();
    assert.equal(client.heldRelay(), HOST.relay);
    assert.equal(client.screen().relay.value, HOST.relay);
  });

  test("a refresh queued across background stays withheld until foreground authorization", async () => {
    const { port, client } = await visibleClient();
    const response = await port.plan(PLAN_ID);
    const attempts = port.writeAttempts;
    const { started, finish } = delayPlan(port);
    const first = client.refresh();
    await started;
    client.releaseRelay();
    const queued = client.refresh();
    finish(response);
    await first;
    await queued;
    assert.equal(client.heldRelay(), null);
    assert.equal(client.screen().relay.value, null);
    assert.equal(port.writeAttempts, attempts);
    await client.foregroundRefresh();
    assert.equal(client.heldRelay(), HOST.relay);
    assert.equal(port.writeAttempts, attempts);
  });

  test("foreground authorization is dropped when background wins before that read", async () => {
    const { port, client } = await visibleClient();
    const response = await port.plan(PLAN_ID);
    const { started, finish } = delayPlan(port);
    const pending = client.foregroundRefresh();
    await started;
    client.releaseRelay();
    finish(response);
    await pending;
    assert.equal(client.heldRelay(), null);
    assert.equal(client.screen().relay.value, null);
    await client.refresh();
    assert.equal(client.heldRelay(), null);
  });

  test("the shell accept action after revoke creates a new grant instead of replaying its first key", async () => {
    const port = createFixturePort();
    const client = createMobileClient(port);
    const shell = createShellActions(client);
    await client.boot();
    await client.reviewPlan(PLAN_ID);
    await shell.requestJoin(PLAN_ID);
    port.scriptHostAcceptsPlan();
    await client.refresh();
    await shell.acceptDisclosure();
    port.scriptHostGrantsContact();
    await client.refresh();
    assert.equal(client.heldRelay(), HOST.relay);
    await shell.revokeContact();
    assert.equal(client.screen().facts.find((fact) => fact.label === "Your contact grant")?.value, "Not active");
    assert.equal(client.screen().actions.some((action) => action.id === "accept" && action.enabled), true);

    const beforeSecondGrant = port.writeAttempts;
    const accept = client.screen().actions.find((action) => action.id === "accept");
    assert.equal(accept?.enabled, true);
    const accepted = await shell.run(accept!, PLAN_ID);
    assert.ok(accepted);
    assert.equal(client.screen().facts.find((fact) => fact.label === "Your contact grant")?.value, "Active");
    assert.equal(client.heldRelay(), HOST.relay);
    assert.ok(port.writeAttempts > beforeSecondGrant);
    const grantKeys = client.ledgerEntries().filter((entry) => entry.endpoint === "grant" && entry.status === "committed");
    assert.equal(grantKeys.length, 2);
    assert.notEqual(grantKeys[0]?.key, grantKeys[1]?.key);

    const replayAttempts = port.writeAttempts;
    const replayMutations = port.mutations;
    await client.acceptDisclosure(grantKeys[0]!.key);
    assert.equal(port.writeAttempts, replayAttempts);
    assert.equal(port.mutations, replayMutations);

    const beforeSecondRevoke = port.writeAttempts;
    await shell.revokeContact();
    assert.equal(client.screen().facts.find((fact) => fact.label === "Your contact grant")?.value, "Not active");
    assert.equal(client.screen().phase, "revoked");
    assert.ok(port.writeAttempts > beforeSecondRevoke);
    const revokeKeys = client.ledgerEntries().filter((entry) => entry.endpoint === "revoke" && entry.status === "committed");
    assert.equal(revokeKeys.length, 2);
    assert.notEqual(revokeKeys[0]?.key, revokeKeys[1]?.key);
    assert.notEqual(revokeKeys[0]?.payloadHash, revokeKeys[1]?.payloadHash);
    assert.equal(client.heldRelay(), null);
  });

  test("shell reconciliation reuses the stored key and does not send a second write", async () => {
    const port = createFixturePort();
    const client = createMobileClient(port);
    const shell = createShellActions(client);
    await client.boot();
    await client.reviewPlan(PLAN_ID);
    port.failNext("join", "pending");
    await shell.requestJoin(PLAN_ID);
    const pendingAction = client.screen().actions.find((action) => action.id === "reconcile");
    assert.equal(pendingAction?.enabled, true);
    assert.equal(pendingAction?.idempotencyKey, "shell-join-1");
    const pendingAttempts = port.writeAttempts;
    await shell.reconcile(pendingAction!);
    assert.equal(port.writeAttempts, pendingAttempts);
    assert.equal(client.screen().truthful, "pending");
    await shell.requestJoin(PLAN_ID);
    assert.equal(port.writeAttempts, pendingAttempts);
    assert.equal(client.screen().phase, "join-pending");
    assert.equal(client.ledgerEntries().filter((entry) => entry.endpoint === "join").length, 1);

    const other = createFixturePort();
    const otherClient = createMobileClient(other);
    const otherShell = createShellActions(otherClient);
    await otherClient.boot();
    await otherClient.reviewPlan(PLAN_ID);
    other.failNext("join", "drop-before");
    await otherShell.requestJoin(PLAN_ID);
    assert.equal(otherClient.screen().truthful, "unknown");
    const unknownAction = otherClient.screen().actions.find((action) => action.id === "reconcile");
    assert.equal(unknownAction?.idempotencyKey, "shell-join-1");
    const unknownAttempts = other.writeAttempts;
    const lookups = other.lookups;
    await otherShell.run(unknownAction!, PLAN_ID);
    assert.equal(other.writeAttempts, unknownAttempts);
    assert.equal(other.lookups, lookups + 1);
    assert.equal(otherClient.screen().truthful, "unknown");
    assert.equal(otherClient.ledgerEntries().find((entry) => entry.key === "shell-join-1")?.status, "ambiguous");
  });

  test("runtime source has no Node imports and the shell labels fixture controls", () => {
    const root = join(import.meta.dirname, "..");
    const files = filesUnder(join(root, "src")).concat(filesUnder(join(root, "native")));
    assert.ok(files.some((file) => file.endsWith(`${join("native", "App.tsx")}`)));
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      assert.equal(/from\s+["']node:/.test(text), false, file);
      assert.equal(/require\(\s*["']node:/.test(text), false, file);
      assert.equal(/\bAsyncStorage\b/.test(text), false, file);
      assert.equal(/\bSecureStore\b/.test(text), false, file);
      assert.equal(/\bwriteFile(Sync)?\b/.test(text), false, file);
      assert.equal(/\blocalStorage\s*[.\[]/.test(text), false, file);
    }
    const app = readFileSync(join(root, "native/App.tsx"), "utf8");
    assert.match(app, /Synthetic demo/);
    assert.match(app, /accessibilityLabel/);
    assert.match(app, /Synthetic fixture control\. No other person accepted\./);
    assert.match(app, /createShellActions/);
    assert.match(app, /foregroundRefresh/);
    assert.equal(app.includes("shell-grant"), false);
    assert.equal(app.includes("shell-revoke"), false);
    assert.equal(app.includes("shell-join"), false);
    assert.equal(app.includes("src/http.ts"), false);
    assert.equal(app.includes("createHttpPort"), false);
    const hash = readFileSync(join(root, "src/hash.ts"), "utf8");
    assert.equal(hash.includes("node:crypto"), false);
  });
});
