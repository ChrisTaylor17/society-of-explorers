import test from 'node:test';
import assert from 'node:assert/strict';
import {lstat,stat} from 'node:fs/promises';
const helper=new URL('./support/review-coverage-db.mjs',import.meta.url),link=await lstat(helper),info=await stat(helper);
assert.equal(link.isSymbolicLink(),false);assert.ok(!info.size||info.blocks);
const {createReviewCoverageDb,applyCoverage,coverageStart,coveragePage,coverageAck,completeCoverage,coverageDecide,seedCoverageReports,IDS,rpc,asRole,requestId,CONTENT}=await import('./support/review-coverage-db.mjs');
async function fixture(t,options){const f=await createReviewCoverageDb(options);t.after(()=>f.db.close());return f;}
const scalar=async(db,q,args=[])=>Object.values((await db.query(q,args)).rows[0])[0];
const reject=(work,code)=>assert.rejects(work,e=>{assert.equal(e.code,code,e.message);return true;});
const table=k=>k==='message'?'circle_message_reports':'circle_reports';
const decisionTable=k=>k==='message'?'circle_message_decisions':'circle_review_decisions';
const count=(f,k,status='open')=>scalar(f.db,`SELECT count(*)::integer FROM ${table(k)} WHERE status=$1`,[status]);

test('startup denial and additive install preserve rows and all four legacy function bodies',async t=>{
 assert.throws(()=>fetch('https://fixture.invalid/no-network'),/EXTERNAL_NETWORK_DISABLED_IN_PRIVATE_BUILD/);
 const f=await fixture(t,{install:false});const rows={listing:(await f.db.query('SELECT * FROM circle_reports ORDER BY id')).rows,message:(await f.db.query('SELECT * FROM circle_message_reports ORDER BY id')).rows};
 const q="SELECT oid,md5(prosrc) body FROM pg_proc WHERE proname IN('soe_circle_review_detail','soe_circle_review_decide','soe_circle_message_review_detail','soe_circle_message_review_decide') ORDER BY oid";
 const before=(await f.db.query(q)).rows;await applyCoverage(f.db);assert.deepEqual((await f.db.query(q)).rows,before);
 assert.deepEqual((await f.db.query('SELECT * FROM circle_reports ORDER BY id')).rows,rows.listing);assert.deepEqual((await f.db.query('SELECT * FROM circle_message_reports ORDER BY id')).rows,rows.message);
});
for(const kind of ['listing','message']){
 test(`${kind}: 101 reports require all three sequential acknowledgements; old decisions still deny`,async t=>{
  const f=await fixture(t),p=await coverageStart(f,kind);assert.equal(p.totalReports,101);assert.equal(p.reports.length,50);assert.equal(p.complete,false);assert.equal(p.reviewedReports,0);
  await reject(()=>coverageDecide(f,p),'PT409');
  const legacy=kind==='message'?['soe_circle_message_review_decide',[IDS.reviewer,f.circleId,f.messageId,p.revision,p.contentHash,requestId(),'restore','no_violation','The reviewed evidence does not establish any violation.',null,null]]:['soe_circle_review_decide',[IDS.reviewer,f.circleId,p.revision,requestId(),'restore','no_violation','The reviewed evidence does not establish any violation.',null,null]];
  await reject(()=>rpc(f.db,...legacy),'PT409');
  const second=await coverageAck(f,p);assert.equal(second.pageNumber,2);assert.equal(second.reviewedReports,50);assert.equal(second.reports.length,50);
  const third=await coverageAck(f,second);assert.equal(third.pageNumber,3);assert.equal(third.reviewedReports,100);assert.equal(third.reports.length,1);assert.equal(third.complete,false);
  const final=await coverageAck(f,third);assert.equal(final.reviewedReports,101);assert.equal(final.complete,true);assert.equal(final.acknowledged,true);
  const receipt=await coverageDecide(f,final);assert.equal(receipt.decision.report_count,101);assert.equal(await count(f,kind),0);assert.equal(await count(f,kind,'dismissed'),101);
 });
 test(`${kind}: 250 tied timestamps have no skips/duplicates and earlier issued evidence remains usable`,async t=>{
  const f=await fixture(t,{reportCount:250});let p=await coverageStart(f,kind);const first=p;const seen=[];
  while(!p.complete){seen.push(...p.reports.map(r=>r.id));p=await coverageAck(f,p);}assert.equal(seen.length,250);assert.equal(new Set(seen).size,250);assert.equal(p.pageNumber,5);
  const old=await coveragePage(f,p,1);assert.deepEqual(old.reports,first.reports);assert.equal(old.complete,true);assert.equal(old.acknowledged,true);
  const chosen=old.reports[0];const receipt=await coverageDecide(f,p,{action:'hide',reason:'safety',evidenceId:chosen.id,excerpt:chosen.note});assert.equal(receipt.decision.report_count,250);assert.equal(await count(f,kind,'reviewed'),250);
 });
 test(`${kind}: only issued pages/tokens and bound actor/case are usable; ACK replay never advances twice`,async t=>{
  const f=await fixture(t),p=await coverageStart(f,kind);await reject(()=>coveragePage(f,p,2),'PT409');
  await reject(()=>coverageAck(f,{...p,pageToken:requestId()}),'PT409');
  const second=await coverageAck(f,p),retry=await coverageAck(f,p);assert.deepEqual(retry,second);
  await reject(()=>coveragePage(f,p,1,IDS.outsider),'PT403');
  await f.db.query('INSERT INTO circle_reviewer_grants(cohort_id,member_id) VALUES($1,$2)',[f.circleId,IDS.outsider]);
  await reject(()=>coveragePage(f,p,1,IDS.outsider),'PT409');
  await reject(()=>rpc(f.db,'soe_circle_review_coverage_page',[IDS.reviewer,f.circleId,p.messageId===null?f.messageId:null,p.sessionId,null]),'PT409');
  await reject(()=>rpc(f.db,'soe_circle_review_coverage_page',[IDS.reviewer,f.circleId,p.messageId,requestId(),null]),'PT409');
  assert.equal((await coveragePage(f,p)).reviewedReports,50);
 });
 test(`${kind}: expired proof cannot resume; fresh ACK alone extends inactivity and never past assignment`,async t=>{
  const f=await fixture(t),p=await coverageStart(f,kind);
  await f.db.query("UPDATE circle_review_coverage_sessions SET expires_at=clock_timestamp()+interval '2 minutes' WHERE id=$1",[p.sessionId]);
  const read=await coveragePage(f,p);const next=await coverageAck(f,p);assert.ok(new Date(next.expiresAt)>new Date(read.expiresAt));
  const again=await coverageAck(f,p);assert.equal(again.expiresAt,next.expiresAt);
  await f.db.query("UPDATE circle_review_coverage_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[p.sessionId]);
  await reject(()=>coveragePage(f,p),'PT409');await reject(()=>coverageAck(f,next),'PT409');await reject(()=>coverageDecide(f,next),'PT409');
  await f.db.query("UPDATE circle_reviewer_grants SET expires_at=clock_timestamp()+interval '3 minutes' WHERE member_id=$1",[IDS.reviewer]);
  const fresh=await coverageStart(f,kind);assert.ok(new Date(fresh.expiresAt).getTime()-Date.now()<181000);
 });
 test(`${kind}: grant revoke/re-enable, restart and source changes permanently invalidate old proof`,async t=>{
  const f=await fixture(t),p=await coverageStart(f,kind);
  await f.db.query('UPDATE circle_reviewer_grants SET revoked_at=clock_timestamp() WHERE member_id=$1',[IDS.reviewer]);await reject(()=>coveragePage(f,p),'PT403');
  await f.db.query('UPDATE circle_reviewer_grants SET revoked_at=NULL WHERE member_id=$1',[IDS.reviewer]);await reject(()=>coveragePage(f,p),'PT409');
  const fresh=await coverageStart(f,kind);const restarted=await coverageStart(f,kind);await reject(()=>coveragePage(f,fresh),'PT409');
  await f.db.query('UPDATE book_cohorts SET title=title||\' changed\' WHERE id=$1',[f.circleId]);await reject(()=>coveragePage(f,restarted),'PT409');
 });
 test(`${kind}: newly submitted actual report invalidates completed coverage without closing anything`,async t=>{
  const f=await fixture(t),p=await completeCoverage(f,kind);
  if(kind==='listing')await rpc(f.db,'soe_circle_report',[null,'a'.repeat(32),f.circleId,'spam','New evidence after the completed review.',requestId()]);
  else{const own=await rpc(f.db,'soe_circle_message_state',[IDS.host,f.circleId,f.messageId]);await rpc(f.db,'soe_circle_message_action',[IDS.host,f.circleId,f.messageId,own.revision,own.contentHash,requestId(),'report','spam','New evidence after the completed review.']);}
  await reject(()=>coverageDecide(f,p),'PT409');assert.equal(await count(f,kind),102);assert.equal(await scalar(f.db,`SELECT count(*)::integer FROM ${decisionTable(kind)}`),0);
 });
 test(`${kind}: committed decision exact replay survives proof expiry/new reports but rejects changed payload/revoked access`,async t=>{
  const f=await fixture(t),p=await completeCoverage(f,kind),key=requestId();const first=await coverageDecide(f,p,{request:key});
  await f.db.query("UPDATE circle_review_coverage_sessions SET expires_at=clock_timestamp()-interval '1 hour' WHERE id=$1",[p.sessionId]);await seedCoverageReports(f,{kind,count:1});
  const retry=await coverageDecide(f,p,{request:key});assert.equal(retry.replayed,true);assert.equal(retry.decision.id,first.decision.id);assert.equal(await count(f,kind),1);
  await reject(()=>coverageDecide(f,p,{request:key,summary:'A different attempted explanation for the same request.'}),'PT409');
  await f.db.query('UPDATE circle_reviewer_grants SET revoked_at=clock_timestamp() WHERE member_id=$1',[IDS.reviewer]);await reject(()=>coverageDecide(f,p,{request:key}),'PT403');
 });
 test(`${kind}: audit insertion failure rolls visibility, report closure and proof consumption back together`,async t=>{
  const f=await fixture(t),p=await completeCoverage(f,kind);
  await f.db.exec(`CREATE FUNCTION fixture_coverage_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic audit unavailable';END$$;CREATE TRIGGER fixture_coverage_audit_failure BEFORE INSERT ON ${decisionTable(kind)} FOR EACH ROW EXECUTE FUNCTION fixture_coverage_audit_failure();`);
  await assert.rejects(()=>coverageDecide(f,p),/synthetic audit unavailable/);assert.equal(await count(f,kind),101);
  const reread=await coveragePage(f,p);assert.equal(reread.complete,true);assert.equal(await scalar(f.db,'SELECT used_request_id FROM circle_review_coverage_sessions WHERE id=$1',[p.sessionId]),null);
 });
}
test('zero report page is complete without acknowledgement; 50/100 boundaries remain exact',async t=>{
 for(const n of [0,50,100]){const f=await fixture(t,{reportCount:n});let p=await coverageStart(f);assert.equal(p.complete,n===0);while(!p.complete)p=await coverageAck(f,p);assert.equal(p.reviewedReports,n);assert.equal(p.pageNumber,Math.max(1,Math.ceil(n/50)));await coverageDecide(f,p);}
});
test('new tables/helpers have no browser/unrelated effective authority despite broad defaults',async t=>{
 const f=await fixture(t);for(const tab of ['circle_review_coverage_sessions','circle_review_coverage_pages'])for(const role of ['anon','authenticated','ai_unrelated']){
  assert.equal(await scalar(f.db,'SELECT has_table_privilege($1,$2,$3)',[role,tab,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN']),false);
  assert.equal(await scalar(f.db,'SELECT has_any_column_privilege($1,$2,$3)',[role,tab,'SELECT,INSERT,UPDATE,REFERENCES']),false);
 }
 const functions=(await f.db.query("SELECT oid::text oid FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname LIKE 'soe_circle_review_coverage_%' OR proname LIKE '_soe_circle_review_coverage_%')")).rows;
 for(const {oid}of functions)for(const role of ['anon','authenticated','ai_unrelated'])assert.equal(await scalar(f.db,'SELECT has_function_privilege($1,$2::oid,$3)',[role,oid,'EXECUTE']),false);
});
test('collision or changed old report-count constraint refuses the whole additive migration',async t=>{
 for(const change of ['CREATE INDEX circle_review_coverage_listing_order ON circle_reports(id)','ALTER TABLE circle_review_decisions ADD CONSTRAINT later_report_cap CHECK(report_count<=100)','CREATE TABLE circle_review_coverage_sessions(unrelated text)','ALTER TABLE circle_review_decisions DROP CONSTRAINT circle_review_decisions_report_count_check;ALTER TABLE circle_review_decisions ADD CONSTRAINT circle_review_decisions_report_count_check CHECK(report_count BETWEEN 0 AND 99)']){
  const f=await fixture(t,{install:false});await f.db.exec(change);await reject(()=>applyCoverage(f.db),'PT409');assert.equal(await scalar(f.db,"SELECT to_regclass('public.circle_review_coverage_pages')"),null);
 }
});

test('unchanged legacy decisions still complete cases at100 and invalidate any parallel coverage proof',async t=>{
 for(const kind of ['listing','message']){const f=await fixture(t,{reportCount:100}),p=await coverageStart(f,kind);
  const receipt=kind==='listing'?await rpc(f.db,'soe_circle_review_decide',[IDS.reviewer,f.circleId,p.revision,requestId(),'restore','no_violation','The full reviewed case has no established conduct violation.',null,null]):await rpc(f.db,'soe_circle_message_review_decide',[IDS.reviewer,f.circleId,f.messageId,p.revision,p.contentHash,requestId(),'restore','no_violation','The full reviewed case has no established conduct violation.',null,null]);
  assert.equal(receipt.decision.report_count,100);assert.equal(await count(f,kind),0);await reject(()=>coveragePage(f,p),'PT409');
 }
});

test('privileged report reassignment immediately invalidates old scope and cannot revive after move-back ABA',async t=>{
 for(const kind of ['listing','message']){const f=await fixture(t),p=await coverageStart(f,kind),chosen=p.reports[0];
  if(kind==='listing'){await f.db.query('UPDATE circle_reports SET cohort_id=$1 WHERE id=$2',[IDS.salon,chosen.id]);}
  else{const other=(await f.db.query('SELECT id FROM seminar_messages WHERE id<>$1 ORDER BY id LIMIT 1',[f.messageId])).rows[0].id;await f.db.query('UPDATE circle_message_reports SET message_id=$1 WHERE id=$2',[other,chosen.id]);}
  assert.equal(await scalar(f.db,'SELECT invalidated FROM circle_review_coverage_sessions WHERE id=$1',[p.sessionId]),true);
  if(kind==='listing')await f.db.query('UPDATE circle_reports SET cohort_id=$1 WHERE id=$2',[f.circleId,chosen.id]);else await f.db.query('UPDATE circle_message_reports SET message_id=$1 WHERE id=$2',[f.messageId,chosen.id]);
  assert.equal(await count(f,kind),101);await reject(()=>coveragePage(f,p),'PT409');
 }
});
