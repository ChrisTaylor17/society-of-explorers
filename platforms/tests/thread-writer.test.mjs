import test from 'node:test';
import assert from 'node:assert/strict';
import {lstat,stat} from 'node:fs/promises';
const loader=new URL('./load-source.mjs',import.meta.url),link=await lstat(loader),info=await stat(loader);assert.equal(link.isSymbolicLink(),false);assert.ok(!info.size||info.blocks);
const {sourceLoader}=await import('./load-source.mjs');
const load=sourceLoader(),{createThreadWriter}=load('platforms/shared/thread-writer.ts'),canonical=load('lib/circles/thread.ts');
const circle='11111111-1111-4111-8111-111111111111',root='22222222-2222-4222-8222-222222222222',child='33333333-3333-4333-8333-333333333333',other='44444444-4444-4444-8444-444444444444',key='55555555-5555-4555-8555-555555555555';
const hash='a'.repeat(64),reviewKey='b'.repeat(64);
const message=(id=root,extra={})=>({id,member_name:'Synthetic author',content:'Synthetic visible parent words.',created_at:'2026-11-04T12:00:00Z',is_mine:false,visibility:'visible',parentMessageId:null,rootMessageId:id,...extra});
const page=()=>({kind:'archive',circleId:circle,items:[message(),message(other,{visibility:'hidden',content:null})],nextCursor:null,limit:25});
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};}
function fixture({keyFactory=async()=>key}={}){
 const calls=[];let hook=null,saved=null;
 const writer=createThreadWriter(async(path,options,mayTransmit)=>{
  assert.equal(mayTransmit(),true);const body=options.body?JSON.parse(options.body):null;calls.push({path,options:{...options},body,mayTransmit});
  let result;
  if(path.endsWith('/preview')){
   const parent=body.parentMessageId?{message:message(body.parentMessageId),revision:0,contentHash:hash}:null;
   result={http:200,body:{...body,circleId:circle,parent,content:canonical.formatDiscussionContent(circle,body.comment,body.parentMessageId),contentHash:hash,reviewKey,commentLimit:canonical.discussionCommentLimit(circle,body.parentMessageId)}};
  }else if(options.method==='GET')result={http:200,body:{circleId:circle,requestId:key,receipt:saved?{...saved,replayed:true}:null}};
  else{
   saved={outcome:'confirmed',circleId:circle,requestId:body.requestId,replayed:false,message:message(child,{is_mine:true,content:canonical.formatDiscussionContent(circle,body.comment,body.parentMessageId),parentMessageId:body.parentMessageId,rootMessageId:body.parentMessageId?root:child})};
   result={http:200,body:saved};
  }
  return hook?hook({path,options,body,result}):result;
 },circle,keyFactory);
 return{writer,calls,setHook(fn){hook=fn;},setSaved(value){saved=value;},ready(){writer.access(page(),1);},async review(parent=null){writer.start(parent);writer.edit('An independent synthetic contribution.');await writer.review();}};
}
test('no secure key capability means writes unavailable; no implicit read/preview/post occurs',async()=>{
 const calls=[],writer=createThreadWriter(async(...args)=>calls.push(args),circle);writer.access(page(),1);assert.equal(writer.model().available,false);assert.equal(writer.start(null),false);await writer.review();await writer.post();assert.equal(calls.length,0);
});
test('root flow requires fresh access, nonempty bounded text, actual preview and explicit confirm',async()=>{
 const f=fixture();assert.equal(f.writer.start(null),false);f.ready();assert.equal(f.writer.start(null),true);assert.equal(f.writer.edit(' '),true);assert.equal(f.writer.model().canReview,false);
 assert.equal(f.writer.edit('x'.repeat(2001)),false);assert.equal(f.writer.edit('bad\u0000text'),false);assert.equal(f.writer.edit('\ud800'),false);f.writer.edit('An independent synthetic contribution.');await f.writer.review();
 assert.equal(f.calls.length,1);assert.equal(f.writer.model().phase,'review');assert.equal(f.writer.model().canPost,false);await f.writer.post();assert.equal(f.calls.length,1);f.writer.confirm(true);await f.writer.post();
 assert.equal(f.calls.length,2);assert.equal(f.writer.model().phase,'confirmed');assert.equal(f.writer.model().receipt.message.is_mine,true);assert.equal(f.writer.model().draft,'');
 assert.deepEqual(Object.keys(f.calls[1].body).sort(),['requestId','comment','parentMessageId','expectedParentRevision','expectedParentHash','contentHash','reviewKey'].sort());
});
test('reply target must be visible in the current page and canonical suffix counts toward UTF16 bound',async()=>{
 const f=fixture();f.ready();assert.equal(f.writer.start(other),false);assert.equal(f.writer.start(child),false);assert.equal(f.writer.start(root),true);
 const limit=canonical.discussionCommentLimit(circle,root);assert.equal(f.writer.model().commentLimit,limit);assert.equal(f.writer.edit('x'.repeat(limit+1)),false);assert.equal(f.writer.edit('x'.repeat(limit)),true);await f.writer.review();
 assert.equal(f.writer.model().preview.content.length,2000);assert.equal(f.writer.model().preview.parent.message.id,root);assert.equal(f.writer.model().preview.content.includes('Synthetic visible parent words.'),false);
});
test('target/fresh page/edit changes invalidate reviewed authority and no automatic action follows',async()=>{
 const f=fixture();f.ready();await f.review(root);f.writer.confirm(true);f.writer.editReview();assert.equal(f.writer.model().canPost,false);f.writer.edit('Changed synthetic wording.');await f.writer.review();assert.equal(f.writer.model().confirmed,false);
 f.writer.access(page(),2);assert.equal(f.writer.model().draft,'');assert.equal(f.writer.model().preview,null);assert.equal(f.writer.model().canPost,false);assert.equal(f.calls.length,2);
});
test('preview must bind circle/key/comment/parent/root/full body and limits before explicit confirmation is possible',async()=>{
 for(const extra of [{circleId:other},{requestId:other},{comment:'Unreviewed wording.'},{parentMessageId:child},{content:'Forged complete body.'},{commentLimit:2000}]){
  const f=fixture();f.ready();f.setHook(({result})=>({http:200,body:{...result.body,...extra}}));await f.review(root);assert.equal(f.writer.model().preview,null);assert.equal(f.writer.model().canPost,false);assert.equal(f.calls.length,1);
 }
});
test('unknown retains only a public request key in model and blocks draft/navigation; null readback does not create a new attempt',async()=>{
 const f=fixture();f.ready();await f.review(root);f.writer.confirm(true);f.setHook(({options,result})=>options.method==='POST'?{http:503,body:{outcome:'unknown'}}:result);await f.writer.post();
 const m=f.writer.model();assert.equal(m.phase,'unknown');assert.equal(m.pendingRequestId,key);assert.equal(m.draft,'');assert.equal(m.preview,null);assert.equal(m.target,null);assert.equal(m.canStart,false);assert.equal(m.canCancel,false);assert.equal(m.canNavigate,false);assert.equal(JSON.stringify(m).includes(reviewKey),false);
 f.setSaved(null);await f.writer.lookup();assert.equal(f.writer.model().phase,'unknown');assert.equal(f.writer.model().pendingRequestId,key);assert.equal(f.calls.filter(x=>x.options.method==='POST').length,2);
});
test('literal manual retry uses unchanged reviewed bytes/key and does not prepare another preview',async()=>{
 const f=fixture();f.ready();await f.review(root);f.writer.confirm(true);let lose=true;f.setHook(({path,result})=>{if(!path.endsWith('/preview')&&lose){lose=false;throw Error('Synthetic lost reply');}return result;});await f.writer.post();const exact=f.calls[1].options.body;await f.writer.retry();
 assert.equal(f.writer.model().phase,'confirmed');assert.equal(f.calls.length,3);assert.equal(f.calls[2].options.body,exact);assert.equal(f.calls[2].body.requestId,key);
});
test('matching own readback confirms once; malformed/key/parent/root/body mismatch cannot publish or restore content',async()=>{
 for(const patch of [{requestId:other},{message:message(child,{is_mine:false})},{message:message(child,{is_mine:true,parentMessageId:other,rootMessageId:other})},{message:message(child,{is_mine:true,parentMessageId:root,rootMessageId:root,content:'Different body.'})}]){
  const f=fixture();f.ready();await f.review(root);f.writer.confirm(true);f.setHook(({result})=>({http:200,body:{...result.body,...patch}}));await f.writer.post();assert.equal(f.writer.model().phase,'unknown');assert.equal(f.writer.model().receipt,null);
 }
 const f=fixture();f.ready();await f.review();f.writer.confirm(true);f.setHook(({options,result})=>options.method==='POST'?{http:503,body:{outcome:'unknown'}}:result);await f.writer.post();f.setHook(null);await f.writer.lookup();assert.equal(f.writer.model().phase,'confirmed');assert.equal(f.writer.model().receipt.replayed,true);assert.equal(f.calls.length,3);
});
test('held key factory/preview/post/readback all retire synchronously and late replies cannot restore drafts, receipts or retries',async()=>{
 for(const stage of ['key','preview','post','lookup']){
  const held=deferred(),arrived=deferred(),f=fixture({keyFactory:stage==='key'?()=>{arrived.resolve();return held.promise;}:async()=>key});f.ready();
  let work;
  if(stage==='key') {f.writer.start(null);f.writer.edit('A synthetic held key.');work=f.writer.review();}
  else if(stage==='preview'){f.setHook(async({result})=>{arrived.resolve();await held.promise;return result;});work=f.review();}
  else{await f.review();f.writer.confirm(true);if(stage==='lookup'){f.setHook(()=>({http:503,body:{outcome:'unknown'}}));await f.writer.post();f.setHook(async({result})=>{arrived.resolve();await held.promise;return result;});work=f.writer.lookup();}
   else{f.setHook(async({result})=>{arrived.resolve();await held.promise;return result;});work=f.writer.post();}}
  await arrived.promise;f.writer.activity(false);assert.equal(f.writer.model().draft,'');assert.equal(f.writer.model().pendingRequestId,null);held.resolve(key);await work;assert.equal(f.writer.model().receipt,null);assert.equal(f.writer.model().canRetry,false);assert.equal(f.writer.model().canPost,false);
  for(const call of f.calls)assert.equal(call.mayTransmit(),false);
 }
});
test('cancel while key/preview is pending and missing/malformed keys never send a post',async()=>{
 for(const raw of ['not-a-uuid',null,other.toUpperCase()]){
  const f=fixture({keyFactory:async()=>raw});f.ready();await f.review();if(raw===other.toUpperCase())assert.equal(f.writer.model().phase,'review');else{assert.equal(f.calls.length,0);assert.equal(f.writer.model().canPost,false);}
 }
 const held=deferred(),f=fixture({keyFactory:()=>held.promise});f.ready();f.writer.start(null);f.writer.edit('Synthetic cancelled draft.');const work=f.writer.review();f.writer.cancel();held.resolve(key);await work;assert.equal(f.calls.length,0);assert.equal(f.writer.model().draft,'');
});
test('actual host bounds a never-resolving secure key factory and returns to editing without preview/post traffic',{timeout:1000},async t=>{
 const {createCircleHost}=load('platforms/native/src/circles/host.ts');let requests=0;
 const host=createCircleHost({circleId:circle,origin:'https://thread-deadline.test',timeoutMs:10,
  owner:{scope:()=> 'SYNTHETIC_SCOPE',subscribe:()=>()=>{},bearer:async()=> 'NONISSUED_DEADLINE_TOKEN'},
  newRequestId:()=>new Promise(()=>{}),transport:async(url)=>{requests++;return{status:200,url,redirected:false,json:async()=>page()};}});
 t.after(()=>host.close());host.connect();await host.openArchive();assert.equal(requests,1);assert.equal(host.threadStart(null),true);host.threadEdit('A synthetic bounded key request.');await host.threadReview();
 assert.equal(host.model().threadWrite.phase,'editing');assert.equal(host.model().threadWrite.busy,false);assert.equal(host.model().threadWrite.preview,null);assert.equal(host.model().threadWrite.canPost,false);assert.equal(requests,1);
});
