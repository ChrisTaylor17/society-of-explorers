// Source-bound portable controller/actual HTTP/strict DB proof; no native OS,
// provider, issued credential, hosted service, install or production mutation.
import assert from 'node:assert/strict';
import {lstat,stat,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const ROOT=new URL('../../../',import.meta.url),WEB=new URL('verification/web/',ROOT);
async function digest(name){const file=new URL(name,ROOT),link=await lstat(file),info=await stat(file);assert.equal(link.isSymbolicLink(),false,'Refuse source symlink '+name);assert.ok(!info.size||info.blocks,'Refuse source placeholder '+name);return createHash('sha256').update(await readFile(file)).digest('hex');}
await digest('verification/web/tests/support/platforms-thread-app.mjs');
// The existing offline-app fixture resolves its cached TypeScript runtime from
// verification/web's cwd. Child test processes still receive explicit cwd.
process.chdir(fileURLToPath(WEB));
const {THREAD_APP_SOURCES,COVERAGE_SOURCE_HASHES,COVERAGE_FIXTURE_LIMITS}=await import('../tests/support/platforms-thread-app.mjs');
const sources=[...new Set([...Object.keys(COVERAGE_SOURCE_HASHES),...THREAD_APP_SOURCES,
 'platforms/shared/thread-writer.ts','platforms/shared/archive.ts','platforms/native/src/circles/host.ts',
 'platforms/native/src/circles/participation-session.ts','platforms/native/src/circles/discussion-reader.ts','platforms/native/src/circles/discussion-composer.ts','platforms/native/src/circles/path.ts',
 'platforms/tests/load-source.mjs','platforms/tests/thread-writer.test.mjs','verification/web/tests/platforms-thread-integration.test.mjs',
 'verification/web/scripts/deny-build-network.cjs','verification/web/scripts/run-platform-thread-tests.mjs',
])];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async name=>[name,await digest(name)])));
const before=await hashes(),startedAt=new Date().toISOString();
const groups=[{name:'writer',cwd:ROOT,args:['--require','./verification/web/scripts/deny-build-network.cjs','--test','platforms/tests/thread-writer.test.mjs'],log:'verification/web/evidence/platform-thread-writer-tests.log',expected:11},
 {name:'httpSql',cwd:WEB,args:['--require','./scripts/deny-build-network.cjs','--test','tests/platforms-thread-integration.test.mjs'],log:'verification/web/evidence/platform-thread-integration-tests.log',expected:10}];
const results=await Promise.all(groups.map(async group=>{
 const result=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,group.args,{cwd:group.cwd,env:{PATH:'/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'},stdio:['ignore','pipe','pipe']});let output='';const timer=setTimeout(()=>child.kill('SIGKILL'),120000);child.stdout.on('data',x=>{output+=x;});child.stderr.on('data',x=>{output+=x;});child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('close',code=>{clearTimeout(timer);resolve({code,output});});});
 await writeFile(new URL(group.log,ROOT),result.output);assert.equal(result.code,0,result.output.slice(-5000));assert.match(result.output,new RegExp('# tests '+group.expected+'\\n'));assert.match(result.output,new RegExp('# pass '+group.expected+'\\n'));assert.match(result.output,/# fail 0\n/);assert.match(result.output,/# skipped 0\n/);
 return{name:group.name,tests:group.expected,passed:group.expected,failed:0,skipped:0,command:[process.execPath,...group.args],log:{path:group.log,sha256:await digest(group.log)}};
}));
const after=await hashes();assert.deepEqual(after,before,'Platform thread inputs changed during proof');
const receipt={status:'PASS',startedAt,finishedAt:new Date().toISOString(),environment:'PATH-only child environments; startup external-network denial; cached runtimes',tests:results,total:21,sourceCount:sources.length,sourcesBefore:before,sourcesAfter:after,unchanged:true,fixtureLimits:COVERAGE_FIXTURE_LIMITS,
 scope:'Actual shared writer and host, canonical preview/post/receipt/auth DTO modules and strict Circle SQL chain. Synthetic actor verification/nonissued bearer/HTTPS delivery; actual parent moderation, membership leave and receipt transactions execute locally.',
 limits:['One PGlite backend; no independent PostgreSQL concurrency schedule.','No SDK/provider/issued credential/account/cookie/native OS/device/hosted-service acceptance.','Report/withdraw RPCs are synthetic setup operations, not implemented native/Quest controls in this milestone.','Existing historical read-only browser proof remains separate; these tests do not execute UI.']};
await writeFile(new URL('evidence/platform-thread-tests.json',WEB),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',tests:21,sourceCount:sources.length,unchanged:true}));
