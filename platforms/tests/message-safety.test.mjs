import test from 'node:test';
import assert from 'node:assert/strict';
import {lstat,stat} from 'node:fs/promises';
const file=new URL('./load-source.mjs',import.meta.url),link=await lstat(file),info=await stat(file);assert.equal(link.isSymbolicLink(),false);assert.ok(!info.size||info.blocks);
const {sourceLoader}=await import('./load-source.mjs');
const load=sourceLoader(),{createMessageSafety,MESSAGE_REPORT_OPTIONS,MESSAGE_WITHDRAWAL_PRIVACY}=load('platforms/shared/message-safety.ts');
const circle='11111111-1111-4111-8111-111111111111',messageId='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333',key='44444444-4444-4444-8444-444444444444',hash='a'.repeat(64);
const clone=x=>JSON.parse(JSON.stringify(x));
const state=(extra={})=>({circleId:circle,message:{id:messageId,member_name:'Synthetic author',content:'Synthetic independently authored message.',created_at:'2026-11-04T12:00:00Z',is_mine:false,visibility:'visible'},revision:0,contentHash:hash,canReport:true,canWithdraw:false,explanations:[],...extra});
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};}
function fixture({initial=state(),keyFactory=async()=>key}={}){
 let current=clone(initial),saved=null,hook=null;const calls=[];
 const safety=createMessageSafety(async(path,options,mayTransmit)=>{
  assert.equal(mayTransmit(),true);const body=options.body?JSON.parse(options.body):null;calls.push({path,options:{...options},body,mayTransmit});let result;
  if(options.method==='GET')result={http:200,body:clone(current)};
  else{
   const replayed=Boolean(saved);
   if(!saved){current={...current,revision:current.revision+1,...(body.action==='withdraw'?{message:{...current.message,visibility:'withdrawn',content:null},canWithdraw:false}:{} )};saved={requestId:body.requestId,circleId:circle,messageId,...(body.action==='report'?{received:true}:{withdrawn:true})};}
   result={http:200,body:{...saved,state:clone(current),replayed}};
  }
  return hook?hook({path,options,body,result}):result;
 },circle,keyFactory);
 return{safety,calls,setHook(fn){hook=fn;},setState(value){current=clone(value);},async ready(){await safety.open(messageId);},async report(){await safety.open(messageId);safety.reason('safety');safety.note('PRIVATE_SYNTHETIC_NOTE');safety.confirm(true);await safety.submit('report');}};
}
test('canonical report options and withdrawal privacy disclosure are explicit and no secure UUID means read-only safety',async()=>{
 assert.deepEqual(Array.from(MESSAGE_REPORT_OPTIONS,x=>x.value),['safety','harassment','spam','misleading','inappropriate','other']);assert.ok(MESSAGE_REPORT_OPTIONS.every(x=>typeof x.label==='string'&&x.label));assert.match(MESSAGE_WITHDRAWAL_PRIVACY,/not physical erasure/i);
 const calls=[],s=createMessageSafety(async()=>{calls.push('GET');return{http:200,body:state()};},circle);await s.open(messageId);assert.equal(s.model().available,false);s.reason('safety');s.confirm(true);await s.submit('report');assert.equal(calls.length,1);assert.equal(s.model().canReport,false);assert.equal(s.model().canWithdraw,false);
});
test('report needs fresh permission, bounded reason/note and explicit confirmation; payload contains no actor or consent authority',async()=>{
 const f=fixture();assert.equal(f.safety.model().state,null);await f.ready();assert.equal(f.calls.length,1);assert.equal(f.safety.model().canReport,false);f.safety.reason('safety');f.safety.note('  PRIVATE_SYNTHETIC_NOTE  ');assert.equal(f.safety.model().canReport,false);f.safety.confirm(true);await f.safety.submit('report');
 assert.equal(f.calls.length,2);assert.equal(f.safety.model().phase,'confirmed');assert.equal(f.safety.model().receipt.received,true);assert.deepEqual(Object.keys(f.calls[1].body).sort(),['action','expectedRevision','contentHash','requestId','reason','note'].sort());assert.equal(f.calls[1].body.note,'PRIVATE_SYNTHETIC_NOTE');assert.equal(JSON.stringify(f.safety.model().receipt).includes('PRIVATE_SYNTHETIC_NOTE'),false);
});
test('report and withdrawal use server permissions, including author-hidden withdrawal without a membership inference',async()=>{
 const reporter=fixture();await reporter.ready();reporter.safety.confirm(true);await reporter.safety.submit('withdraw');assert.equal(reporter.calls.length,1);
 const own=state({message:{...state().message,is_mine:true,visibility:'hidden',content:null},canReport:false,canWithdraw:true});const f=fixture({initial:own});await f.ready();f.safety.reason('safety');f.safety.confirm(true);await f.safety.submit('report');assert.equal(f.calls.length,1);await f.safety.submit('withdraw');assert.equal(f.calls.length,2);assert.equal(f.safety.model().receipt.withdrawn,true);assert.equal(f.safety.model().state.message.content,null);assert.equal(f.safety.model().state.message.visibility,'withdrawn');assert.equal(f.safety.model().canWithdraw,false);
});
test('reason/note edits reset confirmation and reject invalid enum/control/oversize input without sending',async()=>{
 const f=fixture();await f.ready();f.safety.reason('safety');f.safety.note('Valid note');f.safety.confirm(true);assert.equal(f.safety.model().canReport,true);f.safety.note('Different note');assert.equal(f.safety.model().confirmed,false);f.safety.confirm(true);f.safety.reason('spam');assert.equal(f.safety.model().confirmed,false);
 for(const note of ['x'.repeat(1001),'bad\u0000note']){f.safety.note(note);assert.notEqual(f.safety.model().note,note);}f.safety.reason('not-a-reason');assert.notEqual(f.safety.model().reason,'not-a-reason');assert.equal(f.calls.length,1);
});
test('wrong-message/circle or forged permission snapshots never authorize an action',async()=>{
 for(const initial of [state({circleId:other}),state({message:{...state().message,id:other}}),state({canWithdraw:true}),state({message:{...state().message,visibility:'hidden'},canReport:true})]){
  const f=fixture({initial});await f.ready();assert.equal(f.safety.model().state,null);assert.equal(f.safety.model().canReport,false);assert.equal(f.safety.model().canWithdraw,false);
 }
});
test('unknown retains immutable request privately; current-state GET cannot confirm a report or replace retry revision/hash',async()=>{
 const f=fixture();f.setHook(({options,result})=>options.method==='POST'?{http:503,body:{error:'Synthetic lost reply'}}:result);await f.report();const exact=f.calls[1].options.body;
 assert.equal(f.safety.model().phase,'unknown');assert.equal(f.safety.model().pendingRequestId,key);assert.equal(f.safety.model().pendingAction,'report');assert.equal(f.safety.model().note,'');assert.equal(f.safety.model().canNavigate,false);assert.equal(f.safety.model().canClose,false);assert.equal(JSON.stringify(f.safety.model()).includes('PRIVATE_SYNTHETIC_NOTE'),false);
 f.setState(state({revision:9,contentHash:null,message:{...state().message,visibility:'withdrawn',content:null},canReport:false}));await f.safety.refresh();assert.equal(f.safety.model().phase,'unknown');assert.equal(f.safety.model().pendingRequestId,key);assert.equal(f.safety.model().receipt,null);assert.equal(f.calls[2].options.method,'GET');assert.equal(f.calls[2].path.includes('?'),false);
 f.setHook(null);await f.safety.retry();assert.equal(f.calls[3].options.body,exact);assert.equal(f.calls[3].body.expectedRevision,0);assert.equal(f.calls[3].body.contentHash,hash);assert.equal(f.safety.model().receipt.replayed,true);assert.equal(f.safety.model().state.message.content,null);
});
test('exact committed withdrawal replay confirms a current tombstone without another key or old plaintext',async()=>{
 const own=state({message:{...state().message,is_mine:true},canReport:false,canWithdraw:true}),f=fixture({initial:own});await f.ready();f.safety.confirm(true);let lost=true;f.setHook(({options,result})=>{if(options.method==='POST'&&lost){lost=false;throw Error('Synthetic lost committed withdrawal');}return result;});await f.safety.submit('withdraw');assert.equal(f.safety.model().phase,'unknown');const exact=f.calls[1].options.body;await f.safety.retry();assert.equal(f.calls[2].options.body,exact);assert.equal(f.safety.model().phase,'confirmed');assert.equal(f.safety.model().receipt.replayed,true);assert.equal(f.safety.model().state.message.visibility,'withdrawn');assert.equal(f.safety.model().state.message.content,null);
});
test('malformed/wrong-request/action/revision/hash receipts remain unknown rather than implying receipt from current state',async()=>{
 for(const change of [x=>({...x,requestId:other}),x=>({...x,circleId:other}),x=>({...x,received:undefined,withdrawn:true}),x=>({...x,state:{...x.state,revision:-1}}),x=>({...x,state:{...x.state,contentHash:'b'.repeat(64)}})]){
  const f=fixture();f.setHook(({options,result})=>options.method==='POST'?{http:200,body:change(result.body)}:result);await f.report();assert.equal(f.safety.model().phase,'unknown');assert.equal(f.safety.model().receipt,null);assert.equal(f.safety.model().pendingRequestId,key);
 }
});
test('all nonconfirmed POST statuses retain exact pending request until deliberate retry or global retirement',async()=>{
 for(const http of [400,409,413,429,503]){const f=fixture();f.setHook(({options,result})=>options.method==='POST'?{http,body:{error:'Synthetic rejection'}}:result);await f.report();assert.equal(f.safety.model().phase,'unknown');assert.equal(f.safety.model().pendingRequestId,key);assert.equal(f.safety.model().canClose,false);assert.equal(f.safety.model().canNavigate,false);}
});
test('held GET/key/POST/refresh and late replies retire without restoring note, private state, pending key or receipt',async()=>{
 for(const stage of ['get','key','post','refresh']){
  const held=deferred(),arrived=deferred(),f=fixture({keyFactory:stage==='key'?()=>{arrived.resolve();return held.promise;}:async()=>key});let work;
  if(stage==='get'){f.setHook(async({result})=>{arrived.resolve();await held.promise;return result;});work=f.ready();}
  else{await f.ready();f.safety.reason('safety');f.safety.note('PRIVATE_HELD_NOTE');f.safety.confirm(true);
   if(stage==='key')work=f.safety.submit('report');
   else if(stage==='post'){f.setHook(async({result})=>{arrived.resolve();await held.promise;return result;});work=f.safety.submit('report');}
   else{f.setHook(({options,result})=>options.method==='POST'?{http:503,body:{}}:result);await f.safety.submit('report');f.setHook(async({result})=>{arrived.resolve();await held.promise;return result;});work=f.safety.refresh();}}
  await arrived.promise;f.safety.activity(false);assert.equal(f.safety.model().note,'');assert.equal(f.safety.model().state,null);assert.equal(f.safety.model().pendingRequestId,null);held.resolve(key);await work;assert.equal(f.safety.model().receipt,null);assert.equal(f.safety.model().canRetry,false);assert.equal(f.safety.model().canReport,false);for(const call of f.calls)assert.equal(call.mayTransmit(),false);
 }
});
test('ordinary close clears checked state/draft; unknown close cannot abandon key and no automatic refresh/retry occurs',async()=>{
 const f=fixture();await f.ready();f.safety.reason('safety');f.safety.note('PRIVATE_CLEAR_NOTE');f.safety.close();assert.equal(f.safety.model().state,null);assert.equal(f.safety.model().note,'');assert.equal(f.calls.length,1);
 f.setHook(({options,result})=>options.method==='POST'?{http:503,body:{}}:result);await f.report();const count=f.calls.length;f.safety.close();assert.equal(f.safety.model().pendingRequestId,key);await new Promise(r=>setTimeout(r,0));assert.equal(f.calls.length,count);f.safety.retire();assert.equal(f.safety.model().pendingRequestId,null);
});
