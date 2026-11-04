import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { contactDisclosure } from "../src/lib/consent";
import {
  agentPreview,
  createPlan,
  getPlanView,
  grantAgentScope,
  grantContact,
  listAgents,
  listAudit,
  respondToInvitation,
  revokePermission,
} from "../src/lib/domain";
import { assessReceipt } from "../src/lib/receipt";
import { makePerson, testRepo, unwrap } from "./helpers";
import type { Repository } from "../src/lib/db";

async function agreedPair(repo: Repository) {
  const ada = await makePerson(repo, "adaone", ["Walks", "Coworking"], ["Saturday morning", "Thursday morning"]);
  const jules = await makePerson(repo, "julesone", ["Walks"], ["Saturday morning"]);
  const plan = unwrap(
    await createPlan(repo, ada.person.id, {
      title: "A short walk",
      kind: "walk",
      whenLabel: "Saturday morning",
      placeLabel: "Example gate (fictional)",
      inviteeIds: [jules.person.id],
    }),
  );
  unwrap(await respondToInvitation(repo, jules.person.id, plan.planId, "accepted"));
  unwrap(await grantContact(repo, ada.person.id, plan.planId, jules.person.id));
  unwrap(await grantContact(repo, jules.person.id, plan.planId, ada.person.id));
  return { ada, jules, planId: plan.planId };
}

describe("revocation", () => {
  let repo: Repository;

  beforeEach(async () => {
    repo = await testRepo();
  });

  test("a revoke hides the relay on the next read for both people", async () => {
    const { ada, jules, planId } = await agreedPair(repo);
    const open = await getPlanView(repo, ada.person.id, planId);
    const julesOpen = open?.participants.find((person) => person.personId === jules.person.id);
    assert.equal(julesOpen?.contact, "relay:julesone.demo");
    assert.ok(julesOpen?.myGrantId);

    unwrap(await revokePermission(repo, ada.person.id, julesOpen!.myGrantId!));

    const after = await getPlanView(repo, ada.person.id, planId);
    const julesAfter = after?.participants.find((person) => person.personId === jules.person.id);
    assert.equal(julesAfter?.contact, null);
    assert.match(julesAfter?.contactReason ?? "", /revoked/i);

    const julesSide = await getPlanView(repo, jules.person.id, planId);
    const adaAfter = julesSide?.participants.find((person) => person.personId === ada.person.id);
    assert.equal(adaAfter?.contact, null);
    assert.doesNotMatch(JSON.stringify(adaAfter), /relay:adaone\.demo/);
  });

  test("the pure rule treats a revoked grant as closed even if the other grant remains", () => {
    const hidden = contactDisclosure({
      viewerId: "ada",
      otherId: "jules",
      planId: "plan",
      invitationStatus: "accepted",
      grants: [
        {
          grantorId: "ada",
          granteeId: "jules",
          scope: "contact",
          resourceId: "plan",
          status: "revoked",
        },
        {
          grantorId: "jules",
          granteeId: "ada",
          scope: "contact",
          resourceId: "plan",
          status: "active",
        },
      ],
    });
    assert.equal(hidden.visible, false);
    assert.match(hidden.reason, /revoked/i);
  });

  test("someone else cannot revoke your grant", async () => {
    const { ada, jules, planId } = await agreedPair(repo);
    const open = await getPlanView(repo, ada.person.id, planId);
    const grantId = open?.participants.find((person) => person.personId === jules.person.id)?.myGrantId;
    assert.ok(grantId);
    const stolen = await revokePermission(repo, jules.person.id, grantId!);
    assert.equal(stolen.ok, false);
    const still = await getPlanView(repo, ada.person.id, planId);
    assert.equal(
      still?.participants.find((person) => person.personId === jules.person.id)?.contact,
      "relay:julesone.demo",
    );
  });

  test("revoking an agent scope removes that field and leaves the rest", async () => {
    const ada = await makePerson(repo, "adaone", ["Walks", "Notebooks"], ["Saturday morning"]);
    const agents = await listAgents(repo, ada.person.id);
    const before = await agentPreview(repo, ada.person.id, agents[0].id);
    assert.deepEqual(before?.interests, ["Walks", "Notebooks"]);
    assert.deepEqual(before?.availability, ["Saturday morning"]);
    assert.equal(JSON.stringify(before).includes("relay:"), false);

    const grants = await listAudit(repo, ada.person.id);
    assert.ok(grants.every((event) => event.verdict.valid));

    const availabilityGrant = (await import("../src/lib/domain")).listPermissionViews;
    const rows = await availabilityGrant(repo, ada.person.id);
    const availability = rows.find((row) => row.scope === "availability" && row.status === "active");
    assert.ok(availability);
    unwrap(await revokePermission(repo, ada.person.id, availability!.id));

    const after = await agentPreview(repo, ada.person.id, agents[0].id);
    assert.equal(after?.availability, null);
    assert.deepEqual(after?.interests, ["Walks", "Notebooks"]);
    assert.equal(JSON.stringify(after).includes("Saturday morning"), false);

    const draft = unwrap(await grantAgentScope(repo, ada.person.id, agents[0].id, "draft_plans"));
    assert.equal((await agentPreview(repo, ada.person.id, agents[0].id))?.draftPlans, true);
    unwrap(await revokePermission(repo, ada.person.id, draft.permissionId));
    assert.equal((await agentPreview(repo, ada.person.id, agents[0].id))?.draftPlans, false);
  });

  test("each grant and revoke has an Ed25519 receipt that fails if the payload changes", async () => {
    const { ada, jules, planId } = await agreedPair(repo);
    const open = await getPlanView(repo, ada.person.id, planId);
    const grantId = open!.participants.find((person) => person.personId === jules.person.id)!.myGrantId!;
    unwrap(await revokePermission(repo, ada.person.id, grantId));

    const events = await listAudit(repo, ada.person.id);
    const revocation = events.find((event) => event.action === "revoke" && event.scope === "contact");
    assert.ok(revocation);
    assert.equal(revocation!.verdict.valid, true);
    assert.match(revocation!.statement, /revoked/i);
    assert.equal(revocation!.signature.length > 20, true);

    const tampered = assessReceipt(
      revocation!.payload.replace("revoked", "granted"),
      revocation!.signature,
      revocation!.publicKey,
      revocation!.publicKey,
    );
    assert.equal(tampered.valid, false);
    assert.equal(tampered.signatureOk, false);

    const forgedKey = revocation!.publicKey.replace("A", "B");
    const forged = assessReceipt(revocation!.payload, revocation!.signature, forgedKey, revocation!.publicKey);
    assert.equal(forged.valid, false);
  });
});
