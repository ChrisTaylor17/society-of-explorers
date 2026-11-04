import type { PlanSnapshot } from "./types.ts";
import { validReportReceipt } from "./report-contract.ts";

type ObjectValue = Record<string, unknown>;
const object = (x: unknown): x is ObjectValue => typeof x === "object" && x !== null && !Array.isArray(x);
const text = (x: unknown): x is string => typeof x === "string";
const id = (x: unknown): x is string => text(x) && x.length > 0;
const strings = (x: unknown): boolean => Array.isArray(x) && x.every(text);
const fields = (x: ObjectValue, names: string[]): boolean => names.every(name => text(x[name]));
export const validVersion = (x: unknown): x is number => Number.isSafeInteger(x) && (x as number) >= 1;

/** Runtime validation applies to fixture/injected ports as well as parsed HTTP. */
export function validRead(x: unknown, kind: "discover" | "plan" | "visibility", planId?: string): boolean {
  if (!object(x)) return false;
  if (x.status === "offline" || x.status === "expired-session") return true;
  if (x.status === "unavailable") return text(x.blocker);
  if (x.status === "rejected") return kind !== "discover" && id(x.planId) && x.planId === planId && validVersion(x.version) && text(x.error);
  if (x.status !== "ok" || !validVersion(x.version)) return false;
  if (kind === "discover") return Array.isArray(x.data) && x.data.every(card => object(card) && id(card.id) && validVersion(card.version) && card.version <= (x.version as number) && fields(card, ["title", "kindLabel", "whenLabel", "placeLabel", "hostName"]) && strings(card.sharedInterests) && strings(card.sharedWindows));
  const data = x.data;
  if (!object(data) || data.version !== x.version || !text(data.title)) return false;
  if (kind === "visibility") return data.planId === planId && Array.isArray(data.rows) && data.rows.every(row => object(row) && fields(row, ["field", "audience", "access"]) && (row.reason === undefined || text(row.reason)));
  if (data.id !== planId || !fields(data, ["kindLabel", "whenLabel", "placeLabel", "hostName"]) ||
      !["none", "invited", "accepted", "declined", "withdrawn"].includes(data.invitationStatus as string) ||
      !["hidden", "visible", "revoked"].includes(data.contactAccess as string) ||
      !Array.isArray(data.steps) || !data.steps.every(row => object(row) && fields(row, ["label", "value"]))) return false;
  const other = data.other;
  if(data.invitationStatus==='withdrawn'&&(data.contactAccess!=='hidden'||!object(other)||other.contact!==null||other.canGrant!==false||other.canRevoke!==false))return false;
  return object(other) && id(other.personId) && fields(other, ["displayName", "contactReason"]) &&
    (other.contact === null || id(other.contact)) && (data.contactAccess === "visible" || other.contact === null) &&
    (other.myGrantId === null || id(other.myGrantId)) && typeof other.canGrant === "boolean" && typeof other.canRevoke === "boolean";
}

export function validWrite(x: unknown, endpoint: string): boolean {
  if (!object(x)) return false;
  switch (x.status) {
    case "committed": return validVersion(x.version) && object(x.data) && (endpoint === "report" ? Object.keys(x).length === 3 && validReportReceipt(x.data) : endpoint === "join" ? id(x.data.invitationId) : ["grant", "revoke"].includes(endpoint) && id(x.data.permissionId));
    case "pending": return id(x.attemptId);
    case "ambiguous": return id(x.attemptId) && text(x.reason);
    case "conflict": case "rejected": return text(x.error);
    case "expired-session": case "offline": return true;
    case "unavailable": return text(x.blocker);
    default: return false;
  }
}

export function validLookup(x: unknown, endpoint: string): boolean {
  if (!object(x)) return false;
  switch (x.status) {
    case "recorded": return validWrite(x.result, endpoint) && (endpoint !== "report" || (object(x.result) && x.result.status === "committed"));
    case "absent": return true;
    case "conflict": return text(x.error);
    case "unavailable": return text(x.blocker);
    default: return false;
  }
}

/** Keep contact exclusively in RelayMemory; never retain the incoming wire object. */
export function planMetadata(plan: PlanSnapshot): PlanSnapshot {
  return {
    id: plan.id, version: plan.version, title: plan.title, kindLabel: plan.kindLabel,
    whenLabel: plan.whenLabel, placeLabel: plan.placeLabel, hostName: plan.hostName,
    invitationStatus: plan.invitationStatus, contactAccess: plan.contactAccess,
    steps: plan.steps.map(({label, value}) => ({label, value})),
    other: {personId: plan.other.personId, displayName: plan.other.displayName, contact: null,
      contactReason: plan.other.contactReason, myGrantId: plan.other.myGrantId,
      canGrant: plan.other.canGrant, canRevoke: plan.other.canRevoke},
  };
}
