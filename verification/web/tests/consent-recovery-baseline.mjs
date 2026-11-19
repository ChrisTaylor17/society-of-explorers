// Historical defect reproducer: actual consent handlers + disposable current
// consent/allowance SQL. This records the unsafe baseline, not passing release QA.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=name=>{const p=path.join(ROOT,name),s=fs.lstatSync(p);assert(s.isFile()&&!s.isSymbolicLink()&&(!s.size||s.blocks),name);return fs.readFileSync(p);};
const files=['verification/web/tests/consent-recovery-baseline.mjs','verification/web/tests/support/message-ai-app.mjs',
 'verification/web/tests/support/message-ai-db.mjs','verification/web/tests/support/message-ai-allowance-db.mjs',
 'verification/web/tests/support/offline-app.mjs','tests/security/fakes.ts',
 'app/api/circles/[circleId]/messages/[messageId]/ai-consent/route.ts','lib/circles/message-ai-consent.ts',
 'lib/circles/message-moderation-server.ts','lib/circles/moderation-server.ts','lib/http/routeError.ts',
 'app/circles/contributions/MessageAiConsent.tsx','lib/circles/useReviewAccess.ts'];
const hashes=Object.fromEntries(files.map(n=>[n,sha(read(n))]));
const result={status:'RUNNING',startedAt:new Date().toISOString(),scope:'Historical baseline defect reproduction using actual consent GET/POST handlers and actual disposable PGlite SQL. Server actor/PostgREST are synthetic. Held means dispatch is delayed before SQL, modelling an already sent request that can outlive client retirement. No provider calls, production writes, independent PostgreSQL sessions or browser behavior claimed.',sourceHashes:hashes,observations:[],providerCalls:0,cleanup:'pending'};
let f,ownedDatabase;
try {
 assert(process.execArgv.some(v=>v.endsWith('/deny-build-network.cjs')));
 process.chdir(path.join(ROOT,'verification/web'));
 const mod=await import('./support/message-ai-app.mjs');
 Object.assign(hashes,mod.MESSAGE_AI_SOURCE_HASHES);
 const dbModule=await import('./support/message-ai-allowance-db.mjs');
 ownedDatabase=await dbModule.createMessageAiAllowanceDb();
 // Consent needs no report. Supplying the existing fixture skips only the old
 // helper's unrelated report seed, whose current message-action API is400.
 f=await mod.messageAiApp({fixture:ownedDatabase,allowance:null});
 const url=f.messagePath+'/ai-consent';
 const get=async()=>{const r=await f.dispatch(url);assert.equal(r.status,200);return r.json();};
 const body=(s,allowed)=>({expectedConsentRevision:s.consentRevision,contentHash:s.contentHash,policy:s.policy,allowed});
 const post=async value=>{const r=await f.dispatch(url,'POST',value);return {status:r.status,body:await r.json()};};
 const initial=await get();assert.equal(initial.allowed,false);assert.equal(initial.consentRevision,0);
 // The older enable remains undispatched while a newer explicit false intent is
 // accepted and read back. Delivery then resumes with its original exact bytes.
 const oldEnable=body(initial,true),newRevoke=await post(body(initial,false)),checkedFalse=await get();
 assert.equal(newRevoke.status,200);assert.equal(newRevoke.body.consentRevision,0);assert.equal(checkedFalse.allowed,false);
 const lateEnable=await post(oldEnable),afterEnable=await get();
 assert.equal(lateEnable.status,200);assert.equal(afterEnable.allowed,true);assert.equal(afterEnable.consentRevision,1);
 result.observations.push({name:'newer accepted false intent fails to fence older enable',initial,newRevoke,checkedFalse,lateEnable,final:afterEnable});
 // Symmetric unchanged enable also fails to fence an older revoke.
 const oldRevoke=body(afterEnable,false),newEnable=await post(body(afterEnable,true)),checkedTrue=await get();
 assert.equal(newEnable.status,200);assert.equal(newEnable.body.consentRevision,1);assert.equal(checkedTrue.allowed,true);
 const lateRevoke=await post(oldRevoke),afterRevoke=await get();
 assert.equal(lateRevoke.status,200);assert.equal(afterRevoke.allowed,false);assert.equal(afterRevoke.consentRevision,2);
 result.observations.push({name:'newer accepted true intent fails to fence older revoke',newEnable,checkedTrue,lateRevoke,final:afterRevoke});
 assert.equal(f.providerCalls.length,0);
 for(const [name,h]of Object.entries(hashes))assert.equal(sha(read(name)),h,'Source changed: '+name);
 result.status='REPRODUCED';
}catch(error){result.status='FAILED';result.failure=error.stack||String(error);process.exitCode=1;}
finally{if(f)await f.close();if(ownedDatabase){await ownedDatabase.db.close();result.cleanup='closed';}result.completedAt=new Date().toISOString();fs.writeFileSync(path.join(ROOT,'verification/web/evidence/consent-recovery-baseline.json'),JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify({status:result.status,observations:result.observations.map(x=>x.name),providerCalls:result.providerCalls,cleanup:result.cleanup,failure:result.failure}));
