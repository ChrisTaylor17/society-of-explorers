import test from 'node:test';
import assert from 'node:assert/strict';
import {lstatSync} from 'node:fs';
const loaderFile=new URL('./load-source.mjs',import.meta.url),info=lstatSync(loaderFile);
assert.ok(info.isFile()&&!info.isSymbolicLink()&&(!info.size||info.blocks));
const {sourceLoader}=await import('./load-source.mjs');
const {createMemberContributions}=sourceLoader()('platforms/shared/member-contributions.ts');
const origin='https://contributions.invalid',circle='11111111-1111-4111-8111-111111111111',messageId='22222222-2222-4222-8222-222222222222',key='33333333-3333-4333-8333-333333333333';
const clone=x=>JSON.parse(JSON.stringify(x)),deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const state=()=>({circleId:circle,message:{id:messageId,member_name:'Synthetic author',content:'Synthetic author history.',created_at:'2026-11-04T12:00:00Z',is_mine:true,visibility:'visible'},revision:0,contentHash:'a'.repeat(64),canReport:false,canWithdraw:true,explanations:[]});
const tick=()=>new Promise(r=>setTimeout(r,0));
function fixture({timeoutMs=100,newRequestId=async()=>key}={}){
 let scope='fixture-owner',bearerHook=null,transportHook=null,jsonHook=null,current=state(),receipt=null;const calls=[],owners=new Set();let bearerCalls=0;
 const owner={scope:()=>scope,subscribe(fn){owners.add(fn);return()=>owners.delete(fn);},async bearer(){bearerCalls++;return bearerHook?bearerHook():'synthetic-token';}};
 const session=createMemberContributions({origin,owner,timeoutMs,initialOnline:true,newRequestId,transport:async(url,options)=>{
  calls.push({url,options});let body;
  if(url===origin+'/api/circles/contributions')body={items:[clone(current)],nextCursor:null};
  else if(options.method==='GET')body=clone(current);
  else {const input=JSON.parse(options.body);const replayed=Boolean(receipt);if(!receipt){current={...current,revision:1,message:{...current.message,content:null,visibility:'withdrawn'},canWithdraw:false};receipt={requestId:input.requestId,circleId:circle,messageId,withdrawn:true};}body={...receipt,replayed,state:clone(current)};}
  const reply={status:200,url,redirected:false,json:()=>jsonHook?jsonHook(body):Promise.resolve(body)};
  return transportHook?transportHook(reply,options):reply;
 }});session.connect();
 return {session,calls,get bearerCalls(){return bearerCalls;},setBearer(fn){bearerHook=fn;},setTransport(fn){transportHook=fn;},setJson(fn){jsonHook=fn;},changeOwner(){scope='replacement-owner';for(const fn of owners)fn();},async selected(){await session.refresh();await session.select(circle,messageId);},close(){session.disconnect();}};
}
test('connect and invalid selections perform no request; selection never promotes a list row into action authority',async()=>{
 const f=fixture();try{assert.equal(f.calls.length,0);await f.session.select(circle,messageId);assert.equal(f.calls.length,0);await f.session.refresh();assert.equal(f.calls.length,1);await f.session.select(key,messageId);assert.equal(f.calls.length,1);await f.session.select(circle,messageId);assert.equal(f.calls.length,2);assert.equal(f.session.model().items.length,0);assert.equal(f.session.model().safety.canWithdraw,false);f.session.confirm(true);assert.equal(f.session.model().safety.canWithdraw,true);}finally{f.close();}
});
for(const stage of ['bearer','transport','json'])test(`one deadline covers ${stage} and a late reply cannot restore history`,async()=>{
 const f=fixture({timeoutMs:15}),held=deferred();try{
  if(stage==='bearer')f.setBearer(()=>held.promise);else if(stage==='transport')f.setTransport(()=>held.promise);else f.setJson(()=>held.promise);
  await f.session.refresh();assert.equal(f.session.model().phase,'unavailable');assert.equal(f.session.model().items.length,0);
  held.resolve(stage==='bearer'?'synthetic-token':stage==='transport'?{status:200,url:origin+'/api/circles/contributions',redirected:false,json:async()=>({items:[state()],nextCursor:null})}:{items:[state()],nextCursor:null});await tick();
  assert.equal(f.session.model().items.length,0);assert.equal(f.calls.length,stage==='bearer'?0:1);
 }finally{f.close();}
});
test('bounded UUID acquisition cannot transmit after expiry or accept a late key',async()=>{
 const held=deferred(),f=fixture({timeoutMs:15,newRequestId:()=>held.promise});try{await f.selected();f.session.confirm(true);await f.session.withdraw();assert.equal(f.session.model().safety.phase,'unavailable');assert.equal(f.calls.filter(x=>x.options.method==='POST').length,0);held.resolve(key);await tick();assert.equal(f.calls.filter(x=>x.options.method==='POST').length,0);}finally{f.close();}
});
test('a reentrant selection observer can close the view before fresh author data is requested',async()=>{
 const f=fixture();try{await f.session.refresh();const off=f.session.subscribe(m=>{if(m.selected)f.session.close();});await f.session.select(circle,messageId);off();assert.equal(f.calls.length,1);assert.equal(f.session.model().selected,null);assert.equal(f.session.model().safety,null);}finally{f.close();}
});
test('a lost withdrawal blocks all navigation and preserves the exact request until manual replay',async()=>{
 const f=fixture();try{await f.selected();let lose=true;f.setTransport((reply,options)=>{if(options.method==='POST'&&lose){lose=false;throw Error('Synthetic lost committed reply');}return reply;});f.session.confirm(true);await f.session.withdraw();const exact=f.calls.at(-1).options.body,count=f.calls.length;assert.equal(f.session.model().safety.phase,'unknown');assert.equal(f.session.model().canNavigate,false);
  await f.session.refresh();await f.session.next();await f.session.select(circle,messageId);f.session.back();assert.equal(f.calls.length,count);await f.session.check();assert.equal(f.session.model().safety.phase,'unknown');assert.equal(f.session.model().safety.receipt,null);await f.session.retry();assert.equal(f.calls.at(-1).options.body,exact);assert.equal(f.session.model().safety.receipt.replayed,true);assert.equal(f.session.model().canNavigate,true);
 }finally{f.close();}
});
test('ownership retirement aborts response parsing and reconnect does not reload private history',async()=>{
 const f=fixture(),held=deferred();try{f.setJson(()=>held.promise);const run=f.session.refresh();await tick();assert.equal(f.calls.length,1);f.changeOwner();assert.equal(f.calls[0].options.signal.aborted,true);held.resolve({items:[state()],nextCursor:null});await run;assert.equal(f.session.model().items.length,0);f.session.activity(false);f.session.activity(true);f.session.connectivity(false);f.session.connectivity(true);assert.equal(f.calls.length,1);assert.equal(f.session.model().safety,null);}finally{f.close();}
});
test('changed origin responses and non-author fresh state never expose author actions',async()=>{
 for(const kind of ['origin','non-author']){const f=fixture();try{await f.session.refresh();if(kind==='origin')f.setTransport(reply=>({...reply,url:'https://elsewhere.invalid/'}));else f.setJson(body=>({...body,message:{...body.message,is_mine:false},canWithdraw:false,canReport:true}));await f.session.select(circle,messageId);assert.equal(f.session.model().safety.state,null);assert.equal(f.session.model().safety.canWithdraw,false);assert.equal(f.session.model().items.length,0);}finally{f.close();}}
});
