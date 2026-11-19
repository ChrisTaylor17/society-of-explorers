// Local source-bound full-document preparation evidence. No native/device claim.
import assert from 'node:assert/strict';
import {lstat,readFile,writeFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),web=fileURLToPath(new URL('../',import.meta.url));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function bytes(file){const s=await lstat(file);assert(s.isFile()&&!s.isSymbolicLink()&&(!s.size||s.blocks),'Refuse linked/offloaded source '+file);return readFile(file);}
await bytes(root+'verification/web/tests/support/source-reader-app.mjs');
const {sourceReaderAppHashes}=await import('../tests/support/source-reader-app.mjs');
const extra=['verification/web/scripts/verify-source-reader-backend.mjs','verification/web/scripts/deny-build-network.cjs','verification/web/tests/source-reader-backend.test.mjs','scripts/test-source-reader-generator.py','next.config.ts','eslint.config.mjs'];
async function hashes(){const result=await sourceReaderAppHashes();for(const n of extra)result[n]=digest(await bytes(root+n));return result;}
const before=await hashes(),guard=root+'verification/web/scripts/deny-build-network.cjs';
const env={PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor',PYTHONDONTWRITEBYTECODE:'1'};
const python='/usr/bin/python3';
const runtimePaths={node:await realpath(process.execPath),python:await realpath(python),typescript:'/Users/christaylor/Documents/Codex/2026-11-03/soe-supporter/runtime/web/node_modules/typescript/lib/typescript.js',eslint:'/Users/christaylor/Documents/Codex/2026-11-03/soe-supporter/runtime/web/node_modules/eslint/bin/eslint.js'};
const runtimes={};for(const[name,path]of Object.entries(runtimePaths))runtimes[name]={path,sha256:digest(await bytes(path))};
const groups=[
 {name:'source-reader-backend',exe:process.execPath,cwd:web,args:['--require',guard,'--test','tests/source-reader-backend.test.mjs'],expected:36},
 {name:'source-reader-generator',exe:python,cwd:root,args:['scripts/generate-source-reader.py','--check']},
 {name:'source-reader-generator-tests',exe:python,cwd:root,args:['scripts/test-source-reader-generator.py'],expected:5,python:true},
 {name:'source-reader-backend-lint',exe:process.execPath,cwd:root,args:['--require',guard,runtimePaths.eslint,'lib/books/source-reader.ts','lib/books/source-reader-server.ts','app/api/great-books/edition/[bookId]/reader/route.ts','verification/web/tests/source-reader-backend.test.mjs','verification/web/tests/support/source-reader-app.mjs','verification/web/scripts/verify-source-reader-backend.mjs']}
];
const checks=[];
for(const g of groups){const r=spawnSync(g.exe,g.args,{cwd:g.cwd,env,encoding:'utf8',timeout:120000,maxBuffer:8_000_000});const output=(r.stdout??'')+(r.stderr??'');const log='verification/web/evidence/'+g.name+'.log';await writeFile(root+log,output);
 const passed=g.python?Number(output.match(/Ran (\d+) tests?/)?.[1]??0):Number(output.match(/^# pass (\d+)$/m)?.[1]??0);const ok=r.status===0&&(!g.expected||passed===g.expected);
 checks.push({name:g.name,ok,exitCode:r.status,expectedTests:g.expected??null,passedTests:g.expected?passed:null,cwd:g.cwd,command:[g.exe,...g.args],log,logSha256:digest(Buffer.from(output))});console.log(g.name,ok?'PASS':'FAIL',g.expected?`${passed}/${g.expected}`:'');
}
const after=await hashes(),sourceUnchanged=JSON.stringify(before)===JSON.stringify(after);
const receipt={status:checks.every(c=>c.ok)&&sourceUnchanged?'PASS':'FAIL',verifiedAt:new Date().toISOString(),sourceUnchanged,nodeVersion:process.version,checks,runtimes,sourceHashes:after,
 limits:['Original source editions are unchanged. The separately pinned derivative adds only a viewport meta and missing indexed-element ids.','Actual document/image handlers and312 resident raster assets execute locally; no network, provider, database, installation or deployment.','Structural/layout fidelity in browser engines and native WebView/WKWebView behavior require their separate proofs. This receipt is not device acceptance.']};
await writeFile(root+'verification/web/evidence/source-reader-backend.json',JSON.stringify(receipt,null,2)+'\n');if(receipt.status!=='PASS')process.exitCode=1;
