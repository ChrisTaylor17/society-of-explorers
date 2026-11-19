// Local exact-source proof only. No provider, credential, hosted DB or install.
import {lstat,stat,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const ROOT=new URL('../../../',import.meta.url),WEB=new URL('verification/web/',ROOT);
const sources=[
 'app/api/thinker/route.ts','lib/rewards/thinker.ts','components/ThinkerRewardNotice.tsx',
 'app/council/page.tsx','app/members/page.tsx','app/salon/HubOverlay.tsx','app/waddle/page.tsx',
 'lib/auth/request.ts','lib/auth/providerSelection.ts','lib/auth/browserSignOut.ts','lib/circles/client.ts','lib/ids/uuid.ts','lib/http/routeError.ts',
 'docs/sql/thinker-reward-accounting.sql','docs/sql/member-profile-apply.sql',
 ...['preflight','apply','rollback'].map(stage=>'docs/sql/reward-rpc-containment-'+stage+'.sql'),
 'verification/web/tests/fixtures/reward-live-bodies-2026-11-04.json','verification/web/tests/fixtures/legacy-rpc-catalog-2026-11-04.json',
 'verification/web/tests/thinker-reward-accounting.test.mjs','verification/web/tests/support/thinker-reward-db.mjs',
 'verification/web/tests/reward-live-body-db.test.mjs','verification/web/tests/support/reward-live-body-db.mjs',
 'verification/web/tests/reward-rpc-containment-db.test.mjs','verification/web/tests/support/reward-rpc-fixture.mjs',
 'verification/web/tests/support/offline-app.mjs','tests/security/fakes.ts','verification/web/scripts/deny-build-network.cjs',
 'prompts-mvp/supabase/migrations/202606180001_prompt_atlas.sql',
 'verification/web/scripts/run-thinker-reward-accounting.mjs',
];
async function digest(path){const file=new URL(path,ROOT),link=await lstat(file),info=await stat(file);assert.equal(link.isSymbolicLink(),false,'Refuse source symlink '+path);assert.ok(!info.size||info.blocks,'Refuse source placeholder '+path);return createHash('sha256').update(await readFile(file)).digest('hex');}
async function hashes(){return Object.fromEntries(await Promise.all(sources.map(async path=>[path,await digest(path)])));}
const before=await hashes(),startedAt=new Date().toISOString();
const args=['--require','./scripts/deny-build-network.cjs','--test','--test-concurrency=1','tests/thinker-reward-accounting.test.mjs','tests/reward-live-body-db.test.mjs','tests/reward-rpc-containment-db.test.mjs'];
const output=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{cwd:WEB,env:{PATH:'/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'},stdio:['ignore','pipe','pipe']});let out='';child.stdout.on('data',data=>{out+=data;});child.stderr.on('data',data=>{out+=data;});child.once('error',reject);child.once('close',code=>resolve({code,out}));});
await writeFile(new URL('evidence/thinker-reward-accounting.log',WEB),output.out);
const after=await hashes();assert.deepEqual(after,before,'Accounting proof sources changed while tests ran');
assert.equal(output.code,0,output.out.slice(-4000));assert.match(output.out,/# tests 38\n/);assert.match(output.out,/# pass 38\n/);assert.match(output.out,/# fail 0\n/);
const receipt={status:'PASS',startedAt,finishedAt:new Date().toISOString(),command:[process.execPath,...args],environment:'PATH-only; startup external-network denial; cached local runtimes',
 tests:{newAccounting:12,currentExactBody:13,currentRepresentativeBody:13,total:38,failed:0,skipped:0},
 sourceCount:sources.length,sourcesBefore:before,sourcesAfter:after,unchanged:true,
 log:{path:'verification/web/evidence/thinker-reward-accounting.log',sha256:await digest('verification/web/evidence/thinker-reward-accounting.log')},
 limits:['One PGlite backend, no independent multi-session schedule proof.','Auth identity, provider stream and service HTTP transport are synthetic; actual route/helper/SQL execute.','Exactly-once committed award per member/request while receipts are retained; provider/actions/messages may repeat.','Captured legacy bodies and containment SQL unchanged; historical29a6459 receipts remain separate.','No production application, issued credential, live model, deployed caller or provider acceptance.']};
await writeFile(new URL('evidence/thinker-reward-accounting.json',WEB),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({status:receipt.status,tests:receipt.tests,sourceCount:receipt.sourceCount,unchanged:true}));
