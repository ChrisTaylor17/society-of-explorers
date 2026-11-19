// Independent actual shared controller/host -> canonical HTTP -> strict SQL.
// External identity, delivery, lifecycle and secure-key providers are synthetic.
import assert from 'node:assert/strict';
import {lstat,stat,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const ROOT=new URL('../../../',import.meta.url),WEB=new URL('verification/web/',ROOT);
async function digest(name){const file=new URL(name,ROOT),link=await lstat(file),info=await stat(file);assert.equal(link.isSymbolicLink(),false,'Refuse linked source '+name);assert.ok(!info.size||info.blocks,'Refuse offloaded source '+name);return createHash('sha256').update(await readFile(file)).digest('hex');}
await digest('verification/web/tests/support/platforms-message-actions-app.mjs');
// The existing offline TypeScript loader resolves only cached installed tools
// from this explicit cwd; no recursive inventory or dependency installation.
process.chdir(fileURLToPath(WEB));
const {SAFETY_APP_SOURCES,COVERAGE_SOURCE_HASHES,COVERAGE_FIXTURE_LIMITS}=await import('../tests/support/platforms-message-actions-app.mjs');
const sources=[...new Set([...Object.keys(COVERAGE_SOURCE_HASHES),...SAFETY_APP_SOURCES,
 'platforms/shared/message-safety.ts','platforms/shared/thread-writer.ts','platforms/shared/archive.ts',
 'platforms/native/src/circles/host.ts','platforms/native/src/circles/participation-session.ts',
 'platforms/native/src/circles/discussion-reader.ts','platforms/native/src/circles/discussion-composer.ts','platforms/native/src/circles/path.ts',
 'platforms/tests/load-source.mjs','platforms/tests/message-safety.test.mjs','verification/web/tests/platforms-message-actions-integration.test.mjs',
 'verification/web/scripts/deny-build-network.cjs','verification/web/scripts/run-platform-message-actions-tests.mjs',
])];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async name=>[name,await digest(name)])));
const before=await hashes(),startedAt=new Date().toISOString();
const groups=[{name:'controller',cwd:ROOT,args:['--require','./verification/web/scripts/deny-build-network.cjs','--test','platforms/tests/message-safety.test.mjs'],log:'verification/web/evidence/platform-message-safety-unit.log',expected:11},
 {name:'hostHttpSql',cwd:WEB,args:['--require','./scripts/deny-build-network.cjs','--test','tests/platforms-message-actions-integration.test.mjs'],log:'verification/web/evidence/platform-message-actions-integration.log',expected:12}];
const results=await Promise.all(groups.map(async group=>{
 const result=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,group.args,{cwd:group.cwd,env:{PATH:'/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'},stdio:['ignore','pipe','pipe']});let output='';const timer=setTimeout(()=>child.kill('SIGKILL'),120000);child.stdout.on('data',x=>{output+=x;});child.stderr.on('data',x=>{output+=x;});child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('close',code=>{clearTimeout(timer);resolve({code,output});});});
 await writeFile(new URL(group.log,ROOT),result.output);assert.equal(result.code,0,result.output.slice(-6000));assert.match(result.output,new RegExp('# tests '+group.expected+'\n'));assert.match(result.output,new RegExp('# pass '+group.expected+'\n'));assert.match(result.output,/# fail 0\n/);assert.match(result.output,/# skipped 0\n/);
 return{name:group.name,tests:group.expected,passed:group.expected,failed:0,skipped:0,command:[process.execPath,...group.args],log:{path:group.log,sha256:await digest(group.log)}};
}));
const after=await hashes();assert.deepEqual(after,before,'Message safety inputs changed during proof');
const receipt={status:'PASS',startedAt,finishedAt:new Date().toISOString(),environment:'PATH-only child environments; startup network denial; cached Node/TypeScript/PGlite',tests:results,total:23,sourceCount:sources.length,sourcesBefore:before,sourcesAfter:after,unchanged:true,fixtureLimits:COVERAGE_FIXTURE_LIMITS,
 scope:'Actual shared safety controller and host, canonical message action/state handlers and argument-checked service RPCs over the current strict Circle SQL chain. Actual report/withdraw/replay, stale revision, receipt transaction failure, membership leave and human quarantine execute locally.',
 limits:['Synthetic actor verification, nonissued bearer, HTTPS transport, secure UUID supplier and lifecycle events.','Single PGlite backend; no independent PostgreSQL concurrency-schedule proof.','GET reads current state only; only exact manual POST replay recovers an uncertain receipt. Reports are allegations, not human findings.','Already dispatched actions may commit after local retirement; retirement prevents restoration of private local state.','Withdrawal hides member content; restricted original evidence remains and is not physically erased.','No browser UI, native OS/Keystore/device, SDK identity, hosted service, provider, production migration or deployed acceptance claim.','Prior thread controller/HTTP proof and UI proofs remain separate; this runner does not rewrite or execute them.']};
await writeFile(new URL('evidence/platform-message-actions-tests.json',WEB),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',tests:23,sourceCount:sources.length,unchanged:true}));
