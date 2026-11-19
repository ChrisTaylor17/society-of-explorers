import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  createPlan,
  getPlanView,
  grantContact,
  personForToken,
  respondToInvitation,
  revokePermission,
  signIn,
} from "../src/lib/domain";
import { makePerson, testRepo, unwrap } from "./helpers";

describe("two-session revocation timing", () => {
  test("the other session's next read hides the relay within seconds", async () => {
    const repo = await testRepo();
    const ada = await makePerson(repo, "adaone", ["Walks"], ["Saturday morning"]);
    const jules = await makePerson(repo, "julesone", ["Walks"], ["Saturday morning"]);
    const adaSession = unwrap(await signIn(repo, "adaone", "demo-pass"));
    const julesSession = unwrap(await signIn(repo, "julesone", "demo-pass"));
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

    const open = await getPlanView(repo, jules.person.id, plan.planId);
    assert.equal(
      open?.participants.find((person) => person.personId === ada.person.id)?.contact,
      "relay:adaone.demo",
    );
    const grantId = (await getPlanView(repo, ada.person.id, plan.planId))?.participants.find(
      (person) => person.personId === jules.person.id,
    )?.myGrantId;
    assert.ok(grantId);

    const started = Date.now();
    unwrap(await revokePermission(repo, ada.person.id, grantId));
    const julesNow = await personForToken(repo, julesSession.token);
    assert.equal(julesNow?.id, jules.person.id);
    const after = await getPlanView(repo, julesNow!.id, plan.planId);
    const elapsed = Date.now() - started;
    assert.equal(
      after?.participants.find((person) => person.personId === ada.person.id)?.contact,
      null,
    );
    assert.equal(
      JSON.stringify(after?.participants.find((person) => person.personId === ada.person.id)).includes("relay:"),
      false,
    );
    assert.ok(elapsed < 3000, `revoke was visible in ${elapsed}ms`);
    assert.equal((await personForToken(repo, adaSession.token))?.id, ada.person.id);
  });
});
