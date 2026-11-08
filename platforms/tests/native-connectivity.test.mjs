import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {sourceLoader} from './load-source.mjs';
const modulePath='platforms/native/src/circles/native-connectivity.ts';
const observe=()=>sourceLoader()(modulePath).observeNativeConnectivity;

test('missing/malformed/failing connectivity never publishes online, including synchronous registration events',()=>{
 for(const port of [undefined,{}, {snapshot(){return'online';},subscribe(){return null;}},
  {snapshot(){throw Error('Synthetic snapshot unavailable');},subscribe(listener){listener('online');return()=>{};}},
  {snapshot(){return null;},subscribe(listener){listener('online');return()=>{};}},
  {snapshot(){return'online';},subscribe(listener){listener('online');throw Error('Synthetic subscription unavailable');}}]){
  const values=[],off=observe()(port,v=>values.push(v));assert.deepEqual(values,['unknown']);off();
 }
});
test('registration and snapshot events supersede stale initial online snapshots',()=>{
 for(const duringSnapshot of [false,true]){
  let listener;const values=[];
  const off=observe()({subscribe(fn){listener=fn;if(!duringSnapshot)fn('offline');return()=>{};},snapshot(){if(duringSnapshot)listener('offline');return'online';}},v=>values.push(v));
  assert.deepEqual(values,['offline']);off();
 }
});
test('invalid events close access; retired callbacks and callbacks from a disposer cannot reopen it',()=>{
 let listener,disposals=0;const values=[];
 const off=observe()({subscribe(fn){listener=fn;return()=>{disposals++;fn('online');};},snapshot(){return'unknown';}},v=>values.push(v));
 listener('online');listener('offline');listener('ONLINE');assert.deepEqual(values,['unknown','online','offline','unknown']);
 off();off();listener('online');assert.equal(disposals,1);assert.deepEqual(values,['unknown','online','offline','unknown']);
});
test('source loader refuses zero-block or linked source before any content read',()=>{
 const load=sourceLoader(),file=fileURLToPath(new URL('../native/src/circles/native-connectivity.ts',import.meta.url));
 const originalStat=fs.lstatSync,originalRead=fs.readFileSync;let reads=0;
 try{
  fs.readFileSync=(name,...rest)=>{if(String(name)===file)reads++;return originalRead(name,...rest);};
  for(const linked of [false,true]){
   fs.lstatSync=name=>String(name)===file?{size:100,blocks:0,isSymbolicLink:()=>linked,isFile:()=>true}:originalStat(name);
   assert.throws(()=>load(modulePath),/Refuse nonmaterialized or linked/);
  }
  assert.equal(reads,0);
 }finally{fs.lstatSync=originalStat;fs.readFileSync=originalRead;}
});
test('native host can start closed without changing existing/Quest default and reconnect never reads automatically',async()=>{
 const {createCircleHost}=sourceLoader()('platforms/native/src/circles/host.ts');
 const make=initialOnline=>{let calls=0;const host=createCircleHost({circleId:'11111111-1111-4111-8111-111111111111',origin:'https://native-fixture.invalid',
  owner:{scope:()=>'synthetic-owner',bearer:async()=>'NONISSUED_FIXTURE',subscribe:()=>()=>{}},
  transport:async url=>{calls++;return{status:503,url,redirected:false,json:async()=>({error:'Synthetic unavailable'})};},...(initialOnline===undefined?{}:{initialOnline})});
  host.connect();return{host,calls:()=>calls};};
 const closed=make(false);try{assert.equal(closed.host.model().online,false);await closed.host.refresh();assert.equal(closed.calls(),0);closed.host.connectivity(true);assert.equal(closed.calls(),0);await closed.host.refresh();assert.equal(closed.calls(),1);}finally{closed.host.disconnect();}
 const legacy=make();try{assert.equal(legacy.host.model().online,true);await legacy.host.refresh();assert.equal(legacy.calls(),1);}finally{legacy.host.disconnect();}
});
