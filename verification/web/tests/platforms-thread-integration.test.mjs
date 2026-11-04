import test from 'node:test';
import assert from 'node:assert/strict';
import {lstat,stat} from 'node:fs/promises';
const ROOT=new URL('../../../',import.meta.url);
for(const name of ['verification/web/tests/support/platforms-thread-app.mjs','platforms/tests/load-source.mjs']){const file=new URL(name,ROOT),link=await lstat(file),info=await stat(file);assert.equal(link.isSymbolicLink(),false);assert.ok(!info.size||info.blocks,'Refuse offloaded integration source');}
const {createPlatformsThreadApp,TOKENS,ORIGIN,requestId}=await import('./support/platforms-thread-app.mjs');
const {sourceLoader}=await import('../../../platforms/tests/load-source.mjs');
const {createCircleHost}=sourceLoader()('platforms/native/src/circles/host.ts');
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};}
async function fixture(t){
 const f=await createPlatformsThreadApp();t.after(()=>f.close());
 let scope='fixture-author-lifetime',credentialGate=null;const listeners=new Set(),requests=[];
 const owner={scope:()=>scope,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},async bearer(expected){if(credentialGate)await credentialGate.promise;return expected===scope?TOKENS.author:null;}};
 const host=createCircleHost({circleId:f.circleId,origin:ORIGIN,owner,newRequestId:async()=>requestId(),transport:async(url,init)=>{
  assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.equal(init.headers.Authorization,'Bearer '+TOKENS.author);
  requests.push({url,method:init.method,body:init.body});const response=await f.dispatch(url,{method:init.method,headers:init.headers,body:init.body,signal:init.signal});
  return{status:response.status,url,redirected:false,json:()=>response.json()};
 }});
 host.connect();t.after(()=>host.close());
 return{...f,host,requests,credentials(gate){credentialGate=gate;},retire(){scope=null;for(const listener of listeners)listener();}};
}
async function review(f,{parent=null,comment='A synthetic member-first contribution.'}={}){
 await f.host.openArchive();assert.equal(f.host.model().archive.phase,'ready');
 f.host.threadStart(parent);f.host.threadEdit(comment);assert.equal(f.host.model().threadWrite.canReview,true);
 await f.host.threadReview();assert.equal(f.host.model().threadWrite.phase,'review');f.host.threadConfirm(true);assert.equal(f.host.model().threadWrite.canPost,true);
 return f.host.model().threadWrite.preview;
}
test('actual host root preview/explicit post/owned receipt/fresh thread execute canonical routes and strict SQL',async t=>{
 const f=await fixture(t),before=await f.count(),preview=await review(f);
 assert.equal(await f.count(),before,'Preview is read-only');await f.host.threadPost();const m=f.host.model().threadWrite;
 assert.equal(m.phase,'confirmed');assert.equal(m.receipt.requestId,preview.requestId);assert.equal(m.receipt.message.is_mine,true);assert.equal(m.receipt.message.parentMessageId,null);assert.equal(m.receipt.message.rootMessageId,m.receipt.message.id);assert.equal(await f.count(),before+1);
 assert.equal((await f.db.query('SELECT member_id FROM seminar_messages WHERE id=$1',[m.receipt.message.id])).rows[0].member_id,f.authorId);
 await f.host.archiveThread(m.receipt.message.id);assert.equal(f.host.model().archive.page.focus.id,m.receipt.message.id);assert.equal(f.host.model().archive.page.focus.content,preview.content);
 assert.equal(f.calls.filter(x=>x.name==='soe_circle_discussion_post').length,1);assert.equal(f.calls.every(x=>x.status==='ok'),true);
 const browserRoles=(await f.db.query("SELECT has_table_privilege('anon','public.seminar_messages','SELECT,INSERT') a,has_table_privilege('authenticated','public.book_cohort_members','SELECT,INSERT') b")).rows[0];assert.deepEqual(browserRoles,{a:false,b:false});
});
test('actual reply preview preserves immediate parent/root and exact complete body without copying parent identity',async t=>{
 const f=await fixture(t),before=await f.count(),preview=await review(f,{parent:f.messageId,comment:'An independently authored synthetic reply.'});
 assert.equal(preview.parent.message.id,f.messageId);assert.equal(preview.parent.message.rootMessageId,f.messageId);assert.match(preview.content,new RegExp('/discussion\\?message='+f.messageId+'$'));assert.equal(preview.content.includes('PRIVATE_AUTHOR_LABEL'),false);
 await f.host.threadPost();const receipt=f.host.model().threadWrite.receipt;assert.equal(receipt.message.parentMessageId,f.messageId);assert.equal(receipt.message.rootMessageId,f.messageId);assert.equal(await f.count(),before+1);
 await f.host.archiveThread(receipt.message.id);const page=f.host.model().archive.page;assert.equal(page.root.id,f.messageId);assert.equal(page.focus.id,receipt.message.id);assert.equal(page.focus.content,preview.content);
 f.host.threadStart(receipt.message.id);f.host.threadEdit('An independently authored nested reply.');await f.host.threadReview();f.host.threadConfirm(true);await f.host.threadPost();
 const nested=f.host.model().threadWrite.receipt;assert.equal(nested.message.parentMessageId,receipt.message.id);assert.equal(nested.message.rootMessageId,f.messageId);assert.equal(await f.count(),before+2);
 await f.host.archiveThread(nested.message.id);assert.equal(f.host.model().archive.page.root.id,f.messageId);assert.equal(f.host.model().archive.page.focus.id,nested.message.id);
});
test('lost actual committed posting reply stays unknown; explicit own receipt lookup confirms without another write',async t=>{
 const f=await fixture(t),before=await f.count(),preview=await review(f,{parent:f.messageId});let lost=false;
 f.transformRpc((name,args,result)=>{if(name==='soe_circle_discussion_post'&&!lost){lost=true;throw Error('SYNTHETIC_LOST_AFTER_COMMIT');}return result;});
 await f.host.threadPost();const unknown=f.host.model().threadWrite;assert.equal(unknown.phase,'unknown');assert.equal(unknown.pendingRequestId,preview.requestId);assert.equal(unknown.draft,'');assert.equal(unknown.preview,null);assert.equal(unknown.receipt,null);assert.equal(unknown.canNavigate,false);assert.equal(await f.count(),before+1);
 await f.host.threadLookup();assert.equal(f.host.model().threadWrite.phase,'confirmed');assert.equal(f.host.model().threadWrite.receipt.replayed,true);assert.equal(f.calls.filter(x=>x.name==='soe_circle_discussion_post').length,1);assert.equal(await f.count(),before+1);
});
test('literal manual retry after parent restriction recovers existing reply while a new preview refuses current parent',async t=>{
 const f=await fixture(t),before=await f.count();await review(f,{parent:f.messageId});let lost=false;
 f.transformRpc((name,args,result)=>{if(name==='soe_circle_discussion_post'&&!lost){lost=true;throw Error('SYNTHETIC_LOST_AFTER_COMMIT');}return result;});
 await f.host.threadPost();const first=f.requests.find(x=>x.method==='POST'&&!x.url.endsWith('/preview'));await f.hide();await f.host.threadRetry();
 const retry=f.requests.filter(x=>x.method==='POST'&&!x.url.endsWith('/preview'));assert.equal(retry.length,2);assert.equal(retry[1].body,first.body);assert.equal(await f.count(),before+1);
 const saved=f.host.model().threadWrite.receipt;assert.equal(saved.replayed,true);await f.host.archiveThread(saved.message.id);assert.equal(f.host.model().archive.page.root.content,null);assert.equal(f.host.model().archive.page.focus.content,saved.message.content);
 const refused=await f.dispatch(`/api/circles/${f.circleId}/discussion/preview`,{method:'POST',headers:{Authorization:'Bearer '+TOKENS.author},body:{requestId:requestId(),comment:'A new synthetic attempt.',parentMessageId:f.messageId}});assert.equal(refused.status,409);assert.equal(await f.count(),before+1);
});
test('actual parent report revision change refuses stale reviewed reply before any new receipt',async t=>{
 const f=await fixture(t),before=await f.count();await review(f,{parent:f.messageId});await f.report();await f.host.threadPost();
 assert.equal(f.host.model().threadWrite.phase,'unknown');assert.equal(await f.count(),before);const calls=f.calls.filter(x=>x.name==='soe_circle_discussion_post');assert.equal(calls.at(-1).status,'PT409');
 await f.host.threadLookup();assert.equal(f.host.model().threadWrite.phase,'unknown');assert.notEqual(f.host.model().threadWrite.pendingRequestId,null);
});
test('malformed or mismatched actual committed receipt never confirms and own lookup still recovers canonical identity',async t=>{
 const f=await fixture(t),before=await f.count(),preview=await review(f);
 f.transformRpc((name,args,result)=>name==='soe_circle_discussion_post'?{data:{...result.data,requestId:requestId(),message:{...result.data.message,member_id:'PRIVATE_MUST_NOT_ENTER_MODEL'}},error:null}:result);
 await f.host.threadPost();assert.equal(f.host.model().threadWrite.phase,'unknown');assert.equal(f.host.model().threadWrite.pendingRequestId,preview.requestId);assert.equal(JSON.stringify(f.host.model()).includes('PRIVATE_MUST_NOT_ENTER_MODEL'),false);assert.equal(await f.count(),before+1);
 await f.host.threadLookup();assert.equal(f.host.model().threadWrite.phase,'confirmed');assert.equal(await f.count(),before+1);
});
test('withdrawal after a lost committed reply returns a current tombstone instead of restoring retained pending plaintext',async t=>{
 const f=await fixture(t),before=await f.count(),preview=await review(f,{parent:f.messageId});let lost=false;
 f.transformRpc((name,args,result)=>{if(name==='soe_circle_discussion_post'&&!lost){lost=true;throw Error('SYNTHETIC_LOST_AFTER_COMMIT');}return result;});
 await f.host.threadPost();const saved=(await f.db.query('SELECT message_id FROM circle_discussion_post_receipts WHERE actor_member_id=$1 AND request_id=$2',[f.authorId,preview.requestId])).rows[0];await f.withdraw(saved.message_id);await f.host.threadLookup();
 const receipt=f.host.model().threadWrite.receipt;assert.equal(receipt.message.visibility,'withdrawn');assert.equal(receipt.message.content,null);assert.equal(JSON.stringify(f.host.model().threadWrite).includes(preview.comment),false);assert.equal(await f.count(),before+1);
 await f.host.archiveThread(receipt.message.id);assert.equal(f.host.model().archive.page.focus.content,null);
});
test('actual membership leave after preview denies the stale post and later readback rather than treating a reviewer grant as membership',async t=>{
 const f=await fixture(t),before=await f.count();await review(f);await f.leave();await f.host.threadPost();assert.equal(await f.count(),before);
 const post=f.calls.filter(x=>x.name==='soe_circle_discussion_post');assert.equal(post.at(-1).status,'PT403');assert.equal(f.host.model().threadWrite.receipt,null);
 assert.equal(f.host.model().threadWrite.pendingRequestId,null);assert.equal(f.host.model().threadWrite.preview,null);assert.equal(f.host.model().threadWrite.draft,'');assert.equal(f.host.model().threadWrite.canRetry,false);assert.equal(f.host.model().archive.page,null);
 const response=await f.dispatch(`/api/circles/${f.circleId}/discussion`,{headers:{Authorization:'Bearer '+TOKENS.outsider}});assert.equal(response.status,403);
});
test('canonical post rechecks actor immediately before SQL and refuses a changed verified account',async t=>{
 const f=await fixture(t),before=await f.count();await review(f);f.setIdentitySequence(['author','outsider']);await f.host.threadPost();assert.equal(await f.count(),before);assert.equal(f.calls.filter(x=>x.name==='soe_circle_discussion_post').length,0);assert.equal(f.host.model().threadWrite.receipt,null);
});
test('scope retirement before send or during held committed JSON cannot restore private writer state or authorize retries',async t=>{
 for(const stage of ['credentials','response']){
  const f=await fixture(t),before=await f.count();await review(f);const held=deferred(),arrived=deferred();
  if(stage==='credentials')f.credentials(held);else f.transformHttp(async({method,path,response})=>{if(method==='POST'&&!path.endsWith('/preview')){arrived.resolve();await held.promise;}return response;});
  const pending=f.host.threadPost();if(stage==='response')await arrived.promise;else await new Promise(r=>setTimeout(r,0));f.retire();held.resolve();await pending;
  const m=f.host.model().threadWrite;assert.equal(m.draft,'');assert.equal(m.preview,null);assert.equal(m.pendingRequestId,null);assert.equal(m.receipt,null);assert.equal(m.canPost,false);assert.equal(m.canRetry,false);assert.equal(await f.count(),before+(stage==='response'?1:0));
 }
});
