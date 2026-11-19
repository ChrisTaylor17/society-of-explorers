// Actual TypeScript adapter with an explicit native-module double; no OS claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './load-source.mjs';

const epoch='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const origin='https://android-adapter-fixture.invalid', storageKey='android-fixture';
function fixture(os='android') {
  let current=epoch, state='unknown', callback, disposed=0, removeHook=()=>{}, snapshotHook;
  const calls=[], values=new Map();
  const check=(self,generation)=>{assert.equal(self,module);if(generation!==current)throw Error('STALE_FIXTURE_EPOCH');};
  const module={
    async capabilities(){check(this,current);calls.push('capabilities');return{version:2,origin,storageKey,storageGeneration:current,storagePolicy:'os-protected',redirectPolicy:'reject-before-send'};},
    async begin(generation){check(this,generation);calls.push(['begin',generation]);return'owned-handle';},
    async send(id,request){check(this,current);calls.push(['send',id,request]);return{status:200,url:request.url,body:'{}',redirected:false};},
    async cancel(id){check(this,current);calls.push(['cancel',id]);},
    async read(slot,generation){check(this,generation);calls.push(['read',slot,generation]);return values.get(slot)??null;},
    async write(slot,value,generation){check(this,generation);calls.push(['write',slot,generation]);values.set(slot,value);},
    async remove(slot,generation){check(this,generation);calls.push(['remove',slot,generation]);values.delete(slot);},
    async resetAccountStorage(generation){check(this,generation);calls.push(['reset',generation]);current=next;values.clear();return{previousGeneration:generation,generation:current,cleared:true};},
    getConnectivitySnapshot(){check(this,current);return snapshotHook?snapshotHook():state;},
    onConnectivityChange(listener){check(this,current);callback=listener;return{remove(){disposed++;removeHook();}};},
  };
  const load=sourceLoader({'react-native':{Platform:{OS:os},TurboModuleRegistry:{get:name=>{assert.equal(name,'NativeSoeMember');return module;}}}});
  const api=load('platforms/native/src/circles/android-member.ts');
  return{...api,module,calls,values,load,setState:value=>{state=value;},emit:payload=>callback?.(payload),disposed:()=>disposed,
    setRemoveHook:fn=>{removeHook=fn;},setSnapshotHook:fn=>{snapshotHook=fn;}};
}
test('Android adapter rejects absent and incomplete modules before capabilities or account work',()=>{
  const f=fixture();for(const module of [null,{}, {...f.module,resetAccountStorage:undefined},{...f.module,onConnectivityChange:undefined}])assert.throws(()=>f.createAndroidMemberAdapter(module),/unavailable/);
  assert.deepEqual(f.calls,[]);
});
test('module wrappers are memoized and preserve receiver, epoch and narrow transport arguments',async()=>{
  const f=fixture(),adapter=f.createAndroidMemberAdapter(f.module);assert.equal(adapter,f.createAndroidMemberAdapter(f.module));
  const b=adapter.bridge;assert.equal((await b.capabilities()).version,2);
  await b.write('session','SYNTHETIC_SESSION',epoch);assert.equal(await b.read('session',epoch),'SYNTHETIC_SESSION');await b.remove('session',epoch);
  const id=await b.begin(epoch),request={url:origin+'/api/book-salons/11111111-1111-4111-8111-111111111111',method:'GET',bearer:'NONISSUED_FIXTURE'};
  assert.equal((await b.send(id,request)).url,request.url);await b.cancel(id);assert.equal((await b.resetAccountStorage(epoch)).generation,next);
  assert.deepEqual(f.calls.slice(1),[['write','session',epoch],['read','session',epoch],['remove','session',epoch],['begin',epoch],['send',id,request],['cancel',id],['reset',epoch]]);
});
test('queued online event resamples current offline native state and disposal fences synchronous and late callbacks',()=>{
  const f=fixture(),port=f.createAndroidMemberAdapter(f.module).connectivity,seen=[];
  const off=port.subscribe(value=>seen.push(value));f.setState('offline');f.emit({state:'online'});assert.deepEqual(seen,['offline']);
  f.setState('online');f.setRemoveHook(()=>f.emit({state:'online'}));off();off();f.emit({state:'online'});
  assert.equal(f.disposed(),1);assert.deepEqual(seen,['offline']);
});
test('malformed and failed native snapshots stay unknown including events with an online payload',()=>{
  const f=fixture(),port=f.createAndroidMemberAdapter(f.module).connectivity,seen=[];
  f.setState('forged');assert.equal(port.snapshot(),'unknown');const off=port.subscribe(value=>seen.push(value));
  f.setSnapshotHook(()=>{throw Error('SYNTHETIC_PLATFORM_FAILURE');});assert.equal(port.snapshot(),'unknown');f.emit({state:'online'});assert.deepEqual(seen,['unknown']);off();
});
test('malformed native subscription fails closed and its retained callback cannot revive the observer',()=>{
  const f=fixture();let callback;f.module.onConnectivityChange=listener=>{callback=listener;return{};};
  const port=f.createAndroidMemberAdapter(f.module).connectivity,seen=[];
  const {observeNativeConnectivity}=f.load('platforms/native/src/circles/native-connectivity.ts');
  const off=observeNativeConnectivity(port,value=>seen.push(value));f.setState('online');callback({state:'online'});off();assert.deepEqual(seen,['unknown']);
});
test('Android preparation binds actual ports/storage without creating an auth owner; reset retires old binding',async()=>{
  const f=fixture(),binding=await f.prepareAndroidMemberBinding({origin,storageKey});
  assert.deepEqual(f.calls,['capabilities']);await binding.storage.setItem(storageKey,'SYNTHETIC_SESSION');
  await binding.resetAccountStorage();assert.equal(f.values.size,0);await assert.rejects(binding.storage.getItem(storageKey),/unavailable/);
  const fresh=await f.prepareAndroidMemberBinding({origin,storageKey});assert.equal(await fresh.storage.getItem(storageKey),null);fresh.close();
});
test('non-Android preparation is unavailable without native capability or storage calls',async()=>{
  const f=fixture('ios');await assert.rejects(f.prepareAndroidMemberBinding({origin,storageKey}),/unavailable/);assert.deepEqual(f.calls,[]);
});
