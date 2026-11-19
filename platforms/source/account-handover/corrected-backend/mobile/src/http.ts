import type { MeridianPort } from "./port.ts";
import type { IdempotentWrite, LookupResult, ReadResult, WriteResult } from "./types.ts";

/**
 * Routes that exist on the current Meridian server (meridian/src/app/api).
 * Mutations are cookie form actions in meridian/src/lib/actions.ts, not JSON.
 */
export const EXISTING_JSON_ROUTES = {
  planRead: "GET /api/plans/:id",
  permissionsRead: "GET /api/permissions",
  sessionRotate: "POST /api/session",
  receiptVerify: "POST /api/receipts/verify",
} as const;

export const HTTP_BLOCKERS = {
  discover:
    "GET /api/plans does not exist. Plan lists are server-rendered in meridian/src/app/home/page.tsx via listPlanSummaries.",
  plan: "GET /api/plans/:id exists, but it requires the meridian_session cookie from signIn. This client does not invent a bearer session or send that cookie.",
  visibility:
    "There is no JSON visibility route. Who-may-see-what is computed inside getPlanView and returned only on a member plan read.",
  join: "Request-to-join is not a Meridian operation. invitePerson is host-only and is a form server action in meridian/src/lib/actions.ts.",
  grant: "grantContact is a form server action. There is no JSON grant route and no idempotency store.",
  revoke: "revokePermission is a form server action. There is no JSON revoke route.",
  lookup: "No (person_id, endpoint, key) idempotency store exists on the server.",
  session:
    "signIn deletes every session for the person (domain.signIn). A mobile bearer session that can rotate without signing other devices out is not implemented.",
} as const;

export type HttpTransport = {
  send(request: { method: string; path: string }): Promise<unknown>;
};

export function createProbeTransport(): HttpTransport & { calls(): number } {
  let sent = 0;
  return {
    calls: () => sent,
    async send() {
      sent += 1;
      throw new Error("Meridian HTTP transport is disabled in this foundation.");
    },
  };
}

function unavailable<T>(blocker: string): ReadResult<T> {
  return { status: "unavailable", blocker };
}

function refused(blocker: string): WriteResult<never> {
  return { status: "unavailable", blocker };
}

/**
 * Documents the live server without calling it.
 * `transport` is accepted so tests can prove no request is sent.
 */
export function createHttpPort(transport: HttpTransport = createProbeTransport()): MeridianPort {
  void transport;
  return {
    name: "http-boundary",
    writesEnabled: false,
    viewerId: "",
    discover() {
      return Promise.resolve(unavailable(HTTP_BLOCKERS.discover));
    },
    plan() {
      return Promise.resolve(unavailable(HTTP_BLOCKERS.plan));
    },
    visibility() {
      return Promise.resolve(unavailable(HTTP_BLOCKERS.visibility));
    },
    requestJoin(_input: IdempotentWrite<{ planId: string }>) {
      return Promise.resolve(refused(HTTP_BLOCKERS.join));
    },
    acceptDisclosure(_input: IdempotentWrite<{ planId: string; otherId: string }>) {
      return Promise.resolve(refused(HTTP_BLOCKERS.grant));
    },
    revokeContact(_input: IdempotentWrite<{ permissionId: string }>) {
      return Promise.resolve(refused(HTTP_BLOCKERS.revoke));
    },
    lookup(): Promise<LookupResult> {
      return Promise.resolve({ status: "unavailable", blocker: HTTP_BLOCKERS.lookup });
    },
  };
}
