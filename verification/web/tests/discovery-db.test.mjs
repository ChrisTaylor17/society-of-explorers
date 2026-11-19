import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {generateProfile,buildSql} from '../scripts/generate-discovery-unicode.mjs';
import {createDb,createBaseDb,UNICODE_SQL,SEARCH_SQL,CATALOG,IDS,rpc,asRole,requestId,query,search,seed,circleId,participate} from './support/discovery-db.mjs';

const fixture=async t=>{const db=await createDb();t.after(()=>db.close());return db;};
const rejects=(fn,code)=>assert.rejects(fn,error=>error.code===code);
const folded=s=>s.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('en-US');
const value=async(db,sql,args=[])=>asRole(db,'service_role',async tx=>(await tx.query(sql,args)).rows[0].value);
const program=(sessions=[{from:0,to:124}])=>({version:1,bookId:CATALOG.editions[0].bookId,editionId:CATALOG.editions[0].editionId,sessions});
const hideOriginal=async db=>db.query("UPDATE book_cohorts SET status='completed' WHERE id=$1",[IDS.circle]);

test('discovery verification starts with external network transports disabled',()=>assert.throws(()=>fetch('https://fixture.invalid/never-send'),/EXTERNAL_NETWORK_DISABLED_IN_PRIVATE_BUILD/));

test('generated Unicode17 profile is reproducible and its SQL identity pins exact embedded data',async t=>{
 const db=await fixture(t),data=generateProfile();assert.equal(buildSql(data),UNICODE_SQL);
 assert.equal(await value(db,'SELECT public._soe_circle_discovery_unicode_identity() AS value'),createHash('sha256').update(JSON.stringify(data)).digest('hex'));
 assert.deepEqual(await value(db,'SELECT public._soe_circle_discovery_unicode_profile() AS value'),data);
});

test('actual SQL fold matches JavaScript for every valid non-NUL Unicode scalar, including new decomposition mappings',async t=>{
 const db=await fixture(t);let batch=[],scalars=0;
 const check=async()=>{const input=batch.join('\n');assert.equal(await value(db,'SELECT public._soe_circle_discovery_fold($1) AS value',[input]),folded(input));batch=[];};
 for(let cp=1;cp<=0x10ffff;cp++){if(cp>=0xd800&&cp<=0xdfff)continue;batch.push(String.fromCodePoint(cp));scalars++;if(batch.length===2048)await check();}
 if(batch.length)await check();assert.equal(scalars,1112063);
});

test('whole-string casing honors FinalSigma through cased and case-ignorable context rather than scalar lowercase',async t=>{
 const db=await fixture(t),cases=['ΟΣ','ΟΣΑ','Σ','ΣΣ','AΣ\u200d','AΣ\u200dB','\u200dΣ','A\u0345Σ','Σ\u0301','İ','I\u0307','ﬃ','Straße','Æ','A𝚺','A𝚺B'];
 for(let cp=1;cp<=0x10ffff;cp++){if(cp>=0xd800&&cp<=0xdfff)continue;const c=String.fromCodePoint(cp);if(/\p{Case_Ignorable}/u.test(c)){cases.push(`A${c}Σ`,`AΣ${c}`,`AΣ${c}B`,`${c}Σ`,`Σ${c}`);}}
 // PGlite's scalar text decoder strips a leading UTF8 BOM. Hex observes the
 // database bytes directly so that transport behavior cannot mask a fold bug.
 for(let i=0;i<cases.length;i+=128){const strings=cases.slice(i,i+128),rows=await asRole(db,'service_role',tx=>tx.query("SELECT encode(convert_to(public._soe_circle_discovery_fold(s),'UTF8'),'hex') AS value FROM unnest($1::text[]) WITH ORDINALITY x(s,n) ORDER BY n",[strings]));assert.deepEqual(rows.rows.map(x=>x.value),strings.map(s=>Buffer.from(folded(s)).toString('hex')));}
});

test('UTF16BE comparison and surrogate-safe clipping preserve JavaScript ordering and complete characters',async t=>{
 const db=await fixture(t),strings=['a','A','😀','\ue000','\ud7ff','\uffff','\u{10000}','\u{10ffff}','😀a','😀b','a😀','a\ue000'];
 const rows=await asRole(db,'service_role',tx=>tx.query("SELECT s,encode(public._soe_circle_discovery_utf16_key(s),'hex') AS key FROM unnest($1::text[])s ORDER BY public._soe_circle_discovery_utf16_key(s)",[strings]));
 assert.deepEqual(rows.rows.map(x=>x.s),[...strings].sort());
 for(const row of rows.rows)assert.equal(row.key,Buffer.from(row.s,'utf16le').swap16().toString('hex'));
 assert.equal(await value(db,'SELECT public._soe_circle_discovery_clip($1,40) AS value',['x'.repeat(39)+'😀tail']),'x'.repeat(39));
 assert.equal(await value(db,'SELECT public._soe_circle_discovery_clip($1,40) AS value',['x'.repeat(38)+'😀tail']),'x'.repeat(38)+'😀');
});

test('over200 stale forming rows cannot displace a later valid match and reads mutate no source or receipt data',async t=>{
 const db=await fixture(t);await hideOriginal(db);
 for(let n=1;n<=205;n++)await seed(db,{id:circleId(n),startOffset:-365,title:`An ended synthetic group ${n}`});
 const id=await seed(db,{id:circleId(900),title:'Findable future Circle'}),before=await value(db,"SELECT jsonb_build_object('members',(SELECT count(*) FROM book_cohort_members),'receipts',(SELECT count(*) FROM circle_participation_receipts),'states',(SELECT count(*) FROM circle_message_states)) AS value");
 const result=await search(db,{q:query({terms:['findable','future']})});assert.deepEqual(result.items.map(x=>x.circle.id),[id]);assert.equal(result.next,null);
 assert.deepEqual(await value(db,"SELECT jsonb_build_object('members',(SELECT count(*) FROM book_cohort_members),'receipts',(SELECT count(*) FROM circle_participation_receipts),'states',(SELECT count(*) FROM circle_message_states)) AS value"),before);
});

test('more than25 eligible rows page completely by actual tuple and do not depend on a mutable or deleted anchor row',async t=>{
 const db=await fixture(t);await hideOriginal(db);for(let n=1;n<=58;n++)await seed(db,{id:circleId(n),title:`Circle ${String(n).padStart(3,'0')}`});
 const first=await search(db);assert.equal(first.items.length,25);assert.deepEqual(first.next,{nextMeeting:first.items[24].nextMeeting,title:first.items[24].circle.title,id:first.items[24].circle.id});
 await db.query('UPDATE book_cohorts SET circle_hidden=true,title=$1 WHERE id=$2',['An altered title after the cursor was issued',first.next.id]);
 const second=await search(db,{after:first.next,calendarKey:first.calendarKey}),third=await search(db,{after:second.next,calendarKey:second.calendarKey});
 const ids=[...first.items,...second.items,...third.items].map(x=>x.circle.id);assert.equal(ids.length,58);assert.equal(new Set(ids).size,58);assert.equal(third.next,null);
 assert.equal(first.items.every(x=>!('created_by' in x.circle)&&!('circle_hidden' in x.circle)),true);
});

test('next-date and title sorts use folded titles then UUID ties with UTF16 ordering',async t=>{
 const db=await fixture(t);await hideOriginal(db);const cases=[['Éclair',2],['eclair',1],['😀',1],['\ue000',1],['Alpha',5]];
 for(let n=0;n<cases.length;n++)await seed(db,{id:circleId(n+1),title:cases[n][0],startOffset:cases[n][1]});
 const title=await search(db,{q:query({sort:'title'})});assert.deepEqual(title.items.map(x=>x.circle.title),cases.map(x=>x[0]).sort((a,b)=>folded(a)<folded(b)?-1:folded(a)>folded(b)?1:0));
 const next=await search(db);for(let n=1;n<next.items.length;n++){const a=next.items[n-1],b=next.items[n];assert.ok(a.nextMeeting<b.nextMeeting||a.nextMeeting===b.nextMeeting&&(folded(a.circle.title)<folded(b.circle.title)||folded(a.circle.title)===folded(b.circle.title)&&a.circle.id<b.circle.id));}
});

test('literalAND keyword city and hybrid-format filters search only safe projected public labels',async t=>{
 const db=await fixture(t);await hideOriginal(db);await db.query('UPDATE members SET display_name=$1 WHERE id=$2',['Élodie Human',IDS.host]);
 const id=await seed(db,{id:circleId(1),title:'Literal % _ [ River Circle',city:'Québec',region:'North',format:'hybrid'});
 for(const format of ['online','in_person',''])assert.deepEqual((await search(db,{q:query({terms:['%','_','[','élodie','genesis'],cityTerms:['quebec','north'],format})})).items.map(x=>x.circle.id),[id]);
 assert.equal((await search(db,{q:query({terms:['River','absent']})})).items.length,0);
 await db.query('UPDATE members SET display_name=$1 WHERE id=$2',['private@example.invalid',IDS.host]);
 assert.equal((await search(db,{q:query({terms:['private@example.invalid']})})).items.length,0);
 assert.equal((await search(db,{q:query({terms:['explorer']})})).items[0].hostName,'An explorer');
 for(const name of ['Alice\nBob','Alice\tBob','Alice\rBob']){await db.query('UPDATE members SET display_name=$1 WHERE id=$2',[name,IDS.host]);assert.equal((await search(db)).items[0].hostName,'An explorer');}
 await db.query('UPDATE members SET display_name=$1 WHERE id=$2',['x'.repeat(39)+'😀hiddenTail',IDS.host]);
 assert.equal((await search(db)).items[0].hostName,'x'.repeat(39));assert.equal((await search(db,{q:query({terms:['hiddenTail']})})).items.length,0);
 const json=JSON.stringify(await search(db));for(const privateValue of ['private-meeting-do-not-expose','reporter_member_id','online_url','member_id','created_by'])assert.equal(json.includes(privateValue),false);
});

test('book and current session searches use the trusted exact catalog without inventing wholebook coverage',async t=>{
 const db=await fixture(t);await hideOriginal(db);const edition=CATALOG.editions[0],p=program([{from:0,to:10},{from:5,to:8}]);
 const id=await seed(db,{program:p,title:'Selected passages only'});
 assert.deepEqual((await search(db,{q:query({book:edition.bookId,edition:edition.editionId,terms:[edition.author.split(' ')[0],'opening']})})).items.map(x=>x.circle.id),[id]);
 assert.equal((await search(db,{q:query({terms:['Complete source edition']})})).items.length,0);
 const wrong=CATALOG.editions[1];assert.equal((await search(db,{q:query({book:wrong.bookId,edition:wrong.editionId})})).items.length,0);
});

test('Philemon Circles can be found by exact edition and text even when the listing title omits it', async t => {
 const db = await fixture(t);
 await hideOriginal(db);
 const { bookId, editionId } = CATALOG.editions.find(edition => edition.bookId === 'philemon');
 const readingProgram = { version: 1, bookId, editionId, sessions: [{ from: 0, to: 0 }] };
 const id = await seed(db, { title: 'Weekly reading conversation', program: readingProgram });
 await seed(db, { id: circleId(2), title: 'Same night reading group' });
 const found = await search(db, { q: query({ book: bookId, edition: editionId, terms: ['philemon', 'complete'] }) });
 assert.deepEqual(found.items.map(item => item.circle.id), [id]);
 assert.equal(found.items[0].programLength, 1);
 await rejects(() => search(db, { q: query({ book: bookId, edition: CATALOG.editions[0].editionId }) }), 'PT400');
});

test('open-seat filtering uses exact current perCircle membership counts and no private roster',async t=>{
 const db=await fixture(t);await hideOriginal(db);const a=await seed(db,{id:circleId(1),max:3}),b=await seed(db,{id:circleId(2),max:3});
 await db.query('INSERT INTO book_cohort_members(cohort_id,member_id) VALUES($1,$2),($1,$3),($1,$4),($5,$2)',[a,IDS.author,IDS.reader,IDS.reporter2,b]);
 const all=await search(db);assert.equal(all.items.find(x=>x.circle.id===a).memberCount,3);assert.equal(all.items.find(x=>x.circle.id===b).memberCount,1);
 assert.deepEqual((await search(db,{q:query({open:true})})).items.map(x=>x.circle.id),[b]);
 await db.query('DELETE FROM book_cohort_members WHERE cohort_id=$1 AND member_id=$2',[a,IDS.author]);
 assert.equal((await search(db,{q:query({open:true})})).items.length,2);
});

test('finite1/2/12meeting calendars include the final local day all day and exclude the next day',async t=>{
 const db=await fixture(t);await hideOriginal(db);
 for(const [n,length]of [1,2,12].entries()){
  const id=await seed(db,{id:circleId(n+1),program:program(Array.from({length},()=>({from:0,to:10}))),time:'00:00',startOffset:0});
  await db.query("UPDATE book_cohorts SET start_date=((statement_timestamp() AT TIME ZONE 'UTC')::date-($2::int-1)*7)::timestamp AT TIME ZONE 'UTC' WHERE id=$1",[id,length]);
  const item=(await search(db)).items.find(x=>x.circle.id===id);assert.equal(item.programLength,length);assert.equal(item.week,length);assert.equal(item.phase,'in_progress');
  await db.query("UPDATE book_cohorts SET start_date=start_date-interval '7 days' WHERE id=$1",[id]);assert.equal((await search(db)).items.some(x=>x.circle.id===id),false);
 }
});

test('hidden completed null/extreme/malformed calendars and missing private configuration exclude only broken rows',async t=>{
 const db=await fixture(t);await hideOriginal(db);
 await seed(db,{id:circleId(1),hidden:true});await seed(db,{id:circleId(2),status:'completed'});await seed(db,{id:circleId(3),startOffset:null});
 await seed(db,{id:circleId(4)});await db.query("UPDATE book_cohorts SET start_date='infinity' WHERE id=$1",[circleId(4)]);
 await seed(db,{id:circleId(5)});await db.query("UPDATE book_cohorts SET start_date='9999-12-31+00' WHERE id=$1",[circleId(5)]);
 await seed(db,{id:circleId(6),time:'not-a-clock'});await seed(db,{id:circleId(7),timezone:'not-a-zone'});
 const broken=await seed(db,{id:circleId(8),format:'online'});await db.query('DELETE FROM circle_private WHERE cohort_id=$1',[broken]);
 await seed(db,{id:circleId(9),title:'\u00a0\uFEFF'});const good=await seed(db,{id:circleId(10)});
 assert.deepEqual((await search(db)).items.map(x=>x.circle.id),[good]);
});

test('calendarKey matches the canonical9zone JavaScript vector and continuation refuses a changed key',async t=>{
 const db=await fixture(t),first=await search(db,{limit:1});
 const zones=['America/New_York','America/Chicago','America/Denver','America/Phoenix','America/Los_Angeles','America/Anchorage','Pacific/Honolulu','Europe/London','UTC'];
 const dates=zones.map(zone=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(first.asOf)),get=x=>parts.find(p=>p.type===x).value;return[zone,`${get('year')}-${get('month')}-${get('day')}`];});
 assert.equal(first.calendarKey,createHash('sha256').update(JSON.stringify(dates)).digest('hex'));
 const after={nextMeeting:first.items[0].nextMeeting,title:first.items[0].circle.title,id:first.items[0].circle.id};
 await rejects(()=>search(db,{after,calendarKey:'0'.repeat(64)}),'PT409');await rejects(()=>search(db,{after}),'PT400');await rejects(()=>search(db,{calendarKey:first.calendarKey}),'PT400');
 const a=await value(db,"SELECT public._soe_circle_discovery_calendar_key('2026-11-03T04:00:00Z') AS value"),b=await value(db,"SELECT public._soe_circle_discovery_calendar_key('2026-11-03T05:00:00Z') AS value");assert.notEqual(a,b);
});

test('malformed query catalog limits and cursor shapes fail explicitly instead of returning false empty search',async t=>{
 const db=await fixture(t);
 for(const q of [null,{},query({actor:IDS.author}),query({terms:'bad'}),query({format:'hybrid'}),query({open:'true'}),query({sort:'sql'}),query({book:'apology',edition:null}),query({terms:[3]}),query({cityTerms:['bad\u0001']})])await rejects(()=>search(db,{q}),'PT400');
 for(const limit of [null,0,26,100])await rejects(()=>search(db,{limit}),'PT400');
 const first=await search(db);for(const after of [{},{nextMeeting:'2026-02-30',title:'Name',id:circleId(1)},{nextMeeting:'2026-02-28',title:'Name',id:'forged'},{nextMeeting:'2026-02-28',title:'Name',id:circleId(1),actor:IDS.author}])await rejects(()=>search(db,{after,calendarKey:first.calendarKey}),'PT400');
 for(const catalog of [null,{}, {...CATALOG,actor:IDS.author},{...CATALOG,starter:CATALOG.starter.slice(1)},{...CATALOG,editions:CATALOG.editions.map((x,i)=>i===0?{...x,editionId:'forged'}:x)}])await rejects(()=>search(db,{catalog}),'PT503');
});

test('service-only invoker/stable functions add no browser grants new user tables or profile writes',async t=>{
 const db=await fixture(t);for(const role of ['anon','authenticated'])await rejects(()=>rpc(db,'soe_circle_discovery_search',[query(),CATALOG,null,null,25],role),'42501');
 const rows=(await db.query("SELECT proname,prosecdef,provolatile FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname='soe_circle_discovery_search' OR proname LIKE '_soe_circle_discovery_%')")).rows;
 assert.equal(rows.every(x=>!x.prosecdef),true);assert.equal(rows.find(x=>x.proname==='soe_circle_discovery_search').provolatile,'s');
 assert.equal((await db.query("SELECT has_column_privilege('service_role','members','display_name','UPDATE') AS allowed")).rows[0].allowed,false);
 assert.equal(Number((await db.query("SELECT count(*) AS n FROM pg_class WHERE relnamespace='public'::regnamespace AND relname LIKE 'circle_discovery%' AND relkind='r'")).rows[0].n),0);
});

test('new discovery deltas leave every inherited function definition byte unchanged',async t=>{
 const db=await createBaseDb();t.after(()=>db.close());const definitions=async()=>(await db.query("SELECT p.oid::regprocedure::text AS signature,pg_get_functiondef(p.oid) AS definition FROM pg_proc p WHERE pronamespace='public'::regnamespace ORDER BY signature")).rows;
 const before=await definitions();await db.exec(UNICODE_SQL);await db.exec(SEARCH_SQL);assert.deepEqual((await definitions()).filter(x=>!x.signature.includes('circle_discovery_')),before);
});
