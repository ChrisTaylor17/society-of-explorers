import { contactDisclosure, type ContactGrant } from "../../meridian/src/lib/consent.ts";
import type { MeridianPort } from "./port.ts";
import type {
  DiscoverCard,
  IdempotentWrite,
  LookupResult,
  PlanSnapshot,
  ReadResult,
  VisibilityReview,
  WriteResult,
} from "./types.ts";

/** Display fields only. Passcodes from the Meridian catalog are not copied here. */
export const VIEWER = {
  id: "jules",
  displayName: "Jules Okonkwo",
  interests: ["Drawing", "Snacks and stories", "Conversation"],
  availability: ["Saturday morning", "Wednesday evening"],
  relay: "relay:jules.okonkwo",
} as const;

export const HOST = {
  id: "ada",
  displayName: "Ada Linden",
  interests: ["Walks", "Noticing", "Quiet cafes"],
  availability: ["Saturday morning", "Sunday afternoon"],
  relay: "relay:ada.linden",
} as const;

export const PLAN_ID = "plan-riverside";

const PLAN = {
  title: "Saturday riverside walk",
  kindLabel: "A walk",
  whenLabel: "Saturday morning",
  placeLabel: "Riverside path",
} as const;

type InvitationStatus = "none" | "invited" | "accepted" | "declined";

type StoredWrite = {
  hash: string;
  result: WriteResult<unknown>;
};

type Grant = ContactGrant & { id: string };

export type WriteFault = "drop-before" | "drop-after" | "pending";

type StalePlan = {
  version: number;
  title: string;
  contact: string | null;
};

function overlap(left: readonly string[], right: readonly string[]): string[] {
  return left.filter((item) => right.includes(item));
}

function sharedInterests(): string[] {
  return overlap(VIEWER.interests, HOST.interests);
}

function sharedWindows(): string[] {
  return overlap(VIEWER.availability, HOST.availability);
}

/**
 * Synthetic stand-in for Meridian. Mutual contact uses `contactDisclosure`
 * from the server module. This is not a second authorization system and it
 * never calls the live app.
 */
export class FixturePort implements MeridianPort {
  readonly name = "fixture" as const;
  readonly writesEnabled = true;
  readonly viewerId = VIEWER.id;

  reads = 0;
  writeAttempts = 0;
  mutations = 0;
  lookups = 0;

  private version = 1;
  private invitation: InvitationStatus = "none";
  private invitationId: string | null = null;
  private grants: Grant[] = [];
  private nextGrant = 1;
  private session: "active" | "expired" = "active";
  private idempotency = new Map<string, StoredWrite>();
  private faults = new Map<string, WriteFault>();
  private stale: StalePlan | null = null;

  expireSession(): void {
    this.session = "expired";
  }

  failNext(endpoint: string, fault: WriteFault): void {
    this.faults.set(endpoint, fault);
  }

  /** Next plan read returns an older version. The client must ignore it. */
  pushStaleRead(stale: StalePlan): void {
    this.stale = stale;
  }

  invitationStatus(): InvitationStatus {
    return this.invitation;
  }

  grantCount(): number {
    return this.grants.length;
  }

  scriptHostAcceptsPlan(): void {
    if (this.invitation !== "invited") throw new Error("Host acceptance needs a committed join request.");
    this.invitation = "accepted";
    this.version += 1;
    this.mutations += 1;
  }

  scriptHostGrantsContact(): void {
    if (this.invitation !== "accepted") throw new Error("Both people accept the plan before either can share a relay.");
    const existing = this.grants.find(
      (grant) => grant.grantorId === HOST.id && grant.granteeId === VIEWER.id && grant.status === "active",
    );
    if (existing) return;
    this.grants.push(this.makeGrant(HOST.id, VIEWER.id));
    this.version += 1;
    this.mutations += 1;
  }

  discover(): Promise<ReadResult<DiscoverCard[]>> {
    this.reads += 1;
    const blocked = this.readGate();
    if (blocked) return Promise.resolve(blocked);
    const card: DiscoverCard = {
      id: PLAN_ID,
      version: this.version,
      title: PLAN.title,
      kindLabel: PLAN.kindLabel,
      whenLabel: PLAN.whenLabel,
      placeLabel: PLAN.placeLabel,
      hostName: HOST.displayName,
      sharedInterests: sharedInterests(),
      sharedWindows: sharedWindows(),
    };
    return Promise.resolve({ status: "ok", version: this.version, data: [card] });
  }

  plan(planId: string): Promise<ReadResult<PlanSnapshot>> {
    this.reads += 1;
    const blocked = this.readGate();
    if (blocked) return Promise.resolve(blocked);
    if (planId !== PLAN_ID) return Promise.resolve({ status: "unavailable", blocker: "That plan is not in the fixture." });
    if (this.stale) {
      const stale = this.stale;
      this.stale = null;
      return Promise.resolve({
        status: "ok",
        version: stale.version,
        data: this.snapshot({
          version: stale.version,
          title: stale.title,
          contact: stale.contact,
          contactReason: "Stale read.",
          contactAccess: stale.contact ? "visible" : "hidden",
        }),
      });
    }
    const other = this.projectOther();
    return Promise.resolve({
      status: "ok",
      version: this.version,
      data: this.snapshot({
        version: this.version,
        title: PLAN.title,
        contact: other.contact,
        contactReason: other.contactReason,
        contactAccess: other.contactAccess,
      }),
    });
  }

  visibility(planId: string): Promise<ReadResult<VisibilityReview>> {
    this.reads += 1;
    const blocked = this.readGate();
    if (blocked) return Promise.resolve(blocked);
    if (planId !== PLAN_ID) return Promise.resolve({ status: "unavailable", blocker: "That plan is not in the fixture." });
    const other = this.projectOther();
    const review: VisibilityReview = {
      planId,
      version: this.version,
      title: PLAN.title,
      rows: [
        {
          field: "Plan title, time, and place",
          audience: "Anyone who opens this synthetic card",
          access: "Visible on the card",
        },
        {
          field: "Free-window overlap",
          audience: `${VIEWER.displayName} and ${HOST.displayName}`,
          access: sharedWindows().join(", ") || "None",
        },
        {
          field: "Interests without overlap",
          audience: "Each person keeps their own list",
          access: sharedInterests().length === 0 ? "Not shown" : sharedInterests().join(", "),
        },
        {
          field: "Relay handle",
          audience: "You and the host, only after both contact grants",
          access: other.contact ? "Visible for this read" : "Hidden",
          reason: other.contactReason,
        },
        {
          field: "Copies already seen",
          audience: "Anyone who already saw a relay",
          access: "Not recalled by a revoke",
        },
      ],
    };
    return Promise.resolve({ status: "ok", version: this.version, data: review });
  }

  requestJoin(input: IdempotentWrite<{ planId: string }>): Promise<WriteResult<{ invitationId: string }>> {
    return Promise.resolve(this.mutate("join", input, () => this.applyJoin(input.body.planId)));
  }

  acceptDisclosure(
    input: IdempotentWrite<{ planId: string; otherId: string }>,
  ): Promise<WriteResult<{ permissionId: string }>> {
    return Promise.resolve(this.mutate("grant", input, () => this.applyGrant(input.body.planId, input.body.otherId)));
  }

  revokeContact(input: IdempotentWrite<{ permissionId: string }>): Promise<WriteResult<{ permissionId: string }>> {
    return Promise.resolve(this.mutate("revoke", input, () => this.applyRevoke(input.body.permissionId)));
  }

  lookup(input: { personId: string; endpoint: string; key: string; payloadHash: string }): Promise<LookupResult> {
    this.lookups += 1;
    if (this.session === "expired") return Promise.resolve({ status: "unavailable", blocker: "Session expired." });
    const stored = this.idempotency.get(this.idemKey(input.personId, input.endpoint, input.key));
    if (!stored) return Promise.resolve({ status: "absent" });
    if (stored.hash !== input.payloadHash) {
      return Promise.resolve({ status: "conflict", error: "That key was already used for a different request." });
    }
    return Promise.resolve({ status: "recorded", result: stored.result });
  }

  private readGate(): ReadResult<never> | null {
    if (this.session === "expired") return { status: "expired-session" };
    return null;
  }

  private idemKey(personId: string, endpoint: string, key: string): string {
    return `${personId}\u0000${endpoint}\u0000${key}`;
  }

  private mutate<T>(
    endpoint: string,
    input: IdempotentWrite<unknown>,
    apply: () => WriteResult<T>,
  ): WriteResult<T> {
    this.writeAttempts += 1;
    if (this.session === "expired") return { status: "expired-session" };
    if (input.personId !== VIEWER.id) return { status: "rejected", error: "This fixture is signed in as Jules Okonkwo." };
    const slot = this.idemKey(input.personId, endpoint, input.idempotencyKey);
    const stored = this.idempotency.get(slot);
    if (stored) {
      if (stored.hash !== input.payloadHash) {
        return { status: "conflict", error: "That key was already used for a different request." };
      }
      return stored.result as WriteResult<T>;
    }
    const fault = this.faults.get(endpoint);
    if (fault) this.faults.delete(endpoint);
    const attemptId = `attempt:${endpoint}:${input.idempotencyKey}`;
    if (fault === "pending") return { status: "pending", attemptId };
    if (fault === "drop-before") {
      return { status: "ambiguous", attemptId, reason: "The request left the device. The fixture has no stored result." };
    }
    const result = apply();
    if (result.status === "committed") {
      this.idempotency.set(slot, { hash: input.payloadHash, result });
    }
    if (fault === "drop-after") {
      return {
        status: "ambiguous",
        attemptId,
        reason: "The fixture stored the write, then the response was lost.",
      };
    }
    return result;
  }

  private applyJoin(planId: string): WriteResult<{ invitationId: string }> {
    if (planId !== PLAN_ID) return { status: "rejected", error: "That plan is not in the fixture." };
    if (this.invitation === "invited" || this.invitation === "accepted") {
      return { status: "rejected", error: "They already have an invitation." };
    }
    this.invitationId = "invite-jules-riverside";
    this.invitation = "invited";
    this.version += 1;
    this.mutations += 1;
    return { status: "committed", version: this.version, data: { invitationId: this.invitationId } };
  }

  private applyGrant(planId: string, otherId: string): WriteResult<{ permissionId: string }> {
    if (planId !== PLAN_ID || otherId !== HOST.id) {
      return { status: "rejected", error: "Contact can only be shared with someone on this plan." };
    }
    if (this.invitation !== "accepted") {
      return { status: "rejected", error: "Both people accept the plan before either can share a relay." };
    }
    const active = this.grants.find(
      (grant) => grant.grantorId === VIEWER.id && grant.granteeId === HOST.id && grant.status === "active",
    );
    if (active) return { status: "committed", version: this.version, data: { permissionId: active.id } };
    const grant = this.makeGrant(VIEWER.id, HOST.id);
    this.grants.push(grant);
    this.version += 1;
    this.mutations += 1;
    return { status: "committed", version: this.version, data: { permissionId: grant.id } };
  }

  private applyRevoke(permissionId: string): WriteResult<{ permissionId: string }> {
    const grant = this.grants.find((item) => item.id === permissionId);
    if (!grant || grant.grantorId !== VIEWER.id) {
      return { status: "rejected", error: "You can only revoke access you granted." };
    }
    if (grant.status !== "active") return { status: "rejected", error: "That access is already revoked." };
    grant.status = "revoked";
    this.version += 1;
    this.mutations += 1;
    return { status: "committed", version: this.version, data: { permissionId } };
  }

  private makeGrant(grantorId: string, granteeId: string): Grant {
    const id = `grant-${this.nextGrant}`;
    this.nextGrant += 1;
    return {
      id,
      grantorId,
      granteeId,
      scope: "contact",
      resourceId: PLAN_ID,
      status: "active",
    };
  }

  /**
   * Mirrors getPlanView: early reasons before acceptance, then contactDisclosure.
   * The relay string is attached only when that function says visible.
   */
  private projectOther(): {
    contact: string | null;
    contactReason: string;
    contactAccess: "hidden" | "visible" | "revoked";
  } {
    if (this.invitation !== "accepted") {
      return {
        contact: null,
        contactReason: "Accept the plan before any relay can be shared.",
        contactAccess: "hidden",
      };
    }
    const disclosure = contactDisclosure({
      viewerId: VIEWER.id,
      otherId: HOST.id,
      planId: PLAN_ID,
      invitationStatus: "accepted",
      grants: this.grants,
    });
    const revoked = this.grants.some(
      (grant) => grant.grantorId === VIEWER.id && grant.granteeId === HOST.id && grant.status === "revoked",
    );
    return {
      contact: disclosure.visible ? HOST.relay : null,
      contactReason: disclosure.reason,
      contactAccess: disclosure.visible ? "visible" : revoked ? "revoked" : "hidden",
    };
  }

  private snapshot(input: {
    version: number;
    title: string;
    contact: string | null;
    contactReason: string;
    contactAccess: "hidden" | "visible" | "revoked";
  }): PlanSnapshot {
    const active = this.grants.find(
      (grant) => grant.grantorId === VIEWER.id && grant.granteeId === HOST.id && grant.status === "active",
    );
    const hostGrant = this.grants.some(
      (grant) => grant.grantorId === HOST.id && grant.granteeId === VIEWER.id && grant.status === "active",
    );
    return {
      id: PLAN_ID,
      version: input.version,
      title: input.title,
      kindLabel: PLAN.kindLabel,
      whenLabel: PLAN.whenLabel,
      placeLabel: PLAN.placeLabel,
      hostName: HOST.displayName,
      invitationStatus: this.invitation,
      contactAccess: input.contactAccess,
      steps: [
        { label: "Your join request", value: this.invitation === "none" ? "Not sent" : "Committed" },
        {
          label: "Host acceptance of the plan",
          value: this.invitation === "accepted" ? "Accepted" : "Waiting",
        },
        { label: "Your contact grant", value: active ? "Active" : "Not active" },
        { label: "Host contact grant", value: hostGrant ? "Active" : "Not active" },
      ],
      other: {
        personId: HOST.id,
        displayName: HOST.displayName,
        contact: input.contact,
        contactReason: input.contactReason,
        myGrantId: active?.id ?? null,
        canGrant: this.invitation === "accepted" && !active,
        canRevoke: Boolean(active),
      },
    };
  }
}

export function createFixturePort(): FixturePort {
  return new FixturePort();
}
