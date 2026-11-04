import { readFile } from 'node:fs/promises';
import { PGlite } from '../../tooling/node_modules/@electric-sql/pglite/dist/index.js';
export const IDS = { actor:'11111111-1111-4111-8111-111111111111', other:'22222222-2222-4222-8222-222222222222',
 third:'33333333-3333-4333-8333-333333333333', absent:'44444444-4444-4444-8444-444444444444' };
export const SCOPE='live:acct_Fictional';
export const HASH='a'.repeat(64);
let sequence=0;
export function eventId(){return `evt_Fictional${++sequence}`;}
export async function createDb(){
 const db=new PGlite();await db.waitReady;
 await db.exec(`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE TABLE public.members(id uuid PRIMARY KEY,tier text,stripe_customer_id text,display_name text);
  GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;`);
 await db.query("INSERT INTO members(id,tier,stripe_customer_id,display_name) VALUES($1,'free','cus_OldPointer','Fictional Member'),($2,'free',NULL,'Other Member'),($3,'oracle',NULL,'Unknown Oracle')",[IDS.actor,IDS.other,IDS.third]);
 await db.exec(await readFile(new URL('../../../../docs/sql/legacy-billing.sql',import.meta.url),'utf8'));
 return db;
}
export async function asRole(db,role,fn){
 if(!['anon','authenticated','service_role'].includes(role))throw Error('Unexpected fixture role');
 return db.transaction(async tx=>{await tx.exec(`SET LOCAL ROLE ${role}`);return fn(tx);});
}
// PGlite has one PostgreSQL session: concurrency here verifies serialized SQL
// outcomes. The independent-backend Docker runner records actual lock waits.
export async function rpc(db,name,args=[],role='service_role'){
 if(!/^soe_legacy_billing_[a-z_]+$/.test(name))throw Error('Unexpected fixture RPC');
 return asRole(db,role,async tx=>(await tx.query(`SELECT public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) AS value`,args)).rows[0].value);
}
export function state(db,{scope=SCOPE,customer='cus_FictionalA',actor=IDS.actor}={}){
 return rpc(db,'soe_legacy_billing_event_state',[scope,customer,actor]);
}
export function subscription({id='sub_FictionalA',tier='seeker',status='active',paid=status==='active',valid=true,
 periodStart=new Date(Date.now()-3_600_000).toISOString(),periodEnd=new Date(Date.now()+25*86_400_000).toISOString()}={}){
 return {id,kind:'subscription',tier,status,paid,valid,periodStart,periodEnd};
}
export function lifetime({id='cs_live_FictionalOracle',status='complete',paid=status==='complete',valid=true}={}){
 return {id,kind:'lifetime',tier:'oracle',status,paid,valid,periodStart:null,periodEnd:null};
}
export function snapshot(sources=[subscription()],{customer='cus_FictionalA',customers=null,invalidatedSourceIds=[],needsReview=false}={}){
 return {customers:customers??[{customerId:customer,sources}],invalidatedSourceIds,needsReview};
}
export function apply(db,s,{scope=SCOPE,customer='cus_FictionalA',actor=s.memberId,event=eventId(),hash=HASH,
 revision=s.revision,expectedTier=s.expectedTier,value=snapshot()}={}){
 return rpc(db,'soe_legacy_billing_apply_event',[scope,event,hash,actor,customer,revision,expectedTier,JSON.stringify(value)]);
}
