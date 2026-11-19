"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { LOGIN_LIMIT, LOGIN_WINDOW_MS, SIGNUP_LIMIT, SIGNUP_WINDOW_MS, takeAttempt } from "./limits";
import {
  completePlan,
  createIdentity,
  createPlan,
  grantAgentScope,
  grantContact,
  invitePerson,
  respondToInvitation,
  revokePermission,
  saveFeedback,
  signIn,
  updateProfile,
} from "./domain";
import { ready } from "./ready";
import { resetWorld } from "./seed";
import { requirePerson, SESSION_COOKIE, sessionCookieOptions } from "./session";

function safeNext(value: FormDataEntryValue | null, fallback: string): string {
  const text = String(value ?? "");
  if (!text.startsWith("/") || text.startsWith("//") || text.includes("://")) return fallback;
  return text;
}

async function clientKey(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || headerList.get("x-real-ip") || "local";
  return address.slice(0, 80);
}

function go(path: string, error?: string): never {
  if (!error) redirect(path);
  const join = path.includes("?") ? "&" : "?";
  redirect(`${path}${join}error=${encodeURIComponent(error)}`);
}

async function remember(token: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions());
}

export async function signInAction(formData: FormData) {
  const { repo } = await ready();
  const address = await clientKey();
  const magicName = String(formData.get("magicName") ?? "").trim().toLowerCase();
  const allowed =
    (await takeAttempt(repo, `login:${magicName || "blank"}`, LOGIN_LIMIT, LOGIN_WINDOW_MS)) &&
    (await takeAttempt(repo, `login-ip:${address}`, LOGIN_LIMIT, LOGIN_WINDOW_MS));
  if (!allowed) go("/", "Too many sign-in attempts. Wait a few minutes and try again.");
  const result = await signIn(
    repo,
    String(formData.get("magicName") ?? ""),
    String(formData.get("passcode") ?? ""),
  );
  if (!result.ok) go("/", result.error);
  await remember(result.data.token);
  go("/home");
}

export async function signOutAction() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const { repo } = await ready();
    await repo.deleteSession(token);
  }
  jar.delete(SESSION_COOKIE);
  redirect("/");
}

export async function createIdentityAction(formData: FormData) {
  const { repo } = await ready();
  const address = await clientKey();
  const allowed = await takeAttempt(repo, `signup-ip:${address}`, SIGNUP_LIMIT, SIGNUP_WINDOW_MS);
  if (!allowed) go("/", "Too many new people from this network. Wait and try again.");
  const passcode = String(formData.get("passcode") ?? "");
  const result = await createIdentity(repo, {
    magicName: String(formData.get("magicName") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
    passcode,
    interests: formData.getAll("interests").map(String),
    availability: formData.getAll("availability").map(String),
    area: String(formData.get("area") ?? ""),
    contactHandle: String(formData.get("contactHandle") ?? ""),
    bio: String(formData.get("bio") ?? ""),
  });
  if (!result.ok) go("/", result.error);
  const session = await signIn(repo, result.data.person.magicName, passcode);
  if (!session.ok) go("/", session.error);
  await remember(session.data.token);
  go("/profile");
}

export async function updateProfileAction(formData: FormData) {
  const { repo, person } = await requirePerson();
  const result = await updateProfile(repo, person.id, {
    displayName: String(formData.get("displayName") ?? ""),
    interests: formData.getAll("interests").map(String),
    availability: formData.getAll("availability").map(String),
    area: String(formData.get("area") ?? ""),
    contactHandle: String(formData.get("contactHandle") ?? ""),
    bio: String(formData.get("bio") ?? ""),
    shareArea: formData.get("shareArea") === "yes",
    shareBio: formData.get("shareBio") === "yes",
  });
  if (!result.ok) go("/profile", result.error);
  go("/profile?saved=1");
}

export async function createPlanAction(formData: FormData) {
  const { repo, person } = await requirePerson();
  const result = await createPlan(repo, person.id, {
    title: String(formData.get("title") ?? ""),
    kind: String(formData.get("kind") ?? ""),
    whenLabel: String(formData.get("whenLabel") ?? ""),
    placeLabel: String(formData.get("placeLabel") ?? ""),
    note: String(formData.get("note") ?? ""),
    inviteeIds: formData.getAll("inviteeIds").map(String),
  });
  if (!result.ok) go("/plans/new", result.error);
  go(`/plans/${result.data.planId}`);
}

export async function inviteAction(formData: FormData) {
  const { repo, person } = await requirePerson();
  const planId = String(formData.get("planId") ?? "");
  const result = await invitePerson(repo, person.id, planId, String(formData.get("inviteeId") ?? ""));
  go(`/plans/${planId}`, result.ok ? undefined : result.error);
}

export async function respondAction(formData: FormData) {
  const { repo, person } = await requirePerson();
  const planId = String(formData.get("planId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (decision !== "accepted" && decision !== "declined") go(`/plans/${planId}`, "Choose accept or decline.");
  const result = await respondToInvitation(repo, person.id, planId, decision);
  go(`/plans/${planId}`, result.ok ? undefined : result.error);
}

export async function grantContactAction(formData: FormData) {
  const { repo, person } = await requirePerson();
  const planId = String(formData.get("planId") ?? "");
  const result = await grantContact(repo, person.id, planId, String(formData.get("otherId") ?? ""));
  go(`/plans/${planId}`, result.ok ? undefined : result.error);
}

export async function revokeAction(formData: FormData) {
  const { repo, person } = await requirePerson();
  const next = safeNext(formData.get("next"), "/permissions");
  const result = await revokePermission(repo, person.id, String(formData.get("permissionId") ?? ""));
  go(next, result.ok ? undefined : result.error);
}

export async function allowAgentAction(formData: FormData) {
  const { repo, person } = await requirePerson();
  const result = await grantAgentScope(
    repo,
    person.id,
    String(formData.get("agentId") ?? ""),
    String(formData.get("scope") ?? ""),
  );
  go("/permissions", result.ok ? undefined : result.error);
}

export async function completePlanAction(formData: FormData) {
  const { repo, person } = await requirePerson();
  const planId = String(formData.get("planId") ?? "");
  const result = await completePlan(repo, person.id, planId);
  go(`/plans/${planId}`, result.ok ? undefined : result.error);
}

export async function feedbackAction(formData: FormData) {
  const { repo, person } = await requirePerson();
  const planId = String(formData.get("planId") ?? "");
  const result = await saveFeedback(repo, person.id, planId, {
    enjoyment: String(formData.get("enjoyment") ?? ""),
    keepNote: String(formData.get("keepNote") ?? ""),
    again: String(formData.get("again") ?? ""),
  });
  go(`/plans/${planId}`, result.ok ? undefined : result.error);
}

export async function resetAction(formData: FormData) {
  const { repo, person } = await requirePerson();
  const result = await resetWorld(repo, person.id, String(formData.get("secret") ?? ""));
  go("/walkthrough", result.ok ? undefined : result.error);
}
