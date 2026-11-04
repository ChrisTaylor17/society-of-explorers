import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validLookup, validRead, validVersion, validWrite } from '../../../mobile/src/validation.ts';
import { createMobileClient } from '../../../mobile/src/client.ts';
import { createFixturePort, PLAN_ID } from '../../../mobile/src/fixture.ts';
const versions = [undefined,null,NaN,Infinity,-Infinity,0,-1,1.5,'1',Number.MAX_SAFE_INTEGER+1];
test('response contract rejects non-positive-safe-integer versions and malformed variants', () => {
  for(const v of versions) {
    assert.equal(validVersion(v),false);
    for(const endpoint of ['join','grant','revoke']) {
      const value={status:'committed',version:v,data:{invitationId:'i',permissionId:'p'}};
      assert.equal(validWrite(value,endpoint),false);assert.equal(validLookup({status:'recorded',result:value},endpoint),false);
    }
  }
  for(const value of [null,{},[],{status:'pending'},{status:'ambiguous',attemptId:'a'},{status:'conflict'},{status:'rejected'},{status:'unavailable'},{status:'committed',version:1,data:{}},{status:'committed',version:1,data:null}]) {
    assert.equal(validWrite(value,'join'),false);assert.equal(validLookup({status:'recorded',result:value},'join'),false);
  }
  for(const value of [{status:'pending',attemptId:'a'},{status:'ambiguous',attemptId:'a',reason:'r'},{status:'conflict',error:'e'},{status:'rejected',error:'e'},{status:'unavailable',blocker:'b'},{status:'offline'},{status:'expired-session'}]) {
    assert.equal(validWrite(value,'join'),true);assert.equal(validLookup({status:'recorded',result:value},'join'),true);
  }
  assert.equal(validWrite({status:'committed',version:1,data:{invitationId:'i'}},'join'),true);
  for(const endpoint of ['grant','revoke'])assert.equal(validWrite({status:'committed',version:Number.MAX_SAFE_INTEGER,data:{permissionId:'p'}},endpoint),true);
});
test('discover and visibility validate nested shape and version/id binding', async()=>{
  const port=createFixturePort();const discover=await port.discover();const visibility=await port.visibility(PLAN_ID);
  assert.equal(validRead(discover,'discover'),true);assert.equal(validRead(visibility,'visibility',PLAN_ID),true);
  for(const kind of ['discover','visibility'] as const)for(const v of versions)assert.equal(validRead({... (kind==='discover'?discover:visibility),version:v},kind,PLAN_ID),false);
  if(discover.status==='ok') {
    assert.equal(validRead({...discover,data:[{...discover.data[0],sharedInterests:[null]}]},'discover'),false);
    assert.equal(validRead({...discover,data:[{...discover.data[0],version:discover.version+1}]},'discover'),false);
  }
  if(visibility.status==='ok')for(const data of [{...visibility.data,planId:'wrong'},{...visibility.data,version:visibility.version+1},{...visibility.data,rows:[{field:'x'}]}])assert.equal(validRead({...visibility,data},'visibility',PLAN_ID),false);
});
test('controller validates injected ports independently of HTTP adapter',async()=>{
  const port=createFixturePort();const discover=port.discover.bind(port);
  port.discover=async()=>{const result:any=await discover();delete result.version;return result;};
  const client=createMobileClient(port);assert.equal((await client.boot()).phase,'failed-refresh');assert.equal((client as any).highWater.size,0);
  const fresh=createFixturePort();const write=fresh.requestJoin.bind(fresh);
  fresh.requestJoin=async input=>{const result:any=await write(input);delete result.version;return result;};
  const other=createMobileClient(fresh);await other.boot();await other.reviewPlan(PLAN_ID);await other.requestJoin(PLAN_ID,'bad-direct');
  assert.equal(other.ledgerEntries()[0].status,'ambiguous');assert.equal(other.screen().truthful,'unknown');
  const lookup=fresh.lookup.bind(fresh);fresh.lookup=async input=>{const result:any=await lookup(input);delete result.result.version;return result;};
  await other.reconcile('join','bad-direct');assert.equal(other.ledgerEntries()[0].status,'ambiguous');
});
