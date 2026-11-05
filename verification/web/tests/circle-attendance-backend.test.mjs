import test,{after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {createCircleAttendanceApp,TOKENS,ORIGIN} from './support/circle-attendance-app.mjs';
import {contributionSource,rpc} from './support/member-contributions-app.mjs';
import {createNativeReadingApp} from './support/native-reading-app.mjs';
let f,id,current,contract;
const h=(who='author')=>({authorization:'Bearer '+TOKENS[who]});
const path=()=>'/api/circles/'+id;
const read=(headers=h(),suffix='')=>f.dispatch(path()+suffix,{headers});
const post=(body,headers=h(),action='rsvp')=>f.dispatch(path()+'/'+action,{method:'POST',headers,body});
const input=(extra={})=>({expectedMemberId:f.authorId,requestId:crypto.randomUUID(),expectedRevision:current.revision,date:current.meetings[0].date,status:'going',...extra});
async function json(response,status=200){assert.equal(response.status,status);return response.json();}
async function role(query,args=[],name='service_role'){await f.db.exec('SET ROLE '+name);try{return await f.db.query(query,args);}finally{await f.db.exec('RESET ROLE');}}
async function script(name){await f.db.exec('SET ROLE postgres');await f.db.exec((await contributionSource('docs/sql/circle-attendance-'+name+'.sql')).toString());}
after(async()=>{await f?.close();});
beforeEach(async()=>{await f?.close();f=await createCircleAttendanceApp();contract=f.app.load('lib/circles/membership.ts');f.beforeHttp(null);f.transformHttp(null);f.transformDb(null);f.setCookieActor(null);await f.db.exec("ROLLBACK; RESET ROLE; UPDATE book_cohorts SET status='completed'");id=await f.seedCircle();await f.join(id);current=await json(await read());f.sql.length=0;f.http.length=0;});

test('strict mutation parser preserves canonical compact wire and rejects old/injected bodies',()=>{
 const body=input();assert.deepEqual(JSON.parse(contract.circleAttendanceMutationBody(body)),body);assert(Buffer.byteLength(contract.circleAttendanceMutationBody(body))<=contract.CIRCLE_ATTENDANCE_BODY_MAX_BYTES);
 for(const bad of [{...body,expectedMemberId:undefined},{...body,requestId:body.requestId.toUpperCase()},{...body,expectedRevision:-1},{...body,date:'2026-02-30'},{...body,status:null},{...body,status:['going']},{...body,status:{value:'going'}},{...body,role:'admin'}])assert.equal(contract.parseCircleAttendanceMutation(bad),null);
});
test('actual canonical bearer RSVP returns only the reviewed owner and public receipt',async()=>{
 const body=input(),response=await post(body),value=await json(response);assert.equal(value.memberId,f.authorId);assert.equal(value.state.revision,current.revision+1);assert.equal(value.receipt.date,body.date);assert.equal(value.receipt.status,'going');
 assert.match(response.headers.get('cache-control'),/private.*no-store/);assert.match(response.headers.get('vary'),/Authorization/);assert.doesNotMatch(JSON.stringify(value),/PRIVATE_AUTHOR_EMAIL|supabase_auth_id|wallet|roster|online_url/);
 assert.equal((await f.rsvpRow(id,body.date)).status,'going');assert.equal(f.sql.find(x=>x.name==='soe_circle_rsvp').args.p_actor,f.authorId);
});
test('every new same-value confirmation advances once; exact request replay never advances',async()=>{
 const first=input({status:'not_going'}),a=await json(await post(first));const second=input({status:'not_going',expectedRevision:a.state.revision}),b=await json(await post(second));assert.equal(b.state.revision,a.state.revision+1);
 const replay=await json(await post(second));assert.equal(replay.replayed,true);assert.equal(replay.state.revision,b.state.revision);assert.equal(await f.revision(id),b.state.revision);
});
test('held Going cannot overwrite a newer same-value Not going confirmation after local state loss',async()=>{
 const initial=await json(await post(input({status:'not_going'})));current=await json(await read());const held=input(),newer=input({status:'not_going'});let release,entered;
 const seen=new Promise(r=>entered=r),gate=new Promise(r=>release=r);f.beforeHttp(async call=>{if(call.method==='POST'&&JSON.parse(call.body).requestId===held.requestId){entered();await gate;}});
 const pending=post(held);await seen;const confirmed=await json(await post(newer));assert.equal(confirmed.state.revision,initial.state.revision+1);release();await json(await pending,409);
 assert.equal((await f.rsvpRow(id,held.date)).status,'not_going');assert.equal(await f.revision(id),confirmed.state.revision);
});
test('lost response to same-value confirmation is recovered only by exact key and does not double bump',async()=>{
 const first=await json(await post(input({status:'not_going'})));const body=input({status:'not_going',expectedRevision:first.state.revision});f.transformHttp(({method,response})=>{if(method==='POST')throw Error('SYNTHETIC_LOST_REPLY');return response;});await assert.rejects(post(body),/SYNTHETIC/);const committed=await f.revision(id);assert.equal(committed,first.state.revision+1);
 f.transformHttp(null);const replay=await json(await post(body));assert.equal(replay.replayed,true);assert.equal(replay.state.revision,committed);
});
test('request-key payload conflict refuses without changing the original response',async()=>{
 const body=input();await json(await post(body));await json(await post({...body,status:'not_going'}),409);assert.equal((await f.rsvpRow(id,body.date)).status,'going');
});
test('old RSVP bodies and actor or privilege injection never reach the RPC',async()=>{
 const body=input();for(const bad of [{requestId:body.requestId,expectedRevision:body.expectedRevision,date:body.date,status:body.status},{...body,memberId:f.actors.other},{...body,p_actor:f.actors.other},{...body,expectedMemberId:'BAD'},{...body,status:['going']},{...body,status:{value:'going'}},{...body,date:body.date+'T00:00:00Z'}])await json(await post(bad),400);
 assert.equal(f.sql.filter(x=>x.kind==='rpc').length,0);
});
test('canonical actor mismatch refuses body or optional header before SQL',async()=>{
 const body=input();await json(await post(body,h('other')),409);await json(await post(body,{...h(),'x-soe-expected-member':f.actors.other}),409);await json(await post(body,{...h(),'x-soe-expected-member':'INVALID'}),400);assert.equal(f.sql.filter(x=>x.kind==='rpc').length,0);
});
test('anonymous detail stays public; private expected-owner reads reject stale authority',async()=>{
 const pub=await json(await read({}));assert.equal(pub.viewer.signed_in,false);assert(pub.meetings.every(x=>x.my_status===null));assert.equal(pub.online_url,null);await json(await f.dispatch('/api/auth/member'),401);
 for(const suffix of ['', '/membership'])await json(await read({...h('other'),'x-soe-expected-member':f.authorId},suffix),409);
 await json(await read({'x-soe-expected-member':f.authorId}),401);
});
test('cookie account switch between proof and RSVP is refused by canonical expectedMemberId',async()=>{
 f.setCookieActor('author');const proof=await json(await f.dispatch('/api/auth/member'));assert.equal(proof.id??proof.member?.id,f.authorId);f.setCookieActor('other');await json(await post(input(),{origin:ORIGIN}),409);assert.equal(await f.rsvpRow(id,current.meetings[0].date),null);
});
test('actual signed wallet switch is guarded for join leave completion and private reads',async()=>{
 const a=await f.walletCookie('author'),b=await f.walletCookie('other');await json(await f.dispatch('/api/auth/member',{headers:{cookie:a}}));
 const headers={origin:ORIGIN,cookie:b,'x-soe-expected-member':f.authorId};for(const action of ['join','leave','complete'])await json(await post({requestId:crypto.randomUUID(),expectedRevision:current.revision},headers,action),409);
 await json(await read(headers),409);assert.equal(f.sql.filter(x=>x.kind==='rpc').length,0);
});
test('invalid explicit bearer cannot fall back to valid cookie or wallet',async()=>{
 f.setCookieActor('author');const cookie=await f.walletCookie();await json(await post(input(),{origin:ORIGIN,authorization:'Bearer invalid',cookie}),401);assert.equal(f.sql.filter(x=>x.kind==='rpc').length,0);
});
test('signed-out browser selection vetoes an otherwise valid bearer',async()=>{await json(await post(input(),{...h(),origin:ORIGIN,cookie:'soe_auth_provider=signed_out'}),401);assert.equal(f.sql.filter(x=>x.kind==='rpc').length,0);});
test('foreign origin and oversized streamed JSON are refused before SQL',async()=>{
 await json(await post(input(),{...h(),origin:'https://foreign.invalid'}),403);await json(await post('x'.repeat(12001)),413);assert.equal(f.sql.filter(x=>x.kind==='rpc').length,0);
});
test('exact date must belong to the finite current reading program',async()=>{
 const d=new Date(current.meetings[0].date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+14);await json(await post(input({date:d.toISOString().slice(0,10)})),400);d.setUTCDate(d.getUTCDate()-13);await json(await post(input({date:d.toISOString().slice(0,10)})),400);
});
test('a full Circle still accepts its existing member RSVP',async()=>{await f.join(id,'outsider');await f.db.query('UPDATE book_cohorts SET max_members=3 WHERE id=$1',[id]);const detail=await json(await read());current=detail;assert.equal(detail.circle.spots_left,0);assert.equal(detail.capabilities.canRsvp,true);await json(await post(input()));});
test('hidden completed and malformed schedules refuse new RSVP but retain leaving access',async()=>{
 await f.db.query('UPDATE book_cohorts SET circle_hidden=true WHERE id=$1',[id]);await json(await post(input()),404);await json(await read(h(),'/membership'));
 await f.db.query("UPDATE book_cohorts SET circle_hidden=false,circle_timezone='Invalid/Zone' WHERE id=$1",[id]);await json(await post(input()),503);await json(await read(h(),'/membership'));
 await f.db.query("UPDATE book_cohorts SET circle_timezone='UTC',status='completed' WHERE id=$1",[id]);await json(await post(input()),409);
});
test('nonmember cannot RSVP and leaving atomically removes responses',async()=>{
 const body=input();await json(await post(body));const revision=await f.revision(id);await json(await post({requestId:crypto.randomUUID(),expectedRevision:revision},h(),'leave'));assert.equal(await f.rsvpRow(id,body.date),null);await json(await post(input({expectedRevision:await f.revision(id)})),403);
});
test('historical exact replay after departure is read-only and reports current nonmembership',async()=>{
 const body=input(),receipt=await json(await post(body));await json(await post({requestId:crypto.randomUUID(),expectedRevision:receipt.state.revision},h(),'leave'));const replay=await json(await post(body));assert.equal(replay.replayed,true);assert.equal(replay.receipt.status,'going');assert.equal(replay.state.isMember,false);assert.equal(await f.rsvpRow(id,body.date),null);
});
test('member isolation shows only caller response while aggregate counts remain public',async()=>{
 await json(await post(input()));const other=await json(await read(h('other')));assert.equal(other.meetings[0].my_status,null);assert.equal(other.meetings[0].going,1);assert(!JSON.stringify(other).includes(f.authorId));
});
test('tampered receipt coordinates status request and revision fail unknown after an actual commit',async()=>{
 for(const mutate of [v=>v.circleId=f.actors.other,v=>v.requestId=f.actors.other,v=>v.receipt.date='2026-01-01',v=>v.receipt.status='not_going',v=>v.state.revision=current.revision]){
  current=await json(await read());f.transformDb(({name,result})=>{if(name==='soe_circle_rsvp'&&result.data)mutate(result.data);return result;});const response=await post(input());assert.equal(response.status,503);assert.equal((await response.json()).outcome,'unknown');f.transformDb(null);
 }
});
test('strict owner receipt parser rejects private extras and mismatched or missing owner',async()=>{
 const body=input(),value=await json(await post(body));assert(contract.parseCircleAttendanceReceipt(value,id,body.requestId,f.authorId));
 for(const bad of [{...value,memberId:f.actors.other},{...value,memberId:undefined},{...value,receipt:{...value.receipt,status:['going']}},{...value,privateNote:'x'},{...value,receipt:{...value.receipt,roster:[]}}, {...value,state:{...value.state,email:'x'}}])assert.equal(contract.parseCircleAttendanceReceipt(bad,id,body.requestId,f.authorId),null);
});
test('raw service DML and browser function execution cannot bypass reviewed RSVP ordering',async()=>{
 const body=input();await json(await post(body));for(const query of ['DELETE FROM circle_rsvps','UPDATE circle_rsvps SET status=\'not_going\'','TRUNCATE circle_rsvps','INSERT INTO circle_rsvps(cohort_id,member_id,meeting_date,status) VALUES($1,$2,$3,\'going\')'])await assert.rejects(role(query,query.startsWith('INSERT')?[id,f.authorId,body.date]:[]),e=>e.code==='42501');
 for(const name of ['anon','authenticated'])await assert.rejects(role('SELECT soe_circle_rsvp($1,$2,$3,$4,$5,$6)',[f.authorId,id,current.revision,crypto.randomUUID(),body.date,'going'],name),e=>e.code==='42501');
 assert.equal((await f.rsvpRow(id,body.date)).status,'going');
});
test('revision ceiling rejects even a new same-value request without partial mutation',async()=>{
 const body=input({status:'not_going'});await json(await post(body));await f.db.query('UPDATE book_cohorts SET circle_participation_revision=9007199254740991 WHERE id=$1',[id]);await json(await post(input({status:'not_going',expectedRevision:Number.MAX_SAFE_INTEGER})),409);assert.equal((await f.rsvpRow(id,body.date)).status,'not_going');
});
test('preflight rejects helper drift and installed raw-write privilege drift',async()=>{
 await f.db.exec('BEGIN; ALTER FUNCTION _soe_circle_participation_bump(uuid) SECURITY DEFINER');await assert.rejects(script('preflight'),e=>e.code==='PT409');await f.db.exec('ROLLBACK');
 await f.db.exec('BEGIN; GRANT UPDATE ON circle_rsvps TO service_role');await assert.rejects(script('apply'),e=>e.code==='PT409');await f.db.exec('ROLLBACK');await script('preflight');
});
test('disable rollback preserves rows receipts ordering and operational leave; reapply restores RSVP',async()=>{
 const body=input(),saved=await json(await post(body)),count=await f.receiptCount();await script('rollback');assert.equal((await f.rsvpRow(id,body.date)).status,'going');assert.equal(await f.receiptCount(),count);await json(await post(body),503);
 await json(await post({requestId:crypto.randomUUID(),expectedRevision:saved.state.revision},h(),'leave'));assert.equal(await f.rsvpRow(id,body.date),null);await script('apply');const replay=await json(await post(body));assert.equal(replay.state.isMember,false);assert.equal(replay.replayed,true);
});

test('detail parser rejects off-plan first dates weekdays and finite program coordinates',()=>{
 assert(contract.parseCircleDetail(current,id));
 const day=(days)=>new Date(Date.parse(current.circle.first_meeting+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
 for(const change of [v=>v.circle.first_meeting=day(1),v=>v.circle.weekday=(v.circle.weekday+1)%7,v=>{v.meetings[0].date=day(1);v.circle.next_meeting=day(1);},v=>{v.meetings=[{...v.meetings[0],date:day(14)}];v.circle.next_meeting=day(14);},v=>{v.meetings=[{...v.meetings[0],date:day(-7)}];v.circle.next_meeting=day(-7);}]){
  const bad=structuredClone(current);change(bad);assert.equal(contract.parseCircleDetail(bad,id),null);
 }
});
test('actual detail handler refuses an off-program SQL date projection before attendance review',async()=>{
 f.transformDb(({name,result})=>{if(name==='soe_circle_detail'&&result.data){const d=new Date(result.data.meetings[0].date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);result.data.meetings[0].date=d.toISOString().slice(0,10);result.data.nextMeeting=result.data.meetings[0].date;}return result;});
 const value=await json(await read(),503);assert.equal('meetings' in value,false);assert.equal('circle' in value,false);
});

test('migration preserves pre-existing responses and immutable old no-op receipts without fabricating a newer revision',async()=>{
 const old=await createNativeReadingApp();try{
  const circle=await old.seedCircle();await old.join(circle);const detail=await old.membership(circle),date=detail.meetings[0].date;
  const first=await rpc(old.db,'soe_circle_rsvp',[old.authorId,circle,detail.revision,crypto.randomUUID(),date,'not_going']);const key=crypto.randomUUID();
  const noop=await rpc(old.db,'soe_circle_rsvp',[old.authorId,circle,first.state.revision,key,date,'not_going']);assert.equal(noop.state.revision,first.state.revision);
  const beforeRows=(await old.db.query('SELECT row_to_json(r) AS value FROM circle_rsvps r ORDER BY id')).rows;
  const beforeReceipts=(await old.db.query('SELECT row_to_json(r) AS value FROM circle_participation_receipts r ORDER BY actor_member_id,request_id')).rows;
  await old.db.exec('SET ROLE postgres');for(const name of ['preflight','apply'])await old.db.exec((await contributionSource('docs/sql/circle-attendance-'+name+'.sql')).toString());
  assert.deepEqual((await old.db.query('SELECT row_to_json(r) AS value FROM circle_rsvps r ORDER BY id')).rows,beforeRows);
  assert.deepEqual((await old.db.query('SELECT row_to_json(r) AS value FROM circle_participation_receipts r ORDER BY actor_member_id,request_id')).rows,beforeReceipts);
  const replay=await rpc(old.db,'soe_circle_rsvp',[old.authorId,circle,first.state.revision,key,date,'not_going']);assert.equal(replay.replayed,true);assert.equal(replay.state.revision,first.state.revision);
  const next=await rpc(old.db,'soe_circle_rsvp',[old.authorId,circle,first.state.revision,crypto.randomUUID(),date,'not_going']);assert.equal(next.state.revision,first.state.revision+1);
 }finally{await old.close();}
});
