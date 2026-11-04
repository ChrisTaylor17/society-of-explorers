import { createMobileClient } from "./client.ts";
import { createFixturePort, type FixturePort } from "./fixture.ts";
import { createShellActions } from "./shell-actions.ts";
import { relayLifecycleForAppActivity } from "./app-state.ts";
import type { MeridianPort } from "./port.ts";
import { createReporting } from "./reporting.ts";
import { createPortableDiscussion, type DiscussionGateway } from "./shared/discussion.ts";
import {createParticipation,type ParticipationGateway} from './shared/participation.ts';
import { localPrototypeOrigin, signInSyntheticGuest } from "../../prototypes/soe-join-revoke/integration/mobile-local-port.ts";

type Configuration = { development: boolean; mode?: string; origin?: string; fetcher?: typeof fetch };

// Idempotency identity, not authentication or a secret. Counter separates
// factories in this process; time and random suffix separate app restarts.
let sessionSerial = 0;
function intentScope(): string {
  return `local-${Date.now().toString(36)}-${++sessionSerial}-${Math.random().toString(36).slice(2)}`;
}

function blockedPort(reason: string): MeridianPort {
  const refuse = () => Promise.resolve({ status: "unavailable" as const, blocker: reason });
  return {
    name: "http-boundary", writesEnabled: false, viewerId: "jules",
    discover: refuse, plan: refuse, visibility: refuse, requestJoin: refuse,
    acceptDisclosure: refuse, revokeContact: refuse, lookup: refuse,
  };
}

function guestPort(origin: string, fetcher?: typeof fetch): MeridianPort {
  let session: Promise<MeridianPort> | undefined;
  let resolved: MeridianPort | undefined;
  let ended = false;
  const expired: MeridianPort = { ...blockedPort("Session expired."),
    discover: async () => ({status:"expired-session"}), plan: async () => ({status:"expired-session"}), visibility: async () => ({status:"expired-session"}),
    requestJoin: async () => ({status:"expired-session"}), acceptDisclosure: async () => ({status:"expired-session"}), revokeContact: async () => ({status:"expired-session"}),
    submitReport: async () => ({status:"expired-session"}),
  };
  const ready = () => ended ? Promise.resolve(expired) : session ??= signInSyntheticGuest(origin, fetcher).then(port => {
    if (ended) { port.endSession?.(); return expired; } resolved=port; return port;
  }).catch(() => blockedPort("Local synthetic sign-in is unavailable. No fixture fallback was selected. Restart after the local prototype is ready."));
  return {
    name: "http-boundary", writesEnabled: true, viewerId: "jules",
    discussion: {
      session:()=>ended?null:resolved?.discussion?.session()??null,
      identity:async()=>ended?null:(await ready()).discussion?.identity()??null,
      read:async view=>(await ready()).discussion?.read(view)??{http:404,body:{status:'unavailable'}},
      write:async(endpoint,body)=>(await ready()).discussion?.write(endpoint,body)??{http:404,body:{status:'unavailable'}},
      lookup:async body=>(await ready()).discussion?.lookup(body)??{http:404,body:{status:'unavailable'}},
    } satisfies DiscussionGateway,
    participation:{
      session:()=>ended?null:resolved?.participation?.session()??null,
      read:async()=>(await ready()).participation?.read()??{http:404,body:{status:'unavailable'}},
      leave:async body=>(await ready()).participation?.leave(body)??{http:404,body:{status:'unavailable'}},
      lookup:async body=>(await ready()).participation?.lookup(body)??{http:404,body:{status:'unavailable'}},
    } satisfies ParticipationGateway,
    discover: async () => (await ready()).discover(),
    plan: async (id) => (await ready()).plan(id),
    visibility: async (id) => (await ready()).visibility(id),
    requestJoin: async (input) => (await ready()).requestJoin(input),
    acceptDisclosure: async (input) => (await ready()).acceptDisclosure(input),
    revokeContact: async (input) => (await ready()).revokeContact(input),
    lookup: async (input) => (await ready()).lookup(input),
    submitReport: async (input) => (await ready()).submitReport?.(input) ?? {status:"unavailable",blocker:"Local reporting is unavailable."},
    endSession() { ended = true; void session?.then(port => port.endSession?.()); },
  };
}

export function createNativeSession(configuration: Configuration, makeShellActions = createShellActions) {
  let fixture: FixturePort | null = null;
  let port: MeridianPort;
  let mode: "fixture" | "local-http" | "blocked";
  let label: string;
  let detail: string;
  if (!configuration.mode || configuration.mode === "fixture") {
    fixture = createFixturePort(); port = fixture; mode = "fixture";
    label = "Fixture demo — no backend connection";
    detail = "Synthetic controls simulate both people. No real person accepted.";
  } else if (configuration.mode === "local-http" && configuration.development) {
    try {
      const origin = localPrototypeOrigin(configuration.origin ?? "").origin;
      port = guestPort(origin, configuration.fetcher); mode = "local-http";
      label = "Local HTTP demo — synthetic Jules";
      detail = `${origin}. Host acceptance and host disclosure come from the separate synthetic Ada session.`;
    } catch {
      detail = "Local HTTP mode requires an explicit http://127.0.0.1:port origin. Select fixture mode explicitly for the offline demo.";
      port = blockedPort(detail); mode = "blocked"; label = "Blocked development configuration";
    }
  } else {
    detail = "Local HTTP mode requires a development build and mode local-http. Select fixture mode explicitly for the offline demo.";
    port = blockedPort(detail); mode = "blocked"; label = "Blocked development configuration";
  }
  const client = createMobileClient(port);
  const scope = mode === "local-http" ? intentScope() : "";
  const shell = makeShellActions(client, scope);
  const reporting = createReporting(port, configuration.development && mode === "local-http", scope);
  const discussion = createPortableDiscussion(configuration.development && mode === 'local-http' ? port.discussion : undefined, 'plan-riverside');
  const participation=createParticipation(configuration.development&&mode==='local-http'?port.participation:undefined,'plan-riverside',{retirePrivate:()=>{client.releaseRelay();reporting.close();discussion.retire();}});
  let planChecking=false;
  const syncDiscussion=()=>{const m=participation.model();discussion.checkingAccess(planChecking||m.busy||Boolean(m.pending)||Boolean(m.confirmation));};
  participation.subscribe(syncDiscussion);
  const checkingPlanAccess=(checking:boolean)=>{planChecking=checking;participation.checkingAccess(checking||client.ledgerEntries().some(x=>x.status==='pending'||x.status==='ambiguous'));syncDiscussion();};
  let ended = false;
  const activity = (state: string) => {
    discussion.activity(state);
    participation.activity(state);
    reporting.activity(state);
    if (ended) return { kind: "clear" as const, screen: client.releaseRelay() };
    if(participation.model().pending)return {kind:'clear' as const,screen:client.releaseRelay()};
    const decision = relayLifecycleForAppActivity(state);
    if (decision === "clear") return { kind: "clear" as const, screen: client.releaseRelay() };
    if (decision === "refresh") return { kind: "refresh" as const, run: () => client.foregroundRefresh() };
    return null;
  };
  function end() { ended = true; reporting.endSession(); participation.end(); discussion.end(); port.endSession?.(); return client.releaseRelay(); }
  return { fixture, port, client, shell, reporting, discussion, participation, checkingPlanAccess, mode, label, detail, activity, end, isEnded: () => ended };
}

export type NativeSession = ReturnType<typeof createNativeSession>;
