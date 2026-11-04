// Bounded server-only proof; component stories remain in their own receipts.
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=new URL('../../../',import.meta.url),web=new URL('../',import.meta.url);
const files=['lib/hall/public.ts','app/api/hall/route.ts','app/hall/page.tsx','lib/http/routeError.ts',
  ...['preflight','apply','rollback'].map(stage=>`docs/sql/artifact-containment-${stage}.sql`),
  'verification/web/tests/fixtures/hall-catalog-2026-11-04.json','verification/web/tests/fixtures/hall-catalog-supplement-2026-11-04.json',
  'verification/web/tests/support/artifact-containment-fixture.mjs','verification/web/tests/support/hall-http-fixture.mjs',
  'verification/web/tests/support/hall-db-http-fixture.mjs','verification/web/tests/hall-public.test.mjs','verification/web/tests/hall-public-db.test.mjs',
  'verification/web/scripts/deny-build-network.cjs','verification/web/scripts/verify-hall-public.mjs'];
const sources=async()=>Object.fromEntries(await Promise.all(files.map(async name=>[name,createHash('sha256').update(await readFile(new URL(name,root))).digest('hex')])));
const before=await sources(),startedAt=new Date().toISOString();
const command=['--require','./scripts/deny-build-network.cjs','--test','--test-reporter=tap','tests/hall-public.test.mjs','tests/hall-public-db.test.mjs'];
const child=spawn(process.execPath,command,{cwd:fileURLToPath(web),env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},stdio:['ignore','pipe','pipe']});
let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{output+=data.toString();process.stdout.write(data);});
const status=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
const after=await sources(),unchanged=JSON.stringify(before)===JSON.stringify(after);
const count=key=>Number(output.match(new RegExp(`^# ${key} (\\d+)$`,'m'))?.[1]??0);
const passed=status.code===0&&unchanged&&count('tests')===15&&count('pass')===15&&count('fail')===0;
const receipt={kind:'synthetic-local-Hall-server-proof',passed,startedAt,completedAt:new Date().toISOString(),status,
  tests:count('tests'),pass:count('pass'),fail:count('fail'),sourceUnchanged:unchanged,sourceHashesBefore:before,sourceHashesAfter:after,
  command:['env','-i','PATH=/opt/homebrew/bin:/usr/bin:/bin','HOME=/Users/christaylor',process.execPath,...command],
  scope:'Actual pure public contract and canonical GET handler. Five DB cases use the cached Supabase URL builder and narrow intercepted service-role SQL transport on the sanitized contained PGlite17.5 fixture; ten pure/HTTP cases cover text/publication/paging/filter/privacy/deadline/cancellation contracts. Timer callbacks are controlled at the actual5000ms scheduling boundary without real sleeps. Hall UI hash records release context only; component and composed browser proofs are separate receipts.',
  boundaries:'No production/provider/auth/media requests, issued credentials, downloads, real hosted PostgREST, full external schemas, rights approval, deployment or multibackend concurrency proof. Metadata/default/external dependency fidelity exceptions are declared by artifact-containment-fixture.mjs.'};
await writeFile(new URL('evidence/hall-public-server.tap',web),output);
await writeFile(new URL('evidence/hall-public-server.json',web),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({passed,tests:receipt.tests,pass:receipt.pass,fail:receipt.fail,sourceUnchanged:unchanged,receipt:'verification/web/evidence/hall-public-server.json'}));
if(!passed)process.exitCode=1;
