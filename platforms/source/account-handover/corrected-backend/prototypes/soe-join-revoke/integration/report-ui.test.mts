import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createWorld } from "../src/world.js";
import { createHttp } from "../src/http.js";
import { signIn, request, envelope, write } from "../tests/helpers.js";
import { createLocalPrototypePort } from "./mobile-local-port.ts";
import { createNativeSession } from "../../../mobile/src/native-session.ts";
import { createReporting } from "../../../mobile/src/reporting.ts";
import { REPORT_NOTICE } from "../../../mobile/src/report-contract.ts";

const TEXT="Fictional detail for report UI privacy checks";
const target={otherId:"ada",displayName:"Ada Linden",planId:"plan-riverside"};
function defer<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return{promise,resolve};}
async function boot(memory=false){
  const folder=await mkdtemp(join(tmpdir(),"soe-report-ui-")),databasePath=join(folder,"state.sqlite");
  const world=createWorld(memory?{}:{databasePath}),http=createHttp(world),{url}=await http.listen(0);
  return {world,url,databasePath,async stop(){await http.close();await world.close();await rm(folder,{recursive:true,force:true});}};
}
function stored(path:string){const db=new DatabaseSync(path,{readOnly:true});try{return JSON.parse((db.prepare("SELECT state_json FROM soe_state WHERE id=1").get() as {state_json:string}).state_json);}finally{db.close();}}
function fill(reporting:ReturnType<typeof createReporting>){reporting.open(target);reporting.setCategory("safety");reporting.setDetails(TEXT);}
function cleared(value:ReturnType<ReturnType<typeof createReporting>["model"]>){assert.equal(value.details,"");assert.equal(value.category,null);assert.equal(value.subject,null);assert.doesNotMatch(JSON.stringify(value),new RegExp(TEXT));}
async function client(h:Awaited<ReturnType<typeof boot>>,fetcher:typeof fetch=fetch,timeout=10000){const j=await signIn(h.url,"jules");const port=createLocalPrototypePort({url:h.url,personId:"jules",token:j.token,fetcher,reportTimeoutMs:timeout});return{j,port,reporting:createReporting(port,true,"http-ui-test")};}

test("real authenticated report returns a minimal receipt, preserves consent and uses the existing session",async()=>{
 const h=await boot();let signs=0,reports=0;const fetcher:typeof fetch=async(input,init)=>{if(String(input).endsWith("/api/session"))signs++;if(String(input).endsWith("/api/writes/report"))reports++;return fetch(input,init);};
 try{const session=createNativeSession({development:true,mode:"local-http",origin:h.url,fetcher});await session.client.boot();const before=stored(h.databasePath);fill(session.reporting);const pending=session.reporting.submit();assert.equal(session.reporting.model().phase,"submitting");await session.reporting.submit();const value=await pending;
  assert.equal(value.phase,"submitted");cleared(value);assert.equal(value.receipt!.notice,REPORT_NOTICE);assert.deepEqual(Object.keys(value.receipt!).sort(),["notice","reportId","submitted"]);assert.equal(signs,1);assert.equal(reports,1);
  const after=stored(h.databasePath);assert.equal(after.reports.length,1);assert.equal(after.reports[0][1].details,TEXT);assert.equal(after.reports[0][1].reporterId,"jules");for(const field of ["plans","invitations","grants","blocks"])assert.deepEqual(after[field],before[field]);
  session.reporting.close();assert.equal(session.client.screen().phase,"discover");session.end();
 }finally{await h.stop();}
});
test("form/adapter identity binding and server authorization reject cross-user writes and receipt lookup",async()=>{
 const h=await boot();try{const {j,port,reporting}=await client(h),a=await signIn(h.url,"ada"),body={otherId:"ada",category:"safety",details:TEXT};
  const forged=envelope("mina","forge",body);assert.equal((await port.submitReport!(forged)).status,"rejected");assert.equal(stored(h.databasePath).reports.length,0);
  assert.equal((await write(h.url,a.token,"report","jules","server-forge",body)).status,403);
  fill(reporting);await reporting.submit();const own=await write(h.url,j.token,"report","jules","receipt-private",body);assert.equal(own.body.status,"committed");
  const lookup={personId:"jules",endpoint:"report",key:"receipt-private",payloadHash:envelope("jules","receipt-private",body).payloadHash};
  const other=await request(h.url,"/api/lookup",{method:"POST",token:a.token,body:lookup});assert.equal(other.status,409);assert.doesNotMatch(JSON.stringify(other.body),new RegExp(TEXT));
  assert.equal((await request(h.url,"/api/lookup",{method:"POST",token:a.token,body:{...lookup,personId:"ada"}})).body.status,"absent");
 }finally{await h.stop();}
});
for(const loss of ["before","after"])test(`real ${loss}-delivery loss preserves one key across lookup/retry`,async()=>{
 const h=await boot();const writes:string[]=[],checks:unknown[]=[];let drop=true;
 const fetcher:typeof fetch=async(input,init)=>{const path=new URL(String(input)).pathname;if(path==="/api/writes/report"){writes.push(String(init!.body));if(drop&&loss==="before"){drop=false;throw Error(TEXT);}const response=await fetch(input,init);if(drop){drop=false;throw Error(TEXT);}return response;}if(path==="/api/lookup")checks.push(JSON.parse(String(init!.body)));return fetch(input,init);};
 try{const {reporting}=await client(h,fetcher);fill(reporting);assert.equal((await reporting.submit()).phase,"unknown");assert.equal(stored(h.databasePath).reports.length,loss==="before"?0:1);assert.equal(writes.length,1);await reporting.submit();assert.equal(writes.length,1);
  const lookup=await reporting.check();if(loss==="before"){assert.equal(lookup.phase,"retryable");await reporting.retry();assert.equal(writes.length,2);assert.equal(writes[0],writes[1]);}else assert.equal(lookup.phase,"submitted");
  const original=JSON.parse(writes[0]);assert.deepEqual(checks[0],{personId:"jules",endpoint:"report",key:original.idempotencyKey,payloadHash:original.payloadHash});
  assert.equal(stored(h.databasePath).reports.length,1);cleared(reporting.model());assert.equal(reporting.model().phase,"submitted");
 }finally{await h.stop();}
});
test("closing an unknown request erases payload and cannot resend after an absent lookup",async()=>{
 const h=await boot();let posts=0;const fetcher:typeof fetch=async(input,init)=>{if(String(input).endsWith("/api/writes/report")){posts++;throw Error(TEXT);}return fetch(input,init);};
 try{const {reporting}=await client(h,fetcher);fill(reporting);await reporting.submit();cleared(reporting.close());cleared(reporting.open(target));assert.equal((await reporting.check()).phase,"unknown");await reporting.retry();await reporting.submit();assert.equal(posts,1);assert.equal(stored(h.databasePath).reports.length,0);}
 finally{await h.stop();}
});
for(const ending of ["background","logout"])test(`real committed delayed response after ${ending} cannot revive draft or receipt`,async()=>{
 const h=await boot(),gate=defer<void>(),seen=defer<void>();let signs=0,reports=0;const fetcher:typeof fetch=async(input,init)=>{if(String(input).endsWith("/api/session"))signs++;const response=await fetch(input,init);if(String(input).endsWith("/api/writes/report")){reports++;seen.resolve();await gate.promise;}return response;};
 try{const session=createNativeSession({development:true,mode:"local-http",origin:h.url,fetcher});await session.client.boot();fill(session.reporting);const pending=session.reporting.submit();await seen.promise;
  if(ending==="logout")session.end();else session.activity("background");cleared(session.reporting.model());gate.resolve();const value=await pending;cleared(value);assert.equal(value.open,false);assert.equal(value.receipt,null);assert.equal(stored(h.databasePath).reports.length,1);
  const active=session.activity("active");if(active?.kind==="refresh")await active.run();assert.equal(reports,1);assert.equal(signs,1);
  if(ending==="logout"){assert.equal(session.reporting.open(target).enabled,false);await session.port.discover();assert.equal(signs,1);assert.equal(value.unresolved,false);}else{session.reporting.open(target);assert.equal((await session.reporting.check()).phase,"submitted");cleared(session.reporting.model());session.end();}
 }finally{gate.resolve();await h.stop();}
});
test("report deadline aborts a hanging write and keeps an unknown same-key intent",async()=>{
 const h=await boot();let aborted=false;const fetcher:typeof fetch=async(input,init)=>{if(String(input).endsWith("/api/writes/report"))return new Promise((_yes,no)=>{init!.signal!.addEventListener("abort",()=>{aborted=true;no(Error(TEXT));},{once:true});});return fetch(input,init);};
 try{const {reporting}=await client(h,fetcher,25);fill(reporting);assert.equal((await reporting.submit()).phase,"unknown");assert.equal(aborted,true);assert.equal((await reporting.check()).phase,"retryable");assert.equal(stored(h.databasePath).reports.length,0);}
 finally{await h.stop();}
});
test("malformed receipt body never confirms or reflects returned report text",async()=>{
 const h=await boot();const fetcher:typeof fetch=async(input,init)=>{const response=await fetch(input,init);if(String(input).endsWith("/api/writes/report")){const value=await response.json();return new Response(JSON.stringify({...value,data:{...value.data,details:TEXT}}));}return response;};
 try{const {reporting}=await client(h,fetcher);fill(reporting);const value=await reporting.submit();assert.equal(value.phase,"unknown");assert.equal(value.receipt,null);assert.doesNotMatch(value.message,new RegExp(TEXT));assert.equal((await reporting.check()).phase,"submitted");cleared(reporting.model());assert.equal(stored(h.databasePath).reports.length,1);}
 finally{await h.stop();}
});
test("session expiry clears report state and no automatic sign-in or write follows",async()=>{
 const h=await boot();try{const session=createNativeSession({development:true,mode:"local-http",origin:h.url});await session.client.boot();fill(session.reporting);h.world.setNow(()=>Date.now()+8*86400000);const value=await session.reporting.submit();assert.equal(value.phase,"expired");cleared(value);assert.equal(value.enabled,false);await session.reporting.submit();assert.equal(stored(h.databasePath).reports.length,0);session.end();}
 finally{await h.stop();}
});
test("local logout during lazy sign-in cannot send the waiting report or reuse the returned token",async()=>{
 const h=await boot(),gate=defer<void>(),seen=defer<void>();let reports=0,plans=0,signs=0;const fetcher:typeof fetch=async(input,init)=>{const path=new URL(String(input)).pathname;const response=await fetch(input,init);if(path==="/api/session"){signs++;seen.resolve();await gate.promise;}if(path==="/api/writes/report")reports++;if(path==="/api/plans")plans++;return response;};
 try{const session=createNativeSession({development:true,mode:"local-http",origin:h.url,fetcher});fill(session.reporting);const pending=session.reporting.submit();await seen.promise;session.end();gate.resolve();cleared(await pending);await session.port.discover();assert.equal(signs,1);assert.equal(reports,0);assert.equal(plans,0);assert.equal(stored(h.databasePath).reports.length,0);}
 finally{gate.resolve();await h.stop();}
});
test("ending a resolved local port prevents all subsequent participant requests",async()=>{
 const h=await boot();let requests=0;const fetcher:typeof fetch=async(input,init)=>{requests++;return fetch(input,init);};try{const {port}=await client(h,fetcher);await port.discover();const before=requests;port.endSession!();assert.equal((await port.discover()).status,"expired-session");assert.equal((await port.submitReport!(envelope("jules","ended",{otherId:"ada",category:"safety",details:TEXT}))).status,"expired-session");assert.equal((await port.lookup({personId:"jules",endpoint:"report",key:"ended",payloadHash:"hash"})).status,"unavailable");assert.equal(requests,before);}
 finally{await h.stop();}
});
test("local logout while a response body is parsing suppresses the in-flight participant data",async()=>{
 const h=await boot(),gate=defer<void>(),seen=defer<void>();const fetcher:typeof fetch=async(input,init)=>{const response=await fetch(input,init);if(String(input).endsWith("/api/plans")){const parse=response.json.bind(response);response.json=async()=>{const result=await parse();seen.resolve();await gate.promise;return result;};}return response;};
 try{const {port}=await client(h,fetcher);const pending=port.discover();await seen.promise;port.endSession!();gate.resolve();assert.deepEqual(await pending,{status:"expired-session"});}
 finally{gate.resolve();await h.stop();}
});
test("memory-only development backend displays an unavailable state and never a fake receipt",async()=>{
 const h=await boot(true);try{const {reporting}=await client(h);fill(reporting);const value=await reporting.submit();assert.equal(value.phase,"rejected");assert.equal(value.receipt,null);assert.match(value.message,/No report was submitted/);}
 finally{await h.stop();}
});
