import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {offlineApp} from './support/offline-app.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const {readGuideReply,guideReplyNotice}=offlineApp({root:ROOT}).load('lib/claude/guideReply.ts');
const frame=value=>`data: ${JSON.stringify(value)}\n\n`;
function response(value,step=100000){
 const bytes=new TextEncoder().encode(value);let offset=0;
 return new Response(new ReadableStream({pull(c){if(offset===bytes.length){c.close();return;}c.enqueue(bytes.slice(offset,offset+step));offset=Math.min(offset+step,bytes.length);}}),{headers:{'content-type':'text/event-stream'}});
}
test('UTF-8 and every transport boundary preserve text and require the exact final event',async()=>{
 const text='A café question — 猫.';const stream=frame({delta:text})+frame({done:true,response:text,reward:{status:'unknown'}});
 for(const step of [1,2,3,7,100000]){const result=await readGuideReply(response(stream,step));assert.equal(result.status,'complete');assert.equal(result.text,text);}
});
test('all SSE newline conventions, comments and multiline data retain terminal framing',async()=>{
 for(const newline of ['\n','\r\n','\r']){
  const stream=': heartbeat\n\ndata: {"done":true,\ndata: "response":"Complete."}\n\n';
  for(const step of [1,3,100000]){const result=await readGuideReply(response(stream.replaceAll('\n',newline),step));assert.equal(result.status,'complete');assert.equal(result.text,'Complete.');}
 }
});
test('a stream error or clean EOF without completion leaves a partial reply incomplete',async()=>{
 for(const tail of ['',frame({done:true,error:'PRIVATE_FAILURE'}),'data: {broken}\n\n',frame({done:true}),frame({done:true,response:17})]){
  const result=await readGuideReply(response(frame({delta:'Partial.'})+tail));assert.equal(result.status,'interrupted');assert.equal(result.text,'Partial.');assert.doesNotMatch(guideReplyNotice(result.status),/PRIVATE_FAILURE/);
 }
});
test('a terminal response supersedes deltas and a silent completion has no answer text',async()=>{
 const result=await readGuideReply(response(frame({delta:'Draft.'})+frame({done:true,response:'Final.'})));assert.equal(result.text,'Final.');assert.equal(result.status,'complete');
 const silent=await readGuideReply(response(frame({delta:'SILENT'})+frame({done:true,response:'',silent:true})));assert.equal(silent.status,'complete');assert.equal(silent.text,'');
});
test('HTTP refusals and unexpected content types never expose the upstream error body',async()=>{
 for(const status of [401,403,429,500]){const r=await readGuideReply(new Response('PRIVATE_BACKEND',{status}));assert.equal(r.status,status===429?'rate_limited':'unavailable');assert.equal(r.text,'');}
 assert.equal((await readGuideReply(new Response(frame({done:true,response:'Fake'}),{headers:{'content-type':'application/json'}}))).status,'unavailable');
});
test('a partial action marker and model commands never become displayed instructions',async()=>{
 const shown=[];const r=await readGuideReply(response(frame({delta:'Advice.'})+frame({delta:'|||ACT'})+frame({delta:'IONS|||{"secret":"PRIVATE_ACTION"}'})+frame({done:true,response:'Advice.|||ACTIONS|||PRIVATE_ACTION'}),1),{onText:t=>shown.push(t)});
 assert.equal(r.status,'complete');assert.ok(shown.length);assert.ok(shown.every(t=>!t.includes('PRIVATE_ACTION')&&!t.includes('|||ACT')));
});
test('cancellation closes a held reader and cannot accept a late complete reply',async()=>{
 let controller,cancelled=false;const abort=new AbortController();const pending=readGuideReply(new Response(new ReadableStream({start(c){controller=c;c.enqueue(new TextEncoder().encode(frame({delta:'Partial.'})));},cancel(){cancelled=true;}}),{headers:{'content-type':'text/event-stream'}}),{signal:abort.signal});
 await new Promise(r=>setImmediate(r));abort.abort();const r=await pending;assert.equal(r.status,'cancelled');assert.equal(cancelled,true);assert.throws(()=>controller.enqueue(new TextEncoder().encode(frame({done:true,response:'Late.'}))));
});
test('pre-abort, malformed UTF-8 and oversized responses fail without a completion claim',async()=>{
 const controller=new AbortController();controller.abort();assert.equal((await readGuideReply(response(frame({done:true,response:'Late'})),{signal:controller.signal})).status,'cancelled');
 assert.equal((await readGuideReply(new Response(new Uint8Array([255]),{headers:{'content-type':'text/event-stream'}}))).status,'interrupted');
 assert.equal((await readGuideReply(response(frame({delta:'x'.repeat(260000)})))).status,'interrupted');
});
test('unframed trailing completion is not a completed event and post-terminal garbage is ignored',async()=>{
 assert.equal((await readGuideReply(response('data: {"done":true,"response":"Missing delimiter"}'))).status,'interrupted');
 assert.equal((await readGuideReply(response(frame({done:true,response:'Complete.'})+'PRIVATE_GARBAGE'))).text,'Complete.');
});
