// Baseline audit observations, not an assertion that no-op API ordering is safe.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCircleAttendanceApp,TOKENS,ORIGIN} from './support/circle-attendance-app.mjs';
import {contributionSource} from './support/member-contributions-app.mjs';
await contributionSource('platforms/tests/load-source.mjs');
const {sourceLoader}=await import('../../../platforms/tests/load-source.mjs');
const baselineServer='36754555b6658ac9487348a90ac360d707510cf8a04367427bf06101d2dec8be';
const baselineCurrent=createHash('sha256').update(await contributionSource('lib/circles/membership-server.ts')).digest('hex')===baselineServer;
const audit=(name,run)=>test(name,{skip:baselineCurrent?false:'Historical 5a1fba4 observation; current fixed behavior is tested in circle-hosting-backend.test.mjs'},run);
const load=sourceLoader(),{createCircleDirectory}=load('platforms/shared/circle-directory.ts'),{defaultDiscoveryPageRequest}=load('lib/circles/discovery-page.ts');
const headers=who=>({authorization:'Bearer '+TOKENS[who??'author']});
const body=revision=>({requestId:crypto.randomUUID(),expectedRevision:revision});
const check=async(response,status=200)=>{assert.equal(response.status,status,await response.clone().text());return response.json();};
const deferred=()=>{let resolve;return{promise:new Promise(r=>resolve=r),resolve};};
async function setup(t,member=false){const f=await createCircleAttendanceApp();t.after(()=>f.close());const id=await f.seedCircle();if(member)await f.join(id);const path='/api/circles/'+id;
 return{f,id,path,read:(who='author')=>f.dispatch(path,{headers:headers(who)}),post:(action,value,who='author')=>f.dispatch(path+'/'+action,{method:'POST',headers:headers(who),body:value})};}
function hold(f,key){const entered=deferred(),release=deferred();f.beforeHttp(async call=>{if(call.method==='POST'&&JSON.parse(call.body).requestId===key){entered.resolve();await release.promise;}});return{entered:entered.promise,release:release.resolve};}
audit('baseline API accepts new join no-op at same revision and later held leave still commits',async t=>{
 const x=await setup(t,true),d=await check(await x.read()),older=body(d.revision),gate=hold(x.f,older.requestId),pending=x.post('leave',older);await gate.entered;
 const newer=await check(await x.post('join',body(d.revision)));assert.equal(newer.state.isMember,true);assert.equal(newer.state.revision,d.revision);gate.release();const late=await check(await pending);assert.equal(late.state.isMember,false);assert.equal(late.state.revision,d.revision+1);
});
audit('baseline API accepts new leave no-op at same revision and later held join still commits',async t=>{
 const x=await setup(t),d=await check(await x.read()),older=body(d.revision),gate=hold(x.f,older.requestId),pending=x.post('join',older);await gate.entered;
 const newer=await check(await x.post('leave',body(d.revision)));assert.equal(newer.state.isMember,false);assert.equal(newer.state.revision,d.revision);gate.release();const late=await check(await pending);assert.equal(late.state.isMember,true);assert.equal(late.state.revision,d.revision+1);
});
audit('changed membership action advances and rejects another held old-revision action',async t=>{
 const x=await setup(t),d=await check(await x.read()),older=body(d.revision),gate=hold(x.f,older.requestId),pending=x.post('join',older);await gate.entered;
 const newer=await check(await x.post('join',body(d.revision)));assert.equal(newer.state.revision,d.revision+1);gate.release();await check(await pending,409);assert.equal((await check(await x.read())).viewer.is_member,true);
});
audit('completion is terminal and fences a held earlier join; same-state completion has no reopen effect',async t=>{
 const x=await setup(t),d=await check(await x.read()),older=body(d.revision),gate=hold(x.f,older.requestId),pending=x.post('join',older);await gate.entered;
 const complete=await check(await x.post('complete',body(d.revision),'other'));assert.equal(complete.state.completed,true);assert.equal(complete.state.revision,d.revision+1);gate.release();await check(await pending,409);
 const duplicate=await check(await x.post('complete',body(complete.state.revision),'other'));assert.equal(duplicate.state.revision,complete.state.revision);assert.equal(duplicate.state.completed,true);
 await assert.rejects(x.f.db.query("UPDATE book_cohorts SET status='forming' WHERE id=$1",[x.id]),e=>e.code==='PT409');
});
audit('actual native controller does not expose either new no-op intent through reviewed controls',async t=>{
 const x=await setup(t),calls=[];const transport=async(url,options)=>{calls.push({url,method:options.method});const response=await x.f.dispatch(new URL(url).pathname+new URL(url).search,options);return{url,status:response.status,redirected:false,json:()=>response.json()};};
 const owner={scope:()=> 'synthetic-author',bearer:async()=>TOKENS.author,subscribe:()=>()=>{}};
 const directory=createCircleDirectory({origin:ORIGIN,owner,transport,publicTransport:transport,initialOnline:true,newRequestId:async()=>crypto.randomUUID()});t.after(()=>directory.close());directory.connect();assert.equal(calls.length,0);
 await directory.search(defaultDiscoveryPageRequest());await directory.select(x.id);assert.equal(directory.model().canPrepareJoin,true);assert.equal(directory.model().canPrepareLeave,false);
 const n=calls.length;await directory.prepare('leave');await directory.confirm();assert.equal(calls.length,n);
 await directory.prepare('join');await directory.confirm();assert.equal(directory.model().canPrepareJoin,false);assert.equal(directory.model().canPrepareLeave,true);
 const joined=calls.length;await directory.prepare('join');await directory.confirm();assert.equal(calls.length,joined);
});
