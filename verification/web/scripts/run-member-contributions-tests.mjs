// Actual account-level own history and safety controller -> canonical HTTP/SQL.
import assert from 'node:assert/strict';
import {lstat,stat,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=new URL('../../../',import.meta.url),WEB=new URL('verification/web/',ROOT);
async function source(name){const file=new URL(name,ROOT),link=await lstat(file),info=await stat(file);assert.equal(link.isSymbolicLink(),false,'Refuse linked source '+name);assert.ok(info.isFile()&&(!info.size||info.blocks),'Refuse offloaded source '+name);return readFile(file);}
async function digest(name){return createHash('sha256').update(await source(name)).digest('hex');}
process.chdir(fileURLToPath(WEB));await source('verification/web/tests/support/member-contributions-app.mjs');
const {CONTRIBUTION_APP_SOURCES,COVERAGE_SOURCE_HASHES,COVERAGE_FIXTURE_LIMITS}=await import('../tests/support/member-contributions-app.mjs');
const sources=new Set(),roots=[...CONTRIBUTION_APP_SOURCES,...Object.keys(COVERAGE_SOURCE_HASHES),'platforms/shared/member-contributions.ts','platforms/shared/message-safety.ts','platforms/tests/load-source.mjs','platforms/tests/member-contributions.test.mjs',
 'verification/web/tests/member-contributions-integration.test.mjs','verification/web/scripts/deny-build-network.cjs','verification/web/scripts/run-member-contributions-tests.mjs'];
async function visit(name){if(sources.has(name))return;sources.add(name);const data=await source(name);if(!/\.[cm]?[jt]sx?$/.test(name)||name.includes('/node_modules/'))return;const text=data.toString();
 const imports=[...text.matchAll(/(?:from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g)].map(x=>x[1]);const loaded=[...text.matchAll(/(?:\.load|\bload)\(['"]([^'"]+)['"]\)/g)].map(x=>x[1]);
 for(const item of [...imports.map(spec=>spec.startsWith('@/')?spec.slice(2):spec.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(name),spec)):null),...loaded]){
  if(!item||item.includes('/node_modules/')||item.startsWith('../'))continue;let target=null;for(const candidate of path.extname(item)?[item]:[item+'.ts',item+'.tsx',item+'.js',item+'.mjs']){try{await lstat(new URL(candidate,ROOT));target=candidate;break;}catch(error){if(error.code!=='ENOENT')throw error;}}assert.ok(target,'Referenced source missing '+item);await visit(target);
 }
}
for(const name of roots)await visit(name);
const hashes=async()=>Object.fromEntries(await Promise.all([...sources].sort().map(async name=>[name,await digest(name)])));
const before=await hashes(),startedAt=new Date().toISOString(),groups=[{name:'controller',cwd:ROOT,args:['--require','./verification/web/scripts/deny-build-network.cjs','--test','platforms/tests/member-contributions.test.mjs'],expected:9,log:'verification/web/evidence/member-contributions-unit.log'},
 {name:'actualHttpSql',cwd:WEB,args:['--require','./scripts/deny-build-network.cjs','--test','tests/member-contributions-integration.test.mjs'],expected:20,log:'verification/web/evidence/member-contributions-integration.log'}];
const results=await Promise.all(groups.map(async group=>{
 const result=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,group.args,{cwd:group.cwd,env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin'},stdio:['ignore','pipe','pipe']});let output='';const timer=setTimeout(()=>child.kill('SIGKILL'),120000);child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('close',code=>{clearTimeout(timer);resolve({code,output});});});
 await writeFile(new URL(group.log,ROOT),result.output);assert.equal(result.code,0,result.output.slice(-8000));assert.match(result.output,new RegExp('# tests '+group.expected+'\n'));assert.match(result.output,new RegExp('# pass '+group.expected+'\n'));assert.match(result.output,/# fail 0\n/);assert.match(result.output,/# skipped 0\n/);return{name:group.name,passed:group.expected,failed:0,skipped:0,command:[process.execPath,...group.args],log:{path:group.log,sha256:await digest(group.log)}};
}));
const after=await hashes();assert.deepEqual(after,before,'Contribution proof inputs changed during execution');
const receipt={status:'PASS',startedAt,finishedAt:new Date().toISOString(),sourceCount:sources.size,total:29,tests:results,sourcesBefore:before,sourcesAfter:after,unchanged:true,fixtureLimits:COVERAGE_FIXTURE_LIMITS,
 scope:'Actual member-contributions controller and dynamic message-safety child compose with canonical own-contributions/member/message handlers over the current strict Circle SQL chain. Cross-Circle author discovery after actual leave/quarantine, 106-message replacement pagination, ownership, fresh permissions, exact uncertain withdrawal replay and private-note exclusion execute locally.',
 limits:['Synthetic actors, nonissued bearer, transport, lifecycle and secure UUID supplier; no real provider, SDK, native OS or device acceptance.','Single PGlite backend with tracked sanitized catalog plus explicitly synthetic prerequisites. No hosted restore or multi-backend lock scheduling claim.','Withdrawal removes member visibility while restricted original evidence remains. Current-state GET never proves withdrawal receipt; only exact manual POST replay does.','Dispatched actions may commit after local retirement; retirement prevents private local-state restoration and automatic retry.','No server/SQL product changes, migrations, credentials, downloads, deployment or paid services.'],environment:'PATH-only child environments, startup external-network denial, cached Node/TypeScript/PGlite'};
await writeFile(new URL('evidence/member-contributions-tests.json',WEB),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:'PASS',tests:29,sourceCount:sources.size,unchanged:true}));
