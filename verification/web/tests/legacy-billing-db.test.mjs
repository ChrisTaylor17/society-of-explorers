import test from 'node:test';
import assert from 'node:assert/strict';
import {createDb,rpc,asRole,IDS,SCOPE,HASH,eventId,state,subscription,lifetime,snapshot,apply} from './support/legacy-billing-db.mjs';
const reject=(fn,code)=>assert.rejects(fn,error=>error.code===code);
async function setup(t){const db=await createDb();t.after(()=>db.close());return db;}
const member=async(db,id=IDS.actor)=>(await db.query('SELECT tier,stripe_customer_id FROM members WHERE id=$1',[id])).rows[0];

test('read requires a canonical verified owner or existing binding and provisions nothing',async t=>{
 const db=await setup(t),s=await state(db);assert.equal(s.revision,0);assert.equal(s.expectedTier,'free');assert.equal(s.externalChange,false);
 assert.deepEqual(s.customers,['cus_FictionalA']);assert.equal((await db.query('SELECT count(*)::int n FROM legacy_billing_members')).rows[0].n,0);
 await reject(()=>state(db,{actor:null}),'PT404');await reject(()=>state(db,{actor:IDS.absent}),'PT404');
 for(const scope of ['test:unknown','LIVE:acct_A','live:acct_A:extra'])await reject(()=>state(db,{scope}),'PT400');
 assert.equal((await member(db)).stripe_customer_id,'cus_OldPointer');
});
test('original pointer never grants authority but rejects conflicting or ambiguous bootstrap metadata',async t=>{
 const db=await setup(t);await reject(()=>state(db,{actor:null,customer:'cus_OldPointer'}),'PT404');
 const s=await state(db,{actor:IDS.actor,customer:'cus_OldPointer'});assert.equal(s.memberId,IDS.actor);
 await reject(()=>state(db,{actor:IDS.other,customer:'cus_OldPointer'}),'PT409');
 const other=await state(db,{actor:IDS.other,customer:'cus_Other'});
 await reject(()=>apply(db,other,{actor:IDS.other,customer:'cus_OldPointer',value:snapshot([],{customer:'cus_OldPointer'})}),'PT409');
 await db.query("UPDATE members SET stripe_customer_id='cus_OldPointer' WHERE id=$1",[IDS.other]);
 await reject(()=>state(db,{actor:null,customer:'cus_OldPointer'}),'PT409');
 await reject(()=>state(db,{actor:IDS.actor,customer:'cus_OldPointer'}),'PT409');
 assert.equal((await member(db)).tier,'free');
});
test('the pointer barrier is statement scoped to inserts and pointer updates, without broader writer privileges',async t=>{
 const db=await setup(t);
 const triggers=(await db.query("SELECT pg_get_triggerdef(oid) definition FROM pg_trigger WHERE tgname='legacy_billing_pointer_barrier'")).rows;
 assert.equal(triggers.length,1);assert.match(triggers[0].definition,/BEFORE INSERT OR UPDATE OF stripe_customer_id/);assert.match(triggers[0].definition,/FOR EACH STATEMENT/);
 await db.exec('CREATE ROLE fictional_pointer_writer NOLOGIN;GRANT USAGE ON SCHEMA public TO fictional_pointer_writer;GRANT SELECT(id),UPDATE(stripe_customer_id) ON members TO fictional_pointer_writer;');
 await db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE fictional_pointer_writer');await tx.query("UPDATE members SET stripe_customer_id='cus_ExplicitPointerWrite' WHERE id=$1",[IDS.other]);});
 assert.equal((await member(db,IDS.other)).stripe_customer_id,'cus_ExplicitPointerWrite');
 assert.equal((await db.query("SELECT has_function_privilege('fictional_pointer_writer','_legacy_billing_pointer_barrier()','EXECUTE') allowed")).rows[0].allowed,false);
});
test('a later conflicting original pointer or extra inventory customer refuses the whole apply',async t=>{
 const db=await setup(t);const s=await state(db);
 await db.query("UPDATE members SET stripe_customer_id='cus_FictionalA' WHERE id=$1",[IDS.other]);
 await reject(()=>apply(db,s),'PT409');
 await db.query("UPDATE members SET stripe_customer_id='cus_ForeignInventory' WHERE id=$1",[IDS.other]);
 await reject(()=>apply(db,s,{value:snapshot([],{customers:[{customerId:'cus_FictionalA',sources:[subscription()]},{customerId:'cus_ForeignInventory',sources:[]}]})}),'PT409');
 assert.equal((await member(db)).tier,'free');assert.equal((await state(db)).revision,0);
});
test('verified live active paid sources atomically grant tier and receipt without changing customer pointer',async t=>{
 const db=await setup(t),s=await apply(db,await state(db));assert.equal(s.tier,'seeker');assert.equal(s.tierWritten,true);assert.equal(s.revision,1);
 assert.equal((await member(db)).stripe_customer_id,'cus_OldPointer');assert.equal((await db.query('SELECT count(*)::int n FROM legacy_billing_receipts')).rows[0].n,1);
});
test('receipt replay precedes stale CAS, returns current tier and rejects identity or hash changes',async t=>{
 const db=await setup(t),s=await state(db),key=eventId();const first=await apply(db,s,{event:key});
 const later=await apply(db,first,{value:snapshot([subscription({tier:'scholar'})])});
 const replay=await apply(db,s,{event:key});assert.equal(replay.replayed,true);assert.equal(replay.tier,'scholar');assert.equal(replay.revision,later.revision);assert.equal(replay.tierWritten,false);
 await reject(()=>apply(db,later,{event:key,hash:'b'.repeat(64)}),'PT409');
 await reject(()=>apply(db,later,{event:key,customer:'cus_Different',value:snapshot([],{customer:'cus_Different'})}),'PT409');
});
test('test ledger never writes tier or pointer and cannot seed or freeze live baseline',async t=>{
 const db=await setup(t),scope='test:acct_Fictional';let s=await state(db,{scope});
 s=await apply(db,s,{scope,value:snapshot([subscription({tier:'philosopher'})])});assert.equal(s.tierWritten,false);assert.equal((await member(db)).tier,'free');
 await db.query("UPDATE members SET tier='scholar' WHERE id=$1",[IDS.actor]);
 s=await apply(db,await state(db,{scope}),{scope,value:snapshot([subscription({status:'canceled'})])});assert.equal(s.externalChange,false);
 const live=await state(db);assert.equal(live.revision,0);assert.equal(live.baselineTier,'scholar');
 const next=await apply(db,live,{value:snapshot([subscription({tier:'philosopher'})])});assert.equal(next.externalChange,false);assert.equal(next.tier,'philosopher');assert.equal(next.baselineTier,'scholar');
 assert.equal((await member(db)).stripe_customer_id,'cus_OldPointer');
});
test('trialing past_due unpaid incomplete paused expired or future periods never newly grant',async t=>{
 const db=await setup(t);let s=await state(db);
 for(const status of ['trialing','past_due','unpaid','incomplete','incomplete_expired','paused','canceled']){
  s=await apply(db,s,{value:snapshot([subscription({status})])});assert.equal(s.tier,'free');
 }
 s=await apply(db,s,{value:snapshot([subscription({periodStart:'2020-01-01T00:00:00Z',periodEnd:'2020-02-01T00:00:00Z'})])});assert.equal(s.tier,'free');
 s=await apply(db,s,{value:snapshot([subscription({periodStart:new Date(Date.now()+86_400_000).toISOString(),periodEnd:new Date(Date.now()+2*86_400_000).toISOString()})])});assert.equal(s.tier,'free');
});
test('multiple customers aggregate highest eligible tier and cancellation cannot erase another customer source',async t=>{
 const db=await setup(t);let s=await apply(db,await state(db));
 const all=[{customerId:'cus_FictionalA',sources:[subscription()]},{customerId:'cus_FictionalB',sources:[subscription({id:'sub_FictionalB',tier:'philosopher'})]}];
 s=await apply(db,s,{customer:'cus_FictionalB',value:snapshot([],{customers:all})});assert.equal(s.tier,'philosopher');
 all[1].sources[0]=subscription({id:'sub_FictionalB',tier:'philosopher',status:'canceled'});
 s=await apply(db,s,{value:snapshot([],{customers:all})});assert.equal(s.tier,'seeker');assert.deepEqual(s.customers,['cus_FictionalA','cus_FictionalB']);
});
test('missing known customer or known source rejects the entire snapshot and receipt',async t=>{
 const db=await setup(t);let s=await apply(db,await state(db));
 s=await apply(db,s,{customer:'cus_FictionalB',value:snapshot([],{customers:[{customerId:'cus_FictionalA',sources:[subscription()]},{customerId:'cus_FictionalB',sources:[]}]})});
 await reject(()=>apply(db,s,{value:snapshot([subscription({status:'canceled'})])}),'PT409');
 await reject(()=>apply(db,s,{value:snapshot([],{customers:[{customerId:'cus_FictionalA',sources:[]},{customerId:'cus_FictionalB',sources:[]}]})}),'PT409');
 assert.equal((await member(db)).tier,'seeker');assert.equal((await state(db)).revision,s.revision);
});
test('scoped customer and source ownership cannot be rebound to another member or customer',async t=>{
 const db=await setup(t),s=await apply(db,await state(db));
 await reject(()=>state(db,{actor:IDS.other}),'PT409');
 const other=await state(db,{actor:IDS.other,customer:'cus_Other'});
 await reject(()=>apply(db,other,{actor:IDS.other,customer:'cus_Other',value:snapshot([subscription()],{customer:'cus_Other'})}),'PT409');
 await reject(()=>apply(db,s,{customer:'cus_FictionalB',value:snapshot([],{customers:[{customerId:'cus_FictionalA',sources:[]},{customerId:'cus_FictionalB',sources:[subscription()]}]})}),'PT409');
 assert.equal((await member(db,IDS.other)).tier,'free');
});
test('same IDs can exist in another provider mode/account without crossing live tier authority',async t=>{
 const db=await setup(t);await apply(db,await state(db));
 const other=await state(db,{actor:IDS.other,scope:'test:acct_Fictional'});
 await apply(db,other,{actor:IDS.other,scope:'test:acct_Fictional'});assert.equal((await member(db,IDS.other)).tier,'free');
});
test('a verified lifetime Oracle survives all ordinary subscription events',async t=>{
 const db=await setup(t);let s=await apply(db,await state(db),{value:snapshot([subscription(),lifetime()])});assert.equal(s.tier,'oracle');
 for(const status of ['canceled','unpaid','paused']){s=await apply(db,s,{value:snapshot([subscription({status}),lifetime()])});assert.equal(s.tier,'oracle');}
});
test('proven source refund/dispute invalidation is sticky and aggregates other valid sources',async t=>{
 const db=await setup(t);let s=await apply(db,await state(db),{value:snapshot([subscription({tier:'scholar'}),lifetime()])});
 s=await apply(db,s,{value:snapshot([subscription({tier:'scholar'}),lifetime()],{invalidatedSourceIds:[{kind:'lifetime',id:'cs_live_FictionalOracle'}]})});
 assert.equal(s.tier,'scholar');assert.equal(s.needsReview,true);
 s=await apply(db,s,{value:snapshot([subscription({tier:'scholar'}),lifetime()])});assert.equal(s.tier,'scholar');
 s=await apply(db,s,{value:snapshot([subscription({tier:'scholar'}),lifetime()],{invalidatedSourceIds:[{kind:'subscription',id:'sub_FictionalA'}]})});assert.equal(s.tier,'free');
});
test('unproven initial Oracle or paid baseline stays a protected floor under cancellation and risk',async t=>{
 const db=await setup(t);let s=await state(db,{actor:IDS.third});assert.equal(s.needsReview,true);
 s=await apply(db,s,{actor:IDS.third,value:snapshot([subscription({status:'canceled'})],{invalidatedSourceIds:[{kind:'subscription',id:'sub_FictionalA'}]})});
 assert.equal(s.tier,'oracle');assert.equal(s.tierWritten,false);assert.equal(s.baselineTier,'oracle');
 await db.query("UPDATE members SET tier='scholar' WHERE id=$1",[IDS.other]);
 s=await apply(db,await state(db,{actor:IDS.other,customer:'cus_Other'}),{actor:IDS.other,customer:'cus_Other',value:snapshot([subscription({id:'sub_Other',tier:'philosopher'})],{customer:'cus_Other'})});assert.equal(s.tier,'philosopher');
 s=await apply(db,s,{actor:IDS.other,customer:'cus_Other',value:snapshot([subscription({id:'sub_Other',tier:'philosopher',status:'canceled'})],{customer:'cus_Other'})});assert.equal(s.tier,'scholar');
});
test('external member tier changes freeze canonical writes and remain visible without being overwritten',async t=>{
 const db=await setup(t);let s=await apply(db,await state(db));
 await db.query("UPDATE members SET tier='free' WHERE id=$1",[IDS.actor]);
 await reject(()=>apply(db,s,{value:snapshot([subscription({tier:'philosopher'})])}),'PT409');
 s=await state(db);assert.equal(s.externalChange,true);
 s=await apply(db,s,{value:snapshot([subscription({tier:'philosopher'})])});assert.equal(s.externalChange,true);assert.equal(s.tier,'free');assert.equal(s.tierWritten,false);
 s=await apply(db,s,{value:snapshot([subscription({tier:'philosopher'})])});assert.equal(s.tier,'free');
});
test('another live account scope blocks automatic downgrade but not a verified upgrade',async t=>{
 const db=await setup(t);let s=await apply(db,await state(db));const scope='live:acct_Other';
 s=await apply(db,await state(db,{scope}),{scope,value:snapshot([subscription({id:'sub_AccountB',tier:'philosopher'})])});assert.equal(s.tier,'philosopher');assert.equal(s.otherLiveScopes,true);
 s=await apply(db,await state(db,{scope}),{scope,value:snapshot([subscription({id:'sub_AccountB',tier:'philosopher',status:'canceled'})])});
 assert.equal(s.tier,'philosopher');assert.equal(s.tierWritten,false);assert.equal(s.needsReview,true);
});
test('an old higher subscription in another account cannot create a tier from its unrefreshed stored snapshot',async t=>{
 const db=await setup(t);let s=await state(db);
 s=await apply(db,s,{value:snapshot([subscription({tier:'philosopher'})],{needsReview:true})});
 assert.equal(s.tier,'free');assert.equal(s.tierWritten,false);
 const scope='live:acct_FreshSecond',customer='cus_FreshSecond';s=await state(db,{scope,customer});
 s=await apply(db,s,{scope,customer,value:snapshot([subscription({id:'sub_FreshSecond',tier:'seeker'})],{customer})});
 assert.equal(s.tier,'seeker');assert.equal(s.tierWritten,true);assert.equal(s.otherLiveScopes,true);assert.equal(s.needsReview,true);
 s=await apply(db,s,{scope,customer,value:snapshot([subscription({id:'sub_FreshSecond',tier:'scholar'})],{customer})});
 assert.equal(s.tier,'scholar');assert.equal(s.tierWritten,true);
 s=await apply(db,s,{scope,customer,value:snapshot([subscription({id:'sub_FreshSecond',tier:'scholar',status:'canceled'})],{customer})});
 assert.equal(s.tier,'scholar');assert.equal(s.tierWritten,false);assert.equal(s.needsReview,true);
});
test('an old lifetime source in another account cannot grant Oracle while a fresh current-scope upgrade remains valid',async t=>{
 const db=await setup(t);let s=await state(db);
 s=await apply(db,s,{value:snapshot([lifetime()],{needsReview:true})});assert.equal(s.tier,'free');
 const scope='live:acct_FreshSecond',customer='cus_FreshSecond';s=await state(db,{scope,customer});
 s=await apply(db,s,{scope,customer,value:snapshot([subscription({id:'sub_FreshSecond',tier:'seeker'})],{customer})});
 assert.equal(s.tier,'seeker');assert.equal(s.tierWritten,true);
 s=await apply(db,s,{scope,customer,value:snapshot([subscription({id:'sub_FreshSecond',tier:'philosopher'})],{customer})});
 assert.equal(s.tier,'philosopher');assert.equal(s.tierWritten,true);
 s=await apply(db,s,{scope,customer,value:snapshot([subscription({id:'sub_FreshSecond',tier:'philosopher',status:'canceled'})],{customer})});
 assert.equal(s.tier,'philosopher');assert.equal(s.tierWritten,false);
});
test('uncertain snapshot freezes writes; a later complete proven snapshot may reconcile managed state',async t=>{
 const db=await setup(t);let s=await apply(db,await state(db));
 s=await apply(db,s,{value:snapshot([subscription({status:'canceled',valid:false})],{needsReview:true})});assert.equal(s.tier,'seeker');
 s=await apply(db,s,{value:snapshot([subscription({status:'canceled'})])});assert.equal(s.tier,'free');
});
test('strict shapes reject malformed metadata periods duplicate inventories and unproven risk with no partial writes',async t=>{
 const db=await setup(t),s=await state(db);
 const bad=[{}, {...snapshot(),actor:IDS.other},snapshot([{...subscription(),tier:'oracle'}]),snapshot([{...subscription(),paid:'true'}]),
  snapshot([{...subscription(),periodEnd:'infinity'}]),snapshot([{...subscription(),periodEnd:'2020-01-01T00:00:00Z'}]),
  snapshot([{...subscription(),valid:false}]),snapshot([lifetime({id:'cs_test_CrossMode'})]),snapshot([subscription(),subscription()]),
  snapshot([],{customers:[{customerId:'cus_FictionalA',sources:[]},{customerId:'cus_FictionalA',sources:[]}]})];
 bad.push(snapshot(Array.from({length:101},(_,i)=>subscription({id:`sub_Limit${i}`}))));
 for(const value of bad)await reject(()=>apply(db,s,{value}),'PT400');
 await reject(()=>apply(db,s,{value:snapshot([],{invalidatedSourceIds:[{kind:'subscription',id:'sub_Unknown'}]})}),'PT409');
 assert.equal((await state(db)).revision,0);assert.equal((await member(db)).tier,'free');
 assert.equal((await db.query('SELECT count(*)::int n FROM legacy_billing_customers')).rows[0].n,0);
});
test('late receipt failure rolls back tier ownership source snapshot and revision together',async t=>{
 const db=await setup(t),s=await state(db);
 await db.exec(`CREATE FUNCTION public.fixture_receipt_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Synthetic late failure';END $$;
  CREATE TRIGGER fixture_failure BEFORE INSERT ON legacy_billing_receipts FOR EACH ROW EXECUTE FUNCTION public.fixture_receipt_failure();`);
 await reject(()=>apply(db,s),'23514');assert.equal((await member(db)).tier,'free');assert.equal((await state(db)).revision,0);
 for(const table of ['legacy_billing_members','legacy_billing_customers','legacy_billing_subscriptions','legacy_billing_receipts'])assert.equal((await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n,0);
});
test('serialized duplicate delivery writes once and competing revisions cannot overwrite each other',async t=>{
 const db=await setup(t),s=await state(db),key=eventId();const results=await Promise.all([apply(db,s,{event:key}),apply(db,s,{event:key})]);
 assert.deepEqual(results.map(r=>r.replayed).sort(),[false,true]);await reject(()=>apply(db,s,{value:snapshot([subscription({tier:'philosopher'})])}),'PT409');
 assert.equal((await member(db)).tier,'seeker');
});
test('service-only INVOKER functions and RLS protect all new tables without granting non-tier member writes',async t=>{
 const db=await setup(t);const tables=(await db.query("SELECT relname,relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relname LIKE 'legacy_billing_%'")).rows;
 assert.equal(tables.length,6);assert.ok(tables.every(row=>row.relrowsecurity));
 for(const role of ['anon','authenticated']){await reject(()=>rpc(db,'soe_legacy_billing_event_state',[SCOPE,'cus_FictionalA',IDS.actor],role),'42501');
  for(const table of tables)await reject(()=>asRole(db,role,tx=>tx.query(`SELECT * FROM ${table.relname}`)),'42501');}
 assert.equal((await db.query("SELECT bool_and(NOT prosecdef) ok FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname ~ '^(_legacy_billing_|soe_legacy_billing_)'")).rows[0].ok,true);
 assert.equal((await db.query("SELECT has_column_privilege('service_role','members','stripe_customer_id','UPDATE') ok")).rows[0].ok,false);
});
