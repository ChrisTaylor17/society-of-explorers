// Current canonical native identity and listing reviewer SQL/HTTP. All accounts,
// reports and delivery ports are synthetic; no provider or production is used.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {contributionSource} from './member-contributions-app.mjs';
await contributionSource('verification/web/tests/support/native-reviewer-app.mjs');
const {nativeReviewerApp,nativeReviewerSourceHashes}=await import('./native-reviewer-app.mjs');
const ROOT=fileURLToPath(new URL('../../../../',import.meta.url));
export const LISTING_RECEIPT_SQL='docs/sql/circle-listing-review-receipt-apply.sql';
const ROUTES=['app/api/admin/circles/reports/route.ts','app/api/admin/circles/reports/[circleId]/route.ts','app/api/admin/circles/reports/[circleId]/coverage/route.ts','app/api/admin/circles/reports/[circleId]/coverage/decision/route.ts'];
export async function nativeCircleReviewerSourceHashes(){
 const hashes={...await nativeReviewerSourceHashes()},seen=new Set();
 async function bind(name){
  if(seen.has(name))return;seen.add(name);const bytes=await contributionSource(name);hashes[name]=createHash('sha256').update(bytes).digest('hex');
  if(!/\.(?:ts|tsx)$/.test(name))return;
  for(const match of bytes.toString().matchAll(/(?:import|export)\s[^;]*?\sfrom\s*['"]([^'"]+)['"]/g)){
   const spec=match[1];if(['@/lib/getAuthenticatedMember','@/lib/supabase/admin'].includes(spec))continue;
   if(!spec.startsWith('.')&&!spec.startsWith('@/'))continue;
   const target=spec.startsWith('@/')?spec.slice(2):path.posix.normalize(path.posix.join(path.posix.dirname(name),spec));
   const next=/\.(?:ts|tsx|json)$/.test(target)?target:['.ts','.tsx','.json'].map(ext=>target+ext).find(n=>existsSync(path.join(ROOT,n)));
   assert(next,'Missing listing dependency '+target);await bind(next);
  }
 }
 for(const name of [...ROUTES,LISTING_RECEIPT_SQL,'verification/web/tests/support/native-circle-reviewer-app.mjs'])await bind(name);
 return hashes;
}
export async function nativeCircleReviewerApp({reportCount=101}={}){
 assert(Number.isSafeInteger(reportCount)&&reportCount>=0&&reportCount<=10000);
 await nativeCircleReviewerSourceHashes();const f=await nativeReviewerApp({reportCount:0});
 try{
  await f.db.exec((await contributionSource(LISTING_RECEIPT_SQL)).toString('utf8'));
  const circleTitle='Assigned native listing review',description='Synthetic listing description about discussing ideas without personal attacks.';
  const secondCircleId=randomUUID(),secondCircleTitle='Second assigned listing review';
  await f.db.query('UPDATE book_cohorts SET title=$2,description=$3 WHERE id=$1',[f.circleId,circleTitle,description]);
  // Direct synthetic seeding avoids unrelated hosting limits. Every review,
  // assignment, report-coverage and decision operation still uses actual SQL.
  await f.db.query("INSERT INTO book_cohorts SELECT (jsonb_populate_record(NULL::book_cohorts,to_jsonb(c)||jsonb_build_object('id',$1::text,'title',$2::text))).* FROM book_cohorts c WHERE id=$3",[secondCircleId,secondCircleTitle,f.circleId]);
  await f.db.query('INSERT INTO circle_reviewer_grants(cohort_id,member_id) VALUES($1,$2)',[secondCircleId,f.authorId]);
  async function addListingReports(circleId,count){
   assert([f.circleId,secondCircleId].includes(circleId));assert(Number.isSafeInteger(count)&&count>=0&&count<=10000);
   await f.db.query("INSERT INTO circle_reports(cohort_id,reason,note,reporter_key,created_at) SELECT $1,'safety','PRIVATE_NATIVE_LISTING_REPORT '||n,md5($3||n::text),'2026-11-05T13:00:00Z' FROM generate_series(1,$2::integer)n",[circleId,count,randomUUID()]);
  }
  await addListingReports(f.circleId,reportCount);await addListingReports(secondCircleId,1);
  async function counts(circleId=f.circleId){
   assert([f.circleId,secondCircleId].includes(circleId));
   const reports=await f.db.query("SELECT count(*)::int total,count(*) FILTER(WHERE status='open')::int open FROM circle_reports WHERE cohort_id=$1",[circleId]);
   const decisions=await f.db.query('SELECT count(*)::int n FROM circle_review_decisions WHERE cohort_id=$1',[circleId]);
   return{...reports.rows[0],decisions:decisions.rows[0].n};
  }
  return{...f,circleTitle,description,secondCircleId,secondCircleTitle,addListingReports,counts};
 }catch(error){await f.close();throw error;}
}
