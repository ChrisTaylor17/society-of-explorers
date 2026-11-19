import test from 'node:test';
import assert from 'node:assert/strict';
import {lstat} from 'node:fs/promises';
const path=new URL('./support/full-chain-migration-db.mjs',import.meta.url),s=await lstat(path);
assert(s.isFile()&&!s.isSymbolicLink()&&(!s.size||s.blocks));
const {evidence,source,ORDERED_STAGES,LIMITS,IDS,asRole,scalar,createFullChainDb,installFullChain,snapshotPreState,verifyPreStatePreserved,verifySourceStability}=await import('./support/full-chain-migration-db.mjs');
await source('verification/web/tests/full-chain-migration.test.mjs');await source('verification/web/tests/support/full-chain-migration-db.mjs');
await source('verification/web/tests/support/full-chain-migration-workflows.mjs');
const {exerciseFullChain}=await import('./support/full-chain-migration-workflows.mjs');
let expectedBaseline=false;
test.after(async()=>{await verifySourceStability();assert.equal(evidence.databasesCreated,evidence.databasesClosed);console.log('FULL_CHAIN_EVIDENCE '+JSON.stringify({...evidence,orderedStages:ORDERED_STAGES,limits:LIMITS}));});
test('preserved original plan-order control refuses Stage9 for tracked legacy reading policies, not the captured zero-policy state',async()=>{
 assert.throws(()=>fetch('https://offline.invalid/no-network'),/EXTERNAL_NETWORK_DISABLED_IN_PRIVATE_BUILD/);
 const f=await createFullChainDb('documented-order-baseline');
 try{
  await assert.rejects(installFullChain(f,{documentedOrder:true,omitEventContainment:true,through:'saved-reading'}),error=>{
   assert.equal(error.code,'PT409');assert.equal(error.message,'Saved reading policies or triggers require review.');
   assert.equal(evidence.executions.at(-1).path,'docs/sql/reading-progress-preflight.sql');return true;
  });
  expectedBaseline=true;
 }finally{await f.close();}
});
test('captured event gap control deliberately omits only new Stage6b; local TRUNCATE reachability is separate from HTTP',async()=>{
 const f=await createFullChainDb('recorded-event-grants',{recordedEventGrants:true});
 try{
  await installFullChain(f,{omitEventContainment:true,through:'correlated-listing-receipts'});
  await f.db.query("INSERT INTO exp_events(member_id,amount,reason) VALUES($1,1,'Synthetic recorded-grant probe')",[IDS.host]);
  for(const role of ['anon','authenticated']){
   await assert.rejects(asRole(f.db,role,async tx=>{await tx.exec('TRUNCATE exp_events');
    // TRUNCATE bypasses RLS, but SELECT may fail through the preserved owner policy.
    await tx.exec('RESET ROLE');assert.equal((await tx.query('SELECT count(*)::integer n FROM exp_events')).rows[0].n,0);
    throw Error('ROLL_BACK_SUCCESSFUL_TRUNCATE');}),/ROLL_BACK_SUCCESSFUL_TRUNCATE/);
   assert.equal(await scalar(f,'SELECT count(*)::integer FROM exp_events'),1);
  }
  await installFullChain(f,{omitEventContainment:true,from:'atomic-reward-accounting'});
  for(const role of ['anon','authenticated'])assert.equal(await scalar(f,"SELECT has_table_privilege($1,'exp_events','TRUNCATE')",[role]),true);
  const attempts=[];
  for(const role of ['anon','authenticated']){
   await assert.rejects(asRole(f.db,role,tx=>tx.exec('TRUNCATE exp_events')),error=>{
    assert.equal(error.code,'0A000');assert.match(error.message,/foreign key constraint/);
    attempts.push({role,outcome:'refused',code:error.code,message:error.message});return true;
   });
  }
  evidence.observations.push({database:f.label,name:'captured event browser TRUNCATE authority survives the preserved chain when new Stage6b is omitted',outcome:'gap-reproduced',
   preAccountingRollbackProbeRoles:2,finalBrowserTruncatePrivilege:true,targetLeastPrivilegeSatisfied:false,postAccountingAttempts:attempts,httpExploitClaim:false});
 }finally{await f.close();}
});
test('all current planned stages compose in one database after the exact reviewed legacy reading-policy predecessor',async t=>{
 if(!expectedBaseline){t.skip('Stop after an unexpected earlier baseline failure');return;}
 const f=await createFullChainDb('corrected-full-chain',{recordedEventGrants:true});
 try{const before=await snapshotPreState(f);await installFullChain(f);await verifyPreStatePreserved(f,before);await exerciseFullChain(f,{eventContainment:true});}finally{await f.close();}
});
test('captured zero-policy reading pre-state composes core containment and saved-reading CAS without legacy cleanup',async()=>{
 const f=await createFullChainDb('captured-zero-policy-reading',{recordedReadingBaseline:true,recordedEventGrants:true});
 try{
  const before=await snapshotPreState(f);await installFullChain(f,{skipReadingCleanup:true});await verifyPreStatePreserved(f,before);
  assert.equal(await scalar(f,"SELECT count(*)::integer FROM pg_policy WHERE polrelid='public.reading_progress'::regclass"),0);
  assert.equal(await scalar(f,"SELECT relrowsecurity FROM pg_class WHERE oid='public.reading_progress'::regclass"),true);
  assert.equal(await scalar(f,"SELECT has_table_privilege('service_role','reading_progress','INSERT,UPDATE,DELETE,TRUNCATE')"),false);
  for(const role of ['anon','authenticated'])assert.equal(await scalar(f,"SELECT has_table_privilege($1,'exp_events','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')",[role]),false);
  assert(!evidence.executions.some(x=>x.database===f.label&&x.path==='docs/sql/great-books-private-data.sql'));
  evidence.observations.push({database:f.label,name:'captured zero-policy core-to-CAS path requires no legacy policy cleanup',outcome:'pass',policyCount:0,rls:true,rawServiceWrite:false});
 }finally{await f.close();}
});
