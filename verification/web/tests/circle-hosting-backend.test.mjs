import test,{after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {createPublicProfileApp,TOKENS,ORIGIN,SUBJECTS} from './support/public-profile-app.mjs';
import {createCircleAttendanceApp} from './support/circle-attendance-app.mjs';
import {contributionSource,rpc} from './support/member-contributions-app.mjs';
let f,contract;
const headers=(who='author')=>({authorization:'Bearer '+TOKENS[who]});
const intent='c1000000-0000-4000-8000-000000000001';
const selectedCookies=(provider,subject)=>`soe_auth_provider=${provider}; soe_auth_intent=${intent}; soe_auth_selection_v1=v1.${intent}.${provider}.${subject}`;
const json=async(response,status=200)=>{assert.equal(response.status,status,await response.clone().text());return response.json();};
const post=(body,h=headers())=>f.dispatch('/api/circles',{method:'POST',headers:h,body});
const complete=(id,body,h=headers())=>f.dispatch(`/api/circles/${id}/complete`,{method:'POST',headers:h,body});
const action=(revision,member=f.authorId)=>({expectedMemberId:member,requestId:crypto.randomUUID(),expectedRevision:revision});
const detail=id=>f.dispatch('/api/circles/'+id,{headers:headers()});
const memberPost=(id,name,body)=>f.dispatch(`/api/circles/${id}/${name}`,{method:'POST',headers:headers(),body});
const membership=revision=>({requestId:crypto.randomUUID(),expectedRevision:revision});
async function script(db,name){await db.exec('SET ROLE postgres');await db.exec((await contributionSource('docs/sql/circle-membership-intent-'+name+'.sql')).toString());}
const deferred=()=>{let resolve;return{promise:new Promise(r=>resolve=r),resolve};};
function hold(key){const arrived=deferred(),release=deferred();f.beforeHttp(async call=>{if(call.method==='POST'&&JSON.parse(call.body).requestId===key){arrived.resolve();await release.promise;}});return{arrived:arrived.promise,release:release.resolve};}
beforeEach(async()=>{await f?.close();f=await createPublicProfileApp();contract=f.app.load('lib/circles/hosting.ts');});
after(async()=>{await f?.close();});

test('create parser uses exact normalized field types and canonical wire order',async()=>{
 const body=await f.createBody();assert.deepEqual(JSON.parse(contract.circleCreateMutationBody(body)),body);assert(Buffer.byteLength(contract.circleCreateMutationBody(body))<=12000);
 for(const bad of [{...body,expectedMemberId:undefined},{...body,requestId:'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'},{...body,weekday:String(body.weekday)},{...body,maxMembers:'8'},{...body,title:' '+body.title},{...body,format:['in_person']},{...body,timezone:'toString'},{...body,role:'host'}])assert.equal(contract.parseCircleCreateMutation(bad),null);
});
test('historical normalized date remains parseable for exact retry but a new old-date creation is refused by SQL',async()=>{
 const body=await f.createBody({startDate:'2000-01-01'});assert(contract.parseCircleCreateMutation(body));await json(await post(body),400);assert.equal(f.sql.filter(x=>x.name==='soe_circle_create').length,1);
});
test('optional pinned reading program is exact and permits semantic key order without accepting hidden fields',async()=>{
 const meta=await json(await f.dispatch('/api/great-books/text/hamlet'));const body=await f.createBody({readingProgram:{sessions:[{to:43,from:41}],editionId:meta.edition.editionId,bookId:'hamlet',version:1}});
 const parsed=contract.parseCircleCreateMutation(body);assert(parsed);assert.deepEqual(Object.keys(parsed.readingProgram),['version','bookId','editionId','sessions']);
 for(const extra of [{...body,readingProgram:{...body.readingProgram,role:'host'}},{...body,readingProgram:{...body.readingProgram,sessions:[{from:41,to:43,secret:'x'}]}}])assert.equal(contract.parseCircleCreateMutation(extra),null);
 await json(await post(parsed));assert.equal((await f.hosted())[0].circle_reading_program.sessions[0].from,41);
});
test('all eight edition metadata replies execute the real materialized source resolver anonymously',async()=>{
 for(const book of ['republic','meditations','genealogy-of-morals','apology','odyssey','divine-comedy','hamlet','relativity']){const value=await json(await f.dispatch('/api/great-books/text/'+book));assert.equal(value.bookId,book);assert.match(value.edition.editionId,/^pg-/);assert(value.edition.attribution);}
 assert.equal(f.provider.length,0);assert.equal(f.sql.length,0);
});
test('hosting access is owner-aware and stale optional header refuses a switched cookie before RPC',async()=>{
 const response=await f.dispatch('/api/circles/start',{headers:headers()}),value=await json(response);assert.equal(value.memberId,f.authorId);assert(contract.parseCircleHostingAccess(value,f.authorId));assert.equal(contract.parseCircleHostingAccess(value,f.actors.other),null);
 assert.equal(contract.parseCircleHostingAccess({...value,email:'private'},f.authorId),null);f.sql.length=0;f.setCookieActor('other');
 await json(await f.dispatch('/api/circles/start',{headers:{cookie:selectedCookies('supabase',SUBJECTS.other),'x-soe-expected-member':f.authorId}}),409);assert.equal(f.sql.filter(x=>x.kind==='rpc').length,0);
});
test('create rejects old unowned injected malformed and conflicting bodies before side effects',async()=>{
 const body=await f.createBody();const {expectedMemberId:unused,...old}=body;void unused;
 for(const bad of [old,{...body,memberId:f.actors.other},{...body,created_by:f.actors.other},{...body,requestId:[]},{...body,readingProgram:null}])await json(await post(bad),400);
 await json(await post(body,headers('other')),409);assert.equal(f.sql.filter(x=>x.name==='soe_circle_create').length,0);assert.equal((await f.hosted()).length,0);
});
test('canonical create binds owner receipt and writes only normalized listing through one atomic RPC',async()=>{
 const body=await f.createBody(),response=await post(body),value=await json(response);assert.equal(value.memberId,f.authorId);assert.equal(value.requestId,body.requestId);assert.equal(value.state.revision,1);assert.equal(value.state.isHost,true);
 assert(contract.parseOwnedCircleCreateReceipt(value,body.requestId,f.authorId));assert.match(response.headers.get('cache-control'),/private.*no-store/);assert.doesNotMatch(JSON.stringify(value),/email|supabase_auth_id|onlineUrl|wallet/);
 const call=f.sql.find(x=>x.name==='soe_circle_create');assert.equal(call.args.p_actor,f.authorId);assert.equal(Object.hasOwn(call.args.p_input,'expectedMemberId'),false);assert.equal(Object.hasOwn(call.args.p_input,'requestId'),false);assert.equal((await f.hosted()).length,1);
});
test('lost creation reply replays the same key into one Circle and current state',async()=>{
 const body=await f.createBody();f.transformHttp(({path,method,response})=>{if(path==='/api/circles'&&method==='POST')throw Error('SYNTHETIC_LOST_CREATE');return response;});await assert.rejects(post(body),/SYNTHETIC/);assert.equal((await f.hosted()).length,1);
 f.transformHttp(null);const replay=await json(await post(body));assert.equal(replay.replayed,true);assert.equal((await f.hosted()).length,1);assert.equal((await json(await detail(replay.circleId))).viewer.is_host,true);
});
test('a refused retry does not settle an earlier held creation and the old request may still commit',async()=>{
 const body=await f.createBody(),gate=hold(body.requestId),pending=post(body);await gate.arrived;f.beforeHttp(()=>new Response(JSON.stringify({outcome:'not_attempted'}),{status:429}));await json(await post(body),429);assert.equal((await f.hosted()).length,0);gate.release();await json(await pending);assert.equal((await f.hosted()).length,1);
});
test('a deliberately different create key is a separate listing, not deduplication of an unknown request',async()=>{
 const body=await f.createBody(),a=await json(await post(body)),b=await json(await post({...body,requestId:crypto.randomUUID()}));assert.notEqual(a.circleId,b.circleId);assert.equal((await f.hosted()).length,2);
});
test('same create key with a changed listing conflicts without creating another Circle',async()=>{
 const body=await f.createBody();await json(await post(body));await json(await post({...body,title:'Different synthetic listing'}),409);assert.equal((await f.hosted()).length,1);
});
test('cookie and actual signed-wallet owner changes cannot create under the wrong reviewed account',async()=>{
 const body=await f.createBody();f.setCookieActor('other');
 await json(await post(body,{origin:ORIGIN,cookie:selectedCookies('supabase',SUBJECTS.other)}),409);f.setCookieActor(null);
 const walletSession=(await f.walletCookie('other')).split('; ').find(value=>value.startsWith('soe_wallet_id='));
 assert(walletSession);
 const wallet=selectedCookies('wallet',f.actors.other)+'; '+walletSession;
 await json(await post(body,{origin:ORIGIN,cookie:wallet}),409);assert.equal((await f.hosted('author')).length,0);
});
test('invalid explicit bearer cannot borrow valid hosting cookie authority and cross-origin writes are refused',async()=>{
 f.setCookieActor('author');const body=await f.createBody(),cookie=selectedCookies('supabase',SUBJECTS.author);
 assert.equal((await json(await f.dispatch('/api/auth/member',{headers:{cookie}}))).member.id,f.authorId);
 await json(await post(body,{authorization:'Bearer invalid',origin:ORIGIN,cookie}),401);
 await json(await post(body,{...headers(),origin:'https://foreign.invalid'}),403);assert.equal(f.sql.filter(x=>x.name==='soe_circle_create').length,0);
});
test('host quotas still apply after owner-bound validation',async()=>{
 for(let i=0;i<3;i++)await json(await post(await f.createBody({title:'Synthetic listing '+i})));await json(await post(await f.createBody()),409);const current=await json(await f.dispatch('/api/circles/start',{headers:headers()}));assert.equal(current.canCreate,false);assert.equal(current.activeHosted,3);
});
test('complete parser and server refuse old ownerless or cross-account requests',async()=>{
 const created=await json(await post(await f.createBody())),body=action(created.state.revision);assert(Buffer.byteLength(contract.circleCompleteMutationBody(body))<=160);
 for(const bad of [{requestId:body.requestId,expectedRevision:body.expectedRevision},{...body,expectedRevision:[1]},{...body,memberId:f.authorId}]){assert.equal(contract.parseCircleCompleteMutation(bad),null);await json(await complete(created.circleId,bad),400);}
 await json(await complete(created.circleId,body,headers('other')),409);assert.equal(f.sql.filter(x=>x.name==='soe_circle_complete').length,0);
});
test('only the host completes, preserving existing member discussion and exact receipt replay',async()=>{
 const created=await json(await post(await f.createBody()));await json(await complete(created.circleId,action(created.state.revision,f.actors.other),headers('other')),403);
 const body=action(created.state.revision),value=await json(await complete(created.circleId,body));assert.equal(value.memberId,f.authorId);assert(contract.parseOwnedCircleCompleteReceipt(value,created.circleId,body.requestId,f.authorId));assert.equal(value.state.completed,true);assert.equal(value.state.canReadConversation,true);
 const replay=await json(await complete(created.circleId,body));assert.equal(replay.replayed,true);assert.equal(replay.state.revision,value.state.revision);assert.equal((await json(await detail(created.circleId))).capabilities.canJoin,false);
});
test('new completion no-op remains accepted at the same revision because completion is terminal',async()=>{
 const created=await json(await post(await f.createBody())),first=await json(await complete(created.circleId,action(created.state.revision))),again=await json(await complete(created.circleId,action(first.state.revision)));assert.equal(again.state.revision,first.state.revision);assert.equal(again.state.completed,true);
 await assert.rejects(f.db.query("UPDATE book_cohorts SET status='forming' WHERE id=$1",[created.circleId]),e=>e.code==='PT409');
});
test('completion remains available after host leave and reveals current nonmembership alongside history',async()=>{
 const created=await json(await post(await f.createBody())),left=await json(await memberPost(created.circleId,'leave',membership(created.state.revision))),body=action(left.state.revision);const done=await json(await complete(created.circleId,body));assert.equal(done.state.isHost,true);assert.equal(done.state.isMember,false);assert.equal(done.state.completed,true);
});
test('owned create and complete receipt parsers reject arrays private extras and wrong owner or request',async()=>{
 const body=await f.createBody(),created=await json(await post(body)),doneBody=action(created.state.revision),done=await json(await complete(created.circleId,doneBody));
 for(const[value,parse]of [[created,v=>contract.parseOwnedCircleCreateReceipt(v,body.requestId,f.authorId)],[done,v=>contract.parseOwnedCircleCompleteReceipt(v,created.circleId,doneBody.requestId,f.authorId)]]){
  for(const bad of [{...value,memberId:f.actors.other},{...value,requestId:crypto.randomUUID()},{...value,receipt:{...value.receipt,action:[value.receipt.action]}},{...value,receipt:{...value.receipt,status:[]}},{...value,email:'private'},{...value,state:{...value.state,privateNote:'x'}}])assert.equal(parse(bad),null);
 }
});
test('malformed raw SQL confirmation becomes unknown after actual creation without leaking private fields',async()=>{
 f.transformDb(({name,result})=>{if(name==='soe_circle_create'&&result.data)result.data.requestId=crypto.randomUUID();return result;});const response=await post(await f.createBody()),value=await json(response,503);assert.equal(value.outcome,'unknown');assert.equal((await f.hosted()).length,1);assert.equal('circleId' in value,false);
});
test('new join no-op advances once and fences an older held leave; exact replay is read-only',async()=>{
 const id=await f.seedCircle();await f.join(id);const d=await json(await detail(id)),older=membership(d.revision),gate=hold(older.requestId),pending=memberPost(id,'leave',older);await gate.arrived;
 const latest=membership(d.revision),confirmed=await json(await memberPost(id,'join',latest));assert.equal(confirmed.state.revision,d.revision+1);gate.release();await json(await pending,409);const replay=await json(await memberPost(id,'join',latest));assert.equal(replay.replayed,true);assert.equal(replay.state.revision,confirmed.state.revision);assert.equal(replay.state.isMember,true);
});
test('new leave no-op advances once and fences an older held join',async()=>{
 const id=await f.seedCircle(),d=await json(await detail(id)),older=membership(d.revision),gate=hold(older.requestId),pending=memberPost(id,'join',older);await gate.arrived;
 const confirmed=await json(await memberPost(id,'leave',membership(d.revision)));assert.equal(confirmed.state.revision,d.revision+1);gate.release();await json(await pending,409);assert.equal((await json(await detail(id))).viewer.is_member,false);
});
test('join/leave request-key payload conflict and historical replay cannot replace later membership',async()=>{
 const id=await f.seedCircle(),d=await json(await detail(id)),join=membership(d.revision),joined=await json(await memberPost(id,'join',join));await json(await memberPost(id,'leave',join),409);const left=await json(await memberPost(id,'leave',membership(joined.state.revision)));const replay=await json(await memberPost(id,'join',join));assert.equal(replay.receipt.joined,true);assert.equal(replay.state.isMember,false);assert.equal(replay.state.revision,left.state.revision);
});
test('intent candidate preserves RSVP rows and exact attendance replay while old attendance preflight refuses newer leave body',async()=>{
 const id=await f.seedCircle();await f.join(id);const d=await json(await detail(id)),rsvp={...action(d.revision),date:d.meetings[0].date,status:'going'};const saved=await json(await memberPost(id,'rsvp',rsvp));const repeat=await json(await memberPost(id,'rsvp',rsvp));assert.equal(repeat.state.revision,saved.state.revision);assert.equal((await f.rsvpRow(id,rsvp.date)).status,'going');
 await f.db.exec('SET ROLE postgres');await assert.rejects(f.db.exec((await contributionSource('docs/sql/circle-attendance-preflight.sql')).toString()),e=>e.code==='PT409');await f.db.exec('ROLLBACK');await script(f.db,'preflight');
});
test('disable-only intent rollback keeps fixed leave and data; reapply enables joining',async()=>{
 const id=await f.seedCircle(),d=await json(await detail(id));await script(f.db,'rollback');await json(await memberPost(id,'join',membership(d.revision)),503);const left=await json(await memberPost(id,'leave',membership(d.revision)));assert.equal(left.state.revision,d.revision+1);await script(f.db,'apply');const joined=await json(await memberPost(id,'join',membership(left.state.revision)));assert.equal(joined.state.isMember,true);
});
test('intent preflight refuses changed helper definitions and restored raw RSVP write privileges',async()=>{
 await f.db.exec('SET ROLE postgres; BEGIN; ALTER FUNCTION _soe_circle_participation_bump(uuid) SECURITY DEFINER');await assert.rejects(script(f.db,'preflight'),e=>e.code==='PT409');await f.db.exec('ROLLBACK; SET ROLE postgres; BEGIN; GRANT UPDATE ON circle_rsvps TO service_role');await assert.rejects(script(f.db,'apply'),e=>e.code==='PT409');await f.db.exec('ROLLBACK');await script(f.db,'preflight');
});
test('old same-revision membership receipts are retained but new server refuses them until later current state advances',async()=>{
 const old=await createCircleAttendanceApp();try{const id=await old.seedCircle();await old.join(id);const d=await old.membership(id),key=crypto.randomUUID();const before=await rpc(old.db,'soe_circle_join',[old.authorId,id,d.revision,key]);assert.equal(before.state.revision,d.revision);
  const row=(await old.db.query('SELECT payload,receipt FROM circle_participation_receipts WHERE actor_member_id=$1 AND request_id=$2',[old.authorId,key])).rows[0];await script(old.db,'apply');
  assert.deepEqual((await old.db.query('SELECT payload,receipt FROM circle_participation_receipts WHERE actor_member_id=$1 AND request_id=$2',[old.authorId,key])).rows[0],row);
  const request=()=>old.dispatch(`/api/circles/${id}/join`,{method:'POST',headers:headers(),body:{requestId:key,expectedRevision:d.revision}});assert.equal((await json(await request(),503)).outcome,'unknown');
  await rpc(old.db,'soe_circle_join',[old.authorId,id,d.revision,crypto.randomUUID()]);const replay=await json(await request());assert.equal(replay.replayed,true);assert.equal(replay.state.revision,d.revision+1);
 }finally{await old.close();}
});
