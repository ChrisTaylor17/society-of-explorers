import test from 'node:test';import assert from 'node:assert/strict';
import {legacyProviderFixture,ACTOR,OTHER,CATALOG} from './support/legacy-billing-provider.mjs';
const event=(type,id,live=true)=>({id:'evt_Fixture',type,livemode:live,data:{object:{id}}});
test('strict selected-mode configuration and explicit historical catalog are required; archived exact products remain valid',async()=>{
 const f=legacyProviderFixture();assert.equal(f.constructed.options.apiVersion,'2026-10-28.endive');assert.equal(f.constructed.options.maxNetworkRetries,0);assert.equal(f.constructed.options.timeout,5000);
 const parse=f.app.load('lib/payments/legacyBillingConfig.ts').legacyBillingConfig;
 for(const change of [{SOE_LEGACY_BILLING_MODE:undefined},{SOE_LEGACY_BILLING_MODE:'test'},{VERCEL_ENV:'preview'},{SOE_LEGACY_BILLING_CATALOG_JSON:'[]'},{SOE_LEGACY_BILLING_CATALOG_JSON:JSON.stringify([{...CATALOG[0],amount:0}])},{SOE_LEGACY_BILLING_CATALOG_JSON:JSON.stringify([{...CATALOG[0],currency:'cad'}])}])assert.equal(parse({...f.env,...change}),null);
 const s=f.seed();await f.provider.verifyAccount();const result=await f.provider.customer(s.customerId,ACTOR);assert.equal(result.customer.sources[0].paid,true);assert.equal(result.customer.sources[0].tier,'seeker');
});
test('exact catalog validates currency, amount, product, mode, quantity, recurring interval/count and complete single items',async()=>{
 for(const mutate of [s=>s.items.data[0].price.id='price_Unknown',s=>s.items.data[0].price.currency='cad',s=>s.items.data[0].price.unit_amount=0,s=>s.items.data[0].price.product.id='prod_Foreign',s=>s.items.data[0].price.livemode=false,s=>s.items.data[0].quantity=2,s=>s.items.data[0].price.recurring.interval='year',s=>s.items.data[0].price.recurring.interval_count=2,s=>s.items.has_more=true,s=>s.items.data.push(s.items.data[0])]){
  const f=legacyProviderFixture(),s=f.seed();mutate(f.raw.subscriptions.get(s.sourceId));await assert.rejects(f.provider.customer(s.customerId,ACTOR));
 }
});
test('current invoice, exact subscription and paid payment graph are required; active alone and grace states never grant',async()=>{
 for(const [status,paid] of [['active',true],['trialing',true],['past_due',true],['unpaid',false],['canceled',true],['paused',true]]){
  const f=legacyProviderFixture(),s=f.seed({status,paid}),result=await f.provider.customer(s.customerId,ACTOR);assert.equal(result.customer.sources[0].paid,status==='active'&&paid);
 }
 for(const mutate of [f=>f.raw.invoices.get('in_One').status='open',f=>f.raw.invoices.get('in_One').amount_paid=0,f=>f.raw.intents.get('pi_One').status='requires_payment_method',f=>f.raw.charges.get('ch_One').captured=false]){
  const f=legacyProviderFixture(),s=f.seed();mutate(f);assert.equal((await f.provider.customer(s.customerId,ACTOR)).customer.sources[0].paid,false);
 }
});
test('foreign current metadata/customer/subscription/invoice ownership refuses instead of falling back to matching email',async()=>{
 for(const mutate of [f=>f.raw.customers.get('cus_One').metadata.member_id=OTHER,f=>f.raw.subscriptions.get('sub_One').metadata.member_id=OTHER,f=>f.raw.subscriptions.get('sub_One').customer='cus_Other',f=>f.raw.invoices.get('in_One').parent.subscription_details.subscription='sub_Foreign',f=>f.raw.invoices.get('in_One').customer='cus_Other']){
  const f=legacyProviderFixture(),s=f.seed();mutate(f);await assert.rejects(f.provider.customer(s.customerId,ACTOR));
 }
});
test('stale checkout/subscription event hints are classified using current provider graph; unrelated/supporter cannot become legacy',async()=>{
 const f=legacyProviderFixture(),s=f.seed();f.raw.subscriptions.get(s.sourceId).metadata.type='soe_supporter_v1';assert.equal(await f.provider.target(event('customer.subscription.deleted',s.sourceId)),null);
 f.raw.sessions.get(s.sessionId).metadata.type='merch';assert.equal(await f.provider.target(event('checkout.session.completed',s.sessionId)),null);
});
test('new Oracle requires an exact one-time catalog and a current captured paid charge; no amount fallback',async()=>{
 const f=legacyProviderFixture(),s=f.seed({lifetime:true});assert.equal((await f.provider.customer(s.customerId,ACTOR)).customer.sources[0].paid,true);
 f.raw.sessions.get(s.sessionId).line_items.data[0].price.id='price_Unknown49900';await assert.rejects(f.provider.customer(s.customerId,ACTOR));
 const g=legacyProviderFixture(),t=g.seed({lifetime:true});g.raw.charges.get(t.ch).refunded=true;const x=await g.provider.customer(t.customerId,ACTOR);assert.equal(x.customer.sources[0].paid,false);assert.equal(x.invalidatedSourceIds[0].kind,'lifetime');
});
test('fresh refunds and disputes invalidate their exact managed source without inventing an unrelated global cancellation',async()=>{
 const f=legacyProviderFixture(),s=f.seed();f.raw.charges.get(s.ch).amount_refunded=1;
 const x=await f.provider.customer(s.customerId,ACTOR);assert.equal(x.needsReview,false);assert.equal(x.customer.sources[0].paid,false);assert.equal(x.invalidatedSourceIds[0].id,s.sourceId);
 const target=await f.provider.target(event('charge.refunded',s.ch));assert.equal(target.customerId,s.customerId);assert.equal(target.invalidatedSourceIds[0].id,s.sourceId);
 f.raw.disputes.set('dp_One',{id:'dp_One',livemode:true,charge:s.ch});assert.equal((await f.provider.target(event('charge.dispute.created','dp_One'))).invalidatedSourceIds[0].id,s.sourceId);
 f.raw.fraud.set('issfr_One',{id:'issfr_One',livemode:true,charge:s.ch});assert.equal((await f.provider.target(event('radar.early_fraud_warning.created','issfr_One'))).invalidatedSourceIds[0].id,s.sourceId);
});
test('complete bounded pagination follows cursors and refuses truncated inventory',async()=>{
 const f=legacyProviderFixture(),s=f.seed();let calls=0;f.sdk.subscriptions.list=async args=>{calls++;return calls===1?{data:[f.raw.subscriptions.get(s.sourceId)],has_more:true}:{data:[],has_more:false};};
 await f.provider.customer(s.customerId,ACTOR);assert.equal(calls,2);
 f.sdk.subscriptions.list=async()=>({data:[f.raw.subscriptions.get(s.sourceId)],has_more:true});await assert.rejects(f.provider.customer(s.customerId,ACTOR));
});
test('risk graph refuses multiple customers before exposing a write target and handles null PaymentIntent through direct-charge inventory',async()=>{
 const f=legacyProviderFixture(),s=f.seed();const t=f.seed({customerId:'cus_Two',suffix:'Two',memberId:OTHER});f.raw.payments.get('ip_Two').payment.payment_intent=s.pi;
 await assert.rejects(f.provider.target(event('charge.refunded',s.ch)));
 const g=legacyProviderFixture(),u=g.seed();g.raw.charges.get(u.ch).payment_intent=null;g.raw.payments.get('ip_One').payment={type:'charge',charge:u.ch};
 assert.equal((await g.provider.target(event('charge.refunded',u.ch))).invalidatedSourceIds[0].id,u.sourceId);
});
test('all historical membership session references must agree; a canonical client reference can bootstrap only without conflicting metadata',async()=>{
 const f=legacyProviderFixture(),s=f.seed();f.raw.sessions.get(s.sessionId).client_reference_id=OTHER;await assert.rejects(f.provider.customer(s.customerId,ACTOR));await assert.rejects(f.provider.target(event('checkout.session.completed',s.sessionId)));
 const g=legacyProviderFixture(),u=g.seed();delete g.raw.sessions.get(u.sessionId).metadata.member_id;
 assert.equal((await g.provider.target(event('checkout.session.completed',u.sessionId))).verifiedMemberId,ACTOR);await g.provider.customer(u.customerId,ACTOR);
});
test('explicit unrelated products do not freeze recognized legacy sources; unclassified subscription history requests review',async()=>{
 const f=legacyProviderFixture(),s=f.seed();const other=structuredClone(f.raw.subscriptions.get(s.sourceId));other.id='sub_Unrelated';other.metadata={type:'other_product'};f.raw.subscriptions.set(other.id,other);
 const clear=await f.provider.customer(s.customerId,ACTOR);assert.equal(clear.needsReview,false);assert.equal(clear.customer.sources.length,1);assert.equal(clear.customer.sources[0].paid,true);
 other.metadata={};const unknown=await f.provider.customer(s.customerId,ACTOR);assert.equal(unknown.needsReview,true);
});
test('distinct invoice-payment rows cannot double count one captured payment or alias a PaymentIntent through its direct charge',async()=>{
 for(const direct of [false,true]){
  const f=legacyProviderFixture(),s=f.seed();f.raw.invoices.get(s.invoiceId).amount_due=3800;f.raw.invoices.get(s.invoiceId).amount_paid=3800;
  const second=structuredClone(f.raw.payments.get('ip_One'));second.id='inpay_Two';if(direct)second.payment={type:'charge',charge:s.ch};f.raw.payments.set('ip_Two',second);
  await assert.rejects(f.provider.customer(s.customerId,ACTOR));
 }
});
test('historical positive settled discounts may retain the exact catalog tier; zero-due and credits-only invoices grant nothing',async()=>{
 const f=legacyProviderFixture(),s=f.seed();f.raw.invoices.get(s.invoiceId).amount_due=1;f.raw.invoices.get(s.invoiceId).amount_paid=1;f.raw.payments.get('ip_One').amount_paid=1;
 assert.equal((await f.provider.customer(s.customerId,ACTOR)).customer.sources[0].paid,true);
 f.raw.invoices.get(s.invoiceId).amount_due=0;f.raw.invoices.get(s.invoiceId).amount_paid=0;assert.equal((await f.provider.customer(s.customerId,ACTOR)).customer.sources[0].paid,false);
});
test('catalog parsing refuses coercible non-string tiers and account scopes that SQL cannot represent',()=>{
 const f=legacyProviderFixture(),parse=f.app.load('lib/payments/legacyBillingConfig.ts').legacyBillingConfig;
 for(const change of [{SOE_LEGACY_BILLING_ACCOUNT_ID:'acct_Internal_Underscore'},{SOE_LEGACY_BILLING_ACCOUNT_ID:'acct_'+ 'a'.repeat(120)},{SOE_LEGACY_BILLING_CATALOG_JSON:JSON.stringify([{...CATALOG[0],tier:['seeker']}])}])assert.equal(parse({...f.env,...change}),null);
});
test('risk invoice lists are hints: payment identity and fresh invoice ID/customer must match the risky charge graph',async()=>{
 for(const variant of ['other-intent','direct-alias','payment-invoice','invoice-id','invoice-customer','intent-charge']){
  const f=legacyProviderFixture(),one=f.seed(),two=f.seed({suffix:'Two',tier:'scholar'});
  const payment=structuredClone(f.raw.payments.get('ip_One'));
  if(variant==='other-intent')f.sdk.invoicePayments.list=async()=>({data:[f.raw.payments.get('ip_Two')],has_more:false});
  if(variant==='direct-alias'){payment.payment={type:'charge',charge:one.ch};f.sdk.invoicePayments.list=async()=>({data:[payment],has_more:false});}
  if(variant==='payment-invoice'){payment.invoice=two.invoiceId;f.sdk.invoicePayments.list=async()=>({data:[payment],has_more:false});}
  if(variant==='invoice-id')f.sdk.invoices.retrieve=async()=>structuredClone(f.raw.invoices.get(two.invoiceId));
  if(variant==='invoice-customer')f.raw.invoices.get(one.invoiceId).customer='cus_Foreign';
  if(variant==='intent-charge')f.raw.intents.get(one.pi).latest_charge=two.ch;
  await assert.rejects(f.provider.target(event('charge.refunded',one.ch)),variant);
 }
});
test('risk session lists and current one-time sessions must both bind their PaymentIntent and customer to the risky charge',async()=>{
 for(const variant of ['listed-intent','fresh-intent','fresh-customer','fresh-mode']){
  const f=legacyProviderFixture(),one=f.seed({lifetime:true}),two=f.seed({suffix:'Two',lifetime:true});
  const listed=structuredClone(f.raw.sessions.get(two.sessionId));
  if(variant!=='listed-intent')listed.payment_intent=one.pi;
  f.sdk.checkout.sessions.list=async()=>({data:[listed],has_more:false});
  if(variant==='fresh-customer'){f.raw.sessions.get(two.sessionId).payment_intent=one.pi;f.raw.sessions.get(two.sessionId).customer='cus_Foreign';}
  if(variant==='fresh-mode'){f.raw.sessions.get(two.sessionId).payment_intent=one.pi;f.raw.sessions.get(two.sessionId).mode='subscription';}
  await assert.rejects(f.provider.target(event('charge.refunded',one.ch)),variant);
 }
 const f=legacyProviderFixture(),one=f.seed({lifetime:true});
 const target=await f.provider.target(event('charge.refunded',one.ch));assert.equal(target.invalidatedSourceIds[0].id,one.sessionId);
 assert.equal(f.calls.filter(c=>c.name==='session'&&c.id===one.sessionId).length,1);
});
test('unsupported paid invoice lines are uncertain for candidate grants but cannot prevent definite canceled-source reconciliation',async()=>{
 for(const mutate of [f=>f.raw.lines.get('in_One').push({...structuredClone(f.raw.lines.get('in_One')[0]),id:'il_Proration'}),f=>f.raw.lines.get('in_One')[0].period.end--,f=>f.raw.lines.get('in_One')[0].pricing.price_details.price='price_Other',f=>f.raw.lines.get('in_One')[0].parent.subscription_item_details.proration=true,f=>f.raw.subscriptions.get('sub_One').latest_invoice=null]){
  const f=legacyProviderFixture(),s=f.seed();mutate(f);await assert.rejects(f.provider.customer(s.customerId,ACTOR));
  f.raw.subscriptions.get(s.sourceId).status='canceled';const canceled=await f.provider.customer(s.customerId,ACTOR);assert.equal(canceled.customer.sources[0].status,'canceled');assert.equal(canceled.customer.sources[0].paid,false);
 }
});
