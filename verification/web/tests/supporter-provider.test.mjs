import test from 'node:test';
import assert from 'node:assert/strict';
import { offlineApp } from './support/offline-app.mjs';
const ACCOUNT='11111111-1111-4111-8111-111111111111',KEY='aaaaaaaa-aaaa-4aaa-8aaa-000000000001',ACTOR='22222222-2222-4222-8222-222222222222';
const metadata={type:'soe_supporter_v1',account_id:ACCOUNT,scope:'test:acct_Fictional',request_id:KEY,offer_id:'soe-supporter-monthly-v1',terms_version:'supporter-2026-11-03-v1'};
const copy=v=>structuredClone(v);
function fixture(){
 const app=offlineApp(),calls=[],raw={account:{id:'acct_Fictional'},price:{id:'price_Fictional',active:true,livemode:false,currency:'usd',unit_amount:1000,type:'recurring',product:{id:'prod_Fictional',active:true,livemode:false},recurring:{interval:'month',interval_count:1,usage_type:'licensed'}},
 customer:{id:'cus_Fictional',livemode:false,metadata:copy(metadata)},configuration:{id:'bpc_Fictional',active:true,livemode:false,features:{subscription_cancel:{enabled:true},subscription_update:{enabled:false}}},
 subscriptions:[],sessionRows:[],payments:[],invoices:{},charges:{}};
 const now=Math.floor(Date.now()/1000);
 raw.subscription={id:'sub_Fictional',livemode:false,metadata:copy(metadata),customer:'cus_Fictional',status:'active',cancel_at_period_end:false,pause_collection:null,created:now,
  items:{data:[{quantity:1,price:copy(raw.price),current_period_start:now,current_period_end:now+2592000}],has_more:false},
  latest_invoice:{id:'in_Fictional',livemode:false,customer:'cus_Fictional',status:'paid',currency:'usd',amount_paid:1000,parent:{type:'subscription_details',subscription_details:{subscription:'sub_Fictional'}}}};
 raw.session={id:'cs_test_Fictional',mode:'subscription',livemode:false,metadata:copy(metadata),client_reference_id:ACCOUNT,customer:'cus_Fictional',status:'open',payment_status:'unpaid',subscription:null,
  url:'https://checkout.stripe.com/c/pay/cs_test_Fictional',expires_at:now+3600,line_items:{data:[{quantity:1,price:copy(raw.price)}],has_more:false}};
 raw.invoices.in_Fictional={id:'in_Fictional',livemode:false,parent:{type:'subscription_details',subscription_details:{subscription:'sub_Fictional'}}};
 const answer=(stage,value)=>(...args)=>{calls.push({stage,args:copy(args)});return Promise.resolve(copy(typeof value==='function'?value(...args):value));};
 class FakeStripe{
  constructor(key,options){calls.push({stage:'constructor',key,options});}
  accounts={retrieveCurrent:answer('account',()=>raw.account)};
  prices={retrieve:answer('price',()=>raw.price)};
  customers={retrieve:answer('customer.retrieve',()=>raw.customer),create:answer('customer.create',()=>raw.customer)};
  subscriptions={list:answer('subscriptions.list',q=>raw.subscriptionPages?raw.subscriptionPages(q):({data:raw.subscriptions,has_more:false})),retrieve:answer('subscription.retrieve',key=>raw.subscriptionMap?.[key]||raw.subscription)};
  checkout={sessions:{create:answer('checkout.create',()=>raw.session),retrieve:answer('session.retrieve',()=>raw.session),list:answer('sessions.list',q=>({data:raw.sessionRows.filter(s=>!q.status||s.status===q.status),has_more:false}))}};
  billingPortal={configurations:{retrieve:answer('configuration',()=>raw.configuration)},sessions:{create:answer('portal.create',()=>({id:'bps_Fictional',customer:'cus_Fictional',url:'https://billing.stripe.com/p/session/Fictional'}))}};
  invoicePayments={list:answer('payments.list',q=>raw.paymentPages?raw.paymentPages(q):({data:raw.payments,has_more:false}))};
  invoices={retrieve:answer('invoice.retrieve',id=>raw.invoices[id])};
  charges={retrieve:answer('charge.retrieve',id=>raw.charges[id])};
  webhooks={constructEvent(bytes,signature,secret){calls.push({stage:'signature',signature,secret});if(raw.realWebhook)return raw.realWebhook.constructEvent(bytes,signature,secret);if(signature!=='fixture_signature')throw Error('bad signature');return JSON.parse(Buffer.from(bytes).toString());}};
 }
 app.setMock('stripe-supporter',()=>({__esModule:true,default:FakeStripe}));
 const env={SOE_SUPPORTER_MODE:'test',SOE_SUPPORTER_ACCOUNT_ID:'acct_Fictional',SOE_SUPPORTER_STRIPE_SECRET_KEY:'rk_test_Fictional',SOE_SUPPORTER_SITE_ORIGIN:'https://offline.invalid',SOE_SUPPORTER_PRICE_ID:'price_Fictional',SOE_SUPPORTER_PRODUCT_ID:'prod_Fictional',SOE_SUPPORTER_PORTAL_CONFIGURATION_ID:'bpc_Fictional',SOE_SUPPORTER_WEBHOOK_SECRET:'whsec_Fictional',SOE_SUPPORTER_SALES_ENABLED:'true'};
 Object.assign(app.context.process.env,env,{STRIPE_TEST_PRICE_SEEKER:'price_Legacy'});
 const config=app.load('lib/supporter/config.ts').supporterConfig(),provider=app.load('lib/supporter/provider.ts').createSupporterProvider(config);
 return {app,calls,raw,env,config,provider};
}

test('dedicated configuration closes by default, accepts restricted test keys, and refuses live nonproduction/loopback or noncanonical origins',()=>{
 const f=fixture(),{supporterConfig,supporterOffer}=f.app.load('lib/supporter/config.ts');
 assert.equal(supporterOffer(supporterConfig({...f.env,SOE_SUPPORTER_SALES_ENABLED:undefined})).salesOpen,false);
 assert.equal(supporterConfig({...f.env,SOE_SUPPORTER_MODE:'live',SOE_SUPPORTER_STRIPE_SECRET_KEY:'rk_live_Fictional'}),null);
 for(const origin of ['https://localhost','https://127.0.0.1','https://[::1]','http://billing.example.test','https://user@billing.example.test','https://billing.example.test/x','https://billing.example.test?x=1']){
  assert.equal(supporterConfig({...f.env,VERCEL_ENV:'production',SOE_SUPPORTER_MODE:'live',SOE_SUPPORTER_STRIPE_SECRET_KEY:'rk_live_Fictional',SOE_SUPPORTER_SITE_ORIGIN:origin}),null,origin);
 }
 assert.ok(supporterConfig({...f.env,SOE_SUPPORTER_SITE_ORIGIN:'http://127.0.0.1:3195'}));
 assert.equal(f.calls[0].options.apiVersion,'2026-10-28.endive');assert.equal(f.calls[0].options.maxNetworkRetries,0);assert.equal(f.calls[0].options.timeout,5000);
});

test('fresh exact price/product/amount/currency/month/count/mode checks have no amount fallback',async()=>{
 const changes=[r=>{r.unit_amount=999;},r=>{r.currency='cad';},r=>{r.product.id='prod_Other';},r=>{r.active=false;},r=>{r.product.active=false;},r=>{r.livemode=true;},r=>{r.product.livemode=true;},r=>{r.recurring.interval='year';},r=>{r.recurring.interval_count=2;},r=>{r.recurring.usage_type='metered';},r=>{r.type='one_time';}];
 for(const change of changes){const f=fixture();change(f.raw.price);await assert.rejects(f.provider.verifyPrice());assert.equal(f.calls.some(c=>c.stage.endsWith('.create')),false);}
 const f=fixture();await f.provider.verifyPrice();f.raw.account.id='acct_Other';await assert.rejects(f.provider.verifyAccount());
});

test('customer and checkout use stable idempotency and opaque metadata; expiry, fixed returns and identifier stay identical on retry',async()=>{
 const f=fixture();await f.provider.customer(ACCOUNT,KEY);await f.provider.customer(ACCOUNT,KEY);
 const create=f.calls.filter(c=>c.stage==='customer.create');assert.deepEqual(create[0].args,create[1].args);assert.deepEqual(Object.keys(create[0].args[0]),['metadata']);
 await f.provider.checkout(ACCOUNT,'cus_Fictional',KEY,new Date(f.raw.session.expires_at*1000).toISOString());
 await f.provider.checkout(ACCOUNT,'cus_Fictional',KEY,new Date(f.raw.session.expires_at*1000).toISOString());
 const calls=f.calls.filter(c=>c.stage==='checkout.create');assert.deepEqual(calls[0].args,calls[1].args);
 assert.equal(calls[0].args[0].metadata.type,'soe_supporter_v1');assert.equal(calls[0].args[0].subscription_data.metadata.type,'soe_supporter_v1');
 assert.equal(calls[0].args[0].success_url,'https://offline.invalid/billing/return?attempt='+KEY);assert.match(calls[0].args[0].integration_identifier,/[a-z]{8}$/);
 assert.equal('customer_email' in calls[0].args[0],false);assert.equal('payment_method_types' in calls[0].args[0],false);
});

test('provider session refuses foreign account/request/customer/mode and preserves terminal null URL without inventing a link',async()=>{
 for(const change of [s=>{s.metadata.account_id=ACTOR;},s=>{s.metadata.request_id=ACTOR;},s=>{s.customer='cus_Other';},s=>{s.livemode=true;},s=>{s.line_items.data[0].quantity=2;},s=>{s.url='https://evil.invalid/pay';}]){
  const f=fixture();change(f.raw.session);await assert.rejects(f.provider.session('cs_test_Fictional',ACCOUNT,'cus_Fictional',KEY));
 }
 const f=fixture();f.raw.session.status='complete';f.raw.session.url=null;f.raw.session.subscription='sub_Fictional';f.raw.session.payment_status='paid';
 const got=await f.provider.session('cs_test_Fictional',ACCOUNT,'cus_Fictional',KEY);assert.equal(got.url,null);assert.equal(got.paid,true);assert.equal(got.subscriptionId,'sub_Fictional');
});

test('subscription normalization uses v23 item period and invoice-parent graph; active alone, unpaid invoice, wrong currency or pause cannot claim paid',async()=>{
 const f=fixture();f.raw.subscriptions=[{id:'sub_Fictional'}];let result=await f.provider.state('cus_Fictional',ACCOUNT);assert.equal(result.subscription.paid,true);assert.equal(result.blocked,true);
 for(const change of [s=>{s.latest_invoice.status='open';},s=>{s.latest_invoice.currency='eur';},s=>{s.latest_invoice.amount_paid=0;},s=>{s.pause_collection={behavior:'void'};},s=>{s.status='unpaid';}]){
  const a=fixture();a.raw.subscriptions=[{id:'sub_Fictional'}];change(a.raw.subscription);result=await a.provider.state('cus_Fictional',ACCOUNT);assert.equal(result.subscription.paid,false);
 }
 const bad=fixture();bad.raw.subscriptions=[{id:'sub_Fictional'}];bad.raw.subscription.latest_invoice.parent.subscription_details.subscription='sub_Foreign';assert.equal((await bad.provider.state('cus_Fictional',ACCOUNT)).review,true);
});

test('management checks explicit portal configuration cancel enabled and subscription upgrades disabled',async()=>{
 const f=fixture();await f.provider.verifyPortal();await f.provider.portal(ACCOUNT,'cus_Fictional',KEY);assert.equal(f.calls.find(c=>c.stage==='portal.create').args[0].configuration,'bpc_Fictional');
 for(const change of [p=>{p.active=false;},p=>{p.livemode=true;},p=>{p.features.subscription_cancel.enabled=false;},p=>{p.features.subscription_update.enabled=true;}]){
  const a=fixture();change(a.raw.configuration);await assert.rejects(a.provider.verifyPortal());assert.equal(a.calls.some(c=>c.stage==='portal.create'),false);
 }
});

test('legacy portal ownership requires canonical member metadata and explicit mode price IDs; matching email never supplies authority',async()=>{
 const f=fixture();f.raw.customer.metadata={};f.raw.customer.email='private@example.test';f.raw.subscriptions=[{id:'sub_Fictional'}];f.raw.subscription.metadata={type:'membership',member_id:ACTOR};f.raw.subscription.items.data[0].price={id:'price_Legacy',livemode:false};
 assert.equal(await f.provider.legacy('cus_Fictional',ACTOR),true);assert.equal(await f.provider.legacy('cus_Fictional',ACCOUNT),false);
 f.raw.subscription.items.data[0].price.id='price_Unknown';assert.equal(await f.provider.legacy('cus_Fictional',ACTOR),false);
});

test('refund/dispute/fraud resolve PaymentIntent→all InvoicePayments→invoice.parent→subscription; nullable PI retrieves charge',async()=>{
 const f=fixture();f.raw.payments=[{id:'inpay_Fictional',invoice:'in_Fictional'}];
 const event={id:'evt_Fictional',type:'charge.dispute.created',livemode:false,data:{object:{charge:'ch_Fictional',payment_intent:null}}};
 f.raw.charges.ch_Fictional={id:'ch_Fictional',livemode:false,payment_intent:'pi_Fictional'};
 const targets=await f.provider.targets(event);assert.equal(targets.length,1);assert.equal(targets[0].accountId,ACCOUNT);assert.equal(targets[0].kind,'risk');
 const call=f.calls.find(c=>c.stage==='payments.list');assert.deepEqual(call.args[0].payment,{type:'payment_intent',payment_intent:'pi_Fictional'});assert.equal(call.args[0].status,'paid');
 for(const type of ['charge.refunded','radar.early_fraud_warning.created'])assert.equal((await f.provider.targets({...event,type,data:{object:{payment_intent:'pi_Fictional'}}})).length,1);
});

test('webhook verifies raw bytes, selected mode and account; unrelated signed events return no targets',async()=>{
 const f=fixture(),event={id:'evt_Fictional',type:'invoice.paid',livemode:false,account:'acct_Fictional',data:{object:{id:'in_Fictional'}}};
 assert.equal(f.provider.event(new TextEncoder().encode(JSON.stringify(event)),'fixture_signature').id,event.id);
 assert.throws(()=>f.provider.event(new TextEncoder().encode(JSON.stringify(event)),'wrong'));
 for(const change of [{livemode:true},{account:'acct_Foreign'}])assert.throws(()=>f.provider.event(new TextEncoder().encode(JSON.stringify({...event,...change})),'fixture_signature'));
 assert.equal((await f.provider.targets({...event,type:'unrelated.event'})).length,0);
});

test('full pagination follows cursors and refuses a bounded incomplete inventory instead of proving no subscription',async()=>{
 const f=fixture();f.raw.subscriptionPages=q=>q.starting_after?{data:[],has_more:false}:{data:[{id:'sub_Fictional'}],has_more:true};
 const state=await f.provider.state('cus_Fictional',ACCOUNT);assert.equal(state.blocked,true);assert.equal(f.calls.filter(c=>c.stage==='subscriptions.list').length,2);
 assert.equal(f.calls.filter(c=>c.stage==='subscriptions.list')[1].args[0].starting_after,'sub_Fictional');
 const blocked=fixture();blocked.raw.subscriptionPages=()=>({data:[{id:'sub_Fictional'}],has_more:true});await assert.rejects(blocked.provider.state('cus_Fictional',ACCOUNT));
 assert.equal(blocked.calls.filter(c=>c.stage==='subscriptions.list').length,5);
});

test('mixed foreign subscriptions and foreign open sessions require review and never return a paid projection',async()=>{
 const f=fixture();f.raw.subscriptions=[{id:'sub_Fictional'}];f.raw.subscription.metadata.account_id=ACTOR;let state=await f.provider.state('cus_Fictional',ACCOUNT);assert.equal(state.review,true);assert.equal(state.subscription,null);
 const open=fixture();open.raw.sessionRows=[copy(open.raw.session)];open.raw.sessionRows[0].metadata.account_id=ACTOR;state=await open.provider.state('cus_Fictional',ACCOUNT);assert.equal(state.review,true);assert.equal(state.blocked,true);
});

test('risk graph exhausts invoice-payment pages and reports multiple mapped accounts for atomic-controller refusal',async()=>{
 const f=fixture();f.raw.paymentPages=q=>q.starting_after?{data:[{id:'inpay_Two',invoice:'in_Two'}],has_more:false}:{data:[{id:'inpay_One',invoice:'in_Fictional'}],has_more:true};
 f.raw.invoices.in_Two={id:'in_Two',livemode:false,parent:{type:'subscription_details',subscription_details:{subscription:'sub_Two'}}};
 f.raw.subscriptionMap={sub_Fictional:copy(f.raw.subscription),sub_Two:{...copy(f.raw.subscription),id:'sub_Two',metadata:{...metadata,account_id:ACTOR},customer:'cus_Two'}};
 const targets=await f.provider.targets({id:'evt_Fictional',type:'charge.refunded',livemode:false,data:{object:{payment_intent:'pi_Fictional'}}});
 assert.equal(targets.length,2);assert.equal(f.calls.filter(c=>c.stage==='payments.list').length,2);assert.equal(f.calls.filter(c=>c.stage==='payments.list')[1].args[0].starting_after,'inpay_One');
});

test('installed Stripe23 cryptographic webhook verification consumes unchanged raw bytes under a process-wide network deny',async()=>{
 const {createRequire}=await import('node:module'),require=createRequire(new URL('../../../package.json',import.meta.url));
 const Stripe=require('stripe-supporter');const actual=new Stripe('rk_test_FICTIONAL',{apiVersion:'2026-10-28.endive'}),f=fixture();f.raw.realWebhook=actual.webhooks;
 const text=JSON.stringify({id:'evt_Fictional',object:'event',type:'invoice.paid',livemode:false,data:{object:{id:'in_Fictional'}}});
 const signature=actual.webhooks.generateTestHeaderString({payload:text,secret:'whsec_Fictional'});
 assert.equal(f.provider.event(new TextEncoder().encode(text),signature).id,'evt_Fictional');
 assert.throws(()=>f.provider.event(new TextEncoder().encode(text+' '),signature));
});
