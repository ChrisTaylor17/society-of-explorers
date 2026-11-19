// Actual portable account controller and verified owner -> account HTTP -> SQL.
import assert from 'node:assert/strict';
import {lstat,stat,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=new URL('../../../',import.meta.url),WEB=new URL('verification/web/',ROOT);
async function source(name){const file=new URL(name,ROOT),link=await lstat(file),info=await stat(file);assert.equal(link.isSymbolicLink(),false,'Refuse linked source '+name);assert.ok(info.isFile()&&(!info.size||info.blocks),'Refuse offloaded source '+name);return readFile(file);}
async function digest(name){return createHash('sha256').update(await source(name)).digest('hex');}
process.chdir(fileURLToPath(WEB));await source('verification/web/tests/support/bearer-member-provisioning-app.mjs');
const {PROVISIONING_SOURCES}=await import('../tests/support/bearer-member-provisioning-app.mjs');
const sources=new Set(),roots=[...PROVISIONING_SOURCES,'platforms/shared/account-session.ts','platforms/native/src/circles/verified-member-session.ts','platforms/tests/load-source.mjs',
 'verification/web/tests/native-account-session-integration.test.mjs','verification/web/scripts/deny-build-network.cjs','verification/web/scripts/run-native-account-session-tests.mjs'];
async function visit(name){if(sources.has(name))return;sources.add(name);const data=await source(name);if(!/\.[cm]?[jt]sx?$/.test(name)||name.includes('/node_modules/'))return;const text=data.toString();
 const imports=[...text.matchAll(/(?:from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g)].map(x=>x[1]);
 const loaded=[...text.matchAll(/(?:\.load|\bload)\(['"]([^'"]+)['"]\)/g)].map(x=>x[1]);
 for(const item of [...imports.map(spec=>spec.startsWith('@/')?spec.slice(2):spec.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(name),spec)):null),...loaded]){
  if(!item||item.includes('/node_modules/')||item.startsWith('../'))continue;let target=null;
  for(const candidate of path.extname(item)?[item]:[item+'.ts',item+'.tsx',item+'.js',item+'.mjs']){try{await lstat(new URL(candidate,ROOT));target=candidate;break;}catch(error){if(error.code!=='ENOENT')throw error;}}
  assert.ok(target,'Referenced source missing '+item);await visit(target);
 }
}
for(const name of roots)await visit(name);
const hashes=async()=>Object.fromEntries(await Promise.all([...sources].sort().map(async name=>[name,await digest(name)])));
const before=await hashes(),startedAt=new Date().toISOString(),args=['--require','./scripts/deny-build-network.cjs','--test','tests/native-account-session-integration.test.mjs'];
const result=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{cwd:WEB,env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin'},stdio:['ignore','pipe','pipe']});let output='';const timer=setTimeout(()=>child.kill('SIGKILL'),120000);child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('close',code=>{clearTimeout(timer);resolve({code,output});});});
const log='verification/web/evidence/native-account-session-integration.log';await writeFile(new URL(log,ROOT),result.output);assert.equal(result.code,0,result.output.slice(-8000));assert.match(result.output,/# tests 19\n/);assert.match(result.output,/# pass 19\n/);assert.match(result.output,/# fail 0\n/);assert.match(result.output,/# skipped 0\n/);
const after=await hashes();assert.deepEqual(after,before,'Account session inputs changed during proof');
const receipt={status:'PASS',startedAt,finishedAt:new Date().toISOString(),sourceCount:sources.size,tests:19,passed:19,failed:0,skipped:0,sourcesBefore:before,sourcesAfter:after,unchanged:true,command:[process.execPath,...args],log:{path:log,sha256:await digest(log)},
 scope:'Actual createMemberAccountSession and createVerifiedSupabaseCircleOwner modules compose with the actual canonical account handlers and identity uniqueness SQL. Explicit check/confirmation/setup/readback, same-subject/member binding, lost commit/manual check, lifecycle and credential/transport deadlines are exercised.',
 limits:['Synthetic provider getSession/getUser events and nonissued bearer. Actual SDK sign-in, secure storage and device transport are not verified.','Single isolated PGlite database with synthetic members schema. Production uniqueness/backup/identity ownership remains unverified.','A current member read confirms the account now; it does not claim an exactly-once receipt for an uncertain setup request.','Already-dispatched setup may commit after local retirement; no background or automatic setup retry occurs.','This suite does not render native UI, compile Android/iOS, own provider SDK configuration, or call live providers.'],environment:'PATH-only child process, startup external-network denial, cached Node/TypeScript/PGlite'};
await writeFile(new URL('evidence/native-account-session-tests.json',WEB),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:'PASS',tests:19,sourceCount:sources.size,unchanged:true}));
