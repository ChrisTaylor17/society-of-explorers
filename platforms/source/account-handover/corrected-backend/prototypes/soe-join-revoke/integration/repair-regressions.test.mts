import assert from "node:assert/strict";
import { test } from "node:test";
import { createNativeSession } from "../../../mobile/src/native-session.ts";
import { createMobileClient } from "../../../mobile/src/client.ts";
import { payloadHash } from "../../../mobile/src/hash.ts";
import { createLocalPrototypePort } from "./mobile-local-port.ts";
import { createWorld } from "../src/world.js";
import { PLAN as SYNTHETIC_PLAN } from "../src/synthetic.js";

// Deterministic controller/adapter tests. Responses come from the unchanged
// synthetic world in-process, not from a native runtime or a socket transport.
const PLAN = SYNTHETIC_PLAN.id;
type Delivery = { path: string; method: string; body: any; result: any };
type Hook = (delivery: Delivery) => Promise<any> | any;

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function harness() {
  const world = createWorld({ allowFaults: false });
  const calls: { path: string; method: string; endpoint?: string; key?: string }[] = [];
  let hook: Hook = delivery => delivery.result;
  let before: Hook = () => undefined;
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "http://127.0.0.1:8787");
    const path = url.pathname;
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const token = new Headers(init?.headers).get("authorization")?.replace(/^Bearer /, "") ?? "";
    calls.push({ path, method, endpoint: path.startsWith("/api/writes/") ? path.split("/").at(-1) : undefined, key: body?.idempotencyKey });
    await before({ path, method, body, result: undefined });
    let result: any;
    if (path === "/api/health") result = { status: "ok", prototype: true };
    else if (path === "/api/session") result = await world.signIn(body.magicName, body.passcode);
    else if (path === "/api/plans") result = await world.discover(token);
    else if (path === `/api/plans/${PLAN}/visibility`) result = await world.visibility(token, PLAN);
    else if (path === `/api/plans/${PLAN}`) result = await world.plan(token, PLAN);
    else if (path.startsWith("/api/writes/")) result = await world.write(token, path.split("/").at(-1), body);
    else if (path === "/api/lookup") result = await world.lookup(token, body);
    else throw new Error(`Unexpected test path ${path}`);
    result = await hook({ path, method, body, result });
    return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
  };
  const session = () => createNativeSession({ development: true, mode: "local-http", origin: "http://127.0.0.1:8787", fetcher });
  let serial = 0;
  const hostWrite = (token: string, endpoint: string, body: any) => world.write(token, endpoint, {
    personId: "ada", idempotencyKey: `adversarial-host-${++serial}`, payloadHash: payloadHash(body), body,
  });
  return { world, calls, fetcher, session, hostWrite, setHook: (next: Hook) => { hook = next; }, setBefore: (next: Hook) => { before = next; } };
}

async function accepted(h: ReturnType<typeof harness>) {
  const session = h.session();
  await session.client.boot();
  const ada = await h.world.signIn("ada", "synthetic-ada");
  assert.equal(ada.status, "ok");
  await session.client.reviewPlan(PLAN);
  await session.shell.requestJoin(PLAN);
  assert.equal((await h.hostWrite(ada.token, "accept", { planId: PLAN, requesterId: "jules" })).status, "committed");
  await session.client.refresh();
  return { session, ada };
}

async function mutual(h: ReturnType<typeof harness>) {
  const p = await accepted(h);
  await p.session.shell.acceptDisclosure();
  const hostGrant = await h.hostWrite(p.ada.token, "grant", { planId: PLAN, otherId: "jules" });
  assert.equal(hostGrant.status, "committed");
  await p.session.client.refresh();
  assert.equal(p.session.client.heldRelay(), "relay:ada.linden");
  return { ...p, hostGrantId: hostGrant.data.permissionId };
}

function hidden(session: ReturnType<typeof createNativeSession>) {
  assert.equal(session.client.heldRelay(), null);
  assert.equal(session.client.screen().relay.value, null);
  assert.doesNotMatch(JSON.stringify(session.client.screen()), /relay:ada\.linden|relay:jules\.okonkwo/);
}

// Repair regressions use real synthetic-world responses, with deliberate wire corruption.
// Controller-owned references are checked separately from the fixture/adapter's fake data.
function noOwnedContact(session: ReturnType<typeof createNativeSession>) {
  hidden(session);
  const owned = session.client as any;
  assert.equal(owned.plan?.other.contact ?? null, null, "Controller plan must never retain plaintext contact");
  assert.doesNotMatch(JSON.stringify({plan:owned.plan,memory:owned.memory}), /relay:ada\.linden|relay:jules\.okonkwo/);
}

for (const boundary of ["background", "inactive", "offline", "expired", "failed", "stale"] as const) {
  test(`repair: ${boundary} drops controller-owned contact references`, async () => {
    const h=harness(); const {session}=await mutual(h);
    if (boundary==="background" || boundary==="inactive") session.activity(boundary);
    else if(boundary==="offline") session.client.setOnline(false);
    else {
      if(boundary==="expired") h.world.setNow(()=>Date.now()+8*86400000);
      if(boundary==="failed") h.setHook(d=>{if(d.path===`/api/plans/${PLAN}`)throw Error("read loss");return d.result;});
      if(boundary==="stale") h.setHook(d=>d.path===`/api/plans/${PLAN}`?{...d.result,version:1,data:{...d.result.data,version:1}}:d.result);
      await session.client.refresh();
    }
    noOwnedContact(session);
  });
}

test("repair: even authorized plan metadata excludes contact and unknown wire fields", async()=>{
  const h=harness();const {session}=await mutual(h);
  h.setHook(d=>d.path===`/api/plans/${PLAN}`?{...d.result,data:{...d.result.data,unexpectedContact:"relay:ada.linden",other:{...d.result.data.other,extra:"relay:ada.linden"}}}:d.result);
  await session.client.refresh();
  assert.equal(session.client.heldRelay(),"relay:ada.linden");
  const plan=(session.client as any).plan;
  assert.equal(plan.other.contact,null);
  assert.doesNotMatch(JSON.stringify(plan),/relay:ada\.linden/);
  session.activity("background");noOwnedContact(session);
});

const corruptions:Record<string,(x:any)=>void>={
  missing:x=>{delete x.version;}, null:x=>{x.version=null;}, string:x=>{x.version=String(x.version);},
  negative:x=>{x.version=-1;}, zero:x=>{x.version=0;}, fractional:x=>{x.version=1.5;}, unsafe:x=>{x.version=Number.MAX_SAFE_INTEGER+1;},
  nestedMissing:x=>{delete x.data.version;}, nestedMismatch:x=>{x.data.version=x.version+1;},
  wrongId:x=>{x.data.id="other-plan";}, badFlag:x=>{x.data.other.canRevoke="yes";}, badStatus:x=>{x.data.contactAccess="maybe";},
};
for(const [name,corrupt] of Object.entries(corruptions))test(`repair: ${name} plan response cannot restore contact after confirmed revoke`,async()=>{
  const h=harness();const {session}=await mutual(h);let visible:any;
  h.setHook(d=>{if(d.path===`/api/plans/${PLAN}`)visible=structuredClone(d.result);return d.result;});await session.client.refresh();
  h.setHook(d=>d.result);await session.shell.revokeContact();hidden(session);
  const before=(session.client as any).highWater.get(`plan:${PLAN}:jules`);
  h.setHook(d=>{if(d.path!==`/api/plans/${PLAN}`)return d.result;const value=structuredClone(visible);corrupt(value);return value;});
  await session.client.foregroundRefresh();noOwnedContact(session);
  assert.notEqual(session.client.screen().truthful,"committed");
  assert.equal((session.client as any).highWater.get(`plan:${PLAN}:jules`),before,"Malformed response cannot alter the barrier");
});

for(const endpoint of ["join","grant","revoke"] as const)for(const receipt of ["direct","lookup"] as const)test(`repair: malformed ${endpoint} ${receipt} receipt stays unresolved without poisoning versions`,async()=>{
  const h=harness();const session=endpoint==="join"?h.session():(await(endpoint==="grant"?accepted(h):mutual(h))).session;
  if(endpoint==="join"){await session.client.boot();await session.client.reviewPlan(PLAN);}
  const before=(session.client as any).highWater.get(`plan:${PLAN}:jules`);
  h.setHook(d=>{
    if(d.path===`/api/writes/${endpoint}`){if(receipt==="lookup")throw Error("lost committed receipt");const x=structuredClone(d.result);delete x.version;return x;}
    if(d.path==="/api/lookup"){const x=structuredClone(d.result);delete x.result.version;return x;}
    return d.result;
  });
  await(endpoint==="join"?session.shell.requestJoin(PLAN):endpoint==="grant"?session.shell.acceptDisclosure():session.shell.revokeContact());
  const e=session.client.ledgerEntries().find(e=>e.endpoint===endpoint)!;
  if(receipt==="lookup")await session.client.reconcile(e.endpoint,e.key);
  assert.equal(e.status,"ambiguous");assert.equal(session.client.screen().truthful,"unknown");noOwnedContact(session);
  assert.equal((session.client as any).highWater.get(`plan:${PLAN}:jules`),before);
});

test("repair: revoke boundary checks delayed returned screen while receipt remains blocked",async()=>{
  const h=harness();const {session}=await mutual(h);
  const read=deferred(),releaseRead=deferred(),write=deferred(),releaseWrite=deferred();
  h.setHook(async d=>{if(d.path===`/api/plans/${PLAN}`){read.resolve();await releaseRead.promise;}if(d.path==="/api/writes/revoke"){write.resolve();await releaseWrite.promise;}return d.result;});
  const refreshing=session.client.refresh();await read.promise;const revoking=session.shell.revokeContact();hidden(session);
  try{
    releaseRead.resolve();const result=await refreshing;
    assert.equal(result.relay.value,null,"Delayed read result must not restore relay after revoke intent");
    assert.doesNotMatch(JSON.stringify(result),/relay:ada\.linden/);
    await write.promise;noOwnedContact(session);
  }finally{releaseRead.resolve();releaseWrite.resolve();await revoking;}
  noOwnedContact(session);
});
