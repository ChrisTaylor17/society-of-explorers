// Current canonical native-account identity plus real reviewer SQL/HTTP contracts.
// Authentication delivery, reviewer actor resolution and PostgREST are explicit
// doubles. No provider allowance is activated and no live account is used.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {contributionSource} from './member-contributions-app.mjs';
for(const name of ['current-message-ai-consent-app.mjs','review-coverage-app.mjs'])await contributionSource('verification/web/tests/support/'+name);
const {currentMessageAiApp,currentConsentSourceHashes}=await import('./current-message-ai-consent-app.mjs');
const {reviewCoverageApp}=await import('./review-coverage-app.mjs');
const ROOT=fileURLToPath(new URL('../../../../',import.meta.url));
const ROUTES=['app/api/admin/circles/messages/route.ts','app/api/admin/circles/[circleId]/messages/[messageId]/route.ts','app/api/admin/circles/[circleId]/messages/[messageId]/coverage/route.ts','app/api/admin/circles/[circleId]/messages/[messageId]/coverage/decision/route.ts','app/api/admin/circles/[circleId]/messages/[messageId]/advice/route.ts'];
export async function nativeReviewerSourceHashes(){
 const hashes={...await currentConsentSourceHashes()},seen=new Set();
 async function bind(name){
  if(seen.has(name))return;seen.add(name);const bytes=await contributionSource(name);hashes[name]=createHash('sha256').update(bytes).digest('hex');
  if(!/\.(?:ts|tsx)$/.test(name))return;
  for(const match of bytes.toString().matchAll(/(?:import|export)\s[^;]*?\sfrom\s*['"]([^'"]+)['"]/g)){
   const spec=match[1];if(['@/lib/getAuthenticatedMember','@/lib/supabase/admin','@/lib/circles/message-ai-provider'].includes(spec))continue;
   if(!spec.startsWith('.')&&!spec.startsWith('@/'))continue;
   const target=spec.startsWith('@/')?spec.slice(2):path.posix.normalize(path.posix.join(path.posix.dirname(name),spec));
   const next=/\.(?:ts|tsx|json)$/.test(target)?target:['.ts','.tsx','.json'].map(ext=>target+ext).find(n=>existsSync(path.join(ROOT,n)));
   assert(next,'Missing reviewer dependency '+target);await bind(next);
  }
 }
 for(const name of [...ROUTES,'verification/web/tests/support/native-reviewer-app.mjs','verification/web/tests/support/review-coverage-app.mjs'])await bind(name);
 return hashes;
}
export async function nativeReviewerApp({reportCount=101}={}){
 assert(Number.isSafeInteger(reportCount)&&reportCount>=0&&reportCount<=10000);
 await nativeReviewerSourceHashes();const f=await currentMessageAiApp({allowance:null});let coverage;
 try{
  f.setAvailable(false);
  const circleId=await f.seedCircle({title:'Assigned native review Circle',reading:false});
  // The normal native account is an author elsewhere, but has no participation,
  // authorship, hosting or reporter conflict in this separate assigned Circle.
  await f.db.query('INSERT INTO circle_reviewer_grants(cohort_id,member_id) VALUES($1,$2)',[circleId,f.authorId]);
  const message=await f.post({circleId,who:'other',content:'Synthetic assigned review message about an idea without personal attacks.'});
  const second=await f.post({circleId,who:'other',content:'A second synthetic assigned message for stale case actions.'});
  async function addReports(messageId,count){
   assert(Number.isSafeInteger(count)&&count>=0&&count<=10000);
   await f.db.query("INSERT INTO circle_message_reports(cohort_id,message_id,reporter_member_id,reason,note,created_at) SELECT $1,$2,$3,'safety','PRIVATE_NATIVE_REVIEW_REPORT '||n,'2026-11-05T12:00:00Z' FROM generate_series(1,$4::integer)n",[circleId,messageId,f.actors.outsider,count]);
  }
  await addReports(message.id,reportCount);await addReports(second.id,1);
  const evidence=(await f.db.query('SELECT id,note FROM circle_message_reports WHERE message_id=$1 ORDER BY created_at,id LIMIT 1',[message.id])).rows[0]??null;
  coverage=await reviewCoverageApp({fixture:{...f,circleId,messageId:message.id,reviewerId:f.authorId,evidence:{message:evidence}}});
  coverage.setActor(f.authorId);f.setActor(f.authorId);
  const advice=f.app.load('app/api/admin/circles/[circleId]/messages/[messageId]/advice/route.ts');
  async function dispatch(target,method='GET',body){
   const url=new URL(target,'https://review-coverage-fixture.test');
   const m=/^\/api\/admin\/circles\/([^/]+)\/messages\/([^/]+)\/advice$/.exec(url.pathname);
   if(!m)return coverage.dispatch(target,method,body);
   assert.equal(method,'POST');return advice.POST(new Request(url,{method,headers:{origin:url.origin,'content-type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)}),{params:Promise.resolve({circleId:m[1],messageId:m[2]})});
  }
  return{...f,circleId,messageId:message.id,secondMessageId:second.id,reviewerId:f.authorId,messageContent:message.content,secondContent:second.content,coverage,dispatch,addReports,
   setActor(value){coverage.setActor(value);f.setActor(value);},
   async close(){await coverage.close();await f.close();}};
 }catch(error){await coverage?.close();await f.close();throw error;}
}
