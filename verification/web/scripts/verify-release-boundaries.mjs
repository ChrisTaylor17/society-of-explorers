// Run only the synthetic cross-stage compatibility probe with source receipts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
assert.ok(process.execArgv.join(' ').includes('deny-build-network.cjs'),'Start with the network guard');
const root=path.resolve('../..'),testFile='verification/web/tests/release-boundaries-db.test.mjs';
const source=fs.readFileSync(path.join(root,testFile),'utf8');
const block=source.match(/COMPATIBILITY_SQL=Object\.freeze\(\[([\s\S]*?)\]\)/)?.[1];assert.ok(block);
const sql=[...block.matchAll(/'((?:docs\/sql|supabase\/migrations)\/[a-z0-9_-]+\.sql)'/g)].map(m=>m[1]);
assert.equal(sql.length,20);assert.equal(new Set(sql).size,20);
const files=[...sql,testFile,'verification/web/scripts/verify-release-boundaries.mjs',
 'lib/hall/public.ts','app/api/hall/route.ts',
 'verification/web/tests/support/circle-live-db.mjs','verification/web/tests/support/artifact-containment-fixture.mjs',
 'verification/web/tests/support/hall-db-http-fixture.mjs','verification/web/tests/support/offline-app.mjs',
 'verification/web/tests/fixtures/circle-live-catalog-2026-11-04.json',
 'verification/web/tests/fixtures/hall-catalog-2026-11-04.json','verification/web/tests/fixtures/hall-catalog-supplement-2026-11-04.json',
 'docs/sql/first-release-core-containment-rollback.sql','docs/sql/circle-legacy-baseline-rollback.sql'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const snapshot=()=>Object.fromEntries(files.map(file=>[file,hash(fs.readFileSync(path.join(root,file)))]));
const before=snapshot(),startedAt=new Date().toISOString();
const env=Object.fromEntries(['PATH','HOME','USER','SHELL','TMPDIR','LANG','LC_ALL'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const args=['--require','./scripts/deny-build-network.cjs','--test','tests/release-boundaries-db.test.mjs'];
const run=spawnSync(process.execPath,args,{env,encoding:'utf8',timeout:100000,maxBuffer:2_000_000});
const log=(run.stdout??'')+(run.stderr??'');fs.mkdirSync('evidence',{recursive:true});fs.writeFileSync('evidence/release-boundaries-final-tests.log',log);
const after=snapshot(),unchanged=JSON.stringify(before)===JSON.stringify(after);
const count=name=>Number(log.match(new RegExp('^# '+name+' (\\d+)$','m'))?.[1]??-1);
const report={status:run.status===0&&unchanged&&count('pass')===2?'PASS':'FAIL',startedAt,completedAt:new Date().toISOString(),
 command:[process.execPath,...args],tests:count('tests'),pass:count('pass'),fail:count('fail'),exitCode:run.status,error:run.error?String(run.error):null,
 actualSqlFilesInOrder:sql,rawTargets:11,sourceUnchanged:unchanged,sourceHashesBefore:before,sourceHashesAfter:after,
 log:'evidence/release-boundaries-final-tests.log',logSha256:hash(log),
 scope:'One disposable synthetic PGlite database composes core containment, identity uniqueness, private profiles, strict Circle baseline plus9files, ordinary salon and artifact containment. Profile publication/withdrawal, ordinary/Circle posts, actual Hall handler/SDK/local SQL and11rawtable denials share the resulting database.',
 limitations:['Not a95-table production restore or live row compatibility check.','Members/profile/reading and external child tables are explicit minimal synthetic stubs; the Circle3table schema is catalog-derived.','Weekly schedule and artifact theme defaults use declared synthetic literals; unknown original values are never executed.','Single PostgreSQL backend; hosted PostgREST/cache, real provider identity, role maintenance, concurrency and deployed clients remain unverified.'],
 productionMutation:false,providerCalls:false,issuedCredentials:false,externalNetworkDeniedFromStartup:true};
fs.writeFileSync('evidence/release-boundaries.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,tests:report.tests,pass:report.pass,sourceUnchanged:unchanged,actualSqlFiles:sql.length}));
if(report.status!=='PASS')process.exitCode=1;
