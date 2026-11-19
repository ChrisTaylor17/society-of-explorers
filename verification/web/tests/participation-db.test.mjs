import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDb,IDS,rpc,asRole,requestId,creationInput,detail,createCircle,participate,configureParticipationFixture } from './support/participation-db.mjs';
import { createDb as messageDb } from './support/message-db.mjs';

const code=expected=>error=>error.code===expected;
async function scalar(db,sql,params=[]) {return Object.values((await db.query(sql,params)).rows[0])[0];}
async function fixture(t) {const db=await createDb();t.after(()=>db.close());return db;}
const uuid=i=>`ffffffff-ffff-4fff-8fff-${String(i).padStart(12,'0')}`;

test('creation atomically binds cohort, host membership, private URL and immutable self receipt',async t=>{
 const db=await fixture(t);const input=await creationInput(db,{format:'online',venueType:'online',city:null,venueName:null,onlineUrl:'https://meet.example.invalid/PRIVATE_MEETING'});
 const priorGrants=await scalar(db,'SELECT count(*)::int FROM circle_reviewer_grants');
 const result=await createCircle(db,{input});assert.equal(result.receipt.action,'create');assert.equal(result.state.revision,1);assert.equal(result.state.isHost,true);assert.equal(result.state.isMember,true);
 assert.equal(await scalar(db,'SELECT created_by FROM book_cohorts WHERE id=$1',[result.circleId]),IDS.newcomer);
 assert.equal(await scalar(db,'SELECT count(*)::int FROM book_cohort_members WHERE cohort_id=$1 AND member_id=$2',[result.circleId,IDS.newcomer]),1);
 assert.equal(await scalar(db,'SELECT online_url FROM circle_private WHERE cohort_id=$1',[result.circleId]),input.onlineUrl);
 assert.equal(await scalar(db,'SELECT count(*)::int FROM circle_participation_receipts'),1);
 assert.equal(await scalar(db,'SELECT count(*)::int FROM circle_reviewer_grants'),priorGrants);
 assert.equal(JSON.stringify(result).includes('PRIVATE_MEETING'),false);
 const own=await detail(db,IDS.newcomer,result.circleId);assert.equal(own.online_url,input.onlineUrl);assert.equal(own.circle.start_date,input.startDate);
 const publicView=await detail(db,null,result.circleId);assert.equal(publicView.online_url,null);assert.equal('created_by' in publicView.circle,false);
});

test('private configuration or receipt insertion failure leaves no partial creation or consumed quota',async t=>{
 for(const table of ['circle_private','circle_participation_receipts']) {
  const db=await fixture(t);const before=await scalar(db,'SELECT count(*)::int FROM book_cohorts');
  await db.exec(`CREATE FUNCTION fixture_fail_create() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic creation storage failure'; END $$; CREATE TRIGGER fixture_fail_create BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION fixture_fail_create();`);
  const input=await creationInput(db,{format:'online',venueType:'online',venueName:null,onlineUrl:'https://meet.example.invalid/private'});
  await assert.rejects(createCircle(db,{input}),/synthetic creation storage failure/);
  assert.equal(await scalar(db,'SELECT count(*)::int FROM book_cohorts'),before);
  assert.equal(await scalar(db,'SELECT count(*)::int FROM book_cohort_members WHERE member_id=$1',[IDS.newcomer]),0);
  assert.equal(await scalar(db,'SELECT count(*)::int FROM circle_participation_receipts'),0);
 }
});

test('actor-serialized creation enforces active hosted and rolling-day business limits; exact retries bypass both',async t=>{
 const db=await fixture(t);const input=await creationInput(db);const key=requestId();
 const first=await createCircle(db,{actor:IDS.host,key,input});const second=await createCircle(db,{actor:IDS.host,input});
 await db.query('UPDATE book_cohorts SET circle_hidden=true WHERE id=$1',[first.circleId]);
 assert.equal((await rpc(db,'soe_circle_start',[IDS.host])).activeHosted,3);
 await assert.rejects(createCircle(db,{actor:IDS.host,input}),code('PT409'));
 assert.equal((await createCircle(db,{actor:IDS.host,key,input})).replayed,true);
 await participate(db,'complete',{actor:IDS.host,circle:IDS.circle});
 const third=await createCircle(db,{actor:IDS.host,input});
 await participate(db,'complete',{actor:IDS.host,circle:IDS.circle,revision:1}); // no-op completion still own receipt
 await participate(db,'complete',{actor:IDS.host,circle:second.circleId});
 assert.equal((await rpc(db,'soe_circle_start',[IDS.host])).activeHosted,2);
 await assert.rejects(createCircle(db,{actor:IDS.host,input}),code('PT409')); // 3 new creations, even after completion
 assert.equal((await createCircle(db,{actor:IDS.host,key,input})).circleId,first.circleId);
 assert.equal(await scalar(db,"SELECT count(*)::int FROM circle_participation_receipts WHERE receipt->>'action'='create'"),3);
 assert.equal(third.state.isHost,true);
});

test('simultaneous creation calls have real SQL serialized outcomes without exceeding quota',async t=>{
 const db=await fixture(t);const input=await creationInput(db);
 // PGlite has one backend. This proves transactional serialized results, not
 // multi-session advisory-lock scheduling; root separately runs PostgreSQL17.
 const outcomes=await Promise.allSettled(Array.from({length:4},()=>createCircle(db,{input})));
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,3);
 assert.equal(outcomes.find(r=>r.status==='rejected').reason.code,'PT409');
 assert.equal(await scalar(db,'SELECT count(*)::int FROM book_cohorts WHERE created_by=$1',[IDS.newcomer]),3);
});

test('last-seat joins serialize with strict capacity and revision checks; current-member join is a no-op',async t=>{
 const db=await fixture(t);await db.query('UPDATE book_cohorts SET max_members=4 WHERE id=$1',[IDS.circle]);
 const results=await Promise.allSettled([participate(db,'join',{actor:IDS.newcomer,revision:0}),participate(db,'join',{actor:IDS.newcomer2,revision:0})]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.code,'PT409');
 assert.equal(await scalar(db,'SELECT count(*)::int FROM book_cohort_members WHERE cohort_id=$1',[IDS.circle]),4);
 const winner=results[0].status==='fulfilled'?IDS.newcomer:IDS.newcomer2;
 const loser=winner===IDS.newcomer?IDS.newcomer2:IDS.newcomer;
 await assert.rejects(participate(db,'join',{actor:loser}),code('PT409'));
 const repeat=await participate(db,'join',{actor:winner});assert.equal(repeat.state.revision,1);
});

test('leave removes only own membership and RSVPs atomically while host authority survives departure',async t=>{
 const db=await fixture(t);const date=(await detail(db)).meetings[0].date;
 await participate(db,'rsvp',{actor:IDS.reader,date});await participate(db,'rsvp',{actor:IDS.reporter2,date});
 const before=(await detail(db)).revision;
 const left=await participate(db,'leave',{actor:IDS.reader});assert.equal(left.state.isMember,false);assert.equal(left.state.revision,before+1);
 assert.equal(await scalar(db,'SELECT count(*)::int FROM circle_rsvps WHERE member_id=$1',[IDS.reader]),0);
 assert.equal(await scalar(db,'SELECT count(*)::int FROM circle_rsvps WHERE member_id=$1',[IDS.reporter2]),1);
 assert.equal(await scalar(db,'SELECT count(*)::int FROM book_cohort_members WHERE cohort_id=$1 AND member_id=$2',[IDS.circle,IDS.reporter2]),1);
 await assert.rejects(rpc(db,'soe_circle_messages_read',[IDS.reader,IDS.circle]),code('PT403'));
 const hostCircle=await createCircle(db);const hostLeft=await participate(db,'leave',{actor:IDS.newcomer,circle:hostCircle.circleId});
 assert.equal(hostLeft.state.isHost,true);assert.equal(hostLeft.state.canComplete,true);assert.equal(hostLeft.state.canReadConversation,false);
 const mine=await rpc(db,'soe_circle_my_circles',[IDS.newcomer,null,25]);assert.ok(mine.items.some(x=>x.circle.id===hostCircle.circleId));
});

test('stale leave cannot remove a newer rejoin; exact old leave replay returns original event and current joined state',async t=>{
 const db=await fixture(t);const key=requestId();const original={actor:IDS.reader,revision:0,key};
 await participate(db,'leave',original);await participate(db,'join',{actor:IDS.reader});
 const replay=await participate(db,'leave',original);assert.equal(replay.replayed,true);assert.equal(replay.receipt.joined,false);assert.equal(replay.state.isMember,true);assert.equal(replay.state.revision,2);
 await assert.rejects(participate(db,'leave',{...original,key:requestId()}),code('PT409'));
 assert.equal(await scalar(db,'SELECT count(*)::int FROM book_cohort_members WHERE cohort_id=$1 AND member_id=$2',[IDS.circle,IDS.reader]),1);
 await assert.rejects(participate(db,'join',{...original}),code('PT409'));
});

test('RSVP accepts only future dates among the configured twelve meetings and counts current members',async t=>{
 const db=await fixture(t);const view=await detail(db);const first=view.meetings[0].date;
 const dates=(await db.query('SELECT _soe_circle_participation_dates(c) AS dates FROM book_cohorts c WHERE id=$1',[IDS.circle])).rows[0].dates;
 const day=x=>x instanceof Date?x.toISOString().slice(0,10):String(x).slice(0,10);
 const last=day(dates[11]);const saved=await participate(db,'rsvp',{actor:IDS.reader,date:last});assert.equal(saved.receipt.date,last);assert.equal(saved.state.revision,1);
 const same=await participate(db,'rsvp',{actor:IDS.reader,date:last});assert.equal(same.state.revision,1);
 const beyond=await scalar(db,"SELECT to_char($1::date+7,'YYYY-MM-DD')",[last]);
 const wrong=await scalar(db,"SELECT to_char($1::date+1,'YYYY-MM-DD')",[first]);
 await assert.rejects(participate(db,'rsvp',{actor:IDS.reader,date:beyond}),code('PT400'));
 await assert.rejects(participate(db,'rsvp',{actor:IDS.reader,date:wrong}),code('PT400'));
 await assert.rejects(participate(db,'rsvp',{actor:IDS.newcomer,date:first}),code('PT403'));
 await assert.rejects(participate(db,'rsvp',{actor:IDS.reader,date:first,status:'maybe'}),code('PT400'));
 await participate(db,'rsvp',{actor:IDS.reader,date:first});
 assert.equal((await detail(db)).meetings[0].going,1);
 await participate(db,'leave',{actor:IDS.reader});assert.equal((await detail(db,IDS.reporter2)).meetings[0].going,0);
});

test('date-ended Circles have no invented future meetings or join/RSVP authority but retain wrap-up conversation',async t=>{
 const db=await fixture(t);
 await db.query("UPDATE book_cohorts SET start_date=((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date-84)::timestamp AT TIME ZONE 'UTC',circle_weekday=extract(dow FROM (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date)::smallint WHERE id=$1",[IDS.circle]);
 const view=await detail(db);assert.equal(view.ended,true);assert.equal(view.nextMeeting,null);assert.deepEqual(view.meetings,[]);
 assert.equal(view.capabilities.canJoin,false);assert.equal(view.capabilities.canRsvp,false);assert.equal(view.capabilities.canReadConversation,true);assert.equal(view.capabilities.canLeave,true);
 await assert.rejects(participate(db,'join'),code('PT409'));
 await assert.rejects(participate(db,'rsvp',{actor:IDS.reader,date:'2099-01-01'}),code('PT409'));
 assert.equal((await rpc(db,'soe_circle_messages_read',[IDS.reader,IDS.circle])).messages.length,2);
 assert.equal((await rpc(db,'soe_circle_messages_post',[IDS.reader,IDS.circle,'A fictional wrap-up contribution.','Fictional Reader'])).outcome,'confirmed');
 assert.equal((await rpc(db,'soe_circle_start',[IDS.host])).activeHosted,0);
 await participate(db,'leave',{actor:IDS.reader});
});

test('host completion is terminal, does not lift reviewer holds and preserves current-member wrap-up rights',async t=>{
 const db=await fixture(t);await assert.rejects(participate(db,'complete',{actor:IDS.reader}),code('PT403'));
 await db.query('UPDATE book_cohorts SET circle_hidden=true WHERE id=$1',[IDS.circle]);
 const completed=await participate(db,'complete',{actor:IDS.host});assert.equal(completed.state.completed,true);assert.equal(completed.state.hidden,true);assert.equal(completed.state.canComplete,false);
 await db.query('UPDATE book_cohorts SET circle_hidden=false WHERE id=$1',[IDS.circle]); // listing restoration does not reopen participation
 const view=await detail(db);assert.equal(view.ended,true);assert.equal(view.capabilities.canReadConversation,true);assert.equal(view.capabilities.canRsvp,false);
 await assert.rejects(db.query("UPDATE book_cohorts SET status='forming' WHERE id=$1",[IDS.circle]),code('PT409'));
 await assert.rejects(participate(db,'join'),code('PT409'));
 assert.equal((await rpc(db,'soe_circle_messages_post',[IDS.reader,IDS.circle,'A completed Circle can still wrap up.','Fictional Reader'])).outcome,'confirmed');
 const left=await participate(db,'leave',{actor:IDS.reader});assert.equal(left.state.completed,true);assert.equal(left.state.isMember,false);
});

test('hidden detail is self member/host only, exposes no meeting URL and still permits leaving/completion',async t=>{
 const db=await fixture(t);const input=await creationInput(db,{format:'online',venueType:'online',venueName:null,onlineUrl:'https://meet.example.invalid/PRIVATE_HIDDEN_URL'});
 const circle=await createCircle(db,{input});await participate(db,'join',{actor:IDS.reader,circle:circle.circleId});
 await db.query('UPDATE book_cohorts SET circle_hidden=true WHERE id=$1',[circle.circleId]);
 await assert.rejects(detail(db,null,circle.circleId),code('PT404'));await assert.rejects(detail(db,IDS.newcomer2,circle.circleId),code('PT404'));
 const member=await detail(db,IDS.reader,circle.circleId);assert.equal(member.online_url,null);assert.deepEqual(member.meetings,[]);assert.equal(member.capabilities.canLeave,true);assert.equal(member.capabilities.canReadConversation,false);
 await assert.rejects(participate(db,'join',{actor:IDS.newcomer2,circle:circle.circleId}),code('PT404'));
 await participate(db,'leave',{actor:IDS.reader,circle:circle.circleId});await participate(db,'leave',{actor:IDS.newcomer,circle:circle.circleId});
 const host=await detail(db,IDS.newcomer,circle.circleId);assert.equal(host.viewer.is_host,true);assert.equal(host.viewer.is_member,false);assert.equal(host.online_url,null);
 assert.equal((await participate(db,'complete',{actor:IDS.newcomer,circle:circle.circleId})).state.completed,true);
});

test('detail failures do not become false membership, zero RSVPs or a missing private URL success',async t=>{
 for(const table of ['book_cohort_members','circle_rsvps']) {
  const db=await fixture(t);await db.exec(`REVOKE SELECT ON ${table} FROM service_role;`);
  await assert.rejects(detail(db),code('42501'));
 }
 const db=await fixture(t);await db.query("UPDATE book_cohorts SET circle_format='online',circle_venue_type='online',circle_venue_name=NULL WHERE id=$1",[IDS.circle]);
 await assert.rejects(detail(db),code('PT503'));assert.equal((await detail(db,null)).online_url,null);
});

test('canonical self-management remains available with NULL calendar and authorizes fresh leave/completion',async t=>{
 const db=await fixture(t);
 await db.query('UPDATE book_cohorts SET start_date=NULL WHERE id=$1',[IDS.circle]);
 await assert.rejects(detail(db),code('PT503'));
 const member=await rpc(db,'soe_circle_membership_state',[IDS.reader,IDS.circle]);
 assert.equal(member.kind,'management');assert.equal(member.circle.id,IDS.circle);assert.equal(member.viewer.is_member,true);
 assert.deepEqual(member.capabilities,{canLeave:true,canComplete:false});
 for(const key of ['ended','nextMeeting','meetings','online_url','memberCount']) assert.equal(key in member,false);
 assert.equal('created_by' in member.circle,false);
 await assert.rejects(participate(db,'join'),code('PT503'));
 await assert.rejects(participate(db,'rsvp',{actor:IDS.reader,date:'2099-01-01'}),code('PT503'));
 const host=await rpc(db,'soe_circle_membership_state',[IDS.host,IDS.circle]);assert.equal(host.capabilities.canComplete,true);
 await participate(db,'leave',{actor:IDS.reader,revision:member.revision});
 await assert.rejects(rpc(db,'soe_circle_membership_state',[IDS.reader,IDS.circle]),code('PT404'));
 const currentHost=await rpc(db,'soe_circle_membership_state',[IDS.host,IDS.circle]);
 assert.equal((await participate(db,'complete',{actor:IDS.host,revision:currentHost.revision})).state.completed,true);
 assert.equal(await scalar(db,'SELECT start_date IS NULL FROM book_cohorts WHERE id=$1',[IDS.circle]),true);
});

test('missing private URL cannot trap self-management or poison the own-Circles list',async t=>{
 const db=await fixture(t);
 await db.query("UPDATE book_cohorts SET circle_format='online',circle_venue_type='online',circle_venue_name=NULL WHERE id=$1",[IDS.circle]);
 await assert.rejects(detail(db),code('PT503'));
 const mine=await rpc(db,'soe_circle_my_circles',[IDS.reader,null,25]);assert.equal(mine.items.length,1);assert.equal(mine.items[0].kind,'management');
 assert.deepEqual(mine.items[0].capabilities,{canLeave:true,canComplete:false});assert.equal('online_url' in mine.items[0],false);
 const publicView=await detail(db,null);assert.equal(publicView.capabilities.canJoin,false);assert.equal(publicView.capabilities.canRsvp,false);
 await assert.rejects(participate(db,'join'),code('PT503'));
 await assert.rejects(participate(db,'rsvp',{actor:IDS.reader,date:publicView.meetings[0].date}),code('PT503'));
 // The separate self-management authority has no dependency on private storage
 // or RSVP privileges and does not infer membership from a failed detail read.
 await db.exec('REVOKE SELECT ON circle_private,circle_rsvps FROM service_role;');
 const self=await rpc(db,'soe_circle_membership_state',[IDS.reader,IDS.circle]);assert.equal(self.capabilities.canLeave,true);
 await assert.rejects(rpc(db,'soe_circle_membership_state',[IDS.newcomer,IDS.circle]),code('PT404'));
 await assert.rejects(rpc(db,'soe_circle_membership_state',[null,IDS.circle]),code('PT403'));
});

test('a malformed legacy row produces an explicit management item beside normal self items in stable keyset order',async t=>{
 const db=await fixture(t);const created=await createCircle(db,{actor:IDS.reader});
 await db.query('UPDATE book_cohorts SET start_date=NULL,title=$2 WHERE id=$1',[IDS.circle,'x'.repeat(250)]);
 const first=await rpc(db,'soe_circle_my_circles',[IDS.reader,null,1]);assert.equal(first.items.length,1);assert.equal(first.nextCursor,first.items[0].circle.id);
 const second=await rpc(db,'soe_circle_my_circles',[IDS.reader,first.nextCursor,1]);assert.equal(second.items.length,1);assert.equal(second.nextCursor,null);
 const items=[...first.items,...second.items];assert.deepEqual(items.map(x=>x.circle.id),[IDS.circle,created.circleId].sort());
 const bad=items.find(x=>x.circle.id===IDS.circle);const good=items.find(x=>x.circle.id===created.circleId);
 assert.equal(bad.kind,'management');assert.equal(bad.circle.title,null);assert.equal('ended' in bad,false);assert.equal('start_date' in bad.circle,false);
 assert.equal(good.kind,'circle');assert.equal(typeof good.circle.start_date,'string');assert.equal(good.viewer.is_host,true);
 assert.equal(await scalar(db,'SELECT count(*)::int FROM circle_participation_receipts'),1);
 assert.equal(await scalar(db,'SELECT circle_participation_revision::text FROM book_cohorts WHERE id=$1',[IDS.circle]),'0');
});

test('my Circles uses bounded self-only keysets and keeps hosted Circles after host departure',async t=>{
 const db=await fixture(t);
 const template=(await db.query('SELECT * FROM book_cohorts WHERE id=$1',[IDS.circle])).rows[0];
 // Raw valid fixture rows now explicitly identify the immutable legacy path.
 for(let i=1;i<=27;i++) await db.query(`INSERT INTO book_cohorts(id,book_id,title,description,max_members,start_date,status,created_by,circle_format,circle_city,circle_venue_name,circle_venue_type,circle_weekday,circle_time,circle_timezone,circle_hidden,circle_path_id)
  VALUES($1,'soe-circles-path','Fictional hosted list circle',NULL,8,$2,'forming',$3,'in_person','Fictional City','Public library','library',$4,'19:00','UTC',$5,'starter-12')`,[uuid(i),template.start_date,IDS.newcomer,template.circle_weekday,i===1]);
 const first=await rpc(db,'soe_circle_my_circles',[IDS.newcomer,null,25]);assert.equal(first.items.length,25);assert.equal(first.nextCursor,first.items[24].circle.id);
 const next=await rpc(db,'soe_circle_my_circles',[IDS.newcomer,first.nextCursor,25]);assert.equal(next.items.length,2);assert.equal(next.nextCursor,null);
 for(const item of [...first.items,...next.items]) {assert.equal(item.viewer.is_host,true);assert.equal(item.viewer.is_member,false);assert.equal('online_url' in item,false);assert.equal('created_by' in item.circle,false);assert.equal('members' in item,false);}
 const reader=await rpc(db,'soe_circle_my_circles',[IDS.reader,null,25]);assert.deepEqual(reader.items.map(x=>x.circle.id),[IDS.circle]);
 await participate(db,'leave',{actor:IDS.reader});assert.deepEqual((await rpc(db,'soe_circle_my_circles',[IDS.reader,null,25])).items,[]);
 await assert.rejects(rpc(db,'soe_circle_my_circles',[IDS.reader,null,26]),code('PT400'));
});

test('receipts are exact per canonical actor and never reapply old membership intentions',async t=>{
 const db=await fixture(t);const key=requestId();const joined=await participate(db,'join',{actor:IDS.newcomer,key,revision:0});
 await assert.rejects(participate(db,'leave',{actor:IDS.newcomer,key,revision:0}),code('PT409'));
 await participate(db,'leave',{actor:IDS.newcomer});const replay=await participate(db,'join',{actor:IDS.newcomer,key,revision:0});
 assert.equal(replay.receipt.joined,true);assert.equal(replay.state.isMember,false);assert.equal(replay.replayed,true);assert.equal(replay.circleId,joined.circleId);
 await assert.rejects(db.exec("UPDATE circle_participation_receipts SET receipt='{}'::jsonb"),code('PT403'));
 await assert.rejects(db.exec('DELETE FROM circle_participation_receipts'),code('PT403'));
 await assert.rejects(participate(db,'join',{actor:uuid(999)}),code('PT403'));
});

test('browser roles retain no new execution/table authority and ordinary salons keep legacy DML',async t=>{
 const db=await fixture(t);await createCircle(db);
 for(const role of ['anon','authenticated']) {
  await assert.rejects(rpc(db,'soe_circle_start',[IDS.newcomer],role),code('42501'));
  await assert.rejects(rpc(db,'soe_circle_detail',[null,IDS.circle],role),code('42501'));
  await assert.rejects(rpc(db,'soe_circle_membership_state',[IDS.reader,IDS.circle],role),code('42501'));
  await assert.rejects(asRole(db,role,tx=>tx.exec('SELECT * FROM circle_participation_receipts')),code('42501'));
  await assert.rejects(asRole(db,role,tx=>tx.query('INSERT INTO book_cohort_members(cohort_id,member_id) VALUES($1,$2)',[IDS.circle,IDS.newcomer2])),code('42501'));
 }
 await db.exec('GRANT SELECT ON circle_participation_receipts TO authenticated;');
 assert.equal(await asRole(db,'authenticated',tx=>scalar(tx,'SELECT count(*)::int FROM circle_participation_receipts')),0);
 await asRole(db,'authenticated',tx=>tx.query('INSERT INTO book_cohort_members(cohort_id,member_id) VALUES($1,$2)',[IDS.salon,IDS.newcomer]));
 assert.equal(await scalar(db,'SELECT count(*)::int FROM book_cohort_members WHERE cohort_id=$1',[IDS.salon]),1);
 await assert.rejects(participate(db,'join',{circle:IDS.salon}),code('PT404'));
});

test('creation validates actual bounded calendar, venue, plain fields and exact safe JSON types',async t=>{
 const db=await fixture(t);const input=await creationInput(db);
 const far=await scalar(db,"SELECT to_char((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date+181,'YYYY-MM-DD')");
 for(const patch of [{maxMembers:2},{maxMembers:13},{maxMembers:3.5},{weekday:'3'},{weekday:7},{time:'24:00'},{timezone:'Invalid/Zone'},
   {title:'bad\nname'},{startDate:'2027-02-30'},{startDate:far},{format:'in_person',venueName:null},
   {format:'online',venueType:'online',venueName:null,onlineUrl:'https://user:password@example.invalid/'},
   {format:'online',venueType:'online',venueName:null,onlineUrl:'javascript:alert(1)'},{unexpected:'actor'}])
  await assert.rejects(createCircle(db,{input:{...input,...patch}}),code('PT400'));
 // Supply valid JSON scalar bytes to the typed jsonb parameter; malformed JSON
 // is rejected by PostgreSQL's parameter decoder before the function can run.
 for(const invalid of [null,'scalar',[],42]) await assert.rejects(rpc(db,'soe_circle_create',[IDS.newcomer,requestId(),JSON.stringify(invalid)]),code('PT400'));
 assert.equal(await scalar(db,'SELECT count(*)::int FROM circle_participation_receipts'),0);
 assert.equal(await scalar(db,'SELECT count(*)::int FROM book_cohorts WHERE created_by=$1',[IDS.newcomer]),0);
});

test('all participation reads leave schema data and revisions untouched',async t=>{
 const db=await fixture(t);const before=await scalar(db,'SELECT count(*)::int FROM circle_participation_receipts');
 await detail(db);await detail(db,null);await rpc(db,'soe_circle_my_circles',[IDS.reader,null,25]);await rpc(db,'soe_circle_start',[IDS.newcomer]);await rpc(db,'soe_circle_membership_state',[IDS.reader,IDS.circle]);
 assert.equal(await scalar(db,'SELECT count(*)::int FROM circle_participation_receipts'),before);
 assert.equal(await scalar(db,'SELECT circle_participation_revision::text FROM book_cohorts WHERE id=$1',[IDS.circle]),'0');
 assert.equal(await scalar(db,'SELECT count(*)::int FROM circle_message_states'),0);
});

test('revision ceiling rolls membership, RSVP and completion back instead of issuing unsafe numeric receipts',async t=>{
 const db=await fixture(t);const day=(await detail(db)).meetings[0].date;
 await db.query('UPDATE book_cohorts SET circle_participation_revision=9007199254740991 WHERE id=$1',[IDS.circle]);
 await assert.rejects(participate(db,'join'),code('PT409'));
 await assert.rejects(participate(db,'rsvp',{actor:IDS.reader,date:day}),code('PT409'));
 await assert.rejects(participate(db,'complete',{actor:IDS.host}),code('PT409'));
 assert.equal(await scalar(db,'SELECT count(*)::int FROM book_cohort_members WHERE cohort_id=$1',[IDS.circle]),3);
 assert.equal(await scalar(db,'SELECT count(*)::int FROM circle_rsvps'),0);
 assert.equal(await scalar(db,'SELECT status FROM book_cohorts WHERE id=$1',[IDS.circle]),'forming');
 assert.equal(await scalar(db,'SELECT count(*)::int FROM circle_participation_receipts'),0);
});

test('participation never lifts moderation holds or grants a participant review authority',async t=>{
 const db=await fixture(t);await participate(db,'join',{actor:IDS.reviewer});
 await assert.rejects(rpc(db,'soe_circle_message_review_detail',[IDS.reviewer,IDS.circle,IDS.message]),code('PT403'));
 await db.query('UPDATE book_cohorts SET circle_hidden=true WHERE id=$1',[IDS.circle]);
 await participate(db,'leave',{actor:IDS.reviewer});
 assert.equal(await scalar(db,'SELECT circle_hidden FROM book_cohorts WHERE id=$1',[IDS.circle]),true);
 assert.equal(await scalar(db,'SELECT count(*)::int FROM circle_reviewer_grants'),2);
});

test('preflight rejects altered policies, grants or disabled retention without a partial candidate',async t=>{
 const sql=await readFile(new URL('../../../docs/sql/circle-participation.sql',import.meta.url),'utf8');
 for(const mutation of ["ALTER POLICY circle_members_browser_restrict ON book_cohort_members USING(true) WITH CHECK(true)",
   'GRANT TRUNCATE ON seminar_messages TO authenticated','GRANT TRUNCATE ON circle_private TO PUBLIC','ALTER TABLE book_cohorts DISABLE TRIGGER circle_message_parent_retention']) {
  const db=await messageDb();t.after(()=>db.close());await configureParticipationFixture(db);await db.exec(mutation);
  await assert.rejects(db.exec(sql),/policy|grants|protection/);await db.exec('ROLLBACK');
  assert.equal(await scalar(db,"SELECT to_regclass('circle_participation_receipts') IS NULL"),true);
  assert.equal(await scalar(db,"SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name='book_cohorts' AND column_name='circle_participation_revision'"),0);
 }
});
