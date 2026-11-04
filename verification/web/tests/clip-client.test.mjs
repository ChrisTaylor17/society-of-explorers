import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {clipFixture,hash} from './support/clip-fixture.mjs';
const require=createRequire(new URL('../candidate/package.json',import.meta.url));
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const response=(bytes,mime='audio/wav',length=bytes.length)=>new Response(bytes,{headers:{'Content-Type':mime,'Content-Length':String(length)}});
test('client starts only the explicit exact local read and omits identity referrer caching and redirects',async t=>{
 const f=await clipFixture(t),calls=[];f.app.context.fetch=async(...args)=>{calls.push(args);return response(f.bytes);};const client=f.app.load('lib/clips/client.ts');assert.equal(calls.length,0);const controller=new AbortController();const data=await client.fetchClipBytes(`/clips/media/${f.entry.id}?sha=${f.entry.asset.sha256}`,f.entry.asset.sha256,f.bytes.length,'audio/wav',controller.signal);assert.deepEqual(Buffer.from(data),f.bytes);assert.equal(calls.length,1);assert.equal(calls[0][1].credentials,'omit');assert.equal(calls[0][1].referrerPolicy,'no-referrer');assert.equal(calls[0][1].redirect,'error');assert.equal(calls[0][1].cache,'no-store');
});
test('remote URLs malformed gateways and excessive declared sizes refuse before any transport call',async t=>{
 const f=await clipFixture(t);let calls=0;f.app.context.fetch=async()=>{calls++;return response(f.bytes);};const client=f.app.load('lib/clips/client.ts');for(const href of ['https://evil.invalid/x','//evil.invalid/x','/clips/media/../private?sha='+'0'.repeat(64),'/clips/media/a?sha=x'])await assert.rejects(()=>client.fetchClipBytes(href,f.entry.asset.sha256,f.bytes.length,'audio/wav',new AbortController().signal));await assert.rejects(()=>client.fetchClipBytes(`/clips/media/a?sha=${f.entry.asset.sha256}`,f.entry.asset.sha256,17*1024*1024,'audio/wav',new AbortController().signal));assert.equal(calls,0);
});
test('truncated changed MIME changed bytes malformed length and oversized streams never reach playback',async t=>{
 const f=await clipFixture(t),client=f.app.load('lib/clips/client.ts'),url=`/clips/media/${f.entry.id}?sha=${f.entry.asset.sha256}`;for(const reply of [()=>response(f.bytes,'text/html'),()=>response(f.bytes,'audio/wav',f.bytes.length+1),()=>response(f.bytes.subarray(0,100),'audio/wav',f.bytes.length),()=>response(Buffer.alloc(f.bytes.length),'audio/wav')]){f.app.context.fetch=reply;await assert.rejects(()=>client.fetchClipBytes(url,f.entry.asset.sha256,f.bytes.length,'audio/wav',new AbortController().signal));}
 let cancelled=false;f.app.context.fetch=()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(f.bytes.length+1));},cancel(){cancelled=true;}}),{headers:{'Content-Type':'audio/wav','Content-Length':String(f.bytes.length)}});await assert.rejects(()=>client.fetchClipBytes(url,f.entry.asset.sha256,f.bytes.length,'audio/wav',new AbortController().signal));assert.equal(cancelled,true);
});
test('retired reads cannot finish hash verification and captions use their own reviewed bytes',async t=>{
 const f=await clipFixture(t),client=f.app.load('lib/clips/client.ts'),controller=new AbortController();f.app.context.fetch=()=>{controller.abort();return response(f.bytes);};await assert.rejects(()=>client.fetchClipBytes(`/clips/media/${f.entry.id}?sha=${f.entry.asset.sha256}`,f.entry.asset.sha256,f.bytes.length,'audio/wav',controller.signal));
 f.app.context.fetch=()=>response(f.captions,'text/vtt');const got=await client.fetchClipBytes(`/clips/captions/${f.entry.id}?sha=${f.entry.captions.sha256}`,hash(f.captions),f.captions.length,'text/vtt',new AbortController().signal);assert.deepEqual(Buffer.from(got),f.captions);
});
test('actual player renders an explicit load action transcript credits and zero media before interaction',async t=>{
 const f=await clipFixture(t),clip=(await f.server.verifyClip(f.entry,{territory:null},f.root)).public;f.app.setMock('./clips.module.css',()=>({__esModule:true,default:{card:'card',credit:'credit',help:'help',controls:'controls',transcript:'transcript',player:'player'}}));let reads=0;f.app.context.fetch=()=>{reads++;throw Error('No automatic media');};const Player=f.app.load('app/clips/ClipPlayer.tsx').default;const html=renderToStaticMarkup(React.createElement(Player,{clip}));assert.match(html,/Load audio and captions/);assert.match(html,/No media has been loaded/);assert.match(html,/Read the transcript/);assert.match(html,/Original synthetic test content/);assert.equal(/<(?:video|audio|source|track)\b/iu.test(html),false);assert.equal(/autoplay/iu.test(html),false);assert.equal(reads,0);
});
