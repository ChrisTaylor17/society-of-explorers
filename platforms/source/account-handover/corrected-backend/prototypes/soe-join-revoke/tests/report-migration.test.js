import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createWorld } from "../src/world.js";
import { migrateReportStorage } from "../src/sqlite-state.js";
import { envelope } from "./helpers.js";
async function legacy(){
 const path=join(await mkdtemp(join(tmpdir(),"soe-report-migration-")),"world.sqlite");const w=createWorld({databasePath:path});const s=await w.signIn("jules","synthetic-jules");await w.write(s.token,"block",envelope("jules","preserved-block",{otherId:"ada"}));await w.close();
 const db=new DatabaseSync(path),state=JSON.parse(db.prepare("SELECT state_json FROM soe_state").get().state_json);state.format=1;delete state.reports;
 db.exec("BEGIN IMMEDIATE; ALTER TABLE soe_state RENAME TO fixture_new; CREATE TABLE soe_state (id INTEGER PRIMARY KEY CHECK(id=1), format_version INTEGER NOT NULL CHECK(format_version=1), state_json TEXT NOT NULL) STRICT");db.prepare("INSERT INTO soe_state VALUES(1,1,?)").run(JSON.stringify(state));db.exec("DROP TABLE fixture_new; PRAGMA user_version=1; COMMIT");db.close();return {path,state,session:s};
}
test("explicit schema migration preserves all prior state; normal startup never auto-migrates",async()=>{
 const h=await legacy();assert.throws(()=>createWorld({databasePath:h.path}),/Unsupported/);assert.deepEqual(migrateReportStorage(h.path),{schemaVersion:2,checkpointFormat:2});const db=new DatabaseSync(h.path,{readOnly:true});const upgraded=JSON.parse(db.prepare("SELECT state_json FROM soe_state").get().state_json);assert.equal(db.prepare("PRAGMA user_version").get().user_version,2);db.close();assert.deepEqual(upgraded,{...h.state,format:2,reports:[]});
 const w=createWorld({databasePath:h.path});try{assert.equal((await w.plan(h.session.token,"plan-riverside")).status,"rejected");assert.equal((await w.write(h.session.token,"report",envelope("jules","after-migration",{otherId:"ada",category:"other",details:"Fictional migration check"}))).status,"committed");}finally{await w.close();}
 assert.deepEqual(migrateReportStorage(h.path),{schemaVersion:2,checkpointFormat:2});
});
test("invalid legacy data aborts migration without resetting or changing the schema",async()=>{
 const h=await legacy(),db=new DatabaseSync(h.path);db.prepare("UPDATE soe_state SET state_json=?").run(JSON.stringify({...h.state,grantSerial:-1}));const before=db.prepare("SELECT state_json FROM soe_state").get().state_json;db.close();assert.throws(()=>migrateReportStorage(h.path),/Invalid/);const check=new DatabaseSync(h.path);assert.equal(check.prepare("PRAGMA user_version").get().user_version,1);assert.equal(check.prepare("SELECT state_json FROM soe_state").get().state_json,before);check.close();
});
test("migration requires an existing file and never silently upgrades newer schemas",async()=>{
 const path=join(await mkdtemp(join(tmpdir(),"soe-report-missing-")),"missing.sqlite");assert.throws(()=>migrateReportStorage(path),/ENOENT/);const h=await legacy(),db=new DatabaseSync(h.path);db.exec("PRAGMA user_version=3");db.close();assert.throws(()=>migrateReportStorage(h.path),/Unsupported/);const check=new DatabaseSync(h.path);assert.equal(check.prepare("PRAGMA user_version").get().user_version,3);check.close();
});

test("legacy extensions are refused rather than silently dropping unrecognized state",async()=>{
 const h=await legacy(),db=new DatabaseSync(h.path);db.prepare("UPDATE soe_state SET state_json=?").run(JSON.stringify({...h.state,unknownCollection:[]}));db.close();assert.throws(()=>migrateReportStorage(h.path),/Invalid/);const check=new DatabaseSync(h.path);assert.equal(check.prepare("PRAGMA user_version").get().user_version,1);check.close();
});
