import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createWorld } from "../src/world.js";
import { createHttp } from "../src/http.js";
import { envelope, request, signIn, write } from "./helpers.js";
import { MAX_REPORTS_PER_PERSON, REPORT_RECEIPT } from "../src/reports.js";
const CANARY="fictional-private-report-canary";
const body=(extra={})=>({otherId:"ada",category:"safety",details:CANARY,...extra});
function state(path){const db=new DatabaseSync(path,{readOnly:true});try{return JSON.parse(db.prepare("SELECT state_json FROM soe_state WHERE id=1").get().state_json);}finally{db.close();}}
function privateResponse(value){assert.doesNotMatch(JSON.stringify(value),new RegExp(CANARY+"|reporterId|subjectId|submittedAt|Jules Okonkwo|relay:"));}
async function boot(options={}){
 const databasePath=join(await mkdtemp(join(tmpdir(),"soe-reports-")),"world.sqlite");const world=createWorld({databasePath,...options}),http=createHttp(world);const {url}=await http.listen(0);
 return {databasePath,world,http,url,stop:async()=>{await http.close();await world.close();}};
}

test("report submission returns only a submitted receipt, without implying human review",async()=>{
 const h=await boot();try{const s=await signIn(h.url,"jules");const r=await write(h.url,s.token,"report","jules","first",body({planId:"plan-riverside"}));assert.equal(r.status,200);assert.equal(r.body.status,"committed");assert.equal(r.body.version,1);assert.deepEqual(Object.keys(r.body.data).sort(),["notice","reportId","submitted"]);assert.match(r.body.data.reportId,/^report-[a-f0-9]{32}$/);assert.equal(r.body.data.submitted,true);assert.equal(r.body.data.notice,REPORT_RECEIPT);assert.match(r.body.data.notice,/no human review or response-time service/);privateResponse(r.body);
  const stored=state(h.databasePath).reports;assert.equal(stored.length,1);assert.equal(stored[0][1].reporterId,"jules");assert.equal(stored[0][1].subjectId,"ada");assert.equal(stored[0][1].details,CANARY);assert.equal(stored[0][1].planId,"plan-riverside");
 }finally{await h.stop();}
});
test("same-key concurrent retries create one report; changed body conflicts",async()=>{
 const h=await boot();try{const s=await signIn(h.url,"jules");const results=await Promise.all(Array.from({length:8},()=>write(h.url,s.token,"report","jules","same",body())));for(const r of results)assert.deepEqual(r.body,results[0].body);assert.equal(state(h.databasePath).reports.length,1);const different=await write(h.url,s.token,"report","jules","same",body({details:"Different fictional detail"}));assert.equal(different.status,409);privateResponse(different.body);assert.equal(state(h.databasePath).reports.length,1);}finally{await h.stop();}
});
test("missing, forged, replaced, expired and deleted reporter sessions cannot submit",async()=>{
 const h=await boot();try{const j=await signIn(h.url,"jules"),m=await signIn(h.url,"mina");assert.equal((await write(h.url,"","report","jules","anon",body())).status,401);assert.equal((await write(h.url,m.token,"report","jules","forge",body())).status,403);const fresh=await signIn(h.url,"jules");assert.equal((await write(h.url,j.token,"report","jules","old",body())).status,401);await write(h.url,fresh.token,"delete-account","jules","delete",{});assert.equal((await write(h.url,fresh.token,"report","jules","deleted",body())).status,403);h.world.setNow(()=>Date.now()+8*86400000);assert.equal((await write(h.url,m.token,"report","mina","expired",body())).status,401);assert.equal(state(h.databasePath).reports.length,0);}finally{await h.stop();}
});
test("report fields reject malformed, spoofed, oversized and control-character input without reflection",async()=>{
 const h=await boot();try{const j=await signIn(h.url,"jules");const invalid=[{},body({otherId:"jules"}),body({otherId:"unknown"}),body({otherId:null}),body({category:"urgent-moderator"}),body({category:[]}),body({details:null}),body({details:" "}),body({details:"x".repeat(2001)}),body({details:"\u0000"+CANARY}),body({details:"\ud800"}),body({reporterId:"mina"}),body({assignee:"operator"}),body({planId:"missing"}),body({planId:null}),JSON.parse('{"otherId":"ada","category":"safety","details":"test","__proto__":{}}')];let n=0;for(const value of invalid){const r=await write(h.url,j.token,"report","jules","invalid-"+(++n),value);assert.equal(r.status,403);privateResponse(r.body);}const badHash=await request(h.url,"/api/writes/report",{method:"POST",token:j.token,body:{...envelope("jules","hash",body()),payloadHash:"wrong"}});assert.equal(badHash.status,403);const spoofedEnvelope=await request(h.url,"/api/writes/report",{method:"POST",token:j.token,body:{...envelope("jules","top-level",body()),reporterId:"mina"}});assert.equal(spoofedEnvelope.status,403);assert.equal(state(h.databasePath).reports.length,0);}finally{await h.stop();}
});
test("well-formed Unicode and bounded multiline details are stored as plain text",async()=>{
 const h=await boot();try{const j=await signIn(h.url,"jules");for(const [key,details] of [["unicode","😀".repeat(1000)],["text","  <script>fictional only</script>\nline two\ttext  "]]){const r=await write(h.url,j.token,"report","jules",key,body({details}));assert.equal(r.status,200);assert.equal(state(h.databasePath).reports.find(([id])=>id===r.body.data.reportId)[1].details,details.trim());}}finally{await h.stop();}
});
test("report HTTP input is byte-bounded and rejects malformed JSON and invalid UTF-8",async()=>{
 const h=await boot();try{const j=await signIn(h.url,"jules");for(const [payload,status] of [[JSON.stringify(envelope("jules","large",body({details:"x".repeat(10000)}))),413],['{"details":"'+CANARY,400],[Buffer.from([0xff,0xfe,0xfd]),400]]){const r=await fetch(h.url+"/api/writes/report",{method:"POST",headers:{authorization:"Bearer "+j.token,"content-type":"application/json"},body:payload});assert.equal(r.status,status);privateResponse(await r.json());}assert.equal(state(h.databasePath).reports.length,0);}finally{await h.stop();}
});
test("participants cannot list/read reports or look up another participant's receipt",async()=>{
 const h=await boot();try{const j=await signIn(h.url,"jules"),a=await signIn(h.url,"ada"),m=await signIn(h.url,"mina");const r=await write(h.url,j.token,"report","jules","private",body());const lookup={personId:"jules",endpoint:"report",key:"private",payloadHash:envelope("jules","private",body()).payloadHash};for(const token of ["",j.token,a.token,m.token])for(const path of ["/api/reports","/api/reports/"+r.body.data.reportId,"/api/reports/unknown","/api/reports?personId=jules"]){const response=await request(h.url,path,{token});assert.equal(response.status,404);privateResponse(response.body);}const mine=await request(h.url,"/api/lookup",{method:"POST",token:j.token,body:lookup});assert.equal(mine.body.status,"recorded");privateResponse(mine.body);for(const [id,token] of [["ada",a.token],["mina",m.token]]){assert.equal((await request(h.url,"/api/lookup",{method:"POST",token,body:lookup})).status,409);assert.equal((await request(h.url,"/api/lookup",{method:"POST",token,body:{...lookup,personId:id}})).body.status,"absent");}}finally{await h.stop();}
});
test("reports and same-key private receipts survive restart",async()=>{
 const h=await boot();const j=await signIn(h.url,"jules");const first=await write(h.url,j.token,"report","jules","restart",body());await h.stop();const w=createWorld({databasePath:h.databasePath});try{assert.deepEqual(await w.write(j.token,"report",envelope("jules","restart",body())),first.body);assert.equal(state(h.databasePath).reports.length,1);assert.equal(state(h.databasePath).reports[0][1].details,CANARY);}finally{await w.close();}
});
test("persistent quota bounds abuse; stored retries still succeed and another person is unaffected",async()=>{
 const h=await boot();const j=await signIn(h.url,"jules");let first;try{for(let n=0;n<MAX_REPORTS_PER_PERSON;n++){const r=await write(h.url,j.token,"report","jules","quota-"+n,body());assert.equal(r.status,200);first??=r;}const over=await write(h.url,j.token,"report","jules","over",body());assert.equal(over.status,429);privateResponse(over.body);assert.deepEqual((await write(h.url,j.token,"report","jules","quota-0",body())).body,first.body);}finally{await h.stop();}const w=createWorld({databasePath:h.databasePath});try{assert.equal((await w.write(j.token,"report",envelope("jules","after-restart",body()))).code,"report-limit");const m=await w.signIn("mina","synthetic-mina");assert.equal((await w.write(m.token,"report",envelope("mina","own",body()))).status,"committed");assert.equal(state(h.databasePath).reports.length,MAX_REPORTS_PER_PERSON+1);}finally{await w.close();}
});
test("reports can concern blocked/deleted targets and never imply automatic consent or block changes",async()=>{
 const h=await boot();try{const j=await signIn(h.url,"jules"),a=await signIn(h.url,"ada");await write(h.url,j.token,"block","jules","block",{otherId:"ada"});await write(h.url,a.token,"delete-account","ada","delete",{});const before=state(h.databasePath);assert.equal((await write(h.url,j.token,"report","jules","past",body({planId:"plan-riverside"}))).status,200);const after=state(h.databasePath);for(const field of ["blocks","grants","plans","invitations"])assert.deepEqual(after[field],before[field]);}finally{await h.stop();}
});
test("memory-only mode never issues a false submitted receipt",async()=>{
 const world=createWorld(),s=await world.signIn("jules","synthetic-jules");const r=await world.write(s.token,"report",envelope("jules","memory",body()));assert.equal(r.status,"unavailable");assert.match(r.blocker,/No report was submitted/);await world.close();
});
test("failed commit rolls back report and receipt together; generic HTTP errors redact sensitive exception text",async()=>{
 let armed=false;const h=await boot({allowFaults:true,storageTestHooks:{beforeCommit(){if(armed)throw Error(CANARY+" reporter=jules");}}});try{const j=await signIn(h.url,"jules");armed=true;const r=await request(h.url,"/api/writes/%72eport",{method:"POST",token:j.token,body:envelope("jules","failed",body())});assert.equal(r.status,500);privateResponse(r.body);armed=false;assert.equal(state(h.databasePath).reports.length,0);const lookup=await request(h.url,"/api/lookup",{method:"POST",token:j.token,body:{personId:"jules",endpoint:"report",key:"failed",payloadHash:envelope("jules","failed",body()).payloadHash}});assert.equal(lookup.body.status,"absent");assert.equal((await write(h.url,j.token,"report","jules","failed",body())).status,200);}finally{armed=false;await h.stop();}
});
for(const loss of ["drop-before","drop-after"])test(`report ${loss} remains truthful across restart and lookup`,async()=>{
 const h=await boot({allowFaults:true});const j=await signIn(h.url,"jules"),input=envelope("jules","lost",body());const r=await write(h.url,j.token,"report","jules","lost",body(),loss);assert.equal(r.body.status,"ambiguous");await h.stop();const w=createWorld({databasePath:h.databasePath});try{const found=await w.lookup(j.token,{personId:"jules",endpoint:"report",key:"lost",payloadHash:input.payloadHash});assert.equal(found.status,loss==="drop-before"?"absent":"recorded");if(found.result)privateResponse(found.result);assert.equal(state(h.databasePath).reports.length,loss==="drop-before"?0:1);}finally{await w.close();}
});
test("normal server ignores report delivery fault headers",async()=>{
 const h=await boot();try{const j=await signIn(h.url,"jules");assert.equal((await write(h.url,j.token,"report","jules","normal",body(),"drop-before")).body.status,"committed");assert.equal(state(h.databasePath).reports.length,1);}finally{await h.stop();}
});
test("malformed checkpoint errors cannot include stored report text",async()=>{
 const h=await boot();const path=h.databasePath;await h.stop();const db=new DatabaseSync(path);db.prepare("UPDATE soe_state SET state_json=?").run('{"private":"'+CANARY+'", invalid');db.close();assert.throws(()=>createWorld({databasePath:path}),error=>{assert.doesNotMatch(error.message,new RegExp(CANARY));return /Invalid durable checkpoint JSON/.test(error.message);});
});

test("two connections enforce the final quota slot atomically",async()=>{
 const h=await boot();const j=await signIn(h.url,"jules");for(let n=0;n<MAX_REPORTS_PER_PERSON-1;n++)assert.equal((await h.world.write(j.token,"report",envelope("jules","slot-"+n,body()))).status,"committed");const other=createWorld({databasePath:h.databasePath});try{const r=await Promise.all([h.world.write(j.token,"report",envelope("jules","last-a",body())),other.write(j.token,"report",envelope("jules","last-b",body()))]);assert.deepEqual(r.map(x=>x.status).sort(),["committed","rejected"]);assert.equal(state(h.databasePath).reports.length,MAX_REPORTS_PER_PERSON);}finally{await other.close();await h.stop();}
});
test("account deletion does not silently purge reports or grant report access",async()=>{
 const h=await boot();try{const j=await signIn(h.url,"jules");await write(h.url,j.token,"report","jules","before-delete",body());await write(h.url,j.token,"delete-account","jules","delete",{});assert.equal(state(h.databasePath).reports.length,1);const r=await request(h.url,"/api/lookup",{method:"POST",token:j.token,body:{personId:"jules",endpoint:"report",key:"before-delete",payloadHash:envelope("jules","before-delete",body()).payloadHash}});assert.equal(r.status,403);privateResponse(r.body);}finally{await h.stop();}
});
