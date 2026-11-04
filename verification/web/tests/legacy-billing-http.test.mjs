import test from 'node:test';import assert from 'node:assert/strict';
import {legacyBillingApp,IDS} from './support/legacy-billing-app.mjs';
import {legacyProviderFixture} from './support/legacy-billing-provider.mjs';
async function setup(t,options){const a=await legacyBillingApp(options);t.after(()=>a.close());return a;}
const tier=async(a,id=IDS.actor)=>(await a.db.query('SELECT tier FROM members WHERE id=$1',[id])).rows[0].tier;
const count=async(a,table)=>(await a.db.query('SELECT count(*)::int n FROM '+table)).rows[0].n;
async function deliver(a,event,status=200,options){const r=await a.dispatch(event,options);assert.equal(r.status,status,await r.clone().text());assert.match(r.headers.get('cache-control'),/private.*no-store/);return r.json();}
test('signed live event refreshes current paid graph, commits one receipt and exact replay cannot reapply an old grant',async t=>{
 const a=await setup(t),s=a.seed(),e=a.event('checkout.session.completed',s.sessionId);await deliver(a,e);assert.equal(await tier(a),'seeker');assert.equal(await count(a,'legacy_billing_receipts'),1);
 a.raw.subscriptions.get(s.sourceId).status='canceled';await deliver(a,a.event('customer.subscription.deleted',s.sourceId));assert.equal(await tier(a),'free');
 await deliver(a,e);assert.equal(await tier(a),'free');assert.equal(await count(a,'legacy_billing_receipts'),2);
 assert.equal((await a.db.query('SELECT stripe_customer_id FROM members WHERE id=$1',[IDS.actor])).rows[0].stripe_customer_id,null);
});
test('test-mode paid sessions never mutate member tier or historical customer pointer and do not latch live baseline',async t=>{
 const a=await setup(t,{mode:'test'}),s=a.seed();await deliver(a,a.event('checkout.session.completed',s.sessionId));assert.equal(await tier(a),'free');
 assert.equal((await a.db.query('SELECT stripe_customer_id FROM members WHERE id=$1',[IDS.actor])).rows[0].stripe_customer_id,null);assert.equal((await a.db.query('SELECT mode FROM legacy_billing_members')).rows[0].mode,'test');
});
test('unrelated current subscription deletion and stale supporter hints cannot change a legacy member',async t=>{
 const a=await setup(t),s=a.seed();await a.db.query("UPDATE members SET tier='philosopher' WHERE id=$1",[IDS.actor]);a.raw.subscriptions.get(s.sourceId).metadata.type='merch';
 assert.equal((await deliver(a,a.event('customer.subscription.deleted',s.sourceId))).ignored,'not_legacy_membership');assert.equal(await tier(a),'philosopher');assert.equal(await count(a,'legacy_billing_receipts'),0);
 a.raw.subscriptions.get(s.sourceId).metadata.type='soe_supporter_v1';await deliver(a,a.event('customer.subscription.updated',s.sourceId));assert.equal(await tier(a),'philosopher');
});
test('delayed checkout uses current canceled/unpaid truth; no grace is granted to managed trialing/past-due/unpaid sources',async t=>{
 const a=await setup(t),s=a.seed();a.raw.subscriptions.get(s.sourceId).status='canceled';await deliver(a,a.event('checkout.session.completed',s.sessionId));assert.equal(await tier(a),'free');
 a.raw.subscriptions.get(s.sourceId).status='active';await deliver(a,a.event('invoice.paid',s.invoiceId));assert.equal(await tier(a),'seeker');
 for(const status of ['trialing','past_due','unpaid','paused']){a.raw.subscriptions.get(s.sourceId).status=status;await deliver(a,a.event('customer.subscription.updated',s.sourceId));assert.equal(await tier(a),'free');}
});
test('all known same-scope customers are refreshed; canceling one source retains another current paid source',async t=>{
 const a=await setup(t),one=a.seed();await deliver(a,a.event('customer.subscription.updated',one.sourceId));
 const two=a.seed({customerId:'cus_Two',suffix:'Two',tier:'scholar'});await deliver(a,a.event('customer.subscription.updated',two.sourceId));assert.equal(await tier(a),'scholar');
 a.raw.subscriptions.get(two.sourceId).status='canceled';const before=a.calls.length;await deliver(a,a.event('customer.subscription.deleted',two.sourceId));assert.equal(await tier(a),'seeker');
 assert.ok(a.calls.slice(before).some(c=>c.name==='customer'&&c.id===one.customerId));assert.ok(a.calls.slice(before).some(c=>c.name==='customer'&&c.id===two.customerId));
});
test('unknown price/currency/owner refuses without amount or email fallback and without a receipt',async t=>{
 const a=await setup(t),s=a.seed();a.raw.subscriptions.get(s.sourceId).items.data[0].price.id='price_Unknown';await deliver(a,a.event('customer.subscription.updated',s.sourceId),503);assert.equal(await tier(a),'free');assert.equal(await count(a,'legacy_billing_receipts'),0);
 a.raw.subscriptions.get(s.sourceId).items.data[0].price=a.price();a.raw.customers.get(s.customerId).metadata.member_id=IDS.other;await deliver(a,a.event('customer.subscription.updated',s.sourceId),503);assert.equal(await tier(a),'free');
});
test('proven refunds invalidate only their managed source, persist across later paid snapshots and preserve other valid support',async t=>{
 const a=await setup(t),one=a.seed(),two=a.seed({customerId:'cus_Two',suffix:'Two',tier:'scholar'});await deliver(a,a.event('customer.subscription.updated',one.sourceId));await deliver(a,a.event('customer.subscription.updated',two.sourceId));
 a.raw.charges.get(two.ch).amount_refunded=1;await deliver(a,a.event('charge.refunded',two.ch));assert.equal(await tier(a),'seeker');assert.equal(await count(a,'legacy_billing_invalidations'),1);
 a.raw.charges.get(two.ch).amount_refunded=0;await deliver(a,a.event('invoice.paid',two.invoiceId));assert.equal(await tier(a),'seeker');
});
test('Oracle proof is one-time paid and risk-aware; unknown initial Oracle remains an unverified preserved baseline',async t=>{
 const a=await setup(t),s=a.seed({lifetime:true});await deliver(a,a.event('checkout.session.completed',s.sessionId));assert.equal(await tier(a),'oracle');
 a.raw.charges.get(s.ch).disputed=true;await deliver(a,a.event('charge.refunded',s.ch));assert.equal(await tier(a),'free');
 const b=a.seed({memberId:IDS.third,customerId:'cus_Third',suffix:'Third',status:'canceled'});await deliver(a,a.event('customer.subscription.deleted',b.sourceId));assert.equal(await tier(a,IDS.third),'oracle');
 assert.equal((await a.db.query("SELECT needs_review FROM legacy_billing_members WHERE member_id=$1 AND mode='live'",[IDS.third])).rows[0].needs_review,true);
});
test('CAS retry refetches every provider customer; missing schema and receipt failure cannot acknowledge a financial mutation',async t=>{
 const a=await setup(t),s=a.seed(),actual=a.admin.rpc;let conflicts=0;a.admin.rpc=async(name,args)=>name==='soe_legacy_billing_apply_event'&&conflicts++===0?{data:null,error:{code:'PT409'}}:actual(name,args);
 await deliver(a,a.event('customer.subscription.updated',s.sourceId));assert.ok(a.calls.filter(c=>c.name==='subscriptions.list').length>=2);
 await a.db.exec('REVOKE EXECUTE ON FUNCTION soe_legacy_billing_event_state(text,text,uuid) FROM service_role');await deliver(a,a.event('customer.subscription.deleted',s.sourceId),503);assert.equal(await count(a,'legacy_billing_receipts'),1);
});
test('bad signatures, wrong selected mode/account and invalid catalog configuration fail before ledger writes',async t=>{
 const a=await setup(t),s=a.seed();await deliver(a,a.event('customer.subscription.updated',s.sourceId),400,{signature:'bad'});
 await deliver(a,a.event('customer.subscription.updated',s.sourceId,{livemode:false}),503);await deliver(a,a.event('customer.subscription.updated',s.sourceId,{account:'acct_Foreign'}),503);
 a.app.context.process.env.SOE_LEGACY_BILLING_CATALOG_JSON='[]';await deliver(a,a.event('customer.subscription.updated',s.sourceId),503);assert.equal(await count(a,'legacy_billing_receipts'),0);
});
test('explicit unrelated products do not prevent granting or ending only the managed legacy subscription',async t=>{
 const a=await setup(t),s=a.seed(),other=structuredClone(a.raw.subscriptions.get(s.sourceId));other.id='sub_Unrelated';other.metadata={type:'other_product'};a.raw.subscriptions.set(other.id,other);
 await deliver(a,a.event('customer.subscription.updated',s.sourceId));assert.equal(await tier(a),'seeker');a.raw.subscriptions.get(s.sourceId).status='canceled';await deliver(a,a.event('customer.subscription.deleted',s.sourceId));assert.equal(await tier(a),'free');
});
test('fresh metadata cannot override another member customer pointer and pointer alone never bootstraps ownership',async t=>{
 const a=await setup(t),s=a.seed();await a.db.query('UPDATE members SET stripe_customer_id=$1 WHERE id=$2',[s.customerId,IDS.other]);
 await deliver(a,a.event('customer.subscription.updated',s.sourceId),503);assert.equal(await tier(a),'free');assert.equal(await count(a,'legacy_billing_receipts'),0);
 await a.db.query('UPDATE members SET stripe_customer_id=NULL WHERE id=$1',[IDS.other]);await a.db.query('UPDATE members SET stripe_customer_id=$1 WHERE id=$2',[s.customerId,IDS.actor]);
 delete a.raw.subscriptions.get(s.sourceId).metadata.member_id;delete a.raw.sessions.get(s.sessionId).metadata.member_id;a.raw.sessions.get(s.sessionId).client_reference_id=null;
 await deliver(a,a.event('customer.subscription.updated',s.sourceId),503);assert.equal(await count(a,'legacy_billing_receipts'),0);
 a.raw.subscriptions.get(s.sourceId).metadata.member_id=IDS.actor;await deliver(a,a.event('customer.subscription.updated',s.sourceId));assert.equal(await tier(a),'seeker');
});
test('unknown same-amount foreign-currency one-time price cannot mint permanently preserved Oracle',async t=>{
 const a=await setup(t),s=a.seed({lifetime:true});const session=a.raw.sessions.get(s.sessionId);session.currency='cad';session.line_items.data[0].price.id='price_Unknown49900';session.line_items.data[0].price.currency='cad';session.line_items.data[0].currency='cad';
 await deliver(a,a.event('checkout.session.completed',s.sessionId),503);assert.equal(await tier(a),'free');assert.equal(await count(a,'legacy_billing_lifetimes'),0);
});
test('lost committed ledger reply remains retryable and exact event replay never writes a second receipt',async t=>{
 const a=await setup(t),s=a.seed(),actual=a.admin.rpc,e=a.event('customer.subscription.updated',s.sourceId);let dropped=false;
 a.admin.rpc=async(name,args)=>{const result=await actual(name,args);if(name==='soe_legacy_billing_apply_event'&&!result.error&&!dropped){dropped=true;return {data:null,error:{code:'FIXTURE_LOST_COMMIT_REPLY'}};}return result;};
 await deliver(a,e,503);assert.equal(await tier(a),'seeker');assert.equal(await count(a,'legacy_billing_receipts'),1);await deliver(a,e);assert.equal(await count(a,'legacy_billing_receipts'),1);
});
test('signed risk events cannot invalidate an unrelated same-customer subscription through disagreeing payment rows or fresh invoices',async t=>{
 const a=await setup(t),one=a.seed(),two=a.seed({suffix:'Two',tier:'scholar'});
 await deliver(a,a.event('customer.subscription.updated',one.sourceId));assert.equal(await tier(a),'scholar');
 const list=a.sdk.invoicePayments.list,retrieve=a.sdk.invoices.retrieve;
 a.sdk.invoicePayments.list=async()=>({data:[structuredClone(a.raw.payments.get('ip_Two'))],has_more:false});
 await deliver(a,a.event('charge.refunded',one.ch),503);assert.equal(await count(a,'legacy_billing_invalidations'),0);assert.equal(await count(a,'legacy_billing_receipts'),1);assert.equal(await tier(a),'scholar');
 const swapped=structuredClone(a.raw.payments.get('ip_One'));swapped.invoice=two.invoiceId;a.sdk.invoicePayments.list=async()=>({data:[swapped],has_more:false});
 await deliver(a,a.event('charge.refunded',one.ch),503);assert.equal(await count(a,'legacy_billing_invalidations'),0);assert.equal(await tier(a),'scholar');
 a.sdk.invoicePayments.list=list;a.sdk.invoices.retrieve=async()=>structuredClone(a.raw.invoices.get(two.invoiceId));
 await deliver(a,a.event('charge.refunded',one.ch),503);assert.equal(await count(a,'legacy_billing_invalidations'),0);assert.equal(await tier(a),'scholar');
 a.sdk.invoices.retrieve=retrieve;a.raw.charges.get(one.ch).amount_refunded=1;
 await deliver(a,a.event('charge.refunded',one.ch));assert.equal(await tier(a),'scholar');
 const risks=(await a.db.query('SELECT source_id FROM legacy_billing_invalidations')).rows;assert.equal(risks.length,1);assert.equal(risks[0].source_id,one.sourceId);
});
test('signed risk events cannot revoke an unrelated same-customer Oracle through listed or freshly changed session payment identity',async t=>{
 const a=await setup(t),one=a.seed({lifetime:true}),two=a.seed({suffix:'Two',lifetime:true});
 await deliver(a,a.event('checkout.session.completed',one.sessionId));assert.equal(await tier(a),'oracle');
 const list=a.sdk.checkout.sessions.list;
 a.sdk.checkout.sessions.list=async()=>({data:[structuredClone(a.raw.sessions.get(two.sessionId))],has_more:false});
 await deliver(a,a.event('charge.refunded',one.ch),503);assert.equal(await count(a,'legacy_billing_invalidations'),0);assert.equal(await count(a,'legacy_billing_receipts'),1);
 const stale=structuredClone(a.raw.sessions.get(two.sessionId));stale.payment_intent=one.pi;
 a.sdk.checkout.sessions.list=async()=>({data:[stale],has_more:false});
 await deliver(a,a.event('charge.refunded',one.ch),503);assert.equal(await count(a,'legacy_billing_invalidations'),0);assert.equal(await tier(a),'oracle');
 a.sdk.checkout.sessions.list=list;a.raw.charges.get(one.ch).amount_refunded=1;
 await deliver(a,a.event('charge.refunded',one.ch));assert.equal(await tier(a),'oracle');
 const risks=(await a.db.query('SELECT source_id FROM legacy_billing_invalidations')).rows;assert.equal(risks.length,1);assert.equal(risks[0].source_id,one.sessionId);
});
test('switching provider accounts cannot promote an unrefreshed review-held source above the fresh current-account proof',async t=>{
 const a=await setup(t),old=a.seed({tier:'philosopher'}),unknown=structuredClone(a.raw.subscriptions.get(old.sourceId));
 unknown.id='sub_Unclassified';unknown.metadata={};a.raw.subscriptions.set(unknown.id,unknown);
 await deliver(a,a.event('customer.subscription.updated',old.sourceId));assert.equal(await tier(a),'free');
 const held=(await a.db.query('SELECT tier,paid FROM legacy_billing_subscriptions WHERE scope=$1',['live:acct_Legacy'])).rows;
 assert.equal(held.length,1);assert.equal(held[0].tier,'philosopher');assert.equal(held[0].paid,true);
 assert.equal((await a.db.query("SELECT needs_review FROM legacy_billing_members WHERE member_id=$1 AND mode='live'",[IDS.actor])).rows[0].needs_review,true);
 const b=legacyProviderFixture({accountId:'acct_AccountB'}),fresh=b.seed({customerId:'cus_AccountB',suffix:'AccountB'}),oldCalls=a.calls.length;
 a.provider.customer=async()=>{throw Error('Previous account provider is inaccessible');};
 Object.assign(a.app.context.process.env,b.env);a.setProvider(b.provider);
 await deliver(a,a.event('customer.subscription.updated',fresh.sourceId));assert.equal(await tier(a),'seeker');
 assert.equal(a.calls.length,oldCalls);assert.ok(b.calls.some(c=>c.name==='customer'&&c.id===fresh.customerId));
 assert.equal((await a.db.query('SELECT count(*)::int n FROM legacy_billing_receipts')).rows[0].n,2);
});
test('unsupported paid proration or period forms preserve a managed tier and receipt count until current proof is understood',async t=>{
 const a=await setup(t),s=a.seed();await deliver(a,a.event('customer.subscription.updated',s.sourceId));assert.equal(await tier(a),'seeker');
 const original=structuredClone(a.raw.lines.get(s.invoiceId));a.raw.lines.get(s.invoiceId).push({...structuredClone(original[0]),id:'il_Proration',parent:{type:'subscription_item_details',subscription_item_details:{subscription:s.sourceId,proration:true}}});
 await deliver(a,a.event('invoice.paid',s.invoiceId),503);assert.equal(await tier(a),'seeker');assert.equal(await count(a,'legacy_billing_receipts'),1);
 a.raw.lines.set(s.invoiceId,structuredClone(original));a.raw.lines.get(s.invoiceId)[0].period.end--;
 await deliver(a,a.event('invoice.paid',s.invoiceId),503);assert.equal(await tier(a),'seeker');assert.equal(await count(a,'legacy_billing_receipts'),1);
 a.raw.lines.set(s.invoiceId,structuredClone(original));a.raw.subscriptions.get(s.sourceId).latest_invoice=null;
 await deliver(a,a.event('customer.subscription.updated',s.sourceId),503);assert.equal(await tier(a),'seeker');assert.equal(await count(a,'legacy_billing_receipts'),1);
});
test('a canceled source with an unsupported old paid invoice does not block another verified customer from reconciling',async t=>{
 const a=await setup(t),one=a.seed(),two=a.seed({customerId:'cus_Two',suffix:'Two',tier:'scholar'});
 await deliver(a,a.event('customer.subscription.updated',one.sourceId));await deliver(a,a.event('customer.subscription.updated',two.sourceId));assert.equal(await tier(a),'scholar');
 a.raw.subscriptions.get(two.sourceId).status='canceled';a.raw.lines.get(two.invoiceId).push({...structuredClone(a.raw.lines.get(two.invoiceId)[0]),id:'il_OldProration'});
 await deliver(a,a.event('customer.subscription.deleted',two.sourceId));assert.equal(await tier(a),'seeker');assert.equal(await count(a,'legacy_billing_receipts'),3);
 assert.equal((await a.db.query('SELECT paid FROM legacy_billing_subscriptions WHERE id=$1',[two.sourceId])).rows[0].paid,false);
});
