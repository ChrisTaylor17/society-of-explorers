import { timingSafeEqual } from "node:crypto";
import { DEMO_ACCOUNTS } from "./catalog";
import {
  completePlan,
  createIdentity,
  createPlan,
  grantAgentScope,
  grantContact,
  listAgents,
  respondToInvitation,
  revokePermission,
  saveFeedback,
  type Result,
} from "./domain";
import type { Repository } from "./db";

function unwrap<T>(result: Result<T>, label: string): T {
  if (!result.ok) throw new Error(`${label}: ${result.error}`);
  return result.data;
}

let seedQueue: Promise<void> = Promise.resolve();

export function seedIfEmpty(repo: Repository): Promise<void> {
  const run = seedQueue.then(() => seedIfEmptyInner(repo));
  seedQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function seedIfEmptyInner(repo: Repository): Promise<void> {
  try {
    await repo.batch(() => populate(repo));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/UNIQUE|unique/i.test(message)) throw error;
    if ((await repo.getMeta("seed_version")) === "1") return;
    await repo.batch(async () => {
      await repo.clearDemoData();
      await populate(repo);
    });
  }
}

async function populate(repo: Repository): Promise<void> {
  if ((await repo.getMeta("seed_version")) === "1") return;
  if ((await repo.countPeople()) > 0) await repo.clearDemoData();

  const created = "2026-10-14T13:00:00.000Z";
  const people = new Map<string, { id: string; agentId: string }>();
  for (const account of DEMO_ACCOUNTS) {
    const made = unwrap(
      await createIdentity(repo, {
        id: `person_${account.magicName}`,
        agentId: `agent_${account.magicName}`,
        agentName: account.agentName,
        magicName: account.magicName,
        displayName: account.displayName,
        passcode: account.passcode,
        interests: [...account.interests],
        availability: [...account.availability],
        area: account.area,
        contactHandle: account.contactHandle,
        bio: account.bio,
        shareArea: true,
        at: created,
      }),
      account.magicName,
    );
    people.set(account.magicName, { id: made.person.id, agentId: made.agentId });
  }

  const ada = people.get("ada")!;
  const agents = await listAgents(repo, ada.id);
  const draft = unwrap(
    await grantAgentScope(repo, ada.id, agents[0].id, "draft_plans", "2026-10-14T14:00:00.000Z"),
    "draft grant",
  );
  unwrap(
    await revokePermission(repo, ada.id, draft.permissionId, "2026-10-14T15:05:00.000Z"),
    "draft revoke",
  );

  const riverside = unwrap(
    await createPlan(repo, ada.id, {
      id: "plan_riverside",
      title: "A short riverside walk",
      kind: "walk",
      whenLabel: "Saturday morning",
      placeLabel: "Example park gate (fictional)",
      note: "Half an hour out and back. No booking. Bring whatever shoes you already have.",
      inviteeIds: [people.get("jules")!.id, people.get("mina")!.id],
      at: "2026-10-14T16:00:00.000Z",
    }),
    "riverside",
  );
  void riverside;

  const samir = people.get("samir")!;
  const rowan = people.get("rowan")!;
  unwrap(
    await createPlan(repo, samir.id, {
      id: "plan_soup",
      title: "Soup and one story",
      kind: "dinner",
      whenLabel: "Friday evening",
      placeLabel: "Example kitchen table (fictional)",
      note: "One pot of soup and one short story. Sharing food is optional.",
      inviteeIds: [rowan.id],
      at: "2026-10-14T16:10:00.000Z",
    }),
    "soup",
  );
  unwrap(await respondToInvitation(repo, rowan.id, "plan_soup", "accepted"), "rowan accepts soup");
  unwrap(
    await grantContact(repo, samir.id, "plan_soup", rowan.id, "2026-10-14T17:30:00.000Z"),
    "samir grants",
  );

  const mina = people.get("mina")!;
  unwrap(
    await createPlan(repo, mina.id, {
      id: "plan_cowork",
      title: "A quiet coworking hour",
      kind: "coworking",
      whenLabel: "Thursday morning",
      placeLabel: "Example reading room (fictional)",
      note: "One hour, cameras off, a shared table. Leave when the hour is up.",
      inviteeIds: [rowan.id],
      at: "2026-10-14T16:20:00.000Z",
    }),
    "cowork",
  );
  unwrap(await respondToInvitation(repo, rowan.id, "plan_cowork", "accepted"), "rowan accepts cowork");
  unwrap(
    await grantContact(repo, mina.id, "plan_cowork", rowan.id, "2026-10-14T17:00:00.000Z"),
    "mina grants",
  );
  unwrap(
    await grantContact(repo, rowan.id, "plan_cowork", mina.id, "2026-10-14T17:02:00.000Z"),
    "rowan grants",
  );
  unwrap(await completePlan(repo, mina.id, "plan_cowork"), "complete cowork");
  unwrap(
    await saveFeedback(repo, mina.id, "plan_cowork", {
      enjoyment: "glad",
      keepNote: "The hour stayed quiet, and the walk to the door was the best part.",
      again: "yes",
    }),
    "mina feedback",
  );

  await repo.setMeta("seed_version", "1");
}

export async function resetWorld(
  repo: Repository,
  personId: string | null,
  secret: string,
): Promise<Result<{ reset: true }>> {
  if (!personId) return { ok: false, error: "Sign in before resetting the demo." };
  const expected = process.env.MERIDIAN_RESET_SECRET ?? "";
  if (!expected) return { ok: false, error: "Reset is turned off until the server secret is set." };
  const given = Buffer.from(secret);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    return { ok: false, error: "That reset secret is not right." };
  }
  await repo.clearDemoData();
  await seedIfEmpty(repo);
  return { ok: true, data: { reset: true } };
}
