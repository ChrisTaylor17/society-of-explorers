// Source-bound local evidence only. No provider, deployment or live SQL access.
import assert from 'node:assert/strict';
import {lstat,readFile,writeFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),web=fileURLToPath(new URL('../',import.meta.url));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function bytes(file){const s=await lstat(file);assert(s.isFile()&&!s.isSymbolicLink()&&(!s.size||s.blocks),'Refuse linked/offloaded source '+file);return readFile(file);}
await bytes(root+'verification/web/tests/support/public-profile-app.mjs');
const {publicProfileAppHashes}=await import('../tests/support/public-profile-app.mjs');
const extra=['verification/web/scripts/verify-public-profile-backend.mjs','verification/web/scripts/deny-build-network.cjs','verification/web/tests/public-profile-backend.test.mjs','platforms/shared/member-profile.ts','platforms/tests/member-profile.test.mjs','platforms/tests/load-source.mjs','platforms/native/src/circles/discussion-reader.ts','verification/web/tests/member-profile-http.test.mjs','verification/web/tests/member-profile-db.test.mjs','verification/web/tests/public-member-profile.test.mjs','verification/web/tests/public-member-profile-db.test.mjs','verification/web/tests/support/member-profile-http-fixture.mjs','verification/web/tests/support/member-profile-fixture.mjs','docs/integration/production-migration-plan.md','docs/integration/profile-intent-public-references.md','eslint.config.mjs'];
async function hashes(){const value=await publicProfileAppHashes();for(const name of extra)value[name]=digest(await bytes(root+name));return value;}
const before=await hashes();
const runtimePaths={node:await realpath(process.execPath),typescript:'/Users/christaylor/Documents/Codex/2026-11-03/soe-supporter/runtime/web/node_modules/typescript/lib/typescript.js',pglite:'/Users/christaylor/.cache/soe-passages-test-runtime/pglite-0.4.1/dist/index.js',pglitePackage:'/Users/christaylor/.cache/soe-passages-test-runtime/pglite-0.4.1/package.json',eslint:'/Users/christaylor/Documents/Codex/2026-11-03/soe-supporter/runtime/web/node_modules/eslint/bin/eslint.js'};
const runtimes={};for(const[name,path]of Object.entries(runtimePaths))runtimes[name]={path,sha256:digest(await bytes(path))};
const guard=root+'verification/web/scripts/deny-build-network.cjs';
const env={PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'};
const groups=[
 {name:'public-profile-backend',cwd:web,args:['--test','tests/public-profile-backend.test.mjs'],expected:26},
 {name:'public-profile-controller',cwd:root,args:['--test','platforms/tests/member-profile.test.mjs'],expected:47},
 {name:'public-profile-contract-regressions',cwd:web,args:['--test','tests/member-profile-http.test.mjs','tests/member-profile-db.test.mjs','tests/public-member-profile.test.mjs','tests/public-member-profile-db.test.mjs'],expected:46},
 {name:'public-profile-backend-lint',cwd:root,args:[runtimePaths.eslint,'lib/members/public-reference.ts','lib/circles/membership.ts','lib/circles/membership-server.ts','lib/circles/thread.ts','lib/circles/thread-server.ts','lib/circles/discussion-reader.ts','lib/circles/message-moderation.ts','lib/circles/message-moderation-server.ts','app/api/members/profile/route.ts','app/api/book-salons/[cohortId]/route.ts','platforms/shared/member-profile.ts','platforms/native/src/circles/discussion-reader.ts','platforms/tests/member-profile.test.mjs','verification/web/tests/public-profile-backend.test.mjs','verification/web/tests/support/public-profile-app.mjs','verification/web/scripts/verify-public-profile-backend.mjs']}
];
const checks=[];
for(const group of groups){const result=spawnSync(process.execPath,['--require',guard,...group.args],{cwd:group.cwd,env,encoding:'utf8',timeout:120000,maxBuffer:8_000_000});const output=(result.stdout??'')+(result.stderr??'');const log='verification/web/evidence/'+group.name+'.log';await writeFile(root+log,output);
 const pass=Number(output.match(/^# pass (\d+)$/m)?.[1]??0),fail=Number(output.match(/^# fail (\d+)$/m)?.[1]??0);const ok=result.status===0&&(!group.expected||pass===group.expected&&fail===0);
 checks.push({name:group.name,ok,exitCode:result.status,expectedTests:group.expected??null,passedTests:group.expected?pass:null,failedTests:group.expected?fail:null,cwd:group.cwd,command:[process.execPath,'--require',guard,...group.args],log,logSha256:digest(Buffer.from(output))});console.log(group.name,ok?'PASS':'FAIL',group.expected?`${pass}/${group.expected}`:'');
}
const after=await hashes();const sourceUnchanged=JSON.stringify(before)===JSON.stringify(after);const receipt={status:checks.every(x=>x.ok)&&sourceUnchanged?'PASS':'FAIL',verifiedAt:new Date().toISOString(),sourceUnchanged,nodeVersion:process.version,checks,runtimes,sourceHashes:after,
 limits:['Synthetic provider identities and HTTP/PostgREST delivery only; actual canonical handlers and SQL execute locally.','PGlite uses one connection: HTTP overlap and SQL CAS rejection are exercised, not independent PostgreSQL-session lock scheduling.','The four old profile contract suites retain their pinned v1 SQL as regression evidence; the new backend suite alone proves new intent semantics.',
 'Migration is unapplied; no provider call, live SQL, install, deployment or device claim.']};
await writeFile(root+'verification/web/evidence/public-profile-backend.json',JSON.stringify(receipt,null,2)+'\n');if(receipt.status!=='PASS')process.exitCode=1;
