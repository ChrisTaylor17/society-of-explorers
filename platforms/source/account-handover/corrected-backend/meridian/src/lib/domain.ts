import { randomBytes, randomUUID } from "node:crypto";
import { AGENT_SCOPES, INTERESTS, WINDOWS, type AgentScope, type PlanKind } from "./catalog";
import { agentAllows, contactDisclosure, type ContactGrant } from "./consent";
import {
  type AgentRow,
  type AuditRow,
  type PermissionRow,
  type PersonRow,
  type Repository,
} from "./db";
import { checkPasscode, hashPasscode } from "./passcode";
import {
  assessReceipt,
  canonical,
  GENESIS_HASH,
  nextChainHash,
  signPayload,
  signingMaterial,
  type ReceiptBody,
  type ReceiptVerdict,
} from "./receipt";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export type Person = {
  id: string;
  magicName: string;
  displayName: string;
  interests: string[];
  availability: string[];
  area: string;
  contactHandle: string;
  bio: string;
  shareArea: boolean;
  shareBio: boolean;
};

export type VisiblePerson = {
  id: string;
  displayName: string;
  magicName: string;
  sharedInterests: string[];
  sharedWindows: string[];
  area: string | null;
  bio: string | null;
};

export type ParticipantView = {
  personId: string;
  displayName: string;
  role: "host" | "guest";
  invitationStatus: "host" | "invited" | "accepted" | "declined";
  contact: string | null;
  contactReason: string;
  myGrantId: string | null;
  canGrant: boolean;
};

export type FeedbackView = {
  enjoyment: string;
  keepNote: string;
  again: string;
  createdAt: string;
};

export type PlanView = {
  id: string;
  title: string;
  kind: string;
  whenLabel: string;
  placeLabel: string;
  note: string;
  status: string;
  hostId: string;
  viewerId: string;
  createdAt: string;
  participants: ParticipantView[];
  myFeedback: FeedbackView | null;
  canComplete: boolean;
};

export type PlanSummary = {
  id: string;
  title: string;
  kind: string;
  whenLabel: string;
  placeLabel: string;
  status: string;
  role: "host" | "guest";
  invitationStatus: string;
  hostName: string;
};

export type PermissionView = {
  id: string;
  granteeKind: "person" | "agent";
  granteeId: string;
  granteeName: string;
  scope: string;
  resourceId: string;
  resourceLabel: string;
  status: "active" | "revoked";
  createdAt: string;
  revokedAt: string | null;
};

export type AgentPreview = {
  agentId: string;
  name: string;
  blurb: string;
  interests: string[] | null;
  availability: string[] | null;
  draftPlans: boolean;
};

export type AuditView = {
  id: string;
  action: "grant" | "revoke";
  statement: string;
  at: string;
  scope: string;
  payload: string;
  signature: string;
  publicKey: string;
  verdict: ReceiptVerdict;
};

const RELAY = /^relay:[a-z0-9][a-z0-9.-]{1,40}$/;
const MAGIC = /^[a-z][a-z0-9-]{1,22}$/;

function fail(error: string): Result<never> {
  return { ok: false, error };
}

function parseList(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function toPerson(row: PersonRow): Person {
  return {
    id: row.id,
    magicName: row.magic_name,
    displayName: row.display_name,
    interests: parseList(row.interests),
    availability: parseList(row.availability),
    area: row.area,
    contactHandle: row.contact_handle,
    bio: row.bio,
    shareArea: Number(row.share_area) === 1,
    shareBio: Number(row.share_bio) === 1,
  };
}

export function toVisible(viewer: Person, person: Person): VisiblePerson {
  return {
    id: person.id,
    displayName: person.displayName,
    magicName: person.magicName,
    sharedInterests: person.interests.filter((interest) => viewer.interests.includes(interest)),
    sharedWindows: person.availability.filter((window) => viewer.availability.includes(window)),
    area: person.shareArea ? person.area : null,
    bio: person.shareBio ? person.bio : null,
  };
}

function cleanLine(value: string, min: number, max: number): string | null {
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length < min || text.length > max) return null;
  if (/@|https?:|www\./i.test(text)) return null;
  if (/\d{7,}/.test(text)) return null;
  return text;
}

function cleanInterests(values: string[]): string[] | null {
  const out: string[] = [];
  for (const value of values) {
    const known = INTERESTS.find((item) => item.toLowerCase() === value.trim().toLowerCase());
    const text = known ?? cleanLine(value, 2, 40);
    if (!text) return null;
    if (!out.includes(text)) out.push(text);
  }
  if (out.length < 1 || out.length > 8) return null;
  return out;
}

function cleanWindows(values: string[]): string[] | null {
  const out: string[] = [];
  for (const value of values) {
    const known = WINDOWS.find((item) => item === value);
    if (!known) return null;
    if (!out.includes(known)) out.push(known);
  }
  if (out.length < 1 || out.length > WINDOWS.length) return null;
  return out;
}

function cleanRelay(value: string): string | null {
  const text = value.trim().toLowerCase();
  return RELAY.test(text) ? text : null;
}

export async function createIdentity(
  repo: Repository,
  input: {
    id?: string;
    agentId?: string;
    agentName?: string;
    magicName: string;
    displayName: string;
    passcode: string;
    interests: string[];
    availability: string[];
    area: string;
    contactHandle: string;
    bio?: string;
    shareArea?: boolean;
    shareBio?: boolean;
    at?: string;
  },
): Promise<Result<{ person: Person; agentId: string }>> {
  const magicName = input.magicName.trim().toLowerCase();
  if (!MAGIC.test(magicName)) {
    return fail("Use a short magic name: letters, numbers, and hyphens.");
  }
  const displayName = cleanLine(input.displayName, 2, 40);
  if (!displayName) return fail("Use a short display name, with no email address.");
  if (input.passcode.length < 4 || input.passcode.length > 80) {
    return fail("Use a passcode of at least 4 characters.");
  }
  const interests = cleanInterests(input.interests);
  if (!interests) return fail("Choose between 1 and 8 interests.");
  const availability = cleanWindows(input.availability);
  if (!availability) return fail("Choose at least one free window.");
  const area = cleanLine(input.area, 2, 40);
  if (!area) return fail("Use a short fictional area, with no email address.");
  const contactHandle = cleanRelay(input.contactHandle);
  if (!contactHandle) return fail("Relay handles look like relay:ada.linden. No email or phone.");
  const bio = (input.bio ?? "").trim();
  if (bio.length > 280 || /@|https?:/i.test(bio)) {
    return fail("Keep the bio short, and leave out emails and links.");
  }
  if (await repo.credentials(magicName)) return fail("That magic name is already in use.");

  const at = input.at ?? new Date().toISOString();
  const { hash, salt } = hashPasscode(input.passcode);
  const id = input.id ?? randomUUID();
  await repo.insertPerson({
    id,
    magicName,
    displayName,
    passcodeHash: hash,
    passcodeSalt: salt,
    interests,
    availability,
    area,
    contactHandle,
    bio,
    shareArea: input.shareArea === true,
    shareBio: input.shareBio === true,
    createdAt: at,
  });
  const agentId = input.agentId ?? randomUUID();
  const first = displayName.split(" ")[0];
  await repo.insertAgent({
    id: agentId,
    ownerId: id,
    name: input.agentName?.trim() || `${first}'s planner`,
    blurb: "A named agent for this demo. It does not act on its own. It can only read what you still allow.",
  });
  for (const scope of ["interests", "availability"] as const) {
    const granted = await grantScope(repo, {
      grantorId: id,
      granteeKind: "agent",
      granteeId: agentId,
      scope,
      resourceId: "",
      at,
    });
    if (!granted.ok) return granted;
  }
  const person = await mustPerson(repo, id);
  return { ok: true, data: { person, agentId } };
}

export async function signIn(
  repo: Repository,
  magicName: string,
  passcode: string,
): Promise<Result<{ token: string; person: Person }>> {
  const creds = await repo.credentials(magicName);
  if (!creds || !checkPasscode(passcode, creds.passcode_salt, creds.passcode_hash)) {
    return fail("That magic name and passcode do not match.");
  }
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await repo.deleteSessionsFor(creds.id);
  await repo.insertSession(token, creds.id, expires, now.toISOString());
  return { ok: true, data: { token, person: await mustPerson(repo, creds.id) } };
}

export const SESSION_ROTATE_MS = 15 * 60 * 1000;

export async function rotateIfDue(
  repo: Repository,
  token: string,
  now = new Date(),
): Promise<{ person: Person; token: string; rotated: boolean } | null> {
  const record = await repo.sessionRecord(token, now.toISOString());
  if (!record) return null;
  const issued = Date.parse(record.issuedAt);
  if (!Number.isNaN(issued) && now.getTime() - issued < SESSION_ROTATE_MS) {
    return { person: toPerson(record.person), token, rotated: false };
  }
  const next = randomBytes(32).toString("hex");
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await repo.deleteSession(token);
  await repo.insertSession(next, record.person.id, expires, now.toISOString());
  return { person: toPerson(record.person), token: next, rotated: true };
}

export async function personForToken(repo: Repository, token: string): Promise<Person | null> {
  const row = await repo.sessionPerson(token, new Date().toISOString());
  return row ? toPerson(row) : null;
}

async function mustPerson(repo: Repository, id: string): Promise<Person> {
  const row = await repo.personRow(id);
  if (!row) throw new Error("Person disappeared.");
  return toPerson(row);
}

export async function updateProfile(
  repo: Repository,
  personId: string,
  input: {
    displayName: string;
    interests: string[];
    availability: string[];
    area: string;
    contactHandle: string;
    bio: string;
    shareArea: boolean;
    shareBio: boolean;
  },
): Promise<Result<{ person: Person }>> {
  const displayName = cleanLine(input.displayName, 2, 40);
  if (!displayName) return fail("Use a short display name, with no email address.");
  const interests = cleanInterests(input.interests);
  if (!interests) return fail("Choose between 1 and 8 interests.");
  const availability = cleanWindows(input.availability);
  if (!availability) return fail("Choose at least one free window.");
  const area = cleanLine(input.area, 2, 40);
  if (!area) return fail("Use a short fictional area, with no email address.");
  const contactHandle = cleanRelay(input.contactHandle);
  if (!contactHandle) return fail("Relay handles look like relay:ada.linden. No email or phone.");
  const bio = input.bio.trim();
  if (bio.length > 280 || /@|https?:/i.test(bio)) return fail("Keep the bio short, and leave out emails and links.");
  await repo.updateProfile(personId, {
    displayName,
    interests,
    availability,
    area,
    contactHandle,
    bio,
    shareArea: input.shareArea,
    shareBio: input.shareBio,
  });
  return { ok: true, data: { person: await mustPerson(repo, personId) } };
}

export async function visiblePeople(repo: Repository, viewerId: string): Promise<VisiblePerson[]> {
  const viewer = await mustPerson(repo, viewerId);
  const rows = await repo.listPersonRows();
  return rows.filter((row) => row.id !== viewerId).map((row) => toVisible(viewer, toPerson(row)));
}

export async function suggestionsFor(repo: Repository, personId: string): Promise<VisiblePerson[]> {
  const people = await visiblePeople(repo, personId);
  return people.filter((person) => person.sharedInterests.length > 0 || person.sharedWindows.length > 0);
}

export async function createPlan(
  repo: Repository,
  hostId: string,
  input: {
    id?: string;
    title: string;
    kind: string;
    whenLabel: string;
    placeLabel: string;
    note?: string;
    inviteeIds: string[];
    at?: string;
  },
): Promise<Result<{ planId: string }>> {
  const host = await mustPerson(repo, hostId);
  const title = cleanLine(input.title, 3, 80);
  if (!title) return fail("Give the plan a short title.");
  const kinds: PlanKind[] = ["walk", "hike", "coworking", "dinner", "make"];
  if (!kinds.includes(input.kind as PlanKind)) return fail("Choose a kind of plan.");
  if (!host.availability.includes(input.whenLabel)) {
    return fail("Choose one of your free windows, or add that window to your profile first.");
  }
  const placeLabel = cleanLine(input.placeLabel, 3, 80);
  if (!placeLabel) return fail("Use a short fictional meeting place.");
  const note = (input.note ?? "").trim();
  if (note.length > 400 || /@|https?:/i.test(note)) return fail("Keep the note short, with no emails or links.");
  const inviteeIds = [...new Set(input.inviteeIds)].filter((id) => id !== hostId);
  for (const inviteeId of inviteeIds) {
    if (!(await repo.personRow(inviteeId))) return fail("One of the invited people is not in this demo.");
  }
  const at = input.at ?? new Date().toISOString();
  const planId = input.id ?? randomUUID();
  await repo.insertPlan({
    id: planId,
    hostId,
    title,
    kind: input.kind,
    whenLabel: input.whenLabel,
    placeLabel,
    note,
    status: "proposed",
    createdAt: at,
  });
  for (const inviteeId of inviteeIds) {
    await repo.insertInvitation({
      id: randomUUID(),
      planId,
      inviteeId,
      status: "invited",
      createdAt: at,
    });
  }
  return { ok: true, data: { planId } };
}

export async function invitePerson(
  repo: Repository,
  hostId: string,
  planId: string,
  inviteeId: string,
): Promise<Result<{ planId: string }>> {
  const plan = await repo.plan(planId);
  if (!plan || plan.host_id !== hostId) return fail("Only the host can invite someone.");
  if (plan.status === "completed") return fail("This plan is already marked done.");
  if (inviteeId === hostId) return fail("You are already the host.");
  if (!(await repo.personRow(inviteeId))) return fail("That person is not in this demo.");
  if (await repo.invitation(planId, inviteeId)) return fail("They already have an invitation.");
  await repo.insertInvitation({
    id: randomUUID(),
    planId,
    inviteeId,
    status: "invited",
    createdAt: new Date().toISOString(),
  });
  return { ok: true, data: { planId } };
}

export async function respondToInvitation(
  repo: Repository,
  personId: string,
  planId: string,
  decision: "accepted" | "declined",
): Promise<Result<{ planId: string }>> {
  const invite = await repo.invitation(planId, personId);
  if (!invite) return fail("You are not invited to this plan.");
  if (invite.status !== "invited") return fail("You already answered this invitation.");
  const changed = await repo.setInvitationStatus(invite.id, decision);
  if (!changed) return fail("You already answered this invitation.");
  return { ok: true, data: { planId } };
}

async function participantIds(repo: Repository, planId: string, hostId: string): Promise<string[]> {
  const invites = await repo.invitationsForPlan(planId);
  return [hostId, ...invites.map((invite) => invite.invitee_id)];
}

export async function grantContact(
  repo: Repository,
  personId: string,
  planId: string,
  otherId: string,
  at?: string,
): Promise<Result<{ permissionId: string }>> {
  const plan = await repo.plan(planId);
  if (!plan) return fail("That plan is not here.");
  const people = await participantIds(repo, planId, plan.host_id);
  if (!people.includes(personId) || !people.includes(otherId) || personId === otherId) {
    return fail("Contact can only be shared with someone on this plan.");
  }
  if (personId !== plan.host_id && otherId !== plan.host_id) {
    return fail("In this demo, a relay is shared with the host, not between guests.");
  }
  const inviteStatus = await pairStatus(repo, plan.host_id, planId, personId, otherId);
  if (inviteStatus !== "accepted") {
    return fail("Both people accept the plan before either can share a relay.");
  }
  return grantScope(repo, {
    grantorId: personId,
    granteeKind: "person",
    granteeId: otherId,
    scope: "contact",
    resourceId: planId,
    at,
  });
}

export async function grantAgentScope(
  repo: Repository,
  ownerId: string,
  agentId: string,
  scope: string,
  at?: string,
): Promise<Result<{ permissionId: string }>> {
  if (!AGENT_SCOPES.includes(scope as AgentScope)) return fail("That is not an agent scope.");
  const agent = await repo.agent(agentId);
  if (!agent || agent.owner_id !== ownerId) return fail("That agent is not yours.");
  return grantScope(repo, {
    grantorId: ownerId,
    granteeKind: "agent",
    granteeId: agentId,
    scope,
    resourceId: "",
    at,
  });
}

async function pairStatus(
  repo: Repository,
  hostId: string,
  planId: string,
  a: string,
  b: string,
): Promise<"accepted" | "invited" | "declined"> {
  const guestId = a === hostId ? b : b === hostId ? a : "";
  if (!guestId) return "declined";
  const invite = await repo.invitation(planId, guestId);
  if (!invite) return "declined";
  return invite.status as "accepted" | "invited" | "declined";
}

async function grantScope(
  repo: Repository,
  input: {
    grantorId: string;
    granteeKind: "person" | "agent";
    granteeId: string;
    scope: string;
    resourceId: string;
    at?: string;
  },
): Promise<Result<{ permissionId: string }>> {
  const existing = await repo.activePermission(input);
  if (existing) return { ok: true, data: { permissionId: existing.id } };
  if (!signingMaterial()) return fail("The signing key is not configured, so this grant was not saved.");
  const at = input.at ?? new Date().toISOString();
  const permissionId = randomUUID();
  await repo.insertPermission({
    id: permissionId,
    grantorId: input.grantorId,
    granteeKind: input.granteeKind,
    granteeId: input.granteeId,
    scope: input.scope,
    resourceId: input.resourceId,
    status: "active",
    createdAt: at,
  });
  await writeAudit(repo, {
    action: "grant",
    actorId: input.grantorId,
    granteeKind: input.granteeKind,
    granteeId: input.granteeId,
    scope: input.scope,
    resourceId: input.resourceId,
    at,
  });
  return { ok: true, data: { permissionId } };
}

export async function revokePermission(
  repo: Repository,
  personId: string,
  permissionId: string,
  at?: string,
): Promise<Result<{ permissionId: string }>> {
  const row = await repo.permission(permissionId);
  if (!row || row.grantor_id !== personId) return fail("You can only revoke access you granted.");
  if (row.status !== "active") return fail("That access is already revoked.");
  const when = at ?? new Date().toISOString();
  if (!signingMaterial()) return fail("The signing key is not configured, so this revoke was not saved.");
  const changed = await repo.revokePermission(permissionId, personId, when);
  if (!changed) return fail("That access is already revoked.");
  await writeAudit(repo, {
    action: "revoke",
    actorId: personId,
    granteeKind: row.grantee_kind === "agent" ? "agent" : "person",
    granteeId: row.grantee_id,
    scope: row.scope,
    resourceId: row.resource_id,
    at: when,
  });
  return { ok: true, data: { permissionId } };
}

async function writeAudit(
  repo: Repository,
  input: {
    action: "grant" | "revoke";
    actorId: string;
    granteeKind: "person" | "agent";
    granteeId: string;
    scope: string;
    resourceId: string;
    at: string;
  },
) {
  const signer = signingMaterial();
  if (!signer) throw new Error("Log key missing.");
  const actor = await mustPerson(repo, input.actorId);
  const previous = await repo.latestAudit();
  const seq = (previous?.seq ?? 0) + 1;
  const prevHash = previous?.prev_hash
    ? nextChainHash(previous.prev_hash, previous.payload, previous.signature)
    : GENESIS_HASH;
  const granteeName = await granteeLabel(repo, input.granteeKind, input.granteeId);
  const resourceLabel = input.resourceId ? ((await repo.plan(input.resourceId))?.title ?? "a plan") : "";
  const verb = input.action === "grant" ? "granted" : "revoked";
  const what =
    input.scope === "contact"
      ? `contact on ${resourceLabel}`
      : input.scope === "draft_plans"
        ? "permission to draft a plan"
        : input.scope === "availability"
          ? "permission to read free windows"
          : input.scope === "interests"
            ? "permission to read interests"
            : input.scope;
  const body: ReceiptBody = {
    v: 1,
    eventId: randomUUID(),
    seq,
    prevHash,
    action: input.action,
    statement: `${actor.displayName} ${verb} ${granteeName} ${what}.`,
    actorId: actor.id,
    actorName: actor.displayName,
    granteeKind: input.granteeKind,
    granteeId: input.granteeId,
    granteeName,
    scope: input.scope,
    resourceId: input.resourceId,
    resourceLabel,
    at: input.at,
  };
  const payload = canonical(body);
  const signature = signPayload(signer.privatePem, payload);
  await repo.insertAudit({
    id: body.eventId,
    actorId: actor.id,
    action: input.action,
    granteeId: input.granteeId,
    scope: input.scope,
    resourceId: input.resourceId,
    payload,
    signature,
    publicKey: signer.publicPem,
    createdAt: input.at,
    seq,
    prevHash,
  });
}

async function granteeLabel(repo: Repository, kind: "person" | "agent", id: string): Promise<string> {
  if (kind === "agent") {
    const agent = await repo.agent(id);
    return agent?.name ?? "an agent";
  }
  const person = await repo.personRow(id);
  return person ? toPerson(person).displayName : "someone";
}

export async function completePlan(
  repo: Repository,
  personId: string,
  planId: string,
): Promise<Result<{ planId: string }>> {
  const plan = await repo.plan(planId);
  if (!plan || plan.host_id !== personId) return fail("Only the host can mark the plan done.");
  if (plan.status === "completed") return { ok: true, data: { planId } };
  const invites = await repo.invitationsForPlan(planId);
  if (!invites.some((invite) => invite.status === "accepted")) {
    return fail("Someone has to accept the plan before you mark it done.");
  }
  await repo.setPlanStatus(planId, "completed");
  return { ok: true, data: { planId } };
}

export async function saveFeedback(
  repo: Repository,
  personId: string,
  planId: string,
  input: { enjoyment: string; keepNote: string; again: string },
): Promise<Result<{ planId: string }>> {
  const view = await getPlanView(repo, personId, planId);
  if (!view) return fail("That plan is not yours to comment on.");
  if (view.status !== "completed") return fail("Private feedback opens after the plan is marked done.");
  if (view.myFeedback) return fail("You already left a private note.");
  const enjoyment = ["glad", "mixed", "not-for-me"].includes(input.enjoyment) ? input.enjoyment : "";
  if (!enjoyment) return fail("Say how the hour felt.");
  const again = ["yes", "maybe", "no"].includes(input.again) ? input.again : "";
  if (!again) return fail("Say whether you would do it again.");
  const keepNote = input.keepNote.trim();
  if (keepNote.length > 500 || /@|https?:/i.test(keepNote)) {
    return fail("Keep the note short, with no emails or links.");
  }
  await repo.insertFeedback({
    id: randomUUID(),
    planId,
    authorId: personId,
    enjoyment,
    keepNote,
    again,
    createdAt: new Date().toISOString(),
  });
  return { ok: true, data: { planId } };
}

function asGrants(rows: PermissionRow[]): ContactGrant[] {
  return rows.map((row) => ({
    grantorId: row.grantor_id,
    granteeId: row.grantee_id,
    scope: row.scope,
    resourceId: row.resource_id,
    status: row.status === "active" ? "active" : "revoked",
  }));
}

export async function getPlanView(
  repo: Repository,
  viewerId: string,
  planId: string,
): Promise<PlanView | null> {
  const plan = await repo.plan(planId);
  if (!plan) return null;
  const invites = await repo.invitationsForPlan(planId);
  const member = plan.host_id === viewerId || invites.some((invite) => invite.invitee_id === viewerId);
  if (!member) return null;
  const contactRows = await repo.permissionsForResource(planId, "contact");
  const grants = asGrants(contactRows);
  const ids = [plan.host_id, ...invites.map((invite) => invite.invitee_id)];
  const participants: ParticipantView[] = [];
  for (const id of ids) {
    const person = await mustPerson(repo, id);
    const invite = invites.find((item) => item.invitee_id === id);
    const role = id === plan.host_id ? "host" : "guest";
    const invitationStatus = role === "host" ? "host" : (invite?.status as ParticipantView["invitationStatus"]);
    if (id === viewerId) {
      participants.push({
        personId: id,
        displayName: person.displayName,
        role,
        invitationStatus,
        contact: person.contactHandle,
        contactReason: "This is your relay. Other people cannot see it until you both accept.",
        myGrantId: null,
        canGrant: false,
      });
      continue;
    }
    const viewerInvite = invites.find((item) => item.invitee_id === viewerId);
    const viewerIsHost = viewerId === plan.host_id;
    const viewerAccepted = viewerIsHost || viewerInvite?.status === "accepted";
    const withHost = role === "host" || viewerIsHost;
    const guestStatus: "accepted" | "invited" | "declined" = !withHost
      ? "declined"
      : viewerIsHost
        ? (invitationStatus as "accepted" | "invited" | "declined")
        : ((viewerInvite?.status as "accepted" | "invited" | "declined") ?? "declined");
    const disclosure = !withHost
      ? {
          visible: false,
          reason: "Guests on the same plan do not see each other's relays in this demo.",
        }
      : !viewerAccepted
        ? { visible: false, reason: "Accept the plan before any relay can be shared." }
        : contactDisclosure({
            viewerId,
            otherId: id,
            planId,
            invitationStatus: guestStatus,
            grants,
          });
    const activeRow = contactRows.find(
      (row) => row.grantor_id === viewerId && row.grantee_id === id && row.status === "active",
    );
    participants.push({
      personId: id,
      displayName: person.displayName,
      role,
      invitationStatus,
      contact: disclosure.visible ? person.contactHandle : null,
      contactReason: disclosure.reason,
      myGrantId: withHost ? (activeRow?.id ?? null) : null,
      canGrant: withHost && guestStatus === "accepted" && !activeRow,
    });
  }
  const feedback = await repo.feedback(planId, viewerId);
  const canComplete =
    plan.host_id === viewerId &&
    plan.status !== "completed" &&
    invites.some((invite) => invite.status === "accepted");
  return {
    id: plan.id,
    title: plan.title,
    kind: plan.kind,
    whenLabel: plan.when_label,
    placeLabel: plan.place_label,
    note: plan.note,
    status: plan.status,
    hostId: plan.host_id,
    viewerId,
    createdAt: plan.created_at,
    participants,
    myFeedback: feedback
      ? {
          enjoyment: feedback.enjoyment,
          keepNote: feedback.keep_note,
          again: feedback.again,
          createdAt: feedback.created_at,
        }
      : null,
    canComplete,
  };
}

export async function listPlanSummaries(repo: Repository, personId: string): Promise<PlanSummary[]> {
  const plans = await repo.plansFor(personId);
  const summaries: PlanSummary[] = [];
  for (const plan of plans) {
    const host = await mustPerson(repo, plan.host_id);
    const invite = await repo.invitation(plan.id, personId);
    summaries.push({
      id: plan.id,
      title: plan.title,
      kind: plan.kind,
      whenLabel: plan.when_label,
      placeLabel: plan.place_label,
      status: plan.status,
      role: plan.host_id === personId ? "host" : "guest",
      invitationStatus: plan.host_id === personId ? "host" : (invite?.status ?? "invited"),
      hostName: host.displayName,
    });
  }
  return summaries;
}

export async function listPermissionViews(repo: Repository, personId: string): Promise<PermissionView[]> {
  const rows = await repo.permissionsForGrantor(personId);
  const views: PermissionView[] = [];
  for (const row of rows) {
    const kind = row.grantee_kind === "agent" ? "agent" : "person";
    views.push({
      id: row.id,
      granteeKind: kind,
      granteeId: row.grantee_id,
      granteeName: await granteeLabel(repo, kind, row.grantee_id),
      scope: row.scope,
      resourceId: row.resource_id,
      resourceLabel: row.resource_id ? ((await repo.plan(row.resource_id))?.title ?? "A plan") : "Profile",
      status: row.status === "active" ? "active" : "revoked",
      createdAt: row.created_at,
      revokedAt: row.revoked_at,
    });
  }
  return views;
}

export async function agentPreview(repo: Repository, ownerId: string, agentId: string): Promise<AgentPreview | null> {
  const agent = await repo.agent(agentId);
  if (!agent || agent.owner_id !== ownerId) return null;
  const owner = await mustPerson(repo, ownerId);
  const grants = asGrants(await repo.permissionsForGrantor(ownerId));
  const interests = agentAllows(grants, agentId, "interests") ? owner.interests : null;
  const availability = agentAllows(grants, agentId, "availability") ? owner.availability : null;
  return {
    agentId: agent.id,
    name: agent.name,
    blurb: agent.blurb,
    interests,
    availability,
    draftPlans: agentAllows(grants, agentId, "draft_plans"),
  };
}

export async function listAgents(repo: Repository, ownerId: string): Promise<AgentRow[]> {
  return repo.agentsFor(ownerId);
}

export async function listAudit(repo: Repository, personId: string): Promise<AuditView[]> {
  const signer = signingMaterial();
  const rows = await repo.auditFor(personId);
  return rows.map((row) => toAudit(row, signer?.publicPem ?? ""));
}

function toAudit(row: AuditRow, currentKey: string): AuditView {
  let statement = row.action;
  try {
    const parsed = JSON.parse(row.payload) as { statement?: string };
    if (parsed.statement) statement = parsed.statement;
  } catch {
    statement = row.action;
  }
  return {
    id: row.id,
    action: row.action === "revoke" ? "revoke" : "grant",
    statement,
    at: row.created_at,
    scope: row.scope,
    payload: row.payload,
    signature: row.signature,
    publicKey: row.public_key,
    verdict: assessReceipt(row.payload, row.signature, row.public_key, currentKey),
  };
}

export async function logPublicKey(): Promise<string> {
  return signingMaterial()?.publicPem ?? "";
}
