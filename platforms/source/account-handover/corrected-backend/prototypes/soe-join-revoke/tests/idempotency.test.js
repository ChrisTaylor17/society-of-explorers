import assert from "node:assert/strict";
import { test } from "node:test";
import { PLAN_ID, boot, request, signIn, write } from "./helpers.js";

test("the same join key replays and a second key does not create another request", async () => {
  const { url, stop } = await boot();
  try {
    const jules = await signIn(url, "jules");
    const ada = await signIn(url, "ada");
    const first = await write(url, jules.token, "join", "jules", "join-1", { planId: PLAN_ID });
    const retry = await write(url, jules.token, "join", "jules", "join-1", { planId: PLAN_ID });
    assert.equal(retry.body.status, "committed");
    assert.equal(retry.body.data.invitationId, first.body.data.invitationId);
    assert.equal(retry.body.version, first.body.version);
    const duplicate = await write(url, jules.token, "join", "jules", "join-2", { planId: PLAN_ID });
    assert.equal(duplicate.body.status, "rejected");
    assert.match(duplicate.body.error, /already have an invitation/);
    const conflict = await write(url, jules.token, "join", "jules", "join-1", { planId: "plan-other" });
    assert.equal(conflict.body.status, "conflict");
    const host = await request(url, `/api/plans/${PLAN_ID}`, { token: ada.token });
    assert.equal(host.body.data.joinCount, 1);
    assert.equal(host.body.data.invitationId, "invite-jules-riverside");
  } finally {
    await stop();
  }
});

test("concurrent joins with one key commit once, and two keys leave one request", async () => {
  const { url, stop } = await boot();
  try {
    const jules = await signIn(url, "jules");
    const ada = await signIn(url, "ada");
    const same = await Promise.all([
      write(url, jules.token, "join", "jules", "same-key", { planId: PLAN_ID }),
      write(url, jules.token, "join", "jules", "same-key", { planId: PLAN_ID }),
    ]);
    assert.equal(same[0].body.data.invitationId, same[1].body.data.invitationId);
    const host = await request(url, `/api/plans/${PLAN_ID}`, { token: ada.token });
    assert.equal(host.body.data.joinCount, 1);

    const mina = await signIn(url, "mina");
    const raced = await Promise.all([
      write(url, mina.token, "join", "mina", "mina-a", { planId: PLAN_ID }),
      write(url, mina.token, "join", "mina", "mina-b", { planId: PLAN_ID }),
    ]);
    const committed = raced.filter((item) => item.body.status === "committed");
    const rejected = raced.filter((item) => item.body.status === "rejected");
    assert.equal(committed.length, 0);
    assert.equal(rejected.length, 2);
    assert.match(rejected[0].body.error, /already has a join request/);
  } finally {
    await stop();
  }
});

test("accept and grant retries do not open a second grant", async () => {
  const { url, stop } = await boot();
  try {
    const jules = await signIn(url, "jules");
    const ada = await signIn(url, "ada");
    await write(url, jules.token, "join", "jules", "join-1", { planId: PLAN_ID });
    const accept = { planId: PLAN_ID, requesterId: "jules" };
    const first = await write(url, ada.token, "accept", "ada", "accept-1", accept);
    const again = await write(url, ada.token, "accept", "ada", "accept-1", accept);
    assert.equal(again.body.data.invitationId, first.body.data.invitationId);
    const extra = await write(url, ada.token, "accept", "ada", "accept-2", accept);
    assert.equal(extra.body.status, "rejected");
    assert.match(extra.body.error, /already accepted/);
    const grant = { planId: PLAN_ID, otherId: "ada" };
    const granted = await write(url, jules.token, "grant", "jules", "grant-1", grant);
    const grantedAgain = await write(url, jules.token, "grant", "jules", "grant-2", grant);
    assert.equal(grantedAgain.body.status, "committed");
    assert.equal(grantedAgain.body.data.permissionId, granted.body.data.permissionId);
    assert.equal(grantedAgain.body.version, granted.body.version);
  } finally {
    await stop();
  }
});
