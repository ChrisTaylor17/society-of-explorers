import { validRead, validWrite, validLookup } from "../../../mobile/src/validation.ts";
import { createDiscussionGateway, type Reply } from "../../../mobile/src/shared/discussion.ts";
import {createParticipationGateway,membershipFrom} from '../../../mobile/src/shared/participation.ts';
import type { MeridianPort } from "../../../mobile/src/port.ts";
import type {
  DiscoverCard, IdempotentWrite, LookupResult, PlanSnapshot, ReadResult,
  VisibilityReview, WriteResult,
} from "../../../mobile/src/types.ts";

type Options = {
  url: string;
  token: string;
  personId: "ada" | "jules" | "mina";
  fetcher?: typeof fetch;
  reportTimeoutMs?: number;
};
let discussionSessionSerial = 0;

export function localPrototypeOrigin(url: string): URL {
  const origin = new URL(url);
  if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" || !origin.port ||
      origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("The synthetic adapter requires an explicit http://127.0.0.1:port origin.");
  }
  return origin;
}

/** Synthetic local bridge, used by the Node harness and explicit native development mode. */
export function createLocalPrototypePort(options: Options): MeridianPort {
  const origin = localPrototypeOrigin(options.url);
  if (!["ada", "jules", "mina"].includes(options.personId) || !/^[a-f0-9]{64}$/.test(options.token)) {
    throw new Error("Use a synthetic prototype session for ada, jules or mina.");
  }
  const fetcher = options.fetcher ?? fetch;
  const personId = options.personId;
  let token: string | null = options.token;
  const discussionScope = `local-port-${++discussionSessionSerial}`;
  const reportTimeout = options.reportTimeoutMs ?? 10000;
  if (!Number.isSafeInteger(reportTimeout) || reportTimeout < 1 || reportTimeout > 10000) throw new Error("Invalid synthetic report timeout.");
  let health: Promise<void> | undefined;
  const unavailable = (blocker: string) => ({ status: "unavailable" as const, blocker });

  async function checkPrototype(): Promise<void> {
    if (!health) {
      health = (async () => {
        const response = await fetcher(new URL("/api/health", origin), { redirect: "error", cache: "no-store" });
        if (response.url && new URL(response.url).origin !== origin.origin) throw new Error("Unexpected response origin.");
        const body = await response.json();
        if (!response.ok || body?.status !== "ok" || body?.prototype !== true) {
          throw new Error("This is not the synthetic local prototype.");
        }
      })();
    }
    return health;
  }

  async function send<T extends { status: string }>(
    path: string, method: "GET" | "POST", body: unknown, validate: (value: unknown) => boolean,
    uncertainWrite?: string, reportRequest = false,
  ): Promise<T> {
    const expired = () => (path === "/api/lookup" ? { status: "unavailable", blocker: "Session expired." } : { status: "expired-session" }) as unknown as T;
    if (!token) return expired();
    try { await checkPrototype(); }
    catch { return unavailable("Local prototype health check failed; no participant request was sent.") as unknown as T; }
    if (!token) return expired();
    const abort = reportRequest ? new AbortController() : null;
    const timer = abort ? setTimeout(() => abort.abort(), reportTimeout) : undefined;
    try {
      const response = await fetcher(new URL(path, origin), {
        method, redirect: "error", cache: "no-store",
        ...(abort ? { signal: abort.signal } : {}),
        headers: {
          accept: "application/json", authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!token) return expired();
      if (response.url && new URL(response.url).origin !== origin.origin) throw new Error("Unexpected response origin.");
      const result: unknown = await response.json();
      if (!token) return expired();
      if (!validate(result)) throw new Error("Malformed prototype result.");
      return result as T;
    } catch {
      if (uncertainWrite) return {
        status: "ambiguous", attemptId: uncertainWrite,
        reason: "The local HTTP write response was not confirmed. Reconcile this key before any new intent.",
      } as unknown as T;
      return unavailable("The local HTTP response was not confirmed.") as unknown as T;
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }

  function write<T>(endpoint: string, input: IdempotentWrite<unknown>): Promise<WriteResult<T>> {
    if (input.personId !== personId) return Promise.resolve({ status: "rejected", error: "This is not the synthetic session's person." });
    return send(`/api/writes/${endpoint}`, "POST", input, result => validWrite(result, endpoint), `${endpoint}:${input.idempotencyKey}`, endpoint === "report");
  }

  async function discussionRequest(path: string, body?: Record<string, unknown>): Promise<Reply> {
    if (!token) return {http:401,body:{status:'expired-session'}};
    await checkPrototype(); const requestToken=token;
    if (!requestToken) return {http:401,body:{status:'expired-session'}};
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),reportTimeout);
    try {
      const response=await fetcher(new URL(path,origin),{method:body===undefined?'GET':'POST',redirect:'error',cache:'no-store',signal:abort.signal,
        headers:{accept:'application/json',authorization:`Bearer ${requestToken}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
      if(response.status===401&&token===requestToken)token=null;
      if(response.url&&new URL(response.url).origin!==origin.origin)throw Error('Unexpected response origin.');
      const result:unknown=await response.json();
      if(result&&typeof result==='object'&&'status' in result&&result.status==='expired-session'&&token===requestToken)token=null;
      return {http:response.status,body:result};
    } finally {clearTimeout(timer);}
  }
  const discussion=createDiscussionGateway(()=>token?{actor:personId,scope:discussionScope}:null,discussionRequest,'plan-riverside');

  async function readPlan(id:string):Promise<ReadResult<PlanSnapshot>> {
    const result=await send<ReadResult<PlanSnapshot>>(`/api/plans/${encodeURIComponent(id)}`,"GET",undefined,value=>validRead(value,"plan",id));
    if(result.status!=='ok'||result.data.invitationStatus!=='none')return result;
    // The old public visitor snapshot deliberately omits ended invitations.
    // Do not turn it into a false "never requested" claim. Bind this separate
    // authenticated membership fact to the same version, or withhold the view.
    try {
      const membership=membershipFrom(await discussionRequest(`/api/membership/${encodeURIComponent(id)}`),id);
      if(!token)return {status:'expired-session'};
      if(!membership||membership.version!==result.version)return unavailable('Plan and membership could not be verified at the same version. Refresh again.');
      if(membership.status==='withdrawn')return {...result,data:{...result.data,invitationStatus:'withdrawn',steps:[{label:'Your participation',value:'Ended'},{label:'Future contact access',value:'Off'},{label:'Stored history',value:'Remains in local storage'}]}};
      return result;
    } catch {return unavailable('Current membership could not be checked.');}
  }

  return {
    name: "http-boundary", writesEnabled: true, viewerId: personId,
    discussion,
    participation:createParticipationGateway(()=>token?{actor:personId,scope:discussionScope}:null,discussionRequest,'plan-riverside'),
    endSession: () => { token = null; },
    submitReport: (input) => write("report", input),
    discover: () => send<ReadResult<DiscoverCard[]>>("/api/plans", "GET", undefined, result => validRead(result, "discover")),
    plan: readPlan,
    visibility: (id) => send<ReadResult<VisibilityReview>>(`/api/plans/${encodeURIComponent(id)}/visibility`, "GET", undefined, result => validRead(result, "visibility", id)),
    requestJoin: (input) => write("join", input),
    acceptDisclosure: (input) => write("grant", input),
    revokeContact: (input) => write("revoke", input),
    lookup: (input) => send<LookupResult>("/api/lookup", "POST", input, result => validLookup(result, input.endpoint), undefined, input.endpoint === "report"),
  };
}

/** The fixed passcode is an existing fictional fixture value, never a provisioned credential. */
export async function signInSyntheticGuest(url: string, fetcher: typeof fetch = fetch): Promise<MeridianPort> {
  const origin = localPrototypeOrigin(url);
  const health = await fetcher(new URL("/api/health", origin), { redirect: "error", cache: "no-store" });
  if (health.url && new URL(health.url).origin !== origin.origin) throw new Error("Unexpected response origin.");
  const proof = await health.json();
  if (!health.ok || proof?.status !== "ok" || proof?.prototype !== true) throw new Error("Not the local synthetic prototype.");
  const response = await fetcher(new URL("/api/session", origin), {
    method: "POST", redirect: "error", cache: "no-store",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ magicName: "jules", passcode: "synthetic-jules" }),
  });
  if (response.url && new URL(response.url).origin !== origin.origin) throw new Error("Unexpected response origin.");
  const result = await response.json();
  if (!response.ok || result?.status !== "ok" || result?.person?.id !== "jules" || typeof result.token !== "string") {
    throw new Error("Local synthetic sign-in failed.");
  }
  return createLocalPrototypePort({ url: origin.origin, token: result.token, personId: "jules", fetcher });
}
