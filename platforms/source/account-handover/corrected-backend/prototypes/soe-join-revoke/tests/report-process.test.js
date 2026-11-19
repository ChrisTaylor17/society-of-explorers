import assert from "node:assert/strict";
import {test} from "node:test";
import {mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {spawn} from "node:child_process";
import {DatabaseSync} from "node:sqlite";
import {createWorld} from "../src/world.js";
import {envelope,signIn,write} from "./helpers.js";
function start(script,args,env={}){
 const proc=spawn(process.execPath,["--experimental-strip-types",script,...args],{env:{...process.env,...env},stdio:["ignore","pipe","pipe"]});let stdout="",stderr="";const exited=new Promise(resolve=>proc.once("exit",(code,signal)=>resolve({code,signal})));
 const line=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{proc.kill("SIGKILL");reject(Error("Owned test child startup timeout"));},10000);proc.stdout.on("data",d=>{stdout+=d;if(stdout.includes("\n")){clearTimeout(timer);resolve(stdout.split("\n")[0]);}});proc.stderr.on("data",d=>stderr+=d);proc.once("exit",()=>{clearTimeout(timer);if(!stdout.includes("\n"))reject(Error("Owned test child did not start"));});proc.once("error",e=>{clearTimeout(timer);reject(e);});});return {proc,line,exited,output:()=>stdout+stderr};
}
for(const phase of ["before","after"])test(`report SIGKILL ${phase} commit keeps report and receipt in the same transaction`,{timeout:20000},async()=>{
 const databasePath=join(await mkdtemp(join(tmpdir(),"soe-report-crash-")),"world.sqlite");const seed=createWorld({databasePath});await seed.close();const c=start(fileURLToPath(new URL("./support/report-child.js",import.meta.url)),[databasePath,phase]);try{assert.equal(JSON.parse(await c.line).stage,phase);}finally{c.proc.kill("SIGKILL");}assert.equal((await c.exited).signal,"SIGKILL");
 const w=createWorld({databasePath});try{const s=await w.signIn("jules","synthetic-jules"),body={otherId:"ada",category:"other",details:"Fictional crash case"},input=envelope("jules","crash-report",body);const found=await w.lookup(s.token,{personId:"jules",endpoint:"report",key:input.idempotencyKey,payloadHash:input.payloadHash});assert.equal(found.status,phase==="before"?"absent":"recorded");const receipt=await w.write(s.token,"report",input);assert.equal(receipt.status,"committed");if(phase==="after")assert.deepEqual(receipt,found.result);const db=new DatabaseSync(databasePath,{readOnly:true});assert.equal(JSON.parse(db.prepare("SELECT state_json FROM soe_state").get().state_json).reports.length,1);db.close();}finally{await w.close();}
});
test("normal server stdout/stderr never logs reporter identity or report text",{timeout:20000},async()=>{
 const databasePath=join(await mkdtemp(join(tmpdir(),"soe-report-logs-")),"world.sqlite");const c=start(fileURLToPath(new URL("../src/server.js",import.meta.url)),[],{SOE_DATABASE_PATH:databasePath,PORT:"0"});try{const first=await c.line;const url=/http:\/\/127\.0\.0\.1:\d+/.exec(first)?.[0];assert.ok(url);const s=await signIn(url,"jules");assert.equal((await write(url,s.token,"report","jules","log-check",{otherId:"ada",category:"other",details:"fictional-log-privacy-canary"})).status,200);}finally{c.proc.kill("SIGTERM");await c.exited;}assert.doesNotMatch(c.output(),/fictional-log-privacy-canary|Jules Okonkwo|\bjules\b|reporterId/);
});
