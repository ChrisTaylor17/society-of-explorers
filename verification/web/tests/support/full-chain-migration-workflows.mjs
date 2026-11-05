import assert from 'node:assert/strict';
import {evidence,source,IDS,requestId,asRole,rpc,scalar,execute} from './full-chain-migration-db.mjs';
const refused=(work,code='PT409')=>assert.rejects(work,error=>{assert.equal(error.code,code,error.message);return true;});
const POLICY='anthropic-message-review-v1';
export async function exerciseFullChain(f,{eventContainment=false}={}){
 const observe=async(name,work)=>{const details=await work();evidence.observations.push({database:f.label,name,outcome:'pass',...details});};
 const profile=(actor,revision,patch)=>rpc(f,'soe_member_profile_update',[actor,revision,patch]);
 let circle,message,day,edition,coveredRequest,coveredArgs,directArgs;
 const detail=()=>rpc(f,'soe_circle_detail_profiles',[IDS.reader,circle]);
 const revision=()=>scalar(f,'SELECT circle_participation_revision FROM book_cohorts WHERE id=$1',[circle]);
 const consent=()=>rpc(f,'soe_circle_message_ai_consent_state',[IDS.reader,circle,message]);
 const setConsent=(s,allowed)=>rpc(f,'soe_circle_message_ai_consent_set',[IDS.reader,circle,message,s.consentRevision,s.contentHash,POLICY,allowed]);
 await observe('identity uniqueness, authored profile ordering and atomic accounting coexist',async()=>{
  await refused(asRole(f.db,'service_role',tx=>tx.query('INSERT INTO members(id,supabase_auth_id) VALUES($1,$2)',[requestId(),IDS.host])),'23505');
  assert.equal((await profile(IDS.host,0,{visibility:'public',bio:'Synthetic published host'})).profile_revision,1);
  assert.equal((await profile(IDS.host,1,{visibility:'public'})).profile_revision,2);
  await refused(profile(IDS.host,1,{visibility:'private'}));
  const key=requestId(),args=[IDS.host,key,'a'.repeat(64),'socrates',false],award=await rpc(f,'soe_thinker_reward_award',args);
  assert.equal(award.amount,8);assert.equal(award.replayed,false);
  assert.deepEqual(await rpc(f,'soe_thinker_reward_award',args),{...award,replayed:true});
  assert.equal(await scalar(f,'SELECT profile_revision FROM members WHERE id=$1',[IDS.host]),2);
  assert.equal(await scalar(f,'SELECT exp_tokens FROM members WHERE id=$1',[IDS.host]),15);
  assert.equal(await scalar(f,'SELECT count(*)::integer FROM exp_events'),1);
  return{amount:8,eventCount:1,profileRevision:2};
 });
 await observe('Circle creation, reading program, current membership and attendance intent work together',async()=>{
  const date=(await f.db.query("SELECT to_char(CURRENT_DATE+1,'YYYY-MM-DD') AS day,extract(dow FROM CURRENT_DATE+1)::integer AS weekday")).rows[0];day=date.day;
  edition=JSON.parse(await source('lib/circles/reading-program-editions.json')).find(x=>x.bookId==='apology');assert(edition);
  const input={title:'Synthetic composed Circle',description:'Full-chain local rehearsal.',format:'in_person',city:'Synthetic City',region:null,
   venueName:'Synthetic library',venueType:'library',weekday:date.weekday,time:'19:00',timezone:'UTC',startDate:day,maxMembers:8,onlineUrl:null,
   readingProgram:{version:1,bookId:edition.bookId,editionId:edition.editionId,sessions:[{from:0,to:10}]}};
  circle=(await rpc(f,'soe_circle_create',[IDS.host,requestId(),input])).circleId;assert(circle);
  const joined=await rpc(f,'soe_circle_join',[IDS.reader,circle,await revision(),requestId()]);
  const joinedAgain=await rpc(f,'soe_circle_join',[IDS.reader,circle,joined.state.revision,requestId()]);
  assert.equal(joinedAgain.state.revision,joined.state.revision+1);
  const args=[IDS.reader,circle,joinedAgain.state.revision,requestId(),day,'not_going'];
  const first=await rpc(f,'soe_circle_rsvp',args),second=await rpc(f,'soe_circle_rsvp',[IDS.reader,circle,first.state.revision,requestId(),day,'not_going']);
  assert.equal(second.state.revision,first.state.revision+1);assert.equal((await rpc(f,'soe_circle_rsvp',args)).replayed,true);
  assert.equal((await detail()).publicProfileId,IDS.host);
  return{membershipNoopAdvanced:true,attendanceNoopAdvanced:true,exactAttendanceReplay:true};
 });
 await observe('public discovery reads the created programmed Circle through installed Unicode and search functions',async()=>{
  const editions=JSON.parse(await source('lib/circles/reading-program-editions.json'));
  const catalog={version:1,starter:Array.from({length:12},(_,i)=>({week:i+1,title:'Synthetic starter',author:'Synthetic author',selection:'Synthetic selection'})),
   editions:editions.map(e=>({bookId:e.bookId,editionId:e.editionId,blockCount:e.blockCount,title:'Synthetic book label',author:'Synthetic author',sourceTitle:e.sourceTitle,contents:e.contents.map(({readingIndex,label})=>({readingIndex,label}))}))};
  const page=await rpc(f,'soe_circle_discovery_search',[{terms:['composed'],cityTerms:[],format:'',open:false,sort:'next',book:null,edition:null},catalog,null,null,25]);
  assert(page.items.some(x=>x.circle.id===circle));assert.doesNotMatch(JSON.stringify(page),/PRIVATE_SYNTHETIC_EMAIL|PRIVATE_SYNTHETIC_BILLING/);
  return{installedSearchExecuted:true,catalogLabels:'Synthetic, with actual pinned reading edition coordinates'};
 });
 await observe('ordinary salon, passage post and threaded published-author references survive composition',async()=>{
  const ordinary=await rpc(f,'soe_book_salon_messages_post',[IDS.host,IDS.salon,'Synthetic composed salon post','Host']);assert.equal(ordinary.outcome,'confirmed');
  const passage=await rpc(f,'soe_circle_passage_post',[IDS.reader,circle,requestId(),'Synthetic quoted reading comment.',{version:1,bookId:edition.bookId,editionId:edition.editionId,blockIndex:0,start:0,end:24},'Reader']);assert(passage.message.id);
  const root=await rpc(f,'soe_circle_discussion_post',[IDS.reader,circle,requestId(),'Synthetic composed discussion.',null,null,null,'Reader']);message=root.message.id;
  const target=await rpc(f,'soe_circle_discussion_target',[IDS.reader,circle,message]);
  const reply=await rpc(f,'soe_circle_discussion_post',[IDS.host,circle,requestId(),'Synthetic host reply.',message,target.target.revision,target.target.contentHash,'Host']);assert(reply.message.id);
  await profile(IDS.reader,0,{visibility:'public'});
  const page=await rpc(f,'soe_circle_discussion_read_profiles',[IDS.reader,circle,null,25]);
  assert.equal(page.items.find(x=>x.id===message).publicProfileId,IDS.reader);
  await profile(IDS.reader,1,{visibility:'private'});
  assert.equal((await rpc(f,'soe_circle_discussion_read_profiles',[IDS.reader,circle,null,25])).items.find(x=>x.id===message).publicProfileId,null);
  assert.doesNotMatch(JSON.stringify(page),/PRIVATE_SYNTHETIC_EMAIL|PRIVATE_SYNTHETIC_BILLING|PRIVATE_SYNTHETIC_MEMBER/);
  return{ordinarySalon:true,passage:true,thread:true,publicationRechecked:true};
 });
 await observe('author consent advances per message while allowance stays inactive and reporter notes stay outside snapshots',async()=>{
  await f.db.query('INSERT INTO circle_reviewer_grants(cohort_id,member_id) VALUES($1,$2)',[circle,IDS.reviewer]);
  await f.db.query("INSERT INTO circle_message_reports(cohort_id,message_id,reporter_member_id,reason,note) VALUES($1,$2,$3,'safety','PRIVATE_SYNTHETIC_REPORTER_NOTE')",[circle,message,IDS.host]);
  const absent=await consent();assert.equal(absent.allowed,false);assert.equal(absent.consentRevision,0);
  const off=await setConsent(absent,false);assert.equal(off.consentRevision,1);await refused(setConsent(absent,true));
  const allowed=await setConsent(off,true);assert.equal(allowed.consentRevision,2);
  const snapshot=await rpc(f,'soe_circle_message_ai_snapshot',[IDS.reviewer,circle,message]);
  assert.deepEqual(Object.keys(snapshot).sort(),['circleId','consentRevision','content','contentHash','messageId','policy','revision'].sort());
  assert.doesNotMatch(JSON.stringify(snapshot),/PRIVATE_SYNTHETIC_REPORTER_NOTE/);
  await refused(rpc(f,'soe_circle_message_ai_reserve',[IDS.reviewer,circle,message,requestId(),snapshot.revision,snapshot.contentHash,snapshot.consentRevision,POLICY]),'PT503');
  assert.equal(await scalar(f,'SELECT enabled FROM circle_message_ai_allowance'),false);
  return{consentRevision:2,allowanceEnabled:false,providerCalls:0};
 });
 await observe('101-report listing coverage produces correlated receipt and exact replay',async()=>{
  await f.db.query("INSERT INTO circle_reports(cohort_id,reason,note,reporter_key,created_at) SELECT $1,'safety','PRIVATE_SYNTHETIC_LISTING_NOTE '||n,lpad(n::text,32,'0'),'2026-11-04T12:00:00Z' FROM generate_series(1,101)n",[circle]);
  const d=await rpc(f,'soe_circle_review_detail',[IDS.reviewer,circle]);assert.equal(d.complete,false);assert.equal(d.reports.length,100);
  let page=await rpc(f,'soe_circle_review_coverage_start',[IDS.reviewer,circle,null,d.revision,null]),pages=0;
  assert.equal(page.totalReports,101);
  while(!page.complete){page=await rpc(f,'soe_circle_review_coverage_ack',[IDS.reviewer,circle,null,page.sessionId,page.pageToken]);pages++;assert(pages<=3);}
  coveredRequest=requestId();coveredArgs=[IDS.reviewer,circle,null,page.sessionId,page.revision,null,coveredRequest,'restore','no_violation','All reports reviewed; no violation found.',null,null];
  const receipt=await rpc(f,'soe_circle_review_coverage_decide',coveredArgs);assert.equal(receipt.circleId,circle);assert.equal(receipt.requestId,coveredRequest);assert.equal(receipt.decision.report_count,101);
  assert.equal((await rpc(f,'soe_circle_review_coverage_decide',coveredArgs)).replayed,true);
  directArgs=[IDS.reviewer,circle,receipt.revision,requestId(),'restore','no_violation','Fresh human review; no violation found.',null,null];
  const direct=await rpc(f,'soe_circle_review_decide',directArgs);assert.equal(direct.circleId,circle);assert.equal(direct.requestId,directArgs[3]);
  return{reportCount:101,pages,coveredReceiptCorrelated:true,directReceiptCorrelated:true};
 });
 await observe('browser raw targets and successor RPCs remain closed; service write barriers stay narrowed',async()=>{
  const targets=['members','reading_progress','book_highlights','great_books_progress','great_books_highlights','book_reflections','thinker_memory','book_cohorts','book_cohort_members','seminar_messages','artifacts','circle_rsvps','circle_message_ai_consents','soe_thinker_reward_receipts'];
  if(eventContainment)targets.push('exp_events');
  for(const role of ['anon','authenticated'])for(const table of targets){
   assert.equal(await scalar(f,"SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege($1,$2,'SELECT,INSERT,UPDATE,REFERENCES')",[role,table]),false,role+' '+table);
   await refused(asRole(f.db,role,tx=>tx.query('SELECT * FROM '+table)),'42501');
  }
  const functions=(await f.db.query("SELECT oid::regprocedure::text signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname LIKE 'soe\\_%' ESCAPE '\\' OR proname IN('add_exp','increment_exp','increment_exp_tokens'))")).rows;
  for(const role of ['anon','authenticated'])for(const {signature} of functions)assert.equal(await scalar(f,"SELECT has_function_privilege($1,$2,'EXECUTE')",[role,signature]),false,role+' '+signature);
  for(const table of ['reading_progress','circle_rsvps','circle_message_ai_consents']){
   assert.equal(await scalar(f,"SELECT has_table_privilege('service_role',$1,'SELECT')",[table]),true);
   assert.equal(await scalar(f,"SELECT has_table_privilege('service_role',$1,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')",[table]),false);
  }
  if(eventContainment)for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal(await scalar(f,'SELECT has_table_privilege($1,$2,$3)',['service_role','exp_events',privilege]),true);
  return{rawTargets:targets.length,rpcSignatures:functions.length,roles:2,serviceSelectOnlyTargets:3,expEventsScope:eventContainment?'Captured broad-grant pre-state closed by the explicit Stage 6b candidate; no live execution claim.':'Synthetic private prerequisite, not a claim about captured live event privileges.'};
 });
 await observe('used saved-reading CAS disables without erasing tombstone, then reapplies with its raw-write barrier',async()=>{
  const saved=await rpc(f,'soe_reading_progress_update',[IDS.host,0,'meditations','save','synthetic-edition',42,false]);assert.equal(saved.progress_revision,1);
  const removed=await rpc(f,'soe_reading_progress_update',[IDS.host,1,'meditations','remove',null,null,null]);assert.equal(removed.progress_revision,2);assert.equal(removed.progress_removed,true);
  await execute(f,'docs/sql/reading-progress-rollback.sql','disable-used-successor');
  assert.equal(await scalar(f,'SELECT progress_revision FROM reading_progress WHERE member_id=$1',[IDS.host]),2);
  assert.equal(await scalar(f,"SELECT has_table_privilege('service_role','reading_progress','INSERT,UPDATE,DELETE,TRUNCATE')"),false);
  assert.equal(await scalar(f,"SELECT to_regprocedure('public.soe_reading_progress_update(uuid,bigint,text,text,text,bigint,boolean)')"),null);
  await execute(f,'docs/sql/reading-progress-preflight.sql','reapply-preflight');await execute(f,'docs/sql/reading-progress-apply.sql','reapply');
  assert.equal((await rpc(f,'soe_reading_progress_update',[IDS.host,2,'meditations','save','synthetic-edition',43,false])).progress_revision,3);
  return{tombstonePreserved:true,finalRevision:3};
 });
 await observe('membership disable retains leave and attendance; predecessor scripts refuse successor state',async()=>{
  await execute(f,'docs/sql/circle-membership-intent-rollback.sql','disable-used-successor');
  await refused(rpc(f,'soe_circle_join',[IDS.reader,circle,await revision(),requestId()]),'42501');
  await rpc(f,'soe_circle_rsvp',[IDS.reader,circle,await revision(),requestId(),day,'going']);
  const left=await rpc(f,'soe_circle_leave',[IDS.reader,circle,await revision(),requestId()]);assert.equal(left.state.isMember,false);
  for(const stage of ['preflight','apply','rollback'])await refused(execute(f,'docs/sql/circle-attendance-'+stage+'.sql','expected-predecessor-refusal'));
  await execute(f,'docs/sql/circle-membership-intent-preflight.sql','reapply-preflight');await execute(f,'docs/sql/circle-membership-intent-apply.sql','reapply');
  assert.equal((await rpc(f,'soe_circle_join',[IDS.reader,circle,await revision(),requestId()])).state.isMember,true);
  return{retainedLeave:true,retainedAttendance:true,predecessorRefusals:3};
 });
 await observe('profile and public-reference disable-only reversals preserve authored choices and current data',async()=>{
  const before=await scalar(f,'SELECT profile_revision FROM members WHERE id=$1',[IDS.host]);
  await execute(f,'docs/sql/member-profile-intent-rollback.sql','disable-used-successor');await refused(profile(IDS.host,before,{visibility:'private'}),'42501');
  assert.equal((await detail()).publicProfileId,IDS.host);await execute(f,'docs/sql/member-profile-intent-apply.sql','reapply');
  assert.equal((await profile(IDS.host,before,{visibility:'public'})).profile_revision,before+1);
  await execute(f,'docs/sql/circle-public-profiles-rollback.sql','disable-used-successor');await refused(detail(),'42501');
  await execute(f,'docs/sql/circle-public-profiles-apply.sql','reapply');assert.equal((await detail()).publicProfileId,IDS.host);
  return{publicationPreserved:true,profileRevisionAdvanced:true};
 });
 await observe('consent disable retains explicit allow state and snapshot read; older allowance apply refuses successor',async()=>{
  const before=await consent();await execute(f,'docs/sql/circle-message-ai-consent-intent-rollback.sql','disable-used-successor');
  assert.deepEqual(await consent(),before);assert(await rpc(f,'soe_circle_message_ai_snapshot',[IDS.reviewer,circle,message]));
  await refused(setConsent(before,false),'42501');await refused(execute(f,'docs/sql/circle-message-ai-allowance.sql','expected-predecessor-refusal'));
  await execute(f,'docs/sql/circle-message-ai-consent-intent-apply.sql','reapply');assert.equal((await setConsent(before,false)).consentRevision,3);
  assert.equal(await scalar(f,'SELECT enabled FROM circle_message_ai_allowance'),false);
  return{allowStateRetainedWhileDisabled:true,allowanceStillDisabled:true,finalConsentRevision:3};
 });
 await observe('listing disable blocks new listing writes, retains correlated replay, and leaves message decisions operational',async()=>{
  await execute(f,'docs/sql/circle-listing-review-receipt-rollback.sql','disable-used-successor');
  for(const [name,args] of [['soe_circle_review_coverage_decide',coveredArgs],['soe_circle_review_decide',directArgs]]){
   const replay=await rpc(f,name,args);assert.equal(replay.replayed,true);assert.equal(replay.circleId,circle);assert.equal(replay.requestId,name.includes('coverage')?coveredRequest:directArgs[3]);
  }
  const d=await rpc(f,'soe_circle_review_detail',[IDS.reviewer,circle]);await refused(rpc(f,'soe_circle_review_decide',[IDS.reviewer,circle,d.revision,requestId(),'restore','no_violation','New listing writes disabled.',null,null]));
  const m=await rpc(f,'soe_circle_message_review_detail',[IDS.reviewer,circle,message]);
  const decision=await rpc(f,'soe_circle_message_review_decide',[IDS.reviewer,circle,message,m.revision,m.contentHash,requestId(),'restore','no_violation','Message branch remains operational.',null,null]);assert.equal(decision.safety.revision,m.revision+1);
  await execute(f,'docs/sql/circle-listing-review-receipt-apply.sql','reapply');
  assert.equal((await rpc(f,'soe_circle_review_decide',[IDS.reviewer,circle,d.revision,requestId(),'restore','no_violation','Explicit reapply restores listing writes.',null,null])).revision,d.revision+1);
  return{correlatedReplays:2,newListingWriteRefused:true,messageDecisionConfirmed:true};
 });
 await observe('historical containment refuses later schema drift; used accounting and coverage data remain retained',async()=>{
  for(const path of ['docs/sql/first-release-core-containment-apply.sql','docs/sql/first-release-core-containment-rollback.sql','docs/sql/circle-legacy-baseline-rollback.sql'])await refused(execute(f,path,'expected-predecessor-refusal'));
  if(eventContainment)for(const action of ['preflight','apply','rollback'])await refused(execute(f,'docs/sql/exp-events-containment-'+action+'.sql','expected-post-accounting-drift-refusal'));
  assert.equal(await scalar(f,'SELECT count(*)::integer FROM soe_thinker_reward_receipts'),1);
  assert.equal(await scalar(f,'SELECT count(*)::integer FROM circle_review_coverage_sessions'),1);
  assert.equal(await scalar(f,'SELECT count(*)::integer FROM circle_review_coverage_pages'),3);
  assert.equal(evidence.providerCalls,0);return{historicalRestoringRollbacksRefused:true,destructiveReverseCommitted:false,rewardReceipts:1,coverageSessions:1,coveragePages:3};
 });
}
