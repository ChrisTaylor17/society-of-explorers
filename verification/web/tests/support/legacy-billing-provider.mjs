import {createRequire} from 'node:module';
import {offlineApp} from './offline-app.mjs';
const require=createRequire(new URL('../../../../package.json',import.meta.url));
const Stripe=require('stripe');
// Installed SDK use is limited to local signature cryptography. API adapters use
// the exact mocked constructor below; the process-wide network deny is mandatory.
export const realWebhooks=new Stripe('sk_test_FictionalSigningOnly').webhooks;
export const ACTOR='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222';
export const CATALOG=[{priceId:'price_Seeker',productId:'prod_Recurring',tier:'seeker',amount:1900,currency:'usd',interval:'month'},
 {priceId:'price_Scholar',productId:'prod_Recurring',tier:'scholar',amount:4900,currency:'usd',interval:'month'},
 {priceId:'price_Philosopher',productId:'prod_Recurring',tier:'philosopher',amount:9900,currency:'usd',interval:'month'},
 {priceId:'price_Oracle',productId:'prod_Lifetime',tier:'oracle',amount:49900,currency:'usd',interval:null}];
export function legacyProviderFixture({mode='live',accountId='acct_Legacy'}={}){
 const app=offlineApp(),live=mode==='live',calls=[],raw={customers:new Map(),subscriptions:new Map(),sessions:new Map(),invoices:new Map(),lines:new Map(),payments:new Map(),intents:new Map(),charges:new Map(),disputes:new Map(),fraud:new Map()};
 const env={SOE_LEGACY_BILLING_MODE:mode,SOE_LEGACY_BILLING_ACCOUNT_ID:accountId,SOE_LEGACY_BILLING_CATALOG_JSON:JSON.stringify(CATALOG),STRIPE_SECRET_KEY:`rk_${mode}_FictionalLegacy`,STRIPE_WEBHOOK_SECRET:'whsec_FictionalLegacy',VERCEL_ENV:'production'};
 Object.assign(app.context.process.env,env);
 const one=(name,map)=>async id=>{calls.push({name,id});const row=map.get(id);if(!row)throw Error('PRIVATE_NO_SUCH_'+name);return structuredClone(row);};
 const page=rows=>({data:structuredClone(rows),has_more:false});
 const sdk={accounts:{retrieveCurrent:async()=>{calls.push({name:'account'});return {id:accountId};}},
  customers:{retrieve:one('customer',raw.customers)},
  subscriptions:{retrieve:one('subscription',raw.subscriptions),list:async args=>{calls.push({name:'subscriptions.list',args});return page([...raw.subscriptions.values()].filter(s=>s.customer===args.customer));}},
  checkout:{sessions:{retrieve:one('session',raw.sessions),list:async args=>{calls.push({name:'sessions.list',args});return page([...raw.sessions.values()].filter(s=>(!args.customer||s.customer===args.customer)&&(!args.payment_intent||s.payment_intent===args.payment_intent)));}}},
  invoices:{retrieve:one('invoice',raw.invoices),listLineItems:async id=>{calls.push({name:'invoice.lines',id});return page(raw.lines.get(id)||[]);}},
  invoicePayments:{retrieve:async id=>{calls.push({name:'invoicePayment',id});const row=[...raw.payments.values()].find(p=>p.id===id);if(!row)throw Error('PRIVATE_NO_SUCH_invoicePayment');return structuredClone(row);},list:async args=>{calls.push({name:'invoicePayments.list',args});return page([...raw.payments.values()].filter(p=>(!args.invoice||p.invoice===args.invoice)&&(!args.payment||p.payment.payment_intent===args.payment.payment_intent)));}},
  paymentIntents:{retrieve:one('intent',raw.intents)},charges:{retrieve:one('charge',raw.charges)},disputes:{retrieve:one('dispute',raw.disputes)},radar:{earlyFraudWarnings:{retrieve:one('fraud',raw.fraud)}}};
 let constructed;
 app.setMock('stripe-supporter',()=>({__esModule:true,default:class SyntheticReadOnlySDK{constructor(key,options){if(key!==env.STRIPE_SECRET_KEY)throw Error('Unexpected fixture key');constructed={key,options};return sdk;}}}));
 app.setMock('stripe',()=>({__esModule:true,default:class ForbiddenLegacySDK{constructor(){throw Error('Legacy API SDK forbidden in provider fixture');}}}));
 const config=app.load('lib/payments/legacyBillingConfig.ts').legacyBillingConfig(),provider=app.load('lib/payments/legacyBillingProvider.ts').createLegacyBillingProvider(config);
 const price=(which='seeker')=>{const e=CATALOG.find(x=>x.tier===which);return {id:e.priceId,product:{id:e.productId,livemode:live,active:false},livemode:live,active:false,currency:'usd',unit_amount:e.amount,type:which==='oracle'?'one_time':'recurring',recurring:which==='oracle'?null:{interval:'month',interval_count:1,usage_type:'licensed'}};};
 function seed({memberId=ACTOR,customerId='cus_One',suffix='One',tier='seeker',status='active',paid=true,lifetime=false}={}){
  raw.customers.set(customerId,{id:customerId,livemode:live,metadata:{}});
  const start=Math.floor(Date.now()/1000)-3600,end=start+30*86400,p=price(lifetime?'oracle':tier),sourceId=(lifetime?`cs_${mode}_`:'sub_')+suffix,invoiceId='in_'+suffix,pi='pi_'+suffix,ch='ch_'+suffix;
  const metadata={type:'membership',member_id:memberId};
  raw.charges.set(ch,{id:ch,livemode:live,customer:customerId,payment_intent:pi,currency:'usd',paid:true,captured:true,status:'succeeded',amount_captured:p.unit_amount,amount_refunded:0,refunded:false,disputed:false});
  raw.intents.set(pi,{id:pi,livemode:live,customer:customerId,currency:'usd',status:paid?'succeeded':'requires_payment_method',amount_received:paid?p.unit_amount:0,latest_charge:ch});
  if(!lifetime){
   raw.subscriptions.set(sourceId,{id:sourceId,livemode:live,metadata,customer:customerId,status,pause_collection:null,items:{data:[{id:'si_'+suffix,quantity:1,current_period_start:start,current_period_end:end,price:p}],has_more:false},latest_invoice:invoiceId});
   raw.invoices.set(invoiceId,{id:invoiceId,livemode:live,customer:customerId,parent:{type:'subscription_details',subscription_details:{subscription:sourceId}},currency:'usd',status:paid?'paid':'open',amount_due:p.unit_amount,amount_paid:paid?p.unit_amount:0,amount_remaining:paid?0:p.unit_amount});
   raw.lines.set(invoiceId,[{id:'il_'+suffix,quantity:1,currency:'usd',parent:{type:'subscription_item_details',subscription_item_details:{subscription:sourceId}},pricing:{type:'price_details',price_details:{price:p.id}},period:{start,end}}]);
   raw.payments.set('ip_'+suffix,{id:'inpay_'+suffix,livemode:live,invoice:invoiceId,currency:'usd',status:'paid',amount_paid:p.unit_amount,payment:{type:'payment_intent',payment_intent:pi}});
  }
  const sessionId=`cs_${mode}_`+suffix;
  raw.sessions.set(sessionId,{id:sessionId,livemode:live,metadata,customer:customerId,client_reference_id:memberId,currency:'usd',mode:lifetime?'payment':'subscription',status:'complete',payment_status:paid?'paid':'unpaid',amount_total:p.unit_amount,payment_intent:lifetime?pi:null,subscription:lifetime?null:sourceId,line_items:{data:[{id:'li_'+suffix,quantity:1,currency:'usd',price:p}],has_more:false}});
  return {customerId,sourceId,sessionId,invoiceId,pi,ch,start,end};
 }
 return {app,provider,config,env,raw,sdk,calls,seed,price,get constructed(){return constructed;}};
}
