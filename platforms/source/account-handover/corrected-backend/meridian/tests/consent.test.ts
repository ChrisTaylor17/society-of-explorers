import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { contactDisclosure } from "../src/lib/consent";
import {
  createPlan,
  getPlanView,
  grantContact,
  visiblePeople,
  respondToInvitation,
  saveFeedback,
  completePlan,
} from "../src/lib/domain";
import { seedIfEmpty } from "../src/lib/seed";
import { makePerson, testRepo, unwrap } from "./helpers";
import type { Repository } from "../src/lib/db";

describe("contact disclosure rules", () => {
  const planId = "plan";
  const grants = [
    {
      grantorId: "ada",
      granteeId: "jules",
      scope: "contact",
      resourceId: planId,
      status: "active" as const,
    },
    {
      grantorId: "jules",
      granteeId: "ada",
      scope: "contact",
      resourceId: planId,
      status: "active" as const,
    },
  ];

  test("stays hidden until the invitation is accepted", () => {
    const hidden = contactDisclosure({
      viewerId: "ada",
      otherId: "jules",
      planId,
      invitationStatus: "invited",
      grants,
    });
    assert.equal(hidden.visible, false);
  });

  test("one grant is not enough", () => {
    const hidden = contactDisclosure({
      viewerId: "ada",
      otherId: "jules",
      planId,
      invitationStatus: "accepted",
      grants: grants.slice(0, 1),
    });
    assert.equal(hidden.visible, false);
    assert.match(hidden.reason, /until they accept/i);
  });

  test("both grants reveal the relay", () => {
    const shown = contactDisclosure({
      viewerId: "ada",
      otherId: "jules",
      planId,
      invitationStatus: "accepted",
      grants,
    });
    assert.equal(shown.visible, true);
  });

  test("a declined plan never reveals a relay", () => {
    const hidden = contactDisclosure({
      viewerId: "ada",
      otherId: "jules",
      planId,
      invitationStatus: "declined",
      grants,
    });
    assert.equal(hidden.visible, false);
  });
});

describe("server-side consent gating", () => {
  let repo: Repository;

  beforeEach(async () => {
    repo = await testRepo();
  });

  test("contact is omitted until both people grant, then returned only to them", async () => {
    const ada = await makePerson(repo, "adaone");
    const jules = await makePerson(repo, "julesone", ["Walks", "Drawing"], ["Saturday morning"]);
    const stranger = await makePerson(repo, "strangerone", ["Cooking"], ["Friday evening"]);
    const plan = unwrap(
      await createPlan(repo, ada.person.id, {
        title: "A short walk",
        kind: "walk",
        whenLabel: "Saturday morning",
        placeLabel: "Example gate (fictional)",
        inviteeIds: [jules.person.id],
      }),
    );

    const before = await getPlanView(repo, ada.person.id, plan.planId);
    assert.ok(before);
    const julesBefore = before.participants.find((person) => person.personId === jules.person.id);
    assert.equal(julesBefore?.contact, null);
    assert.equal(julesBefore?.canGrant, false);

    assert.equal((await grantContact(repo, ada.person.id, plan.planId, jules.person.id)).ok, false);
    unwrap(await respondToInvitation(repo, jules.person.id, plan.planId, "accepted"));

    unwrap(await grantContact(repo, ada.person.id, plan.planId, jules.person.id));
    const oneSide = await getPlanView(repo, ada.person.id, plan.planId);
    const julesOne = oneSide?.participants.find((person) => person.personId === jules.person.id);
    assert.equal(julesOne?.contact, null);
    assert.doesNotMatch(JSON.stringify(oneSide), /relay:julesone\.demo/);
    assert.doesNotMatch(JSON.stringify(julesOne), /relay:julesone\.demo/);

    const julesView = await getPlanView(repo, jules.person.id, plan.planId);
    const adaOne = julesView?.participants.find((person) => person.personId === ada.person.id);
    assert.equal(adaOne?.contact, null);

    unwrap(await grantContact(repo, jules.person.id, plan.planId, ada.person.id));
    const both = await getPlanView(repo, ada.person.id, plan.planId);
    assert.equal(
      both?.participants.find((person) => person.personId === jules.person.id)?.contact,
      "relay:julesone.demo",
    );
    const julesBoth = await getPlanView(repo, jules.person.id, plan.planId);
    assert.equal(
      julesBoth?.participants.find((person) => person.personId === ada.person.id)?.contact,
      "relay:adaone.demo",
    );

    assert.equal(await getPlanView(repo, stranger.person.id, plan.planId), null);
  });

  test("the directory never includes relay handles", async () => {
    const viewer = await makePerson(repo, "directoryone");
    await makePerson(repo, "directorytwo");
    const people = await visiblePeople(repo, viewer.person.id);
    assert.equal(JSON.stringify(people).includes("relay:"), false);
    assert.ok(people.some((person) => person.magicName === "directorytwo"));
  });

  test("private feedback is visible only to its author", async () => {
    const host = await makePerson(repo, "hostone");
    const guest = await makePerson(repo, "guestone");
    const plan = unwrap(
      await createPlan(repo, host.person.id, {
        title: "Soup night",
        kind: "dinner",
        whenLabel: "Saturday morning",
        placeLabel: "Example table (fictional)",
        inviteeIds: [guest.person.id],
      }),
    );
    unwrap(await respondToInvitation(repo, guest.person.id, plan.planId, "accepted"));
    assert.equal(
      (await saveFeedback(repo, host.person.id, plan.planId, { enjoyment: "glad", keepNote: "secret note", again: "yes" })).ok,
      false,
    );
    unwrap(await completePlan(repo, host.person.id, plan.planId));
    unwrap(
      await saveFeedback(repo, host.person.id, plan.planId, {
        enjoyment: "glad",
        keepNote: "The soup was the easy part.",
        again: "yes",
      }),
    );
    const hostView = await getPlanView(repo, host.person.id, plan.planId);
    const guestView = await getPlanView(repo, guest.person.id, plan.planId);
    assert.match(hostView?.myFeedback?.keepNote ?? "", /soup/i);
    assert.equal(guestView?.myFeedback, null);
    assert.doesNotMatch(JSON.stringify(guestView), /The soup was the easy part/);
  });

  test("seeded plans follow the same gate", async () => {
    await seedIfEmpty(repo);
    const soupForSamir = await getPlanView(repo, "person_samir", "plan_soup");
    const soupGuest = soupForSamir?.participants.find((person) => person.personId === "person_rowan");
    assert.equal(soupGuest?.contact, null);
    assert.match(soupGuest?.contactReason ?? "", /until they accept/i);

    const cowork = await getPlanView(repo, "person_mina", "plan_cowork");
    assert.equal(
      cowork?.participants.find((person) => person.personId === "person_rowan")?.contact,
      "relay:rowan.ellis",
    );
    const rowan = await getPlanView(repo, "person_rowan", "plan_cowork");
    assert.equal(rowan?.myFeedback, null);
    assert.match(cowork?.myFeedback?.keepNote ?? "", /quiet/i);
    assert.doesNotMatch(JSON.stringify(rowan), /walk to the door/);
  });
});
