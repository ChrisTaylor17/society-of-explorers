import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sourceManifest, helperSource } from '../tests/support/prompt-atlas-core-db.mjs';

const root = new URL('../../../',import.meta.url);
const guard = fileURLToPath(new URL('verification/web/scripts/deny-build-network.cjs',root));
assert.ok(process.execArgv.some(value=>value.endsWith('/deny-build-network.cjs')),'Launch this driver with the startup network guard.');
const testPath = 'verification/web/tests/prompt-atlas-core-compatibility-db.test.mjs';
const tracked = [testPath,'verification/web/tests/support/prompt-atlas-core-db.mjs',
  'verification/web/tests/fixtures/prompt-member-dependency-digests-2026-11-04.json',
  'verification/web/scripts/test-prompt-atlas-core.mjs',
  'verification/web/scripts/deny-build-network.cjs',
  ...Object.values(sourceManifest).map(source=>source.path)];
const sha256 = bytes=>createHash('sha256').update(bytes).digest('hex');
const inputs = Object.fromEntries(await Promise.all(tracked.map(async path=>[path,sha256(await readFile(new URL(path,root)))])));
const startedAt = new Date().toISOString();
const command = [process.execPath,'--require',guard,'--test','--test-concurrency=1',testPath];
const child=spawn(command[0],command.slice(1),{
  cwd:fileURLToPath(root),env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},stdio:['ignore','pipe','pipe'],
});
let output='',timedOut=false,spawnError;
child.stdout.on('data',chunk=>{output+=chunk;process.stdout.write(chunk);});
child.stderr.on('data',chunk=>{output+=chunk;process.stderr.write(chunk);});
child.once('error',error=>{spawnError=error.message;});
let hardKill;
const deadline=setTimeout(()=>{
  timedOut=true;child.kill('SIGTERM');
  hardKill=setTimeout(()=>child.kill('SIGKILL'),3000);hardKill.unref();
},120000);deadline.unref();
const completion=await new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
clearTimeout(deadline);clearTimeout(hardKill);
const diagnostics=output.match(/^# PROMPT_ATLAS_CATALOG (.+)$/m);
const changed=[];
for(const path of tracked)if(sha256(await readFile(new URL(path,root)))!==inputs[path])changed.push(path);
const count=name=>Number(output.match(new RegExp('^# '+name+' (\\d+)$','m'))?.[1]??0);
const passed=completion.code===0&&!timedOut&&!spawnError&&changed.length===0&&count('tests')===11&&count('pass')===11&&count('fail')===0&&!!diagnostics;
const receipt={version:1,kind:'Synthetic local PGlite execution of complete unchanged Prompt Atlas migration plus actual member identity/core containment SQL.',
  result:passed?'PASS':'FAIL',startedAt,completedAt:new Date().toISOString(),command,
  runtime:process.version,startupNetworkGuard:true,cleanChildEnvironment:true,
  sourceManifest,helperSource,inputs,changedInputs:changed,
  tests:{total:count('tests'),passed:count('pass'),failed:count('fail')},
  completion,timedOut,spawnError:spawnError??null,
  catalogComparison:diagnostics?JSON.parse(diagnostics[1]):null,
  limitations:[
    'Minimal seven-table schema and legacy permissive member policy are synthetic prerequisites, not recovered production DDL.',
    'auth.uid() uses a test-controlled subject setting; no JWT, session, provider, wallet, device or hosted-role validation.',
    'Explicit fixture base-table CRUD and service-view SELECT grants are not live ACL equivalence.',
    'Leaderboard browser counts follow caller RLS and are not global favorite/vote totals.',
    'No production execution, hosted load, arbitrary external caller inventory, concurrent migration proof, or access approval.',
  ],
};
await mkdir(new URL('verification/web/evidence/',root),{recursive:true});
await writeFile(new URL('verification/web/evidence/prompt-atlas-core-compatibility.log',root),output);
await writeFile(new URL('verification/web/evidence/prompt-atlas-core-compatibility.json',root),JSON.stringify(receipt,null,2)+'\n');
if(!passed)process.exitCode=1;
