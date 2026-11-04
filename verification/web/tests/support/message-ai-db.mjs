// Synthetic local consent fixture. No provider, user rows, token or live database.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,stat,lstat} from 'node:fs/promises';
const ROOT=new URL('../../../../',import.meta.url);
export const MIGRATION='docs/sql/circle-message-ai-consent.sql';
export const POLICY='anthropic-message-review-v1';
export const CONTENT='Synthetic disagreement with an idea, without a personal attack.';
export const MESSAGE_AI_SQL_CHAIN=Object.freeze([
 'docs/sql/circle-legacy-baseline-preflight.sql','docs/sql/circle-legacy-baseline-apply.sql',
 'supabase/migrations/20261027_soe_circles.sql','docs/sql/circle-moderation.sql',
 'docs/sql/circle-message-moderation.sql','docs/sql/circle-participation.sql',
 'docs/sql/circle-reading-programs.sql','docs/sql/circle-passage-posts.sql',
 'docs/sql/circle-discussion-threads.sql','docs/sql/circle-discovery-unicode.sql',
 'docs/sql/circle-discovery-search.sql',MIGRATION,
]);
export async function materializedMessageAiSource(path){
 const file=new URL(path,ROOT),link=await lstat(file),info=await stat(file);
 assert.equal(link.isSymbolicLink(),false,'Refuse source symlink '+path);
 assert.ok(!info.size||info.blocks,'Refuse source placeholder '+path);
 return readFile(file);
}
const sources=[
 'verification/web/tests/support/circle-live-db.mjs',
 'verification/web/tests/fixtures/circle-live-catalog-2026-11-04.json',
 ...MESSAGE_AI_SQL_CHAIN,
];
export const MESSAGE_AI_SOURCE_HASHES=Object.freeze(Object.fromEntries(await Promise.all(sources.map(async path=>[
 path,createHash('sha256').update(await materializedMessageAiSource(path)).digest('hex'),
]))));
// Existing helper reads the exact guarded source/data files listed above.
const live=await import('./circle-live-db.mjs');
assert.deepEqual(live.CIRCLE_SQL_CHAIN,MESSAGE_AI_SQL_CHAIN.slice(2,-1),'Review and guard any additional chain inputs before execution');
export const {IDS,rpc,asRole,requestId,snapshotLegacyRows,LIVE_FIXTURE_EXCEPTIONS}=live;
export const MESSAGE_AI_FIXTURE_LIMITS=Object.freeze({
 database:'Tracked sanitized three-table catalog plus explicitly synthetic members/administrative roles/external child/default exceptions; not a hosted restore.',
 grants:'Broad synthetic extra defaults for ai_unrelated/PUBLIC stress only the new objects; no live role changes.',
 concurrency:'Single PGlite backend proves sequential CAS/recheck and transactional rollback, not multi-backend lock scheduling.',
 identity:'Actors and member records are synthetic. No JWT, selected-provider, issued credential, SDK or provider acceptance.',
});
export async function runMessageAiSql(db){
 try{return await db.exec((await materializedMessageAiSource(MIGRATION)).toString('utf8'));}
 catch(error){await db.exec('ROLLBACK');throw error;}
}
export async function createMessageAiDb({install=true}={}){
 const db=await live.createLiveDb();
 try{
  // Restat before each unchanged helper read; never hydrate an offloaded chain.
  for(const path of MESSAGE_AI_SQL_CHAIN.slice(0,-1))await materializedMessageAiSource(path);
  await live.installCircleChain(db);
  const {day,weekday}=(await db.query("SELECT to_char(CURRENT_DATE+1,'YYYY-MM-DD') AS day,extract(dow FROM CURRENT_DATE+1)::int AS weekday")).rows[0];
  const {circleId:circle}=await rpc(db,'soe_circle_create',[IDS.host,requestId(),{
   title:'Synthetic AI consent Circle',description:'Synthetic offline message permission fixture.',format:'in_person',
   city:'Synthetic City',region:null,venueName:'Synthetic public library',venueType:'library',weekday,time:'19:00',
   timezone:'UTC',startDate:day,maxMembers:8,onlineUrl:null,
  }]);
  const participation=(await db.query('SELECT circle_participation_revision FROM book_cohorts WHERE id=$1',[circle])).rows[0].circle_participation_revision;
  await rpc(db,'soe_circle_join',[IDS.reader,circle,participation,requestId()]);
  const {message}=await rpc(db,'soe_circle_discussion_post',[IDS.reader,circle,requestId(),CONTENT,null,null,null,'PRIVATE_AUTHOR_LABEL']);
  await db.query('INSERT INTO circle_reviewer_grants(cohort_id,member_id) VALUES($1,$2)',[circle,IDS.reviewer]);
  await db.exec('CREATE ROLE ai_unrelated NOLOGIN;ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO PUBLIC,ai_unrelated;ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role,ai_unrelated;');
  if(install)await runMessageAiSql(db);
  return {db,circleId:circle,messageId:message.id,authorId:IDS.reader,reviewerId:IDS.reviewer,circle,message:message.id,author:IDS.reader};
 }catch(error){await db.close();throw error;}
}
