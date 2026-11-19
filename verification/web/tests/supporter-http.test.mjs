import test from 'node:test';
import assert from 'node:assert/strict';
import { supporterApp, IDS } from './support/supporter-app.mjs';
const OFFER='soe-supporter-monthly-v1',TERMS='supporter-2026-11-03-v1';
async function read(a,path='/api/supporter/status',status=200){const r=await a.dispatch(path);assert.equal(r.status,status,await r.clone().text());assert.match(r.headers.get('cache-control'),/private.*no-store/);return r.json();}
async function write(a,path,body,status=200,headers){const r=await a.dispatch(path,'POST',body,headers);assert.equal(r.status,status,await r.clone().text());return r.json();}
const body=(a,s,extra={})=>({requestId:a.requestId(),expectedRevision:s.revision,expectedMode:s.mode,reviewToken:s.reviewToken,offerId:OFFER,termsVersion:TERMS,...extra});
async function setup(t,options={}){const a=await supporterApp(options);t.after(()=>a.close());return a;}
const count=async(a,table)=>(await a.db.query('SELECT count(*)::int n FROM '+table)).rows[0].n;

test('public offer is proposed/config-only, sales default closed; private GET provisions nothing and leaves free community tier unchanged',async t=>{
 const a=await setup(t);const offer=await read(a,'/api/supporter/offer');assert.equal(offer.salesOpen,false);assert.equal(offer.amount,1000);assert.equal(a.provider.calls.length,0);
 const status=await read(a);assert.equal(status.canCheckout,false);assert.equal(await count(a,'supporter_accounts'),0);assert.equal(await count(a,'supporter_checkout_attempts'),0);
 await write(a,'/api/supporter/checkout',body(a,status),503);assert.equal(a.provider.calls.some(c=>['checkout','customer','portal'].includes(c.stage)),false);
 assert.equal((await a.db.query('SELECT tier FROM members WHERE id=$1',[IDS.actor])).rows[0].tier,'free');
});

test('canonical actor, same-origin, bounded UTF8 JSON and explicit mode/config binding refuse before any provider effect',async t=>{
 const a=await setup(t,{salesEnabled:true}),s=await read(a),valid=body(a,s);a.provider.calls.length=0;
 for(const [extra,code] of [[{memberId:IDS.other},400],[{requestId:'bad'},400],[{expectedRevision:-1},400],[{expectedMode:'live'},409],[{reviewToken:'a'.repeat(64)},409],[{offerId:'other'},400]])await write(a,'/api/supporter/checkout',{...valid,...extra},code);
 await write(a,'/api/supporter/checkout',valid,403,{origin:'https://evil.invalid'});
 await write(a,'/api/supporter/checkout',valid,403,{'sec-fetch-site':'cross-site'});
 a.setActor(IDS.other);await write(a,'/api/supporter/checkout',valid,409);a.setActor(null);await write(a,'/api/supporter/checkout',valid,401);a.setActor(IDS.actor);
 const route=a.app.load('app/api/supporter/checkout/route.ts');
 for(const [bytes,status] of [[new TextEncoder().encode('x'.repeat(12001)),413],[new Uint8Array([255]),400]]){
  const req=new Request('https://offline.invalid/api/supporter/checkout',{method:'POST',headers:{origin:'https://offline.invalid','content-type':'application/json'},body:new ReadableStream({start(c){c.enqueue(bytes);c.close();}}),duplex:'half'});
  assert.equal((await route.POST(req)).status,status);
 }
 assert.equal(a.provider.calls.length,0);assert.equal(await count(a,'supporter_accounts'),0);
});

test('fresh signed review verifies catalog; checkout creates one opaque customer/session and literal manual retry reuses one durable operation',async t=>{
 const a=await setup(t,{salesEnabled:true}),s=await read(a);assert.equal(s.canCheckout,true);assert.deepEqual(a.provider.calls.map(c=>c.stage),['verifyAccount','verifyPrice','verifyPortal']);
 const request=body(a,s),first=await write(a,'/api/supporter/checkout',request);assert.equal(first.mode,'test');assert.equal(first.reviewToken,s.reviewToken);assert.equal(first.outcome,'ready');assert.equal(first.attemptId,request.requestId);
 const again=await write(a,'/api/supporter/checkout',request);assert.equal(again.replayed,true);assert.equal(again.url,first.url);
 assert.equal(a.provider.customers.size,1);assert.equal(a.provider.sessions.size,1);assert.equal(await count(a,'supporter_checkout_attempts'),1);
 const latest=await read(a);assert.equal(latest.status,'pending');assert.equal(latest.canCheckout,false);
 await write(a,'/api/supporter/checkout',body(a,latest),409);assert.equal(a.provider.sessions.size,1);
 assert.doesNotMatch(JSON.stringify(latest),/cus_|cs_test_|accountId|customerId|subscriptionId|@|sessionUrl/);
});

test('lost provider reply records unknown; same UUID discovers committed session without a second provider creation',async t=>{
 const a=await setup(t,{salesEnabled:true}),s=await read(a),request=body(a,s);a.provider.failNext('checkout');
 const failed=await write(a,'/api/supporter/checkout',request,503);assert.equal(failed.outcome,'unknown');
 assert.equal((await a.db.query('SELECT status FROM supporter_checkout_attempts')).rows[0].status,'unknown');
 const before=a.provider.calls.filter(c=>c.stage==='checkout').length;
 const retried=await write(a,'/api/supporter/checkout',request);assert.equal(retried.replayed,true);assert.equal(retried.outcome,'ready');
 assert.equal(a.provider.calls.filter(c=>c.stage==='checkout').length,before);assert.equal(a.provider.sessions.size,1);assert.equal(a.provider.customers.size,1);
});

test('lost session persistence recovers atomically through mapped paid webhook; only durable plus fresh own session confirms return',async t=>{
 const a=await setup(t,{salesEnabled:true}),s=await read(a),request=body(a,s);a.provider.failNext('checkout');await write(a,'/api/supporter/checkout',request,503);
 assert.equal((await a.db.query('SELECT session_id FROM supporter_checkout_attempts')).rows[0].session_id,null);
 const pending=await read(a,'/api/supporter/return?attempt='+request.requestId);assert.equal(pending.returnState,'pending');
 await a.provider.markPaid(request.requestId);
 const returned=await read(a,'/api/supporter/return?attempt='+request.requestId);assert.equal(returned.returnState,'confirmed');assert.equal(returned.status,'active');
 const stored=(await a.db.query('SELECT status,session_id,session_url FROM supporter_checkout_attempts')).rows[0];assert.equal(stored.status,'completed');assert.match(stored.session_id,/^cs_test_/);assert.equal(stored.session_url,null);
 a.setActor(IDS.other);await read(a,'/api/supporter/return?attempt='+request.requestId,404);a.setActor(IDS.actor);
 await read(a,'/api/supporter/return?attempt='+request.requestId+'&paid=1',400);
 assert.equal((await a.db.query('SELECT tier FROM members WHERE id=$1',[IDS.actor])).rows[0].tier,'free');
});

test('a reloaded pending operation can reconcile provider-confirmed expiry while sales are closed, without new provider effects',async t=>{
 const a=await setup(t,{salesEnabled:true}),s=await read(a),request=body(a,s);await write(a,'/api/supporter/checkout',request);
 const session=a.provider.sessions.get(request.requestId);session.status='expired';session.url=null;a.setSalesEnabled(false);
 const reloaded=await read(a);assert.equal(reloaded.pendingAttempt.requestId,request.requestId);
 const effects=a.provider.calls.filter(c=>['checkout','customer'].includes(c.stage)).length;
 const recovery=await write(a,'/api/supporter/checkout',body(a,reloaded,{requestId:request.requestId}));assert.equal(recovery.outcome,'pending');assert.equal(recovery.url,null);
 const resolved=await read(a);assert.equal(resolved.pendingAttempt,null);assert.equal(resolved.canCheckout,false);assert.equal(a.provider.calls.filter(c=>['checkout','customer'].includes(c.stage)).length,effects);
 a.setSalesEnabled(true);await write(a,'/api/supporter/checkout',body(a,await read(a)));assert.equal(a.provider.sessions.size,2);
});

test('verified legacy management remains available with sales closed, bootstraps only on explicit portal POST and preserves Oracle',async t=>{
 const a=await setup(t);await a.seedLegacy(IDS.other);a.setActor(IDS.other);
 const s=await read(a);assert.equal(s.legacy,true);assert.equal(s.canCheckout,false);assert.equal(s.canManage,true);assert.equal(await count(a,'supporter_accounts'),0);
 const request={requestId:a.requestId(),expectedRevision:s.revision,expectedMode:s.mode,reviewToken:s.reviewToken};
 const result=await write(a,'/api/supporter/portal',request);assert.equal(result.operation,'portal');assert.match(result.url,/^https:\/\/billing.stripe.com\/p\/session\//);
 assert.equal(await count(a,'supporter_accounts'),1);assert.equal(a.provider.calls.some(c=>c.stage==='customer'||c.stage==='checkout'),false);
 assert.equal((await a.db.query('SELECT tier FROM members WHERE id=$1',[IDS.other])).rows[0].tier,'oracle');
 const retry=await write(a,'/api/supporter/portal',request);assert.equal(retry.replayed,true);assert.equal(retry.url,result.url);
});

test('foreign legacy ownership and unavailable storage fail closed; no email fallback or provisioning',async t=>{
 const a=await setup(t);const c=await a.seedLegacy(IDS.other);a.provider.legacyOwners.set(c,IDS.actor);a.setActor(IDS.other);
 const s=await read(a);assert.equal(s.canManage,false);assert.equal(s.legacy,true);
 await write(a,'/api/supporter/portal',{requestId:a.requestId(),expectedRevision:s.revision,expectedMode:s.mode,reviewToken:s.reviewToken},409);
 assert.equal(await count(a,'supporter_accounts'),0);
 await a.db.exec('REVOKE EXECUTE ON FUNCTION soe_supporter_read(uuid,text) FROM service_role');await read(a,'/api/supporter/status',503);
 assert.equal(a.provider.calls.some(c=>['portal','customer','checkout'].includes(c.stage)),false);
});

test('mode/config drift rejects stale review, and unresolved same-mode account scope blocks fresh sale in a replacement account',async t=>{
 const a=await setup(t,{salesEnabled:true}),s=await read(a),request=body(a,s);await write(a,'/api/supporter/checkout',request);
 a.setConfig({SOE_SUPPORTER_ACCOUNT_ID:'acct_FictionalTwo'});
 await write(a,'/api/supporter/checkout',request,409);
 const current=await read(a);assert.equal(current.canCheckout,false);assert.equal(current.status,'review');
 await write(a,'/api/supporter/checkout',body(a,current),409);assert.equal(a.provider.sessions.size,1);
});

test('sticky risk review suppresses paid return claims without deleting membership or preventing verified management',async t=>{
 const a=await setup(t,{salesEnabled:true}),request=body(a,await read(a));await write(a,'/api/supporter/checkout',request);await a.provider.markPaid(request.requestId);
 await a.webhook({id:'evt_FictionalRisk',type:'charge.refunded',livemode:false,data:{object:{requestId:request.requestId}}});
 const s=await read(a);assert.equal(s.status,'review');assert.equal(s.canCheckout,false);assert.equal(s.canManage,true);
 assert.equal((await read(a,'/api/supporter/return?attempt='+request.requestId)).returnState,'review');
 assert.equal((await a.db.query('SELECT tier FROM members WHERE id=$1',[IDS.actor])).rows[0].tier,'free');
});

test('webhook refuses wrong signature/mode and multi-account mapping before any writes; CAS retry refreshes provider state',async t=>{
 const a=await setup(t,{salesEnabled:true}),request=body(a,await read(a));await write(a,'/api/supporter/checkout',request);
 const e={id:'evt_FictionalMulti',type:'invoice.paid',livemode:false,data:{object:{}},targets:[{accountId:IDS.actor},{accountId:IDS.other}]};
 await write(a,'/api/supporter/webhook',e,400,{'stripe-signature':'wrong'});
 await write(a,'/api/supporter/webhook',{...e,livemode:true},400,{'stripe-signature':'fixture_signature'});
 await write(a,'/api/supporter/webhook',e,503,{'stripe-signature':'fixture_signature'});assert.equal(await count(a,'supporter_webhook_receipts'),0);
 const actual=a.admin.rpc;let conflicts=0;a.admin.rpc=async(name,args)=>{if(name==='soe_supporter_apply_event'&&conflicts++===0)return {error:{code:'PT409'},data:null};return actual(name,args);};
 const before=a.provider.calls.filter(c=>c.stage==='state').length;await a.provider.markPaid(request.requestId);
 assert.ok(a.provider.calls.filter(c=>c.stage==='state').length>=before+2);assert.equal(await count(a,'supporter_webhook_receipts'),1);
});

test('verified opaque customer ownership preserves cancellation management during financial review; missing ownership never opens portal',async t=>{
 const a=await setup(t,{salesEnabled:true}),request=body(a,await read(a));await write(a,'/api/supporter/checkout',request);
 const actual=a.provider.state;a.provider.state=async(...args)=>({...await actual(...args),review:true,blocked:true});
 const s=await read(a);assert.equal(s.status,'review');assert.equal(s.canCheckout,false);assert.equal(s.canManage,true);
 await write(a,'/api/supporter/portal',{requestId:a.requestId(),expectedRevision:s.revision,expectedMode:s.mode,reviewToken:s.reviewToken});
 a.provider.state=async(...args)=>({...await actual(...args),review:true,blocked:true,ownershipVerified:false});const foreign=await read(a);assert.equal(foreign.canManage,false);
 await write(a,'/api/supporter/portal',{requestId:a.requestId(),expectedRevision:foreign.revision,expectedMode:foreign.mode,reviewToken:foreign.reviewToken},409);
});

test('lost committed webhook reply replays original immutable event even when fresh financial review changes its derived kind',async t=>{
 const a=await setup(t,{salesEnabled:true}),request=body(a,await read(a));await write(a,'/api/supporter/checkout',request);
 const actual=a.admin.rpc;let dropped=false;a.admin.rpc=async(name,args)=>{const result=await actual(name,args);if(name==='soe_supporter_apply_event'&&!result.error&&!dropped){dropped=true;return {data:null,error:{code:'FIXTURE_LOST_COMMIT_REPLY'}};}return result;};
 await assert.rejects(a.provider.markPaid(request.requestId));assert.equal(await count(a,'supporter_webhook_receipts'),1);
 const revision=(await a.db.query('SELECT revision FROM supporter_accounts')).rows[0].revision;
 const state=a.provider.state;a.provider.state=async(...args)=>({...await state(...args),review:true});
 const response=await write(a,'/api/supporter/webhook',a.provider.events.at(-1),200,{'stripe-signature':'fixture_signature'});assert.equal(response.received,true);
 assert.equal(await count(a,'supporter_webhook_receipts'),1);assert.equal((await a.db.query('SELECT revision FROM supporter_accounts')).rows[0].revision,revision);
 assert.equal((await a.db.query('SELECT event_kind FROM supporter_webhook_receipts')).rows[0].event_kind,'checkout');assert.equal((await read(a)).status,'review');
});

test('a provider-complete new session cannot resolve against an unrelated old terminal subscription snapshot',async t=>{
 const a=await setup(t,{salesEnabled:true}),request=body(a,await read(a));await write(a,'/api/supporter/checkout',request);
 const s=a.provider.sessions.get(request.requestId);s.status='complete';s.url=null;s.paid=true;s.subscriptionId='sub_New';
 a.provider.subscriptions.set(s.customerId,{id:'sub_Old',status:'canceled',paid:false,cancelAtPeriodEnd:false,currentPeriodStart:null,currentPeriodEnd:null});
 const state=await read(a);await write(a,'/api/supporter/checkout',body(a,state,{requestId:request.requestId}),409);
 assert.equal((await a.db.query('SELECT status FROM supporter_checkout_attempts')).rows[0].status,'ready');
 await write(a,'/api/supporter/webhook',{id:'evt_FictionalMismatch',type:'checkout.session.completed',livemode:false,data:{object:{requestId:request.requestId}}},503,{'stripe-signature':'fixture_signature'});
 assert.equal(await count(a,'supporter_webhook_receipts'),0);
 await write(a,'/api/supporter/checkout',body(a,await read(a)),409);assert.equal(a.provider.sessions.size,1);
});

test('old portal attempts never expose a stale idempotent URL; fresh explicit requests remain available after the cooldown',async t=>{
 const a=await setup(t);await a.seedLegacy(IDS.other);a.setActor(IDS.other);
 for(const status of ['ready','unknown','pending']){
  const s=await read(a),request={requestId:a.requestId(),expectedRevision:s.revision,expectedMode:s.mode,reviewToken:s.reviewToken};
  await write(a,'/api/supporter/portal',request);
  await a.db.query("UPDATE supporter_portal_attempts SET status=$1,session_id=CASE WHEN $1='ready' THEN session_id ELSE NULL END,session_url=CASE WHEN $1='ready' THEN session_url ELSE NULL END,created_at=date_trunc('second',now())-interval '16 minutes',retry_until=date_trunc('second',now())+interval '21 hours 44 minutes' WHERE request_id=$2",[status,request.requestId]);
  const effects=a.provider.calls.filter(c=>c.stage==='portal').length;
  await write(a,'/api/supporter/portal',request,409);
  assert.equal(a.provider.calls.filter(c=>c.stage==='portal').length,effects);
 }
 const s=await read(a);assert.equal(s.canManage,true);
 const fresh=await write(a,'/api/supporter/portal',{requestId:a.requestId(),expectedRevision:s.revision,expectedMode:s.mode,reviewToken:s.reviewToken});
 assert.equal(fresh.outcome,'ready');assert.match(fresh.url,/^https:\/\/billing.stripe.com\/p\/session\//);
});
