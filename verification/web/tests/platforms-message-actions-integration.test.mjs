import test from 'node:test';
import assert from 'node:assert/strict';
import {lstat,stat} from 'node:fs/promises';
const ROOT=new URL('../../../',import.meta.url);
for(const name of ['verification/web/tests/support/platforms-message-actions-app.mjs','platforms/tests/load-source.mjs']){const file=new URL(name,ROOT),link=await lstat(file),info=await stat(file);assert.equal(link.isSymbolicLink(),false);assert.ok(!info.size||info.blocks,'Refuse offloaded safety source');}
const {createPlatformsMessageActionsApp,TOKENS,ORIGIN,requestId,rpc}=await import('./support/platforms-message-actions-app.mjs');
const {sourceLoader}=await import('../../../platforms/tests/load-source.mjs');
const {createCircleHost}=sourceLoader()('platforms/native/src/circles/host.ts');
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};}
async function fixture(t,{actor='reporter',keyFactory=async()=>requestId(),timeoutMs=15000}={}){
 const f=await createPlatformsMessageActionsApp({actor});t.after(()=>f.close());
 let scope='synthetic-safety-owner',credentialGate=null;const listeners=new Set(),requests=[];
 const owner={scope:()=>scope,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},async bearer(expected){if(credentialGate)await credentialGate.promise;return expected===scope?TOKENS[actor]:null;}};
 const host=createCircleHost({circleId:f.circleId,origin:ORIGIN,owner,timeoutMs,...(keyFactory===null?{}:{newRequestId:keyFactory}),transport:async(url,init)=>{
  assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.equal(init.headers.Authorization,'Bearer '+TOKENS[actor]);assert.equal(init.signal.aborted,false);
  requests.push({url,method:init.method,body:init.body});const response=await f.dispatch(url,{method:init.method,headers:init.headers,body:init.body,signal:init.signal});
  return{status:response.status,url,redirected:false,json:()=>response.json()};
 }});host.connect();t.after(()=>host.close());
 return{...f,host,requests,credentials(gate){credentialGate=gate;},retire(){scope=null;for(const listener of listeners)listener();}};
}
async function openSafety(f){await f.host.openArchive();assert.equal(f.host.model().archive.phase,'ready');assert.ok(f.host.model().archive.page.items.some(x=>x.id===f.messageId));await f.host.messageOpen(f.messageId);assert.equal(f.host.model().messageSafety.phase,'ready');assert.equal(f.host.model().archive.page,null);assert.equal(f.host.model().threadWrite.preview,null);return f.host.model().messageSafety.state;}
function prepareReport(f,note='PRIVATE_SYNTHETIC_ACTION_NOTE'){f.host.messageReason('safety');f.host.messageNote(note);f.host.messageConfirm(true);assert.equal(f.host.model().messageSafety.canReport,true);}
const posts=f=>f.requests.filter(x=>x.method==='POST');
test('actual host fresh state, explicit report, actor-bound receipt and fresh archive preserve report-note privacy',async t=>{
 const f=await fixture(t),before=await f.counts(),state=await openSafety(f);assert.equal(state.message.is_mine,false);assert.equal(state.canReport,true);assert.equal(state.canWithdraw,false);prepareReport(f);await f.host.messageSubmit('report');
 const m=f.host.model().messageSafety;assert.equal(m.phase,'confirmed');assert.equal(m.receipt.received,true);assert.equal(m.receipt.replayed,false);assert.equal(m.state.revision,state.revision+1);assert.equal(m.pendingRequestId,null);assert.equal(m.note,'');assert.equal(JSON.stringify(m).includes('PRIVATE_SYNTHETIC_ACTION_NOTE'),false);
 const after=await f.counts();assert.equal(after.reports,before.reports+1);assert.equal(after.receipts,before.receipts+1);const stored=(await f.db.query('SELECT reporter_member_id,note FROM circle_message_reports WHERE message_id=$1',[f.messageId])).rows;assert.equal(stored.length,1);assert.equal(stored[0].reporter_member_id,f.actors.reporter);assert.equal(stored[0].note,'PRIVATE_SYNTHETIC_ACTION_NOTE');
 assert.equal(JSON.stringify(await f.state('author')).includes('PRIVATE_SYNTHETIC_ACTION_NOTE'),false);await f.host.openArchive();assert.equal(f.host.model().archive.phase,'ready');assert.equal(JSON.stringify(f.host.model()).includes('PRIVATE_SYNTHETIC_ACTION_NOTE'),false);
 assert.deepEqual(Object.keys(JSON.parse(posts(f)[0].body)).sort(),['action','contentHash','expectedRevision','note','reason','requestId'].sort());assert.equal(f.calls.every(x=>x.status==='ok'),true);
 const privileges=(await f.db.query("SELECT has_table_privilege('anon','public.seminar_messages','SELECT,INSERT') a,has_table_privilege('authenticated','public.circle_message_reports','SELECT,INSERT') b")).rows[0];assert.deepEqual(privileges,{a:false,b:false});
});
test('author loaded archive before leaving can freshly inspect and withdraw after actual leave and Circle quarantine',async t=>{
 const f=await fixture(t,{actor:'author'});await f.host.openArchive();assert.equal(f.host.model().archive.phase,'ready');await f.leave('author');
 const detail=await rpc(f.db,'soe_circle_review_detail',[f.reviewerId,f.circleId]);await rpc(f.db,'soe_circle_review_decide',[f.reviewerId,f.circleId,detail.revision,requestId(),'hide','safety','A synthetic human reviewer recorded a host-facing explanation.',null,detail.circle.description.slice(0,20)]);
 await f.host.messageOpen(f.messageId);const state=f.host.model().messageSafety.state;assert.equal(state.message.is_mine,true);assert.equal(state.canReport,false);assert.equal(state.canWithdraw,true);f.host.messageConfirm(true);await f.host.messageSubmit('withdraw');
 const m=f.host.model().messageSafety;assert.equal(m.phase,'confirmed');assert.equal(m.receipt.withdrawn,true);assert.equal(m.state.message.visibility,'withdrawn');assert.equal(m.state.message.content,null);assert.equal(m.state.canWithdraw,false);assert.equal((await f.db.query('SELECT content FROM seminar_messages WHERE id=$1',[f.messageId])).rows[0].content.length>0,true,'Restricted original evidence remains; withdrawal is not erasure');
 assert.equal(f.calls.filter(x=>x.name==='soe_circle_message_state').length,1,'No added blanket membership gate');
});
test('lost committed report stays unknown after state refresh; only exact POST replay confirms current hidden tombstone',async t=>{
 const f=await fixture(t);await openSafety(f);prepareReport(f);let lost=false;f.transformRpc((name,args,result)=>{if(name==='soe_circle_message_action'&&!lost){lost=true;throw Error('SYNTHETIC_LOST_AFTER_COMMIT');}return result;});await f.host.messageSubmit('report');
 const first=posts(f)[0].body,key=JSON.parse(first).requestId,before=await f.counts();assert.equal(f.host.model().messageSafety.phase,'unknown');assert.equal(f.host.model().messageSafety.pendingRequestId,key);assert.equal(f.host.model().messageSafety.canNavigate,false);assert.equal(f.host.model().messageSafety.canClose,false);assert.equal(JSON.stringify(f.host.model()).includes('PRIVATE_SYNTHETIC_ACTION_NOTE'),false);
 await f.hide();await f.host.messageRefresh();assert.equal(f.host.model().messageSafety.phase,'unknown');assert.equal(f.host.model().messageSafety.state.message.visibility,'hidden');assert.equal(f.host.model().messageSafety.state.message.content,null);assert.equal(f.host.model().messageSafety.receipt,null);assert.equal(f.host.model().messageSafety.pendingRequestId,key);assert.equal(posts(f).length,1);
 const requests=f.requests.length;await f.host.openArchive();await f.host.refresh();f.host.messageClose();f.host.threadStart(null);assert.equal(f.requests.length,requests);assert.equal(f.host.model().messageSafety.pendingRequestId,key);
 await f.host.messageRetry();assert.equal(posts(f).length,2);assert.equal(posts(f)[1].body,first);assert.equal(f.host.model().messageSafety.phase,'confirmed');assert.equal(f.host.model().messageSafety.receipt.replayed,true);assert.equal(f.host.model().messageSafety.receipt.state.contentHash,null);assert.equal(f.host.model().messageSafety.receipt.state.message.content,null);const after=await f.counts();assert.equal(after.reports,before.reports);assert.equal(after.receipts,before.receipts+1,'Only the separate human decision added a receipt');
});
test('lost committed author withdrawal recovers by exact POST replay without another withdrawal or key',async t=>{
 let keys=0;const f=await fixture(t,{actor:'author',keyFactory:async()=>{keys++;return requestId();}});await openSafety(f);f.host.messageConfirm(true);let lost=false;f.transformRpc((name,args,result)=>{if(name==='soe_circle_message_action'&&!lost){lost=true;throw Error('SYNTHETIC_LOST_AFTER_COMMIT');}return result;});await f.host.messageSubmit('withdraw');const before=await f.counts(),body=posts(f)[0].body;
 assert.equal(f.host.model().messageSafety.phase,'unknown');await f.host.messageRefresh();assert.equal(f.host.model().messageSafety.phase,'unknown');assert.equal(f.host.model().messageSafety.state.message.visibility,'withdrawn');await f.host.messageRetry();assert.equal(posts(f)[1].body,body);assert.equal(keys,1);assert.equal(f.host.model().messageSafety.phase,'confirmed');assert.equal(f.host.model().messageSafety.receipt.replayed,true);assert.equal(f.host.model().messageSafety.receipt.withdrawn,true);assert.deepEqual(await f.counts(),before);
});
test('actual stale revision returns unknown; fresh GET does not replace immutable old report snapshot or invent confirmation',async t=>{
 const f=await fixture(t);await openSafety(f);prepareReport(f);await f.report();const before=await f.counts();await f.host.messageSubmit('report');assert.equal(f.calls.at(-1).status,'PT409');assert.equal(f.host.model().messageSafety.phase,'unknown');const body=posts(f)[0].body;
 await f.host.messageRefresh();assert.equal(f.host.model().messageSafety.phase,'unknown');assert.equal(f.host.model().messageSafety.receipt,null);await f.host.messageRetry();assert.equal(posts(f)[1].body,body);assert.equal(f.calls.at(-1).status,'PT409');assert.deepEqual(await f.counts(),before);
});
test('report membership loss refuses action and host retires all private views instead of retrying as another actor',async t=>{
 const f=await fixture(t);await openSafety(f);prepareReport(f);await f.leave('reporter');const before=await f.counts();await f.host.messageSubmit('report');assert.equal(f.calls.at(-1).status,'PT403');const model=f.host.model();assert.equal(model.messageSafety.state,null);assert.equal(model.messageSafety.note,'');assert.equal(model.messageSafety.pendingRequestId,null);assert.equal(model.archive.page,null);assert.equal(model.threadWrite.preview,null);assert.equal(model.messageSafety.receipt,null);assert.deepEqual(await f.counts(),before);
});
test('exact request-key payload collision is rejected atomically without duplicating report or private notes in DTO',async t=>{
 const f=await fixture(t);await openSafety(f);prepareReport(f);await f.host.messageSubmit('report');const first=JSON.parse(posts(f)[0].body),before=await f.counts();const response=await f.dispatch(`/api/circles/${f.circleId}/messages/${f.messageId}`,{method:'POST',headers:{Authorization:'Bearer '+TOKENS.reporter},body:{...first,note:'A different synthetic report payload.'}});assert.equal(response.status,409);assert.deepEqual(await f.counts(),before);const reply=await response.json();assert.equal(JSON.stringify(reply).includes('PRIVATE_SYNTHETIC_ACTION_NOTE'),false);
});
test('actual receipt insert failure rolls back report and revision; explicit exact retry later commits once',async t=>{
 const f=await fixture(t);await openSafety(f);prepareReport(f);const before=await f.counts(),state=await f.state('reporter');await f.db.exec("CREATE FUNCTION public.synthetic_refuse_safety_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic receipt failure'; END $$; CREATE TRIGGER synthetic_refuse_safety_receipt BEFORE INSERT ON public.circle_message_receipts FOR EACH ROW EXECUTE FUNCTION public.synthetic_refuse_safety_receipt();");
 await f.host.messageSubmit('report');assert.equal(f.host.model().messageSafety.phase,'unknown');assert.deepEqual(await f.counts(),before);assert.equal((await f.state('reporter')).revision,state.revision);const body=posts(f)[0].body;await f.db.exec('DROP TRIGGER synthetic_refuse_safety_receipt ON public.circle_message_receipts; DROP FUNCTION public.synthetic_refuse_safety_receipt();');await f.host.messageRetry();assert.equal(posts(f)[1].body,body);assert.equal(f.host.model().messageSafety.phase,'confirmed');assert.equal(f.host.model().messageSafety.receipt.replayed,false);assert.equal((await f.counts()).reports,before.reports+1);
});
test('wrong success receipt after actual commit remains unknown and real exact replay is the only recovery',async t=>{
 const f=await fixture(t);await openSafety(f);prepareReport(f);let wrong=true;f.transformRpc((name,args,result)=>{if(name==='soe_circle_message_action'&&wrong){wrong=false;return{...result,data:{...result.data,requestId:requestId()}};}return result;});await f.host.messageSubmit('report');assert.equal(f.host.model().messageSafety.phase,'unknown');assert.equal(f.host.model().messageSafety.receipt,null);const before=await f.counts();await f.host.messageRetry();assert.equal(f.host.model().messageSafety.receipt.replayed,true);assert.deepEqual(await f.counts(),before);
});
test('only loaded archive IDs can open fresh safety and an open retires old archive before response',async t=>{
 const f=await fixture(t);await f.host.messageOpen(f.messageId);assert.equal(f.requests.length,0);await f.host.openArchive();const count=f.requests.length;await f.host.messageOpen(requestId());assert.equal(f.requests.length,count);const held=deferred(),arrived=deferred();f.transformHttp(async x=>{if(x.path.includes('/messages/')){arrived.resolve();await held.promise;}return x.response;});const pending=f.host.messageOpen(f.messageId);await arrived.promise;assert.equal(f.host.model().archive.page,null);assert.equal(f.host.model().threadWrite.canStart,false);assert.equal(f.host.model().threadWrite.preview,null);assert.equal(f.host.model().threadWrite.draft,'');assert.equal(f.host.model().messageSafety.state,null);held.resolve();await pending;assert.equal(f.host.model().messageSafety.phase,'ready');
});
test('owner, inactivity and offline retirement fence held credentials and committed response without restoring private state',async t=>{
 for(const stage of ['credentials','response','body']){
  const f=await fixture(t);await openSafety(f);prepareReport(f);const held=deferred(),arrived=deferred();
  if(stage==='credentials'){f.credentials(held);queueMicrotask(()=>arrived.resolve());}
  else f.transformHttp(async x=>{if(x.method==='POST'){if(stage==='response'){arrived.resolve();await held.promise;return x.response;}return{status:x.response.status,json:async()=>{arrived.resolve();await held.promise;return x.response.json();}};}return x.response;});
  const before=await f.counts(),pending=f.host.messageSubmit('report');await arrived.promise;if(stage==='credentials')f.retire();else if(stage==='response')f.host.activity(false);else f.host.connectivity(false);held.resolve();await pending;const m=f.host.model().messageSafety;assert.equal(m.state,null);assert.equal(m.note,'');assert.equal(m.pendingRequestId,null);assert.equal(m.receipt,null);assert.equal(m.canRetry,false);if(stage==='credentials'){assert.equal(posts(f).length,0);assert.deepEqual(await f.counts(),before);}else assert.equal((await f.counts()).reports,before.reports+1,'Already dispatched action may commit before local retirement');
 }
});
test('absent or timed-out secure UUID never sends a safety action and normal manual refresh stays available',async t=>{
 for(const keyFactory of [null,()=>new Promise(()=>{})]){
  const f=await fixture(t,{keyFactory,timeoutMs:20});await openSafety(f);if(keyFactory){prepareReport(f);await f.host.messageSubmit('report');assert.equal(f.host.model().messageSafety.phase,'unavailable');assert.equal(f.host.model().messageSafety.pendingRequestId,null);await f.host.messageRefresh();assert.equal(f.host.model().messageSafety.phase,'ready');}else{f.host.messageReason('safety');f.host.messageConfirm(true);await f.host.messageSubmit('report');assert.equal(f.host.model().messageSafety.available,false);}assert.equal(posts(f).length,0);
 }
});
