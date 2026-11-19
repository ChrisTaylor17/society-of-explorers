// Runs only the separate live-catalog rehearsal; never connects to a database.
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CIRCLE_SQL_CHAIN, LIVE_CATALOG_SHA256, LIVE_FIXTURE_EXCEPTIONS } from '../tests/support/circle-live-db.mjs';

const root=new URL('../../../',import.meta.url), web=new URL('../',import.meta.url);
const paths=[
  'docs/sql/circle-legacy-baseline-preflight.sql',
  'docs/sql/circle-legacy-baseline-apply.sql',
  'docs/sql/circle-legacy-baseline-rollback.sql',
  ...CIRCLE_SQL_CHAIN,
  'verification/web/tests/fixtures/circle-live-catalog-2026-11-04.json',
  'verification/web/tests/support/circle-live-db.mjs',
  'verification/web/tests/circle-live-chain-db.test.mjs',
  'verification/web/scripts/deny-build-network.cjs',
  'verification/web/scripts/verify-circle-live-chain.mjs',
];
const hashSources=async()=>Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(await readFile(new URL(path,root))).digest('hex')])));
const before=await hashSources(),started=new Date().toISOString();
const command=['--require','./scripts/deny-build-network.cjs','--test','--test-reporter=tap','tests/circle-live-chain-db.test.mjs'];
const child=spawn(process.execPath,command,{cwd:fileURLToPath(web),env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},stdio:['ignore','pipe','pipe']});
let output='';
for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{const text=data.toString();output+=text;process.stdout.write(text);});
const status=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
const after=await hashSources(),unchanged=JSON.stringify(before)===JSON.stringify(after);
const count=label=>Number(output.match(new RegExp(`^# ${label} (\\d+)$`,'m'))?.[1]??0);
const passed=status.code===0 && unchanged && count('tests')===8 && count('pass')===8 && count('fail')===0;
const receipt={
  kind:'synthetic-local-catalog-rehearsal',startedAt:started,completedAt:new Date().toISOString(),
  passed,status,tests:count('tests'),pass:count('pass'),fail:count('fail'),sourceUnchanged:unchanged,
  catalogSHA256:LIVE_CATALOG_SHA256,fixtureExceptions:LIVE_FIXTURE_EXCEPTIONS,
  runtime:{node:process.version,postgres:'PGlite cached runtime PostgreSQL17.5; one local backend'},
  command:['env','-i','PATH=/opt/homebrew/bin:/usr/bin:/bin','HOME=/Users/christaylor',process.execPath,...command],
  coverage:[
    'Saved metadata comparison with declared synthetic exceptions and normalized internal trigger OIDs',
    'Actual baseline preflight/apply followed by all nine canonical Circle SQL files',
    'Original rows, sender fields, nullable/no-action FK behavior and defaults preserved',
    'Service create/join/RSVP/post/reply/read/report/review/withdraw/leave/complete/discover and pinned passage post',
    'Raw browser table/column/RPC/TRUNCATE denial and all eight table privilege checks including MAINTAIN',
    'Broad new-object default grants retained; accidental SELECT regrant remains default-denied by RLS',
    'Strict preflight column-grant drift, object collision atomicity and later-DDL rollback refusal',
  ],
  boundaries:[
    'No production/provider calls, live SQL, credentials, user rows or downloads',
    'Synthetic minimal members and incoming book_reflections dependency; not a complete hosted schema restore',
    'Redacted weekly schedule default is synthetic; original MD5 retained, original literal never executed',
    'No hosted PostgREST, real identity verification, realtime, device acceptance or multi-backend concurrency proof',
    'Ordinary salon HTTP/RPC and owner profile prerequisite are separate acceptance suites',
  ],sourceHashesBefore:before,sourceHashesAfter:after,
};
await writeFile(new URL('evidence/circle-live-chain.tap',web),output);
await writeFile(new URL('evidence/circle-live-chain.json',web),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({receipt:'verification/web/evidence/circle-live-chain.json',passed,tests:receipt.tests,pass:receipt.pass,fail:receipt.fail,sourceUnchanged:unchanged}));
if(!passed)process.exitCode=1;
