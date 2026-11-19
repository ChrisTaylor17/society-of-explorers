import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createMobileClient } from "../src/client.ts";
import { createFixturePort, HOST, PLAN_ID } from "../src/fixture.ts";
import type { MeridianPort } from "../src/port.ts";

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("truthful device states", () => {
  test("boot stays on loading until the read returns", async () => {
    const gate = deferred<Awaited<ReturnType<MeridianPort["discover"]>>>();
    const port = createFixturePort();
    port.discover = () => gate.promise;
    const client = createMobileClient(port);
    const pending = client.boot();
    assert.equal(client.screen().phase, "loading");
    assert.equal(client.screen().truthful, "loading");
    assert.equal(client.screen().relay.value, null);
    gate.resolve({
      status: "ok",
      version: 1,
      data: [
        {
          id: PLAN_ID,
          version: 1,
          title: "Saturday riverside walk",
          kindLabel: "A walk",
          whenLabel: "Saturday morning",
          placeLabel: "Riverside path",
          hostName: HOST.displayName,
          sharedInterests: [],
          sharedWindows: ["Saturday morning"],
        },
      ],
    });
    await pending;
    assert.equal(client.screen().phase, "discover");
  });

  test("offline does not call the adapter and clears a held relay", async () => {
    const port = createFixturePort();
    const client = createMobileClient(port);
    await client.boot();
    await client.requestJoin(PLAN_ID, "join-offline");
    port.scriptHostAcceptsPlan();
    await client.refresh();
    await client.acceptDisclosure("grant-offline");
    port.scriptHostGrantsContact();
    await client.refresh();
    assert.equal(client.heldRelay(), HOST.relay);
    const reads = port.reads;
    const writes = port.writeAttempts;
    client.setOnline(false);
    const offline = client.screen();
    assert.equal(offline.phase, "offline");
    assert.equal(offline.relay.value, null);
    assert.equal(client.heldRelay(), null);
    await client.requestJoin(PLAN_ID, "join-while-offline");
    await client.refresh();
    assert.equal(port.reads, reads);
    assert.equal(port.writeAttempts, writes);
  });

  test("an expired session clears the relay and does not collect a passcode", async () => {
    const port = createFixturePort();
    const client = createMobileClient(port);
    await client.boot();
    await client.requestJoin(PLAN_ID, "join-expire");
    port.scriptHostAcceptsPlan();
    await client.refresh();
    await client.acceptDisclosure("grant-expire");
    port.scriptHostGrantsContact();
    await client.refresh();
    port.expireSession();
    const expired = await client.refresh();
    assert.equal(expired.phase, "expired-session");
    assert.equal(client.heldRelay(), null);
    assert.equal(JSON.stringify(expired).includes(HOST.relay), false);
    assert.match(expired.lede, /does not collect a passcode/);
    const attempts = port.writeAttempts;
    await client.requestJoin(PLAN_ID, "join-after-expire");
    assert.equal(port.invitationStatus(), "accepted");
    assert.equal(port.writeAttempts, attempts);
    assert.equal(client.screen().phase, "expired-session");
    assert.equal(
      client.ledgerEntries().some((entry) => entry.status === "committed" && entry.key === "join-after-expire"),
      false,
    );
  });

  test("a pending join is not success and is not sent twice", async () => {
    const port = createFixturePort();
    port.failNext("join", "pending");
    const client = createMobileClient(port);
    await client.boot();
    const pending = await client.requestJoin(PLAN_ID, "join-pending");
    assert.equal(pending.phase, "join-pending");
    assert.equal(pending.truthful, "pending");
    assert.equal(pending.title, "Join request still pending");
    assert.equal(port.invitationStatus(), "none");
    assert.equal(port.mutations, 0);
    assert.equal(port.writeAttempts, 1);
    const again = await client.requestJoin(PLAN_ID, "another-key");
    assert.equal(again.phase, "join-pending");
    assert.match(again.lede, /not send it again|was not sent again/);
    assert.equal(port.writeAttempts, 1);
    assert.equal(client.ledgerEntries().find((entry) => entry.key === "join-pending")?.status, "pending");
    const looked = port.lookups;
    await client.reconcile("join", "join-pending");
    assert.equal(port.lookups, looked + 1);
    assert.equal(port.writeAttempts, 1);
    assert.equal(client.screen().truthful, "pending");
    assert.equal(port.invitationStatus(), "none");
  });

  test("an ambiguous join stays unknown, and a lost response can be reconciled without a second insert", async () => {
    const lost = createFixturePort();
    lost.failNext("join", "drop-before");
    const client = createMobileClient(lost);
    await client.boot();
    const ambiguous = await client.requestJoin(PLAN_ID, "join-lost");
    assert.equal(ambiguous.truthful, "unknown");
    assert.equal(ambiguous.phase, "join-ambiguous");
    assert.notEqual(ambiguous.truthful, "committed");
    assert.equal(lost.invitationStatus(), "none");
    await client.requestJoin(PLAN_ID, "join-lost");
    await client.requestJoin(PLAN_ID, "fresh-key-should-not-send");
    assert.equal(lost.writeAttempts, 1);
    await client.reconcile("join", "join-lost");
    assert.equal(client.screen().phase, "join-ambiguous");
    assert.equal(lost.mutations, 0);

    const stored = createFixturePort();
    stored.failNext("join", "drop-after");
    const other = createMobileClient(stored);
    await other.boot();
    const dropped = await other.requestJoin(PLAN_ID, "join-stored");
    assert.equal(dropped.truthful, "unknown");
    assert.equal(stored.invitationStatus(), "invited");
    assert.equal(stored.mutations, 1);
    await other.reconcile("join", "join-stored");
    assert.equal(other.screen().truthful, "committed");
    assert.equal(stored.mutations, 1);
    assert.equal(stored.writeAttempts, 1);
  });

  test("the same key with a different payload conflicts, and the same payload replays", async () => {
    const port = createFixturePort();
    const client = createMobileClient(port);
    await client.boot();
    await client.requestJoin(PLAN_ID, "same-key");
    assert.equal(port.mutations, 1);
    const conflict = await client.requestJoin("plan-other", "same-key");
    assert.match(conflict.blockers.join(" ") + conflict.lede, /different request/);
    assert.equal(port.writeAttempts, 1);
    assert.equal(port.mutations, 1);

    const replay = createMobileClient(port);
    await replay.boot();
    await replay.requestJoin(PLAN_ID, "same-key");
    assert.equal(port.mutations, 1);
    assert.equal(replay.screen().truthful, "committed");
  });

  test("a lower version is ignored and the relay is cleared", async () => {
    const port = createFixturePort();
    const client = createMobileClient(port);
    await client.boot();
    await client.requestJoin(PLAN_ID, "join-stale");
    port.scriptHostAcceptsPlan();
    await client.refresh();
    await client.acceptDisclosure("grant-stale");
    port.scriptHostGrantsContact();
    await client.refresh();
    assert.equal(client.heldRelay(), HOST.relay);
    port.pushStaleRead({ version: 1, title: "Leaked title", contact: HOST.relay });
    const stale = await client.refresh();
    assert.equal(stale.phase, "failed-refresh");
    assert.equal(stale.truthful, "failed-refresh");
    assert.equal(stale.title, "Saturday riverside walk");
    assert.equal(stale.relay.value, null);
    assert.equal(client.heldRelay(), null);
    assert.equal(JSON.stringify(stale).includes("Leaked title"), false);
    assert.equal(JSON.stringify(stale).includes(HOST.relay), false);
  });

  test("an ambiguous revoke stays unconfirmed while the grant remains", async () => {
    const port = createFixturePort();
    const client = createMobileClient(port);
    await client.boot();
    await client.requestJoin(PLAN_ID, "join-revoke-unknown");
    port.scriptHostAcceptsPlan();
    await client.refresh();
    await client.acceptDisclosure("grant-revoke-unknown");
    port.scriptHostGrantsContact();
    await client.refresh();
    assert.equal(client.heldRelay(), HOST.relay);
    port.failNext("revoke", "drop-before");
    const ambiguous = await client.revokeContact("revoke-unknown");
    assert.equal(ambiguous.truthful, "unknown");
    assert.equal(ambiguous.title, "Revoke not confirmed");
    assert.equal(ambiguous.phase, "join-ambiguous");
    assert.equal(client.heldRelay(), null);
    assert.equal(port.grantCount(), 2);
    const attempts = port.writeAttempts;
    await client.revokeContact("revoke-unknown-again");
    assert.equal(port.writeAttempts, attempts);
    assert.notEqual(client.screen().phase, "revoked");
  });

  test("two join taps serialize to one mutation", async () => {
    const port = createFixturePort();
    const client = createMobileClient(port);
    await client.boot();
    await Promise.all([client.requestJoin(PLAN_ID, "tap-1"), client.requestJoin(PLAN_ID, "tap-2")]);
    assert.equal(port.mutations, 1);
    assert.equal(port.invitationStatus(), "invited");
  });
});
