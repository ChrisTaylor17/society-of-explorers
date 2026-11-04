import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createMobileClient } from "../src/client.ts";
import { createFixturePort, HOST, PLAN_ID } from "../src/fixture.ts";
import type { MeridianPort } from "../src/port.ts";

async function visibleClient() {
  const port = createFixturePort();
  const client = createMobileClient(port);
  await client.boot();
  await client.requestJoin(PLAN_ID, "review-join");
  port.scriptHostAcceptsPlan();
  await client.refresh();
  await client.acceptDisclosure("review-grant");
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

describe("read and write lifecycle", () => {
  test("offline invalidation survives a late authorized plan response", async () => {
    const { port, client } = await visibleClient();
    const response = await port.plan(PLAN_ID);
    const { started, finish } = delayPlan(port);
    const inFlight = client.refresh();
    await started;
    client.setOnline(false);
    assert.equal(client.screen().phase, "offline");
    assert.equal(client.heldRelay(), null);
    finish(response);
    await inFlight;
    assert.equal(client.screen().phase, "offline");
    assert.equal(client.heldRelay(), null);
    assert.equal(client.screen().relay.value, null);
  });

  test("a late plan response stays discarded after reconnect", async () => {
    const { port, client } = await visibleClient();
    const response = await port.plan(PLAN_ID);
    const { started, finish } = delayPlan(port);
    const inFlight = client.refresh();
    await started;
    client.setOnline(false);
    client.setOnline(true);
    finish(response);
    await inFlight;
    assert.notEqual(client.screen().phase, "mutual");
    assert.equal(client.heldRelay(), null);
    assert.equal(client.screen().relay.value, null);
    assert.equal(JSON.stringify(client.screen()).includes("relay handle is visible"), false);
  });

  test("a rejected refresh does not retain the old private relay", async () => {
    const { port, client } = await visibleClient();
    port.plan = async () => {
      throw new Error("synthetic transport loss");
    };
    try {
      await client.refresh();
    } catch {
      /* Inspect the resulting safe state. */
    }
    const screen = client.screen();
    assert.equal(client.heldRelay(), null);
    assert.notEqual(screen.phase, "loading");
    assert.equal(screen.relay.value, null);
    assert.equal(screen.title, "The refresh did not succeed");
    assert.match(screen.lede, /not current access/);
    assert.equal(screen.lede.includes("relay handle is visible"), false);
    assert.equal(screen.lede.includes("older than the latest version"), false);
  });

  test("refresh does not erase an unresolved revoke outcome or restore its relay", async () => {
    const { port, client } = await visibleClient();
    port.failNext("revoke", "drop-before");
    const unknown = await client.revokeContact("review-revoke");
    assert.equal(unknown.truthful, "unknown");
    assert.equal(unknown.title, "Revoke not confirmed");
    assert.equal(client.heldRelay(), null);
    const writes = port.writeAttempts;
    const refreshed = await client.refresh();
    assert.equal(refreshed.truthful, "unknown");
    assert.equal(refreshed.title, "Revoke not confirmed");
    assert.equal(refreshed.relay.value, null);
    assert.equal(client.heldRelay(), null);
    assert.equal(port.writeAttempts, writes);
    assert.equal(client.ledgerEntries().find((entry) => entry.key === "review-revoke")?.status, "ambiguous");
  });

  test("a revoke attempt clears the relay before the write returns", async () => {
    const { port, client } = await visibleClient();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = port.revokeContact.bind(port);
    port.revokeContact = async (input) => {
      assert.equal(client.heldRelay(), null);
      assert.equal(client.screen().phase, "join-pending");
      await gate;
      return original(input);
    };
    const pending = client.revokeContact("review-revoke-hold");
    release();
    const screen = await pending;
    assert.equal(screen.phase, "revoked");
    assert.equal(client.heldRelay(), null);
  });
});
