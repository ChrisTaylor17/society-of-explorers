// Focused actual account handler -> strict isolated SQL proof and existing auth
// regressions. Provider identity and service transport are synthetic boundaries.
import assert from 'node:assert/strict';
import {lstat,stat,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=new URL('../../../',import.meta.url),WEB=new URL('verification/web/',ROOT);
async function source(name){const file=new URL(name,ROOT),link=await lstat(file),info=await stat(file);assert.equal(link.isSymbolicLink(),false,'Refuse linked source '+name);assert.ok(info.isFile()&&(!info.size||info.blocks),'Refuse offloaded source '+name);return readFile(file);}
async function digest(name){return createHash('sha256').update(await source(name)).digest('hex');}
process.chdir(fileURLToPath(WEB));
await source('verification/web/tests/support/bearer-member-provisioning-app.mjs');
const {PROVISIONING_SOURCES}=await import('../tests/support/bearer-member-provisioning-app.mjs');
const sources=new Set(),roots=[...PROVISIONING_SOURCES,'lib/auth/verified-supabase-subject.ts',
 'verification/web/tests/bearer-member-provisioning.test.mjs','verification/web/tests/account-security.test.mjs','verification/web/tests/account-identity-db.test.mjs',
 'docs/sql/member-identity-rollback.sql','verification/web/scripts/deny-build-network.cjs','verification/web/scripts/run-bearer-member-provisioning-tests.mjs'];
async function visit(name){if(sources.has(name))return;sources.add(name);const data=await source(name);if(!/\.[cm]?[jt]sx?$/.test(name)||name.includes('/node_modules/'))return;const text=data.toString();
 const imports=[...text.matchAll(/(?:from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g)].map(x=>x[1]);
 const loaded=[...text.matchAll(/\.load\(['"]([^'"]+)['"]\)/g)].map(x=>x[1]);
 for(const item of [...imports.map(spec=>spec.startsWith('@/')?spec.slice(2):spec.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(name),spec)):null),...loaded]){
  if(!item||item.includes('/node_modules/')||item.startsWith('../'))continue;
  let target=null;for(const candidate of path.extname(item)?[item]:[item+'.ts',item+'.tsx',item+'.js',item+'.mjs']){try{await lstat(new URL(candidate,ROOT));target=candidate;break;}catch(error){if(error.code!=='ENOENT')throw error;}}
  assert.ok(target,'Referenced source missing '+item);await visit(target);
 }
}
for(const name of roots)await visit(name);
const hashes=async()=>Object.fromEntries(await Promise.all([...sources].sort().map(async name=>[name,await digest(name)])));
const before=await hashes(),startedAt=new Date().toISOString();
const groups=[{name:'bearerProvisioningHttpSql',file:'tests/bearer-member-provisioning.test.mjs',expected:19,log:'evidence/bearer-member-provisioning.log'},
 {name:'existingAccountSecurity',file:'tests/account-security.test.mjs',expected:37,log:'evidence/bearer-member-account-regressions.log'},
 {name:'identityMigration',file:'tests/account-identity-db.test.mjs',expected:12,log:'evidence/bearer-member-identity-regressions.log'}];
const results=await Promise.all(groups.map(async group=>{const args=['--require','./scripts/deny-build-network.cjs','--test',group.file];
 const result=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{cwd:WEB,env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin'},stdio:['ignore','pipe','pipe']});let output='';const timer=setTimeout(()=>child.kill('SIGKILL'),120000);child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('close',code=>{clearTimeout(timer);resolve({code,output});});});
 await writeFile(new URL(group.log,WEB),result.output);assert.equal(result.code,0,result.output.slice(-8000));assert.match(result.output,new RegExp('# tests '+group.expected+'\n'));assert.match(result.output,new RegExp('# pass '+group.expected+'\n'));assert.match(result.output,/# fail 0\n/);assert.match(result.output,/# skipped 0\n/);
 return{name:group.name,passed:group.expected,failed:0,skipped:0,command:[process.execPath,...args],log:{path:'verification/web/'+group.log,sha256:await digest('verification/web/'+group.log)}};
}));
const after=await hashes();assert.deepEqual(after,before,'Account proof inputs changed during execution');
const receipt={status:'PASS',startedAt,finishedAt:new Date().toISOString(),sourceCount:sources.size,total:68,tests:results,sourcesBefore:before,sourcesAfter:after,unchanged:true,
 scope:'Actual canonical ensure-member and member handlers, exact-token subject verifier, canonical private DTO and existing auth regressions; actual identity uniqueness draft over isolated PostgreSQL-compatible members table with server-role selects/inserts and browser table privilege denial.',
 limits:['Provider getUser, cookie sessions and nonissued bearer tokens are synthetic; no provider/account ownership or deployed acceptance claim.','PGlite uses a synthetic complete members schema and one backend. A deliberately interleaved competing insert proves unique-error recovery, not independent backend lock scheduling.','An injected wrong-row transport reply is rejected, but a dispatched insert may already have committed before an unavailable response.','Actual identity SQL is applied only to disposable local test databases; no production preflight, uniqueness migration, grants or records changed.','No native OS build, secure storage, network transport or device sign-in verification is implied.'],
 baseline:{path:'verification/web/evidence/bearer-member-provisioning-baseline.json',sha256:await digest('verification/web/evidence/bearer-member-provisioning-baseline.json')},environment:'PATH-only child environments, startup external-network denial, cached Node/TypeScript/PGlite'};
await writeFile(new URL('evidence/bearer-member-provisioning-tests.json',WEB),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:'PASS',tests:68,sourceCount:sources.size,unchanged:true}));
