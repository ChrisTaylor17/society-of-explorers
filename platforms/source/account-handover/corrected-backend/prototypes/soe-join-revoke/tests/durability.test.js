import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, stat, symlink, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createWorld } from "../src/world.js";
import { payloadHash } from "../src/hash.js";
const PLAN="plan-riverside";
const script=fileURLToPath(new URL("./support/durable-child.js",import.meta.url));
async function database(){return join(await mkdtemp(join(tmpdir(),"soe-durable-")),"world.sqlite");}
function envelope(personId,key,body){return {personId,idempotencyKey:key,payloadHash:payloadHash(body),body};}
async function mutual(w){
 const ada=await w.signIn("ada","synthetic-ada"),jules=await w.signIn("jules","synthetic-jules");
 const send=(actor,endpoint,key,body)=>w.write(({ada,jules})[actor].token,endpoint,envelope(actor,key,body));
 assert.equal((await send("jules","join","join",{planId:PLAN})).status,"committed");
 assert.equal((await send("ada","accept","accept",{planId:PLAN,requesterId:"jules"})).status,"committed");
 const guest=await send("jules","grant","grant-j",{planId:PLAN,otherId:"ada"});const host=await send("ada","grant","grant-a",{planId:PLAN,otherId:"jules"});
 assert.equal((await w.plan(jules.token,PLAN)).data.other.contact,"relay:ada.linden");return {ada,jules,guest,host,send};
}
function child(path,mode,actor="ada",target="jules"){
 const proc=spawn(process.execPath,["--experimental-strip-types",script,path,mode,actor,target],{stdio:["ignore","pipe","pipe"]});let errors="",output="";proc.stderr.on("data",d=>errors+=d);
 const exited=new Promise(resolve=>proc.once("exit",(code,signal)=>resolve({code,signal})));
 const ready=new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{proc.kill("SIGKILL");reject(Error("Child checkpoint timeout: "+errors));},10000);
  proc.stdout.on("data",d=>{output+=d;if(output.includes("\n")){clearTimeout(timer);try{resolve(JSON.parse(output.split("\n")[0]));}catch(e){reject(e);}}});
  proc.once("error",e=>{clearTimeout(timer);reject(e);});proc.once("exit",code=>{clearTimeout(timer);if(!output.includes("\n"))reject(Error("Child exited "+code+": "+errors));});
 });return {proc,ready,exited};
}
function checkpoint(path){const db=new DatabaseSync(path,{readOnly:true});try{return JSON.parse(db.prepare("SELECT state_json FROM soe_state WHERE id=1").get().state_json);}finally{db.close();}}

test("grants, sessions, versions and original idempotency receipts survive reopening",async()=>{
 const path=await database();let w=createWorld({databasePath:path});const p=await mutual(w);await w.close();w=createWorld({databasePath:path});try{
  assert.equal((await w.plan(p.jules.token,PLAN)).data.other.contact,"relay:ada.linden");
  assert.deepEqual(await w.write(p.jules.token,"grant",envelope("jules","grant-j",{planId:PLAN,otherId:"ada"})),p.guest);assert.equal((await w.plan(p.jules.token,PLAN)).version,5);
  assert.equal((await w.write(p.jules.token,"grant",envelope("jules","grant-j",{planId:PLAN,otherId:"mina"}))).status,"conflict");
  const found=await w.lookup(p.jules.token,{personId:"jules",endpoint:"grant",key:"grant-j",payloadHash:payloadHash({planId:PLAN,otherId:"ada"})});assert.deepEqual(found.result,p.guest);
 }finally{await w.close();}assert.equal((await stat(path)).mode&0o777,0o600);
});
test("block, both revoked grants, withdrawn invitation and versioned denial persist",async()=>{
 const path=await database();let w=createWorld({databasePath:path});const p=await mutual(w),input=envelope("ada","block",{otherId:"jules"});const block=await w.write(p.ada.token,"block",input);await w.close();w=createWorld({databasePath:path});try{
  for(const kind of ["plan","visibility"]){const denial=await w[kind](p.jules.token,PLAN);assert.equal(denial.status,"rejected");assert.equal(denial.planId,PLAN);assert.equal(denial.version,block.version);assert.doesNotMatch(JSON.stringify(denial),/relay:/);}
  assert.equal((await w.discover(p.jules.token)).data.length,0);assert.deepEqual(await w.write(p.ada.token,"block",input),block);
  assert.equal((await w.write(p.jules.token,"revoke",envelope("jules","late",{permissionId:p.guest.data.permissionId}))).status,"rejected");
  const mina=await w.signIn("mina","synthetic-mina");assert.equal((await w.write(mina.token,"join",envelope("mina","join-mina",{planId:PLAN}))).status,"committed");
 }finally{await w.close();}const s=checkpoint(path);assert.equal(s.blocks.length,1);assert.ok(s.grants.every(([,g])=>g.status==="revoked"));assert.ok(s.invitations.some(([,i])=>i.requesterId==="jules"&&i.status==="withdrawn"));
});
test("grant serial and deletion tombstone survive restart",async()=>{
 const path=await database();let w=createWorld({databasePath:path});const p=await mutual(w);await w.write(p.jules.token,"revoke",envelope("jules","revoke",{permissionId:p.guest.data.permissionId}));await w.close();
 w=createWorld({databasePath:path});const next=await w.write(p.jules.token,"grant",envelope("jules","new-grant",{planId:PLAN,otherId:"ada"}));assert.equal(next.data.permissionId,"grant-3");await w.write(p.jules.token,"delete-account",envelope("jules","delete",{}));await w.close();
 w=createWorld({databasePath:path});try{assert.equal((await w.signIn("jules","synthetic-jules")).status,"rejected");assert.doesNotMatch(JSON.stringify(await w.plan(p.ada.token,PLAN)),/relay:/);}finally{await w.close();}
});
test("failure after staged update rolls back block, grants, versions and receipt atomically",async()=>{
 const path=await database();let armed=false;const w=createWorld({databasePath:path,allowFaults:true,storageTestHooks:{beforeCommit(){if(armed)throw Error("Deliberate failed commit");}}});const p=await mutual(w),before=checkpoint(path);armed=true;
 await assert.rejects(w.write(p.ada.token,"block",envelope("ada","rollback",{otherId:"jules"})),/Deliberate/);armed=false;assert.deepEqual(checkpoint(path),before);assert.equal((await w.plan(p.jules.token,PLAN)).data.contactAccess,"visible");
 assert.equal((await w.lookup(p.ada.token,{personId:"ada",endpoint:"block",key:"rollback",payloadHash:payloadHash({otherId:"jules"})})).status,"absent");await w.close();
});
for(const phase of ["before","after"])test(`SIGKILL ${phase} commit recovers all-or-nothing block and retry receipt`,{timeout:20000},async()=>{
 const path=await database();let w=createWorld({databasePath:path});const p=await mutual(w);await w.close();const c=child(path,phase);try{assert.equal((await c.ready).stage,phase+"Commit");}finally{c.proc.kill("SIGKILL");}assert.equal((await c.exited).signal,"SIGKILL");
 w=createWorld({databasePath:path});try{
  const plan=await w.plan(p.jules.token,PLAN);assert.equal(plan.status,phase==="before"?"ok":"rejected");assert.equal(plan.version,phase==="before"?5:6);
  const ada=await w.signIn("ada","synthetic-ada"),input=envelope("ada","child-block-ada",{otherId:"jules"});const found=await w.lookup(ada.token,{personId:"ada",endpoint:"block",key:input.idempotencyKey,payloadHash:input.payloadHash});assert.equal(found.status,phase==="before"?"absent":"recorded");
  const s=checkpoint(path);assert.equal(s.blocks.length,phase==="before"?0:1);assert.ok(s.grants.every(([,g])=>g.status===(phase==="before"?"active":"revoked")));assert.equal(s.invitations[0][1].status,phase==="before"?"accepted":"withdrawn");
  const retry=await w.write(ada.token,"block",input);assert.equal(retry.version,6);if(phase==="after")assert.deepEqual(retry,found.result);assert.equal((await w.plan(p.jules.token,PLAN)).version,6);
 }finally{await w.close();}
});
test("separate processes preserve both concurrent blocks and receipts",{timeout:20000},async()=>{
 const path=await database();let w=createWorld({databasePath:path});await mutual(w);await w.close();const cs=[child(path,"complete","jules","ada"),child(path,"complete","mina","ada")];try{for(const c of cs)assert.equal((await c.ready).status,"committed");for(const c of cs)assert.equal((await c.exited).code,0);}finally{for(const c of cs)if(c.proc.exitCode===null&&c.proc.signalCode===null)c.proc.kill("SIGKILL");}
 const s=checkpoint(path);assert.equal(s.blocks.length,2);assert.equal(s.idempotency.filter(([key])=>key.includes("\u0000block\u0000child-block-")).length,2);
 w=createWorld({databasePath:path});try{for(const actor of ["jules","mina"]){const person=await w.signIn(actor,"synthetic-"+actor);assert.equal((await w.write(person.token,"join",envelope(actor,"blocked-join",{planId:PLAN}))).status,"rejected");}}finally{await w.close();}
});
test("two connections reload latest committed state rather than caching a stale snapshot",async()=>{
 const path=await database(),a=createWorld({databasePath:path}),b=createWorld({databasePath:path});try{const p=await mutual(a);assert.equal((await b.plan(p.jules.token,PLAN)).data.contactAccess,"visible");const block=await b.write(p.ada.token,"block",envelope("ada","from-b",{otherId:"jules"}));assert.equal((await a.plan(p.jules.token,PLAN)).version,block.version);assert.equal((await a.plan(p.jules.token,PLAN)).status,"rejected");}finally{await a.close();await b.close();}
});
test("lost-before and lost-after outcomes remain truthful after restart",async()=>{
 for(const fault of ["drop-before","drop-after"]){const path=await database();let w=createWorld({databasePath:path,allowFaults:true});const p=await mutual(w),body={otherId:"jules"},input=envelope("ada","lost",body);assert.equal((await w.write(p.ada.token,"block",input,fault)).status,"ambiguous");await w.close();w=createWorld({databasePath:path});try{assert.equal((await w.lookup(p.ada.token,{personId:"ada",endpoint:"block",key:"lost",payloadHash:payloadHash(body)})).status,fault==="drop-before"?"absent":"recorded");assert.equal((await w.plan(p.jules.token,PLAN)).status,fault==="drop-before"?"ok":"rejected");}finally{await w.close();}}
});
test("foreign, newer, missing, invalid and truncated stores fail closed instead of reseeding",async()=>{
 const foreign=await database();let db=new DatabaseSync(foreign);db.exec("CREATE TABLE foreign_data (value TEXT); INSERT INTO foreign_data VALUES('synthetic-canary')");db.close();await chmod(foreign,0o600);assert.throws(()=>createWorld({databasePath:foreign}),/Unsupported/);db=new DatabaseSync(foreign);assert.equal(db.prepare("SELECT value FROM foreign_data").get().value,"synthetic-canary");db.close();
 for(const mode of ["newer","missing","invalid"]){const path=await database();const w=createWorld({databasePath:path});await w.close();db=new DatabaseSync(path);if(mode==="newer")db.exec("PRAGMA user_version=3");else if(mode==="missing")db.exec("DELETE FROM soe_state");else db.prepare("UPDATE soe_state SET state_json=?").run('{"format":1}');db.close();assert.throws(()=>createWorld({databasePath:path}),/Unsupported|Missing|Invalid/);}
 const empty=await database();await writeFile(empty,"",{mode:0o600});assert.throws(()=>createWorld({databasePath:empty}),/Unsupported/);
});
test("storage requires explicit owner-only regular file and normal mode refuses test hooks",async()=>{
 assert.throws(()=>createWorld({databasePath:':memory:'}),/absolute/);assert.throws(()=>createWorld({storageTestHooks:{beforeCommit(){}}}),/allowFaults/);
 const path=await database();await writeFile(path,"",{mode:0o644});assert.throws(()=>createWorld({databasePath:path}),/owner-only/);
 const target=await database(),link=target+'.link';await writeFile(target,"",{mode:0o600});await symlink(target,link);assert.throws(()=>createWorld({databasePath:link}),/regular owner-only/);
});
test("close drains accepted operations and rejects subsequent work",async()=>{
 const path=await database(),w=createWorld({databasePath:path});const pending=w.signIn("jules","synthetic-jules"),close=w.close();assert.equal((await pending).status,"ok");await close;await w.close();await assert.rejects(w.discover("unused"),/closed/);
});

test("a pre-join block survives restart even when no plan version was incremented",async()=>{
 const path=await database();let w=createWorld({databasePath:path});const ada=await w.signIn("ada","synthetic-ada"),jules=await w.signIn("jules","synthetic-jules");const input=envelope("jules","before-join",{otherId:"ada"});const receipt=await w.write(jules.token,"block",input);assert.equal(receipt.version,1);await w.close();w=createWorld({databasePath:path});try{assert.equal((await w.write(jules.token,"join",envelope("jules","new-join",{planId:PLAN}))).status,"rejected");assert.equal((await w.plan(jules.token,PLAN)).version,1);assert.deepEqual(await w.write(jules.token,"block",input),receipt);}finally{await w.close();}
});

test("replaced and already-expired sessions cannot be revived by reopening",async()=>{
 const path=await database();let w=createWorld({databasePath:path});const old=await w.signIn("jules","synthetic-jules"),fresh=await w.signIn("jules","synthetic-jules");w.setNow(()=>Date.now()-8*86400000);const expired=await w.signIn("mina","synthetic-mina");await w.close();w=createWorld({databasePath:path});try{assert.equal((await w.discover(old.token)).status,"expired-session");assert.equal((await w.discover(fresh.token)).status,"ok");assert.equal((await w.discover(expired.token)).status,"expired-session");}finally{await w.close();}
});

test("storage refuses a group/world-writable parent directory before creating a file",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"soe-shared-parent-"));await chmod(dir,0o777);try{assert.throws(()=>createWorld({databasePath:join(dir,"world.sqlite")}),/trusted directory/);}finally{await chmod(dir,0o700);}
});
