import { randomUUID } from 'node:crypto';
import { offlineApp } from './offline-app.mjs';
import { createDb, rpc, asRole, IDS } from './supporter-db.mjs';
export { IDS };
export async function supporterApp({ origin = 'https://offline.invalid', salesEnabled = false } = {}) {
  const db = await createDb(), app = offlineApp();
  await db.exec('ALTER TABLE members ADD COLUMN stripe_customer_id text; GRANT SELECT(tier,stripe_customer_id) ON members TO service_role;');
  let actor = IDS.actor, sequence = 0;
  const calls = [], customers = new Map(), sessions = new Map(), subscriptions = new Map(), legacyOwners = new Map(), failures = new Map();
  const env = app.context.process.env;
  Object.assign(env,{ SOE_SUPPORTER_MODE:'test', SOE_SUPPORTER_ACCOUNT_ID:'acct_FictionalOne',SOE_SUPPORTER_STRIPE_SECRET_KEY:'rk_test_FictionalKey',SOE_SUPPORTER_WEBHOOK_SECRET:'whsec_Fictional',
    SOE_SUPPORTER_PRICE_ID:'price_FictionalSupporter',SOE_SUPPORTER_PRODUCT_ID:'prod_FictionalSupporter',SOE_SUPPORTER_PORTAL_CONFIGURATION_ID:'bpc_Fictional',SOE_SUPPORTER_SITE_ORIGIN:origin,
    SOE_SUPPORTER_SALES_ENABLED:salesEnabled?'true':'false',STRIPE_TEST_PRICE_PHILOSOPHER:'price_FictionalLegacy' });
  const fail = stage => { const n=failures.get(stage)||0;if(n){failures.set(stage,n-1);throw Error('PRIVATE_FIXTURE_'+stage);} };
  const log = (stage,more={}) => calls.push({stage,...more});
  const provider = {
    calls,customers,sessions,subscriptions,legacyOwners,events:[],failNext(stage){failures.set(stage,(failures.get(stage)||0)+1);},
    async verifyAccount(){log('verifyAccount');fail('verifyAccount');},
    async verifyPrice(){log('verifyPrice');fail('verifyPrice');},
    async verifyPortal(){log('verifyPortal');fail('verifyPortal');},
    async customer(accountId,requestId){log('customer',{accountId,requestId});let row=[...customers.values()].find(c=>c.requestId===requestId&&c.accountId===accountId);
      if(!row){row={id:'cus_Fictional'+(++sequence),accountId,requestId};customers.set(row.id,row);}fail('customer');return row.id;},
    async state(customerId,accountId){log('state',{customerId,accountId});fail('state');const c=customers.get(customerId);if(!c||c.accountId!==accountId)throw Error('PRIVATE_FOREIGN_CUSTOMER');
      const subscription=subscriptions.get(customerId)||null;return {subscription,blocked:Boolean(subscription&&!['canceled','incomplete_expired'].includes(subscription.status))||[...sessions.values()].some(s=>s.customerId===customerId&&s.status==='open'),review:false,ownershipVerified:true};},
    async checkout(accountId,customerId,requestId,expiresAt){log('checkout',{accountId,customerId,requestId,expiresAt});let s=sessions.get(requestId);
      if(!s){s={id:'cs_test_Fictional'+(++sequence),url:'https://checkout.stripe.com/c/pay/fixture'+sequence,expiresAt,status:'open',paid:false,subscriptionId:null,accountId,customerId,requestId};sessions.set(requestId,s);}fail('checkout');return {...s};},
    async session(id,accountId,customerId,requestId){log('session',{id,requestId});fail('session');const s=sessions.get(requestId);
      if(!s||s.id!==id||s.accountId!==accountId||s.customerId!==customerId)throw Error('PRIVATE_FOREIGN_SESSION');return {...s};},
    async findSession(accountId,customerId,requestId){log('findSession',{requestId});fail('findSession');const s=sessions.get(requestId);if(!s)return null;
      if(s.accountId!==accountId||s.customerId!==customerId)throw Error('PRIVATE_FOREIGN_SESSION');return {...s};},
    async portal(accountId,customerId,requestId){log('portal',{accountId,customerId,requestId});fail('portal');return {id:'bps_Fictional'+requestId.replaceAll('-',''),url:'https://billing.stripe.com/p/session/'+requestId};},
    async legacy(customerId,canonical){log('legacy',{customerId,actor:canonical});fail('legacy');return legacyOwners.get(customerId)===canonical;},
    event(bytes,signature){if(signature!=='fixture_signature')throw Error('PRIVATE_BAD_SIGNATURE');const e=JSON.parse(new TextDecoder().decode(bytes));
      if(e.livemode!==false||(e.account&&e.account!=='acct_FictionalOne'))throw Error('PRIVATE_WRONG_MODE');return e;},
    async targets(e){log('targets');fail('targets');if(e.targets)return e.targets;const key=e.data.object.requestId,s=sessions.get(key);if(!s)return [];
      return [{accountId:s.accountId,customerId:s.customerId,kind:e.type.startsWith('charge.')?'risk':'checkout',requestId:key,session:{...s}}];},
  };
  // Exact import strings matter in this VM loader. Block SDK construction even
  // if a new import path bypasses the interface fixture.
  app.setMock('stripe-supporter',()=>({__esModule:true,default:class ForbiddenProviderSDK { constructor(){throw Error('Real provider SDK forbidden in offline interface fixture');} }}));
  app.setMock('./provider',()=>({createSupporterProvider:()=>provider}));
  app.setMock('@/lib/supporter/provider',()=>({createSupporterProvider:()=>provider}));
  app.setMock('@/lib/getAuthenticatedMember',()=>({getAuthenticatedMember:async()=>actor?{memberId:actor,member:{id:actor}}:null}));
  const functions = new Map();
  const admin = { rpc:async(name,args)=>{try{
    if(!name.startsWith('soe_supporter_'))throw Error('Unexpected fixture RPC');
    let names=functions.get(name);if(!names){const q=await db.query("SELECT proargnames FROM pg_proc WHERE proname=$1 AND pronamespace='public'::regnamespace",[name]);if(q.rows.length!==1)throw Error('Missing fixture RPC');names=q.rows[0].proargnames;functions.set(name,names);}
    return {data:await rpc(db,name,names.map(k=>args[k]??null)),error:null};
   }catch(e){return {data:null,error:{code:e.code||'FIXTURE_ERROR'}};}},
   from(table){if(table!=='members')throw Error('Unexpected fixture table');let key;
    const q={select(){return q;},eq(column,value){if(column!=='id')throw Error('Unexpected fixture column');key=value;return q;},async single(){try{return await asRole(db,'service_role',async tx=>{const rows=(await tx.query('SELECT id,tier,stripe_customer_id FROM members WHERE id=$1',[key])).rows;return rows.length===1?{data:rows[0],error:null}:{data:null,error:{code:'PGRST116'}};});}catch{return {data:null,error:{code:'FIXTURE_ERROR'}};}}};return q;}
  };
  app.setMock('@/lib/supabase/admin',()=>({getSupabaseAdmin:()=>admin}));
  const routes=new Map();
  function route(name){if(!routes.has(name))routes.set(name,app.load('app/api/supporter/'+name+'/route.ts'));return routes.get(name);}
  async function dispatch(path,method='GET',body,headers={}){
    const u=new URL(path,origin),name=u.pathname.split('/').at(-1);if(!['offer','status','checkout','portal','return','webhook'].includes(name))throw Error('Unexpected route '+path);
    const req=app.fakes.makeReq(body,{url:u.href,headers:{'content-type':'application/json',origin,...headers}});return route(name)[method](req);
  }
  async function seedLegacy(who=IDS.other){const customerId='cus_Legacy'+who.replaceAll('-','');await db.query('UPDATE members SET tier=$1,stripe_customer_id=$2 WHERE id=$3',['oracle',customerId,who]);legacyOwners.set(customerId,who);customers.set(customerId,{id:customerId,legacy:true});return customerId;}
  async function webhook(event){provider.events.push(structuredClone(event));const r=await dispatch('/api/supporter/webhook','POST',event,{'stripe-signature':'fixture_signature'});if(r.status!==200)throw Error('Fixture webhook '+r.status+' '+await r.text());return r.json();}
  provider.markPaid=async requestId=>{const s=sessions.get(requestId);if(!s)throw Error('No synthetic session');s.status='complete';s.paid=true;s.url=null;s.subscriptionId='sub_Fictional'+requestId.replaceAll('-','');
    const start=new Date(),end=new Date(start);end.setUTCMonth(end.getUTCMonth()+1);
    subscriptions.set(s.customerId,{id:s.subscriptionId,status:'active',cancelAtPeriodEnd:false,currentPeriodStart:start.toISOString(),currentPeriodEnd:end.toISOString(),paid:true});
    return webhook({id:'evt_Fictional'+(++sequence),type:'checkout.session.completed',livemode:false,data:{object:{requestId}}});};
  return {db,app,provider,admin,dispatch,seedLegacy,webhook,setActor:value=>{actor=value;},setSalesEnabled:value=>{env.SOE_SUPPORTER_SALES_ENABLED=value?'true':'false';},
    setConfig:values=>Object.assign(env,values),requestId:()=>randomUUID(),close:()=>db.close()};
}
