// Actual saved legacy bodies + planned profile guard/containment/accounting.
// Identity, provider output and HTTP service transport remain explicitly synthetic.
import {lstat,stat} from 'node:fs/promises';
import assert from 'node:assert/strict';
const old=new URL('./reward-live-body-db.mjs',import.meta.url),link=await lstat(old),info=await stat(old);
assert.equal(link.isSymbolicLink(),false);assert.ok(!info.size||info.blocks,'Refuse offloaded reward helper');
const legacy=await import('./reward-live-body-db.mjs');
export const {A,B,AUTH_A,asRole,rewardRows,thinkerFixture,materializedRewardSource,LIVE_BODIES,liveRewardMetadata}=legacy;
export const REQUEST='33333333-3333-4333-8333-333333333333';
export const HASH='a'.repeat(64);
export async function installAccounting(db){
 try{await db.exec((await materializedRewardSource('docs/sql/thinker-reward-accounting.sql')).toString());}
 catch(error){await db.exec('ROLLBACK');throw error;}
}
export async function createThinkerRewardDb(t,{install=true}={}){
 const db=await legacy.createRewardLiveDb();if(t)t.after(()=>db.close());
 try{await legacy.runRewardSql(db,'apply');if(install)await installAccounting(db);return db;}
 catch(error){if(!t)await db.close();throw error;}
}
export async function award(db,{actor=A,requestId=REQUEST,hash=HASH,thinker='socrates',reaction=false,role='service_role'}={}){
 return asRole(db,role,async tx=>(await tx.query('SELECT public.soe_thinker_reward_award($1,$2,$3,$4,$5) value',[actor,requestId,hash,thinker,reaction])).rows[0].value);
}
export async function receipt(db,actor=A,requestId=REQUEST,role='service_role'){
 return asRole(db,role,async tx=>(await tx.query('SELECT public.soe_thinker_reward_receipt($1,$2) value',[actor,requestId])).rows[0].value);
}
export const body=(overrides={})=>({requestId:REQUEST,thinkerId:'socrates',message:'Synthetic private request',isCouncilMode:true,...overrides});
export async function done(response){
 const text=await response.text();const rows=text.split('\n').filter(x=>x.startsWith('data: ')).map(x=>JSON.parse(x.slice(6)));
 return{rows,last:rows.findLast(x=>x.done),text};
}
