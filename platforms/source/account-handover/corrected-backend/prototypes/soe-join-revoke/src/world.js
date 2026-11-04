import {MESSAGE_CONTRACT,MESSAGE_WRITES,MESSAGE_COLLECTIONS,createMessaging,validMessageBody,exact} from './messages.js';
import {DISCUSSION_CONTRACT,DISCUSSION_COLLECTIONS,DISCUSSION_WRITES,createDiscussion,validDiscussionBody} from './discussion.js';
import {openDiscussionStore} from './discussion-state.js';
import {openMessageStore} from './message-state.js';
import { randomBytes } from "node:crypto";
import { openStateStore } from "./sqlite-state.js";
import { contactDisclosure } from "./consent.ts";
import { BLOCK_LIMIT, BLOCK_SQLITE_LIMIT, DELETION_LIMIT, REVOCATION_LIMIT, SESSION_TTL_MS } from "./copy.js";
import { payloadHash } from "./hash.js";
import { checkPasscode, hashPasscode } from "./passcode.ts";
import { PEOPLE, PLAN } from "./synthetic.js";
import { MAX_REPORTS_PER_PERSON, REPORT_RECEIPT, validReportBody } from "./reports.js";
import { OPS_COLLECTIONS, OPS_WRITES, createSyntheticOps } from './synthetic-ops.js';
import { openSyntheticOpsStore, openPrivacyQueueStore } from './synthetic-ops-state.js';
import { QUEUE_CONTRACT, QUEUE_WRITES, PRIVACY_COLLECTIONS, createPrivacyOps, RHEA } from './privacy-queue.js';
import {LOCAL_RECOVERY_CONTRACT,createLocalRecovery} from './local-recovery.js';

function rejected(error) {
  return { status: "rejected", error };
}

function conflict(error) {
  return { status: "conflict", error };
}

function committed(version, data) {
  return { status: "committed", version, data };
}

/**
 * Meridian-shaped synthetic world with optional transactional local storage.
 * contactDisclosure is the vendored Meridian rule, not a second policy.
 * Mutations and reads share one queue so a revoke cannot tear a fetch.
 */
export function createWorld({ allowFaults = false, databasePath, storageTestHooks, syntheticOps = false, privacyQueue = false, privacyTestHooks, syntheticMessages = false, syntheticDiscussion = false, localRecovery = false } = {}) {
  if(localRecovery!==false&&localRecovery!==LOCAL_RECOVERY_CONTRACT)throw Error('Explicit local-session-recovery-v1 contract required');
  if(localRecovery&&(!allowFaults||databasePath===undefined||syntheticDiscussion!==DISCUSSION_CONTRACT))throw Error('Local recovery requires explicit synthetic discussion and durable local storage');
  if(syntheticDiscussion!==false&&syntheticDiscussion!==DISCUSSION_CONTRACT)throw Error('Explicit plan-discussion-v1 contract required');
  if(syntheticDiscussion&&(!allowFaults||!syntheticOps||privacyQueue!==QUEUE_CONTRACT||databasePath===undefined))throw Error('Discussion requires explicit disposable synthetic privacy-queue mode');
  if(syntheticMessages!==false&&syntheticMessages!==MESSAGE_CONTRACT)throw Error('Explicit plan-messages-v1 contract required');
  if(syntheticMessages&&(!allowFaults||databasePath===undefined))throw Error('Messaging requires explicit disposable synthetic SQLite mode');
  const baseFormat=privacyQueue?4:syntheticOps?3:2;
  if (privacyQueue !== false && privacyQueue !== QUEUE_CONTRACT) throw Error('Explicit safety-queue-v1 contract required');
  if (privacyQueue && (!syntheticOps || !allowFaults || databasePath === undefined)) throw Error('Privacy queue requires explicit disposable synthetic ops');
  if (privacyTestHooks && (!privacyQueue || !allowFaults)) throw Error('Privacy hooks require explicit test mode');
  const opsWrites = new Set([...OPS_WRITES, ...(privacyQueue ? QUEUE_WRITES : [])]);
  if (storageTestHooks && !allowFaults) throw new Error("Storage test hooks require allowFaults.");
  if (syntheticOps && (syntheticOps !== true || !allowFaults || databasePath === undefined)) throw new Error('Synthetic ops requires explicit test flags and disposable SQLite storage.');
  const people = new Map();
  const sessions = new Map();
  const plans = new Map();
  const invitations = new Map();
  const grants = new Map();
  const blocks = new Map();
  const idempotency = new Map();
  const reports = new Map();
  let nowFn = () => Date.now();
  let tail = Promise.resolve();
  let grantSerial = 0;

  for (const seed of [...PEOPLE, ...(privacyQueue ? [RHEA] : [])]) {
    const { hash, salt } = hashPasscode(seed.passcode);
    people.set(seed.id, {
      id: seed.id,
      magicName: seed.magicName,
      displayName: seed.displayName,
      passcodeHash: hash,
      passcodeSalt: salt,
      interests: [...seed.interests],
      availability: [...seed.availability],
      relay: seed.relay,
      deletedAt: null,
    });
  }
  plans.set(PLAN.id, { ...PLAN, version: 1, closed: false });

  const collections = { people, sessions, plans, invitations, grants, blocks, idempotency, reports };
  if (syntheticOps) for (const name of [...OPS_COLLECTIONS, ...(privacyQueue ? PRIVACY_COLLECTIONS : [])]) collections[name] = new Map();
  if(syntheticMessages){for(const name of MESSAGE_COLLECTIONS)collections[name]=new Map();collections.messageMeta.set('config',{contract:MESSAGE_CONTRACT,instanceId:randomBytes(16).toString('hex'),clock:0});}
  if(syntheticDiscussion){for(const name of DISCUSSION_COLLECTIONS)collections[name]=new Map();collections.discussionMeta.set('config',{contract:DISCUSSION_CONTRACT,instanceId:randomBytes(16).toString('hex'),revision:0});}
  const checkpoint = () => ({ format: syntheticDiscussion ? 6 : syntheticMessages ? 5 : baseFormat, ...(syntheticDiscussion?{discussionBaseFormat:syntheticMessages?5:baseFormat}:{}), ...(syntheticMessages?{baseFormat}:{}), fixture: privacyQueue ? "soe-four-person-one-plan-queue-v1" : "soe-three-person-one-plan-v1", grantSerial,
    ...Object.fromEntries(Object.entries(collections).map(([name, rows]) => [name, [...rows]])) });
  function restore(state) {
    grantSerial = state.grantSerial;
    for (const [name, rows] of Object.entries(collections)) {
      rows.clear();
      for (const [key, value] of state[name]) rows.set(key, value);
    }
  }
  const storage = databasePath === undefined ? null : (syntheticDiscussion ? openDiscussionStore : syntheticMessages ? ((path,initial,hooks)=>openMessageStore(path,initial,hooks,baseFormat)) : privacyQueue ? openPrivacyQueueStore : syntheticOps ? openSyntheticOpsStore : openStateStore)(databasePath, checkpoint(), storageTestHooks);
  const ops = syntheticOps ? (privacyQueue ? createPrivacyOps : createSyntheticOps)({ collections, now: () => nowFn(), bump, fixtureAllowed: allowFaults, hooks: privacyTestHooks }) : null;
  const messaging=syntheticMessages?createMessaging({collections,now:()=>nowFn(),blocked:blockedBetween,unavailable:planId=>ops?.unavailable(planId)}):null;
  const discussion=syntheticDiscussion?createDiscussion({collections,now:()=>nowFn(),blocked:blockedBetween,unavailable:planId=>ops?.unavailable(planId),reviewerAllowed:(personId,planId)=>ops?.read(collections.people.get(personId),planId).status==='ok'}):null;
  const recovery=localRecovery?createLocalRecovery({collections,gate,instanceId:()=>discussion.instanceId()}):null;
  const recoveryUnavailable=()=>({status:'unavailable',blocker:'Local recovery disabled.'});
  // Informational copy describes this run, including replays of older stored
  // receipts. Preserve the committed facts and the stored receipt itself.
  function currentBlockNotice(result) {
    if (result.status !== "committed" || result.data?.blocked !== true) return result;
    return { ...result, data: { ...result.data, limit: storage ? BLOCK_SQLITE_LIMIT : BLOCK_LIMIT } };
  }
  let closing = false;
  let closePromise;
  function exclusive(fn, authorize) {
    if (closing) return Promise.reject(new Error("Synthetic world is closed."));
    const run = tail.then(() => {
      if (!storage) return fn();
      let before;
      try {
        return storage.transaction(state => {
          before = structuredClone(state); restore(state);
          const result = fn();
          if (result && typeof result.then === "function") throw new Error("Durable world operations must be synchronous inside the transaction.");
          return { state: checkpoint(), result, authorize };
        });
      } catch (error) {
        if (before) restore(before);
        if(error.authorizationResult)return error.authorizationResult;
        throw error;
      }
    });
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  function sessionPerson(token) {
    if (!token) return null;
    const row = sessions.get(token);
    if (!row) return null;
    if (Date.parse(row.expiresAt) <= nowFn()) return null;
    return people.get(row.personId) ?? null;
  }

  function asGrants(planId) {
    return [...grants.values()]
      .filter((grant) => grant.resourceId === planId && grant.scope === "contact")
      .map((grant) => ({
        grantorId: grant.grantorId,
        granteeId: grant.granteeId,
        scope: grant.scope,
        resourceId: grant.resourceId,
        status: grant.status,
      }));
  }

  function activeGrant(grantorId, granteeId, planId) {
    return [...grants.values()].find(
      (grant) =>
        grant.grantorId === grantorId &&
        grant.granteeId === granteeId &&
        grant.scope === "contact" &&
        grant.resourceId === planId &&
        grant.status === "active",
    );
  }

  function planInvites(planId) {
    return [...invitations.values()].filter((invite) => invite.planId === planId);
  }

  // One person's block denies interaction in both directions. Only that
  // authenticated person can create their own directed block record.
  function blockedBetween(left, right) {
    return blocks.has(`${left}\u0000${right}`) || blocks.has(`${right}\u0000${left}`);
  }

  function primaryInvite(planId) {
    const rows = planInvites(planId);
    return rows.find((invite) => invite.status === "accepted") ?? rows.find((invite) => invite.status === "invited") ?? null;
  }

  function bump(plan) {
    plan.version += 1;
    return plan.version;
  }

  function seal(snapshot) {
    const rest = structuredClone(snapshot);
    rest.other.contact = null;
    if (JSON.stringify(rest).includes("relay:")) {
      throw new Error("A relay appeared outside the contact field.");
    }
    if (snapshot.contactAccess !== "visible" && snapshot.other.contact != null) {
      throw new Error("Contact was returned without mutual acceptance.");
    }
    return snapshot;
  }

  function overlap(viewer, host) {
    return {
      sharedInterests: host.interests.filter((interest) => viewer.interests.includes(interest)),
      sharedWindows: host.availability.filter((window) => viewer.availability.includes(window)),
    };
  }

  function visitorSnapshot(viewer, plan, host) {
    const shared = viewer.id === host.id ? { sharedInterests: [], sharedWindows: [] } : overlap(viewer, host);
    return seal({
      id: plan.id,
      version: plan.version,
      title: plan.title,
      kindLabel: plan.kindLabel,
      whenLabel: plan.whenLabel,
      placeLabel: plan.placeLabel,
      hostName: host.displayName,
      invitationStatus: "none",
      contactAccess: "hidden",
      steps: [
        { label: "Your join request", value: "Not sent" },
        { label: "Host acceptance of the plan", value: "Waiting" },
        { label: "Your contact grant", value: "Not active" },
        { label: "Host contact grant", value: "Not active" },
      ],
      other: {
        personId: host.id,
        displayName: host.displayName,
        contact: null,
        contactReason: "Contact stays hidden until both of you accept disclosure.",
        myGrantId: null,
        canGrant: false,
        canRevoke: false,
      },
      role: viewer.id === host.id ? "host" : "visitor",
      canAccept: false,
      invitationId: null,
      viewerName: viewer.displayName,
      sharedInterests: shared.sharedInterests,
      sharedWindows: shared.sharedWindows,
      revocationLimit: REVOCATION_LIMIT,
    });
  }

  function pairSnapshot(viewer, other, plan, invite, isHost) {
    const host = people.get(plan.hostId);
    const accepted = invite.status === "accepted";
    let contact = null;
    let contactReason;
    let contactAccess = "hidden";
    if (blockedBetween(viewer.id, other.id)) {
      contactReason = "Contact is unavailable.";
    } else if (other.deletedAt) {
      contactReason = invite.wasVisible
        ? "Their account is deleted. Future contact access is off. A copy someone already saw stays with them."
        : "Their account is deleted. Future contact access is off.";
    } else if (!accepted) {
      contactReason = "Accept the plan before any relay can be shared.";
    } else {
      const disclosure = contactDisclosure({
        viewerId: viewer.id,
        otherId: other.id,
        planId: plan.id,
        invitationStatus: "accepted",
        grants: asGrants(plan.id),
      });
      contactReason = disclosure.reason;
      const mineRevoked = asGrants(plan.id).some(
        (grant) => grant.grantorId === viewer.id && grant.granteeId === other.id && grant.status === "revoked",
      );
      if (disclosure.visible) {
        contact = other.relay;
        contactAccess = "visible";
        invite.wasVisible = true;
      } else if (mineRevoked) {
        contactAccess = "revoked";
      }
    }
    const myGrant = activeGrant(viewer.id, other.id, plan.id);
    const theirGrant = activeGrant(other.id, viewer.id, plan.id);
    const shared = overlap(isHost ? other : viewer, host);
    const steps = isHost
      ? [
          { label: "Join request", value: "Committed" },
          { label: "Your acceptance of the plan", value: accepted ? "Accepted" : "Waiting" },
          { label: "Your contact grant", value: myGrant ? "Active" : "Not active" },
          { label: "Their contact grant", value: theirGrant ? "Active" : "Not active" },
        ]
      : [
          { label: "Your join request", value: "Committed" },
          { label: "Host acceptance of the plan", value: accepted ? "Accepted" : "Waiting" },
          { label: "Your contact grant", value: myGrant ? "Active" : "Not active" },
          { label: "Host contact grant", value: theirGrant ? "Active" : "Not active" },
        ];
    const snapshot = {
      id: plan.id,
      version: plan.version,
      title: plan.title,
      kindLabel: plan.kindLabel,
      whenLabel: plan.whenLabel,
      placeLabel: plan.placeLabel,
      hostName: host.displayName,
      invitationStatus: invite.status,
      contactAccess,
      steps,
      other: {
        personId: other.id,
        displayName: other.displayName,
        contact,
        contactReason,
        myGrantId: myGrant ? myGrant.id : null,
        canGrant: Boolean(accepted && !other.deletedAt && !viewer.deletedAt && !blockedBetween(viewer.id, other.id) && !myGrant),
        canRevoke: Boolean(myGrant),
      },
      role: isHost ? "host" : "guest",
      canAccept: Boolean(isHost && invite.status === "invited" && !other.deletedAt && !plan.closed && !blockedBetween(viewer.id, other.id)),
      invitationId: invite.id,
      viewerName: viewer.displayName,
      sharedInterests: shared.sharedInterests,
      sharedWindows: shared.sharedWindows,
      revocationLimit: REVOCATION_LIMIT,
    };
    if (isHost) {
      snapshot.joinCount = planInvites(plan.id).filter((row) => row.status === "invited" || row.status === "accepted").length;
    }
    return seal(snapshot);
  }

  function snapshotFor(viewer, plan) {
    const host = people.get(plan.hostId);
    const invite = primaryInvite(plan.id);
    const isHost = viewer.id === plan.hostId;
    const isGuest = Boolean(invite && invite.requesterId === viewer.id);
    if (!isHost && !isGuest) return visitorSnapshot(viewer, plan, host);
    if (isHost && !invite) return visitorSnapshot(viewer, plan, host);
    const other = isHost ? people.get(invite.requesterId) : host;
    return pairSnapshot(viewer, other, plan, invite, isHost);
  }

  function gate(token) {
    const person = sessionPerson(token);
    if (!person) return { error: { status: "expired-session" } };
    if (person.deletedAt) return { error: { status: "rejected", error: "This account was deleted." } };
    return { person };
  }

  function readPlan(token, planId) {
    const gated = gate(token);
    if (gated.error) return gated.error;
    const plan = plans.get(planId);
    if (!plan) return { status: "unavailable", blocker: "That plan is not in this prototype." };
    if (blockedBetween(gated.person.id, plan.hostId)) {
      return { ...rejected("This plan is unavailable."), planId: plan.id, version: plan.version };
    }
    const held = ops?.unavailable(planId);
    if (held) return held;
    const data = snapshotFor(gated.person, plan);
    return { status: "ok", version: data.version, data };
  }

  function applyJoin(person, body) {
    const plan = plans.get(body.planId);
    if (!plan) return rejected("That plan is not in this prototype.");
    if (ops?.unavailable(plan.id)) return ops.unavailable(plan.id);
    if (plan.closed) return rejected("This plan is closed.");
    if (person.id === plan.hostId) return rejected("You are already the host.");
    if (blockedBetween(person.id, plan.hostId)) return rejected("This interaction is unavailable.");
    const rows = planInvites(plan.id);
    const mine = rows.find((invite) => invite.requesterId === person.id && (invite.status === "invited" || invite.status === "accepted"));
    if (mine) return rejected("They already have an invitation.");
    if (rows.some((invite) => invite.status === "invited" || invite.status === "accepted")) {
      return rejected("This plan already has a join request.");
    }
    const firstId = person.id === "jules" && plan.id === "plan-riverside" ? "invite-jules-riverside" : `invite-${person.id}-${plan.id}`;
    const id = invitations.has(firstId) ? `${firstId}-${randomBytes(16).toString("hex")}` : firstId;
    invitations.set(id, {
      id,
      planId: plan.id,
      requesterId: person.id,
      status: "invited",
      wasVisible: false,
    });
    return committed(bump(plan), { invitationId: id });
  }

  function applyAccept(person, body) {
    const plan = plans.get(body.planId);
    if (!plan) return rejected("That plan is not here.");
    if (ops?.unavailable(plan.id)) return ops.unavailable(plan.id);
    if (plan.hostId !== person.id) return rejected("Only the plan host can accept a join request.");
    if (blockedBetween(person.id, body.requesterId)) return rejected("This interaction is unavailable.");
    if (plan.closed) return rejected("This plan is closed.");
    const requests = planInvites(plan.id).filter(row => row.requesterId === body.requesterId);
    if (requests.length > 1 && typeof body.invitationId !== "string") return rejected("Refresh this join request before accepting.");
    const invite = body.invitationId === undefined ? requests[0] : requests.find(row => row.id === body.invitationId);
    if (!invite || invite.status === "declined") return rejected("That join request is not here.");
    if (invite.status === "withdrawn") return rejected("That join request was withdrawn.");
    if (invite.status === "accepted") return rejected("That join request is already accepted.");
    const requester = people.get(invite.requesterId);
    if (!requester || requester.deletedAt) return rejected("That join request was withdrawn.");
    invite.status = "accepted";
    return committed(bump(plan), { invitationId: invite.id });
  }

  function applyGrant(person, body) {
    const plan = plans.get(body.planId);
    if (!plan || plan.closed) return rejected("That plan is not here.");
    if (ops?.unavailable(plan.id)) return ops.unavailable(plan.id);
    const other = people.get(body.otherId);
    if (!other || other.id === person.id) return rejected("Contact can only be shared with someone on this plan.");
    if (other.deletedAt) return rejected("This account was deleted.");
    if (blockedBetween(person.id, other.id)) return rejected("This interaction is unavailable.");
    const invite = primaryInvite(plan.id);
    if (!invite) return rejected("Contact can only be shared with someone on this plan.");
    const cycles = planInvites(plan.id).filter(row => row.requesterId === invite.requesterId).length;
    if ((cycles > 1 && typeof body.invitationId !== "string") || (body.invitationId !== undefined && body.invitationId !== invite.id)) {
      return rejected("Refresh this participation before sharing contact.");
    }
    const members = new Set([plan.hostId, invite.requesterId]);
    if (!members.has(person.id) || !members.has(other.id)) {
      return rejected("Contact can only be shared with someone on this plan.");
    }
    if (person.id !== plan.hostId && other.id !== plan.hostId) {
      return rejected("In this prototype, a relay is shared with the host, not between guests.");
    }
    if (invite.status !== "accepted") {
      return rejected("Both people accept the plan before either can share a relay.");
    }
    const existing = activeGrant(person.id, other.id, plan.id);
    if (existing) return committed(plan.version, { permissionId: existing.id });
    grantSerial += 1;
    const id = `grant-${grantSerial}`;
    grants.set(id, {
      id,
      grantorId: person.id,
      granteeId: other.id,
      scope: "contact",
      resourceId: plan.id,
      status: "active",
      revokedAt: null,
    });
    const version = bump(plan);
    const disclosure = contactDisclosure({
      viewerId: person.id,
      otherId: other.id,
      planId: plan.id,
      invitationStatus: "accepted",
      grants: asGrants(plan.id),
    });
    return committed(version, { permissionId: id });
  }

  function applyLeave(person, body) {
    if (Object.keys(body).length !== 2 || typeof body.planId !== "string" || typeof body.invitationId !== "string") return rejected("A leave requires only planId and invitationId.");
    const plan = plans.get(body.planId), invite = invitations.get(body.invitationId);
    if (!plan || plan.hostId === person.id || !invite || invite.planId !== plan.id || invite.requesterId !== person.id) return rejected("That participation is unavailable.");
    if (!["invited", "accepted"].includes(invite.status)) return rejected("That participation has already ended.");
    const outcome = invite.status === "accepted" ? "left" : "withdrawn";
    invite.status = "withdrawn";
    const at = new Date(nowFn()).toISOString();
    for (const grant of grants.values()) {
      if (grant.resourceId === plan.id && grant.status === "active" &&
          ((grant.grantorId === person.id && grant.granteeId === plan.hostId) || (grant.grantorId === plan.hostId && grant.granteeId === person.id))) {
        grant.status = "revoked"; grant.revokedAt = at;
      }
    }
    return committed(bump(plan), { operation: "leave", planId: plan.id, invitationId: invite.id, outcome,
      limit: "Participation ended. Future contact access is off; copies already seen cannot be recalled. Historical records remain in local storage." });
  }

  function applyRevoke(person, body) {
    const grant = grants.get(body.permissionId);
    if (!grant || grant.grantorId !== person.id) return rejected("You can only revoke access you granted.");
    if (grant.status !== "active") return rejected("That access is already revoked.");
    grant.status = "revoked";
    grant.revokedAt = new Date(nowFn()).toISOString();
    const plan = plans.get(grant.resourceId);
    const version = plan ? bump(plan) : 0;
    return committed(version, { permissionId: grant.id, limit: REVOCATION_LIMIT });
  }

  function applyDelete(person) {
    if (!person.deletedAt) {
      person.deletedAt = new Date(nowFn()).toISOString();
      for (const plan of plans.values()) {
        if (plan.hostId === person.id) {
          plan.closed = true;
          for (const invite of planInvites(plan.id)) {
            if (invite.status === "invited") invite.status = "withdrawn";
          }
          bump(plan);
        }
      }
      for (const invite of invitations.values()) {
        if (invite.requesterId === person.id && invite.status === "invited") {
          invite.status = "withdrawn";
          const plan = plans.get(invite.planId);
          if (plan) bump(plan);
        }
      }
      for (const grant of grants.values()) {
        if (grant.grantorId === person.id && grant.status === "active") {
          grant.status = "revoked";
          grant.revokedAt = person.deletedAt;
          const plan = plans.get(grant.resourceId);
          if (plan) bump(plan);
        }
      }
    }
    const version = Math.max(...[...plans.values()].map((plan) => plan.version));
    return committed(version, { deleted: true, limit: DELETION_LIMIT });
  }

  function applyBlock(person, body) {
    if (Object.keys(body).length !== 1 || typeof body.otherId !== "string") {
      return rejected("A block requires only otherId.");
    }
    const other = people.get(body.otherId);
    if (!other || other.deletedAt || other.id === person.id) return rejected("That block target is unavailable.");
    const key = `${person.id}\u0000${other.id}`;
    if (!blocks.has(key)) {
      const createdAt = new Date(nowFn()).toISOString();
      blocks.set(key, { blockerId: person.id, blockedId: other.id, createdAt });
      const affected = new Set();
      const isPair = (left, right) =>
        (left === person.id && right === other.id) || (left === other.id && right === person.id);
      for (const invite of invitations.values()) {
        const plan = plans.get(invite.planId);
        if (plan && isPair(plan.hostId, invite.requesterId) && ["invited", "accepted"].includes(invite.status)) {
          invite.status = "withdrawn";
          affected.add(plan.id);
        }
      }
      for (const grant of grants.values()) {
        if (grant.scope === "contact" && grant.status === "active" && isPair(grant.grantorId, grant.granteeId)) {
          grant.status = "revoked";
          grant.revokedAt = createdAt;
          affected.add(grant.resourceId);
        }
      }
      for (const planId of affected) {
        const plan = plans.get(planId);
        if (plan) bump(plan);
      }
    }
    // Same version convention as account deletion. Reads still authorize each
    // plan; this receipt is history, not permission to see a participant.
    const version = Math.max(1, ...[...plans.values()].map(plan => plan.version));
    return currentBlockNotice(committed(version, { blocked: true, otherId: other.id, limit: BLOCK_LIMIT }));
  }

  function applyReport(person, body) {
    if (!storage) return { status: "unavailable", blocker: "Report submission requires the configured local database. No report was submitted." };
    if (!validReportBody(body)) return rejected("The report fields are invalid.");
    const other = people.get(body.otherId);
    if (!other || other.id === person.id || (body.planId !== undefined && !plans.has(body.planId))) return rejected("The report fields are invalid.");
    if ([...reports.values()].filter(report => report.reporterId === person.id).length >= MAX_REPORTS_PER_PERSON) {
      return { status: "rejected", code: "report-limit", error: "The local report submission limit was reached. No report was submitted." };
    }
    let id;
    do { id = `report-${randomBytes(16).toString("hex")}`; } while (reports.has(id));
    reports.set(id, { id, reporterId: person.id, subjectId: other.id, category: body.category,
      details: body.details.trim(), planId: body.planId ?? null, submittedAt: new Date(nowFn()).toISOString() });
    ops?.registerReport(reports.get(id));
    const version = Math.max(1, ...[...plans.values()].map(plan => plan.version));
    return committed(version, { reportId: id, submitted: true, notice: REPORT_RECEIPT });
  }

  function apply(endpoint, person, body) {
    if(DISCUSSION_WRITES.has(endpoint))return discussion?discussion.apply(person,endpoint,body):{status:'unavailable',blocker:'Discussion disabled.'};
    if(MESSAGE_WRITES.has(endpoint))return messaging?messaging.apply(person,endpoint,body):{status:"unavailable",blocker:"Messaging disabled."};
    if (opsWrites.has(endpoint) && ops) return ops.apply(person, endpoint, body);
    if (endpoint === "join") return applyJoin(person, body);
    if (endpoint === "leave") return applyLeave(person, body);
    if (endpoint === "accept") return applyAccept(person, body);
    if (endpoint === "grant") return applyGrant(person, body);
    if (endpoint === "revoke") return applyRevoke(person, body);
    if (endpoint === "delete-account") return applyDelete(person);
    if (endpoint === "block") return applyBlock(person, body);
    if (endpoint === "report") return applyReport(person, body);
    return rejected("That route is not in this prototype.");
  }

  function writeUnlocked(person, endpoint, input, fault) {
    if (privacyQueue && !ops.endpointAllowed(person, endpoint)) return rejected('not_authorized');
    if (!input || typeof input !== "object" || Array.isArray(input)) return rejected("The body is not a write.");
    if(DISCUSSION_WRITES.has(endpoint)){
      if(!discussion)return {status:'unavailable',blocker:'Discussion disabled.'};
      if(!exact(input,['personId','idempotencyKey','payloadHash','body'])||!validDiscussionBody(endpoint,input.body)||!/^[A-Za-z0-9._:-]{1,100}$/.test(input.idempotencyKey))return rejected('invalid_discussion');
      if(input.body.instanceId!==discussion.instanceId())return conflict('fixture_changed');
    }
    if (["report", "leave"].includes(endpoint) && Object.keys(input).some(key => !["personId", "idempotencyKey", "payloadHash", "body"].includes(key))) return rejected("The report envelope is invalid.");
    if (opsWrites.has(endpoint) && Object.keys(input).some(key => !["personId", "idempotencyKey", "payloadHash", "body"].includes(key))) return rejected('malformed');
    if(MESSAGE_WRITES.has(endpoint)){
      if(!messaging)return {status:'unavailable',blocker:'Messaging disabled.'};
      if(!exact(input,['personId','idempotencyKey','payloadHash','body'])||!validMessageBody(endpoint,input.body)||!/^[A-Za-z0-9._:-]{1,100}$/.test(input.idempotencyKey))return rejected('invalid_message');
      if(input.body.instanceId!==messaging.instanceId())return conflict('fixture_changed');
    }
    if (input.personId !== person.id) return opsWrites.has(endpoint) ? rejected('actor_mismatch') : rejected(`This session is signed in as ${person.displayName}.`);
    if (typeof input.idempotencyKey !== "string" || input.idempotencyKey.length < 1 || input.idempotencyKey.length > 200) {
      return rejected("The idempotency key is missing.");
    }
    if (!input.body || typeof input.body !== "object" || Array.isArray(input.body)) {
      return rejected("The write body is missing.");
    }
    const hash = payloadHash(input.body);
    if (input.payloadHash !== hash) return rejected("The payload hash does not match the body.");
    if (person.deletedAt && endpoint !== "delete-account") return rejected("This account was deleted.");
    const storeKey = `${person.id}\u0000${endpoint}\u0000${input.idempotencyKey}`;
    const existing = idempotency.get(storeKey);
    if (existing) {
      if (existing.payloadHash !== hash) return conflict("That key was already used for a different request.");
      const result = structuredClone(existing.result);
      if (opsWrites.has(endpoint) && ops) return ops.present(existing, person, true);
      return endpoint === "block" ? currentBlockNotice(result) : result;
    }
    if (fault === "drop-before") {
      return {
        status: "ambiguous",
        attemptId: `attempt:${endpoint}:${input.idempotencyKey}`,
        reason: "The request was dropped before it was stored.",
      };
    }
    const heldBefore=messaging?.held();
    const result = apply(endpoint, person, input.body);
    if(result.status==='committed'&&messaging&&!MESSAGE_WRITES.has(endpoint))messaging.afterCore(endpoint,heldBefore);
    if(result.status==='committed'&&discussion&&!DISCUSSION_WRITES.has(endpoint))discussion.afterCore();
    if (result.status === "committed") {
      idempotency.set(storeKey, { payloadHash: hash, result: structuredClone(result), ...(opsWrites.has(endpoint) && ops ? {
        authority: { assignmentId: input.body.assignmentId, epoch: input.body.expectedEpoch, planId: input.body.planId },
      } : {}) });
    }
    if (fault === "drop-after") {
      return {
        status: "ambiguous",
        attemptId: `attempt:${endpoint}:${input.idempotencyKey}`,
        reason: "The server stored the write, then the response was lost.",
      };
    }
    if (result.status === 'committed' && opsWrites.has(endpoint) && ops) return ops.present(idempotency.get(storeKey), person, false);
    return result;
  }

  return {
    allowFaults,
    localRecoveryContract:localRecovery||null,
    currentRecoverySession(token){return exclusive(()=>recovery?recovery.context(token):recoveryUnavailable(),recovery?()=>gate(token).error??null:undefined);},
    recoverParticipation(token,input){return exclusive(()=>recovery?recovery.receipts(token,input):recoveryUnavailable(),recovery?()=>gate(token).error??null:undefined);},
    endRecoverySession(token,input){return exclusive(()=>recovery?recovery.end(token,input):recoveryUnavailable());},
    discussionContract:syntheticDiscussion||null,
    discussionIdentity(){return exclusive(()=>discussion?{contract:DISCUSSION_CONTRACT,instanceId:discussion.instanceId()}:null);},
    discussion(token,planId,view='feed'){return exclusive(()=>{if(!discussion)return {status:'unavailable',blocker:'Discussion disabled.'};const g=gate(token);return g.error??discussion.read(g.person,planId,view);});},
    storageMode: storage ? "sqlite" : "memory",
    messagingContract:syntheticMessages||null,
    messagingIdentity(){return exclusive(()=>messaging?{contract:MESSAGE_CONTRACT,instanceId:messaging.instanceId()}:null);},
    messagingContext(token,planId,invitationId){return exclusive(()=>{if(!messaging)return {status:'unavailable',blocker:'Messaging disabled.'};const g=gate(token);return g.error??messaging.context(g.person,planId,invitationId);});},
    messages(token,body){return exclusive(()=>{if(!messaging)return {status:'unavailable',blocker:'Messaging disabled.'};const g=gate(token);return g.error??messaging.read(g.person,body);});},
    syntheticOpsEnabled: Boolean(ops),
    privacyQueueContract: privacyQueue || null,
    privateOpsState(token, planId, view) {
      return exclusive(() => {
        if (!privacyQueue) return { status: 'unavailable', blocker: 'Privacy queue disabled.' };
        const gated = gate(token); if (gated.error) return gated.error;
        return ops.readPrivate(gated.person, planId, view);
      });
    },
    ...(ops && allowFaults ? {
      seedSyntheticOpsFixture(config) { return exclusive(() => ops.seedFixture(config)); },
      setSyntheticResumePolicy(planId, config) { return exclusive(() => ops.setPolicy(planId, config)); },
    } : {}),
    opsState(token, planId) {
      return exclusive(() => {
        if (!ops) return { status: 'unavailable', blocker: 'Synthetic operator foundation is disabled.' };
        const gated = gate(token);
        if (gated.error) return gated.error;
        return ops.read(gated.person, planId);
      });
    },
    close() {
      if (!closePromise) {
        closing = true;
        closePromise = tail.then(() => storage?.close());
      }
      return closePromise;
    },
    setNow(fn) {
      nowFn = fn;
    },
    signIn(magicName, passcode) {
      return exclusive(() => {
        const name = String(magicName ?? "").trim().toLowerCase();
        const person = [...people.values()].find((item) => item.magicName === name);
        if (!person || !checkPasscode(String(passcode ?? ""), person.passcodeSalt, person.passcodeHash)) {
          return { status: "rejected", error: "That magic name and passcode do not match." };
        }
        if (person.deletedAt) return { status: "rejected", error: "This account was deleted." };
        for (const [token, row] of sessions) {
          if (row.personId === person.id) sessions.delete(token);
        }
        const token = randomBytes(32).toString("hex");
        const expiresAt = new Date(nowFn() + SESSION_TTL_MS).toISOString();
        sessions.set(token, { personId: person.id, expiresAt, issuedAt: new Date(nowFn()).toISOString() });
        return {
          status: "ok",
          token,
          expiresAt,
          person: { id: person.id, displayName: person.displayName, magicName: person.magicName },
        };
      });
    },
    discover(token) {
      return exclusive(() => {
        const gated = gate(token);
        if (gated.error) return gated.error;
        const cards = [];
        for (const plan of plans.values()) {
          const host = people.get(plan.hostId);
          if (!host || host.deletedAt || plan.closed || ops?.unavailable(plan.id) || blockedBetween(gated.person.id, host.id)) continue;
          const shared = overlap(gated.person, host);
          cards.push({
            id: plan.id,
            version: plan.version,
            title: plan.title,
            kindLabel: plan.kindLabel,
            whenLabel: plan.whenLabel,
            placeLabel: plan.placeLabel,
            hostName: host.displayName,
            sharedInterests: shared.sharedInterests,
            sharedWindows: shared.sharedWindows,
          });
        }
        if (JSON.stringify(cards).includes("relay:")) throw new Error("A relay appeared on a discover card.");
        const version = cards.reduce((max, card) => Math.max(max, card.version), 1);
        return { status: "ok", version, data: cards };
      });
    },
    membership(token, planId) {
      return exclusive(() => {
        const gated = gate(token); if (gated.error) return gated.error;
        const plan = plans.get(planId); if (!plan) return { status: "unavailable", blocker: "That plan is not in this prototype." };
        const mine = planInvites(planId).filter(row => row.requesterId === gated.person.id).at(-1);
        return { status: "ok", version: plan.version, data: { planId, invitationId: mine?.id ?? null,
          status: gated.person.id === plan.hostId ? "host" : mine?.status ?? "none",
          canLeave: Boolean(mine && ["invited", "accepted"].includes(mine.status)) } };
      });
    },
    plan(token, planId) {
      return exclusive(() => readPlan(token, planId));
    },
    visibility(token, planId) {
      return exclusive(() => {
        const read = readPlan(token, planId);
        if (read.status !== "ok") return read;
        const snap = read.data;
        const relayAccess = snap.contactAccess === "visible" ? "Visible for this read" : "Hidden";
        const windowAccess = (snap.sharedWindows || []).join(", ") || "None";
        const overlapNames =
          snap.viewerName === snap.other.displayName
            ? snap.viewerName
            : `${snap.viewerName} and ${snap.other.displayName}`;
        const review = {
          planId: snap.id,
          version: snap.version,
          title: snap.title,
          rows: [
            {
              field: "Plan title, time, and place",
              audience: "Anyone who opens this synthetic card",
              access: "Visible on the card",
            },
            {
              field: "Free-window overlap",
              audience: overlapNames,
              access: windowAccess,
            },
            {
              field: "Interests without overlap",
              audience: "Each person keeps their own list",
              access: "Not shown",
            },
            {
              field: "Relay handle",
              audience:
                snap.role === "host"
                  ? "You and the guest, only after both contact grants"
                  : "You and the host, only after both contact grants",
              access: relayAccess,
              reason: snap.other.contactReason,
            },
            {
              field: "Copies already seen",
              audience: "Anyone who already saw a relay",
              access: "Not recalled by a revoke",
            },
          ],
        };
        if (JSON.stringify(review).includes("relay:")) throw new Error("A relay appeared on the visibility review.");
        return { status: "ok", version: review.version, data: review };
      });
    },
    write(token, endpoint, input, fault = "") {
      return exclusive(() => {
        if (opsWrites.has(endpoint) && !ops) return { status: 'unavailable', blocker: 'Synthetic operator foundation is disabled.' };
        const person = sessionPerson(token);
        if (!person) return { status: "expired-session" };
        return writeUnlocked(person, endpoint, input, opsWrites.has(endpoint) ? '' : fault);
      },(messaging&&MESSAGE_WRITES.has(endpoint)||discussion&&DISCUSSION_WRITES.has(endpoint))?()=>{const actor=sessionPerson(token);return !actor||actor.deletedAt?{status:'expired-session'}:null;}:undefined);
    },
    lookup(token, input) {
      return exclusive(() => {
        const person = sessionPerson(token);
        if (!person) return { status: "unavailable", blocker: "Session expired." };
        if (person.deletedAt) return rejected("This account was deleted.");
        if (!input || typeof input !== "object") return rejected("The body is not a lookup.");
        if (input.personId !== person.id) return conflict("This session is not that person.");
        if (typeof input.endpoint !== "string" || typeof input.key !== "string" || typeof input.payloadHash !== "string") {
          return rejected("The lookup is missing a field.");
        }
        if (privacyQueue && !ops.endpointAllowed(person, input.endpoint, true)) return rejected('not_authorized');
        if(DISCUSSION_WRITES.has(input.endpoint)){
          if(!discussion)return {status:'unavailable',blocker:'Discussion disabled.'};
          if(!exact(input,['personId','endpoint','key','payloadHash','instanceId'])||input.instanceId!==discussion.instanceId())return conflict('fixture_changed');
        }
        if(MESSAGE_WRITES.has(input.endpoint)){
          if(!messaging)return {status:'unavailable',blocker:'Messaging disabled.'};
          if(!exact(input,['personId','endpoint','key','payloadHash','instanceId'])||input.instanceId!==messaging.instanceId())return conflict('fixture_changed');
        }
        const existing = idempotency.get(`${person.id}\u0000${input.endpoint}\u0000${input.key}`);
        if (!existing) return { status: "absent" };
        if (existing.payloadHash !== input.payloadHash) return conflict("That key was already used for a different request.");
        const result = structuredClone(existing.result);
        if (opsWrites.has(input.endpoint) && ops) {
          const { presentation, ...stable } = ops.present(existing, person, true);
          return { status: 'recorded', result: stable, presentation };
        }
        return { status: "recorded", result: input.endpoint === "block" ? currentBlockNotice(result) : result };
      });
    },
  };
}
