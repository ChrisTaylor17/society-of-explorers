// Actual additive allowance SQL over the unchanged strict consent fixture.
// All activation is explicit owner-only synthetic setup; no provider or user data.
import assert from 'node:assert/strict';
import {stat,lstat,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const ROOT=new URL('../../../../',import.meta.url);
export const ALLOWANCE_SQL='docs/sql/circle-message-ai-allowance.sql';
export async function allowanceSource(name=ALLOWANCE_SQL){
 const file=new URL(name,ROOT),link=await lstat(file),info=await stat(file);
 assert.equal(link.isSymbolicLink(),false,'Refuse allowance source symlink');
 assert.ok(!info.size||info.blocks,'Refuse allowance source placeholder');return readFile(file);
}
await allowanceSource('verification/web/tests/support/message-ai-db.mjs');
const consent=await import('./message-ai-db.mjs');
export const {IDS,rpc,asRole,requestId,POLICY,CONTENT,snapshotLegacyRows}=consent;
export const ALLOWANCE_SOURCE_HASHES=Object.freeze({...consent.MESSAGE_AI_SOURCE_HASHES,
 [ALLOWANCE_SQL]:createHash('sha256').update(await allowanceSource()).digest('hex'),
 'verification/web/tests/support/message-ai-allowance-db.mjs':createHash('sha256').update(await allowanceSource('verification/web/tests/support/message-ai-allowance-db.mjs')).digest('hex')});
export const ALLOWANCE_FIXTURE_LIMITS=Object.freeze({...consent.MESSAGE_AI_FIXTURE_LIMITS,
 allowance:'Explicit synthetic owner activation, request counts only; no provider/account price or dollar-spend acceptance. PGlite has one backend; concurrent lock scheduling needs independent PostgreSQL sessions.'});
export async function applyAllowance(db){try{return await db.exec((await allowanceSource()).toString('utf8'));}catch(error){await db.exec('ROLLBACK');throw error;}}
export async function createMessageAiAllowanceDb({install=true}={}){
 const f=await consent.createMessageAiDb();try{if(install)await applyAllowance(f.db);return f;}catch(error){await f.db.close();throw error;}
}
export async function activateAllowance(db,{globalLimit=5,reviewerLimit=2,startOffsetSeconds=-1,endOffsetSeconds=60}={}){
 await db.query(`UPDATE public.circle_message_ai_allowance SET enabled=true,
  starts_at=clock_timestamp()+$1::double precision*interval '1 second',
  ends_at=clock_timestamp()+$2::double precision*interval '1 second',global_limit=$3,per_reviewer_limit=$4
  WHERE singleton=1`,[startOffsetSeconds,endOffsetSeconds,globalLimit,reviewerLimit]);
}
export async function enableConsent(f){
 const state=await rpc(f.db,'soe_circle_message_ai_consent_state',[f.authorId,f.circleId,f.messageId]);
 return rpc(f.db,'soe_circle_message_ai_consent_set',[f.authorId,f.circleId,f.messageId,state.consentRevision,state.contentHash,POLICY,true]);
}
export const adviceSnapshot=(f,actor=IDS.reviewer)=>rpc(f.db,'soe_circle_message_ai_snapshot',[actor,f.circleId,f.messageId]);
export async function reserveAllowance(f,{actor=IDS.reviewer,attemptId=requestId(),snapshot,revision,hash,consentRevision,policy=POLICY}={}){
 snapshot??=await adviceSnapshot(f,actor);
 return rpc(f.db,'soe_circle_message_ai_reserve',[actor,f.circleId,f.messageId,attemptId,
  revision??snapshot.revision,hash??snapshot.contentHash,consentRevision??snapshot.consentRevision,policy]);
}
