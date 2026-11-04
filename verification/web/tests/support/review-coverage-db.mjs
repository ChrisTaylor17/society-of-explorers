// Actual coverage migration over current strict Circle/consent/inactive-allowance chain.
import assert from 'node:assert/strict';
import {lstat,stat,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const ROOT=new URL('../../../../',import.meta.url);
export const COVERAGE_SQL='docs/sql/circle-review-coverage.sql';
export async function coverageSource(name=COVERAGE_SQL){
 const f=new URL(name,ROOT),link=await lstat(f),info=await stat(f);
 assert.equal(link.isSymbolicLink(),false,'Refuse coverage source symlink');
 assert.ok(!info.size||info.blocks,'Refuse coverage source placeholder');return readFile(f);
}
await coverageSource('verification/web/tests/support/message-ai-allowance-db.mjs');
const base=await import('./message-ai-allowance-db.mjs');
export const {IDS,rpc,asRole,requestId,CONTENT,POLICY,snapshotLegacyRows}=base;
export const COVERAGE_SOURCE_HASHES=Object.freeze({...base.ALLOWANCE_SOURCE_HASHES,
 'verification/web/tests/support/message-ai-db.mjs':createHash('sha256').update(await coverageSource('verification/web/tests/support/message-ai-db.mjs')).digest('hex'),
 [COVERAGE_SQL]:createHash('sha256').update(await coverageSource()).digest('hex'),
 'verification/web/tests/support/review-coverage-db.mjs':createHash('sha256').update(await coverageSource('verification/web/tests/support/review-coverage-db.mjs')).digest('hex')});
export const COVERAGE_FIXTURE_LIMITS=Object.freeze({...base.ALLOWANCE_FIXTURE_LIMITS,
 coverage:'Synthetic report rows with tied timestamps; bounded actual SQL pages/CAS/rollback, not evidence of human comprehension or independent backend lock scheduling.'});
export async function applyCoverage(db){try{return await db.exec((await coverageSource()).toString('utf8'));}catch(error){await db.exec('ROLLBACK');throw error;}}
export async function seedCoverageReports(f,{kind='both',count=101}={}){
 assert.ok(Number.isInteger(count)&&count>=0&&count<=10000);
 if(kind==='both'||kind==='listing')await f.db.query(`INSERT INTO circle_reports(cohort_id,reason,note,reporter_key,created_at)
 SELECT $1,'safety','PRIVATE earlier listing evidence '||n,lpad(n::text,32,'0'),'2026-11-04T12:00:00Z' FROM generate_series(1,$2::integer)n`,[f.circleId,count]);
 if(kind==='both'||kind==='message')await f.db.query(`INSERT INTO circle_message_reports(cohort_id,message_id,reporter_member_id,reason,note,created_at)
 SELECT $1,$2,$3,'safety','PRIVATE earlier message evidence '||n,'2026-11-04T12:00:00Z' FROM generate_series(1,$4::integer)n`,[f.circleId,f.messageId,IDS.host,count]);
}
export async function createReviewCoverageDb({reportCount=101,install=true}={}){
 const f=await base.createMessageAiAllowanceDb();try{
  if(install)await applyCoverage(f.db);await seedCoverageReports(f,{count:reportCount});
  f.evidence={listing:(await f.db.query('SELECT id,note FROM circle_reports WHERE cohort_id=$1 ORDER BY created_at,id LIMIT 1',[f.circleId])).rows[0]??null,
   message:(await f.db.query('SELECT id,note FROM circle_message_reports WHERE message_id=$1 ORDER BY created_at,id LIMIT 1',[f.messageId])).rows[0]??null};
  return f;
 }catch(error){await f.db.close();throw error;}
}
export const mid=(f,kind)=>kind==='message'?f.messageId:null;
export async function coverageStart(f,kind='listing',actor=IDS.reviewer){
 const d=await rpc(f.db,kind==='message'?'soe_circle_message_review_detail':'soe_circle_review_detail',kind==='message'?[actor,f.circleId,f.messageId]:[actor,f.circleId]);
 return rpc(f.db,'soe_circle_review_coverage_start',[actor,f.circleId,mid(f,kind),d.revision,d.contentHash??null]);
}
export const coveragePage=(f,p,pageNumber=null,actor=IDS.reviewer)=>rpc(f.db,'soe_circle_review_coverage_page',[actor,f.circleId,p.messageId,p.sessionId,pageNumber]);
export const coverageAck=(f,p,actor=IDS.reviewer)=>rpc(f.db,'soe_circle_review_coverage_ack',[actor,f.circleId,p.messageId,p.sessionId,p.pageToken]);
export async function completeCoverage(f,kind='listing',actor=IDS.reviewer){let p=await coverageStart(f,kind,actor);while(!p.complete)p=await coverageAck(f,p,actor);return p;}
export const coverageDecide=(f,p,{actor=IDS.reviewer,request=requestId(),action='restore',reason='no_violation',summary='The complete evidence does not establish a conduct violation.',evidenceId=null,excerpt=null,sessionId=p.sessionId}={})=>rpc(f.db,'soe_circle_review_coverage_decide',[actor,f.circleId,p.messageId,sessionId,p.revision,p.contentHash,request,action,reason,summary,evidenceId,excerpt]);
