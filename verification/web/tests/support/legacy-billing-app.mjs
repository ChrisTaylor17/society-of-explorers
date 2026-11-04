import {offlineApp} from './offline-app.mjs';
import {createDb,rpc,IDS} from './legacy-billing-db.mjs';
import {legacyProviderFixture,realWebhooks} from './legacy-billing-provider.mjs';
export {IDS};
let sequence=0;
export async function legacyBillingApp({mode='live'}={}){
 const fixture=legacyProviderFixture({mode}),app=offlineApp(),db=await createDb();
 let provider=fixture.provider;
 await db.query('UPDATE members SET stripe_customer_id=NULL WHERE id=$1',[IDS.actor]);
 Object.assign(app.context.process.env,fixture.env);
 // Exact interface imports are mocked in the HTTP VM; the returned provider is
 // the actual adapter in a separate VM with only synthetic read-only SDK methods.
 app.setMock('./legacyBillingProvider',()=>({createLegacyBillingProvider:()=>provider}));
 app.setMock('@/lib/payments/legacyBillingProvider',()=>({createLegacyBillingProvider:()=>provider}));
 app.setMock('stripe-supporter',()=>({__esModule:true,default:class ForbiddenProviderSDK{constructor(){throw Error('Real SDK forbidden in HTTP fixture');}}}));
 app.setMock('stripe',()=>({__esModule:true,default:class SignatureOnlySDK{constructor(key){if(key!==fixture.env.STRIPE_SECRET_KEY)throw Error('Unexpected key');}webhooks=realWebhooks;} }));
 app.setMock('@/lib/capital/pledgeLedger',()=>({recordPaidPledge:()=>{throw Error('Capital side effect forbidden in membership fixture');}}));
 app.setMock('@/lib/email/resend',()=>({getResend:()=>{throw Error('Email forbidden in membership fixture');}}));
 const functions=new Map(),admin={rpc:async(name,args)=>{try{
  let names=functions.get(name);if(!names){const rows=(await db.query("SELECT proargnames FROM pg_proc WHERE proname=$1 AND pronamespace='public'::regnamespace",[name])).rows;if(rows.length!==1)throw Error('Missing fixture RPC');names=rows[0].proargnames;functions.set(name,names);}
  return {data:await rpc(db,name,names.map(n=>n==='p_snapshot'?JSON.stringify(args[n]):args[n]??null)),error:null};
 }catch(e){return {data:null,error:{code:e.code||'FIXTURE_ERROR'}};}},from(){throw Error('Unscoped table access forbidden in membership processor');}};
 app.setMock('@/lib/supabase/admin',()=>({getSupabaseAdmin:()=>admin}));
 const route=app.load('app/api/stripe/webhook/route.ts');
 function event(type,id,extra={}){return {id:'evt_Fixture'+(++sequence),type,livemode:mode==='live',data:{object:{id,metadata:{type:'membership'}}},...extra};}
 async function dispatch(event,{raw,signature,headers={}}={}){const bytes=raw??new TextEncoder().encode(JSON.stringify(event));const sig=signature??realWebhooks.generateTestHeaderString({payload:Buffer.from(bytes),secret:'whsec_FictionalLegacy'});
  return route.POST(new Request('https://offline.invalid/api/stripe/webhook',{method:'POST',headers:{'stripe-signature':sig,...headers},body:bytes}));}
 return {...fixture,app,db,admin,event,dispatch,setProvider:value=>{provider=value;},close:()=>db.close()};
}
