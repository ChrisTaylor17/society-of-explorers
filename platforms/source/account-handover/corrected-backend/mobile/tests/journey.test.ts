import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { contactDisclosure } from "../../meridian/src/lib/consent.ts";
import { DEMO_ACCOUNTS } from "../../meridian/src/lib/catalog.ts";
import { createMobileClient } from "../src/client.ts";
import { DEMO_LABEL, REVOCATION_LIMIT } from "../src/copy.ts";
import { createFixturePort, HOST, PLAN_ID, VIEWER } from "../src/fixture.ts";

describe("adult journey on the synthetic fixture", () => {
  test("demo people match the Meridian catalog display fields and omit passcodes", () => {
    const ada = DEMO_ACCOUNTS.find((account) => account.magicName === "ada");
    const jules = DEMO_ACCOUNTS.find((account) => account.magicName === "jules");
    assert.ok(ada && jules);
    assert.equal(HOST.displayName, ada.displayName);
    assert.equal(HOST.relay, ada.contactHandle);
    assert.deepEqual(HOST.interests, [...ada.interests]);
    assert.equal(VIEWER.displayName, jules.displayName);
    assert.equal(VIEWER.relay, jules.contactHandle);
    assert.equal(JSON.stringify(HOST).includes("passcode"), false);
    assert.equal(JSON.stringify(VIEWER).includes(ada.passcode), false);
  });

  test("discover, visibility, join, mutual acceptance, then revoke", async () => {
    const port = createFixturePort();
    const client = createMobileClient(port);
    await client.boot();
    const discover = client.screen();
    assert.equal(discover.phase, "discover");
    assert.equal(discover.demoLabel, DEMO_LABEL);
    assert.equal(discover.revocationNote, REVOCATION_LIMIT);
    assert.equal(discover.title, "Saturday riverside walk");
    assert.match(discover.lede, /Saturday morning/);
    assert.match(discover.lede, /none/);
    assert.equal(JSON.stringify(discover).includes(HOST.relay), false);
    assert.equal(port.writeAttempts, 0);

    await client.reviewPlan(PLAN_ID);
    const visibility = client.screen();
    assert.equal(visibility.phase, "visibility");
    assert.equal(visibility.relay.value, null);
    assert.equal(JSON.stringify(visibility).includes(HOST.relay), false);
    assert.ok(visibility.facts.some((fact) => fact.label === "Relay handle" && fact.value.startsWith("Hidden")));
    assert.ok(visibility.facts.some((fact) => fact.label === "Copies already seen"));
    assert.equal(visibility.actions.find((action) => action.id === "join")?.enabled, true);

    const requested = await client.requestJoin(PLAN_ID, "join-1");
    assert.equal(requested.truthful, "committed");
    assert.equal(requested.phase, "mutual");
    assert.match(requested.lede, /Accept the plan before any relay/);
    assert.equal(requested.relay.value, null);
    assert.equal(port.invitationStatus(), "invited");
    assert.equal(port.mutations, 1);

    assert.equal((await client.acceptDisclosure("too-soon")).truthful, "committed");
    assert.equal(port.writeAttempts, 1);

    port.scriptHostAcceptsPlan();
    await client.refresh();
    const ready = client.screen();
    assert.equal(ready.actions.find((action) => action.id === "accept")?.enabled, true);
    assert.equal(ready.relay.value, null);

    await client.acceptDisclosure("grant-1");
    assert.equal(client.heldRelay(), null);
    port.scriptHostGrantsContact();
    await client.refresh();
    const mutual = client.screen();
    assert.equal(mutual.phase, "mutual");
    assert.equal(mutual.eyebrow, "Mutual acceptance");
    assert.equal(mutual.relay.state, "memory");
    assert.equal(mutual.relay.value, HOST.relay);
    assert.match(mutual.relay.note, /Not written to disk/);
    assert.equal(client.heldRelay(), HOST.relay);
    const expected = contactDisclosure({
      viewerId: VIEWER.id,
      otherId: HOST.id,
      planId: PLAN_ID,
      invitationStatus: "accepted",
      grants: [
        {
          grantorId: VIEWER.id,
          granteeId: HOST.id,
          scope: "contact",
          resourceId: PLAN_ID,
          status: "active",
        },
        {
          grantorId: HOST.id,
          granteeId: VIEWER.id,
          scope: "contact",
          resourceId: PLAN_ID,
          status: "active",
        },
      ],
    });
    assert.equal(expected.visible, true);
    assert.equal(mutual.lede, expected.reason);

    const revoked = await client.revokeContact("revoke-1");
    assert.equal(revoked.phase, "revoked");
    assert.equal(revoked.truthful, "committed");
    assert.equal(revoked.relay.value, null);
    assert.equal(client.heldRelay(), null);
    assert.match(revoked.lede, /already saw/);
    assert.match(revoked.revocationNote, /cannot erase information someone already saw/);
    const revokedReason = contactDisclosure({
      viewerId: VIEWER.id,
      otherId: HOST.id,
      planId: PLAN_ID,
      invitationStatus: "accepted",
      grants: [
        {
          grantorId: VIEWER.id,
          granteeId: HOST.id,
          scope: "contact",
          resourceId: PLAN_ID,
          status: "revoked",
        },
        {
          grantorId: HOST.id,
          granteeId: VIEWER.id,
          scope: "contact",
          resourceId: PLAN_ID,
          status: "active",
        },
      ],
    });
    assert.match(revoked.lede, new RegExp(revokedReason.reason.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(JSON.stringify(revoked).includes(HOST.relay), false);
  });
});
