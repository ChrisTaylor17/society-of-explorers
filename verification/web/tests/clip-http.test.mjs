import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {clipFixture} from './support/clip-fixture.mjs';
import {offlineApp} from './support/offline-app.mjs';
const request=(f,{method='GET',range,query=`sha=${f.entry.asset.sha256}`}={})=>new Request(`http://local.invalid/clips/media/synthetic-tone?${query}`,{method,headers:range?{range}:{}});
test('gateway returns only reviewed exact bytes with private no-store and no filesystem metadata',async t=>{
 const f=await clipFixture(t),r=await f.server.clipResource(request(f),f.entry.id,'media',[f.entry],f.root);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'audio/wav');assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.match(r.headers.get('cache-control'),/no-store/);assert.equal(r.headers.get('accept-ranges'),'bytes');assert.deepEqual(Buffer.from(await r.arrayBuffer()),f.bytes);
});
test('HEAD bounded byte ranges and suffix/open-ended ranges match the reviewed file for seeking',async t=>{
 const f=await clipFixture(t);const head=await f.server.clipResource(request(f,{method:'HEAD'}),f.entry.id,'media',[f.entry],f.root);assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),String(f.bytes.length));assert.equal((await head.arrayBuffer()).byteLength,0);
 for(const [range,start,end]of [['bytes=0-43',0,43],['bytes=44-',44,f.bytes.length-1],['bytes=-12',f.bytes.length-12,f.bytes.length-1]]){const r=await f.server.clipResource(request(f,{range}),f.entry.id,'media',[f.entry],f.root);assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),`bytes ${start}-${end}/${f.bytes.length}`);assert.deepEqual(Buffer.from(await r.arrayBuffer()),f.bytes.subarray(start,end+1));}
 for(const range of ['bytes=0-1,3-4','bytes=01-2','bytes=-0','bytes=999999-','bytes=40-2','items=1-2']){const r=await f.server.clipResource(request(f,{range}),f.entry.id,'media',[f.entry],f.root);assert.equal(r.status,416);assert.equal(r.headers.get('content-range'),`bytes */${f.bytes.length}`);}
});
test('stale hash malformed query held entries unknown IDs and replaced files cannot disclose media',async t=>{
 const f=await clipFixture(t);
 for(const query of ['url=https://evil.invalid/','sha=x',`sha=${f.entry.asset.sha256}&sha=${f.entry.asset.sha256}`,`sha=${f.entry.asset.sha256}&path=source.html`])assert.equal((await f.server.clipResource(request(f,{query}),f.entry.id,'media',[f.entry],f.root)).status,400);
 assert.equal((await f.server.clipResource(request(f,{query:'sha='+'0'.repeat(64)}),f.entry.id,'media',[f.entry],f.root)).status,409);
 assert.equal((await f.server.clipResource(request(f),'unknown','media',[f.entry],f.root)).status,404);assert.equal((await f.server.clipResource(request(f),f.entry.id,'media',[{...f.entry,publishable:false}],f.root)).status,404);
 await writeFile(path.join(f.root,'tone.wav'),Buffer.alloc(f.bytes.length));const r=await f.server.clipResource(request(f),f.entry.id,'media',[f.entry],f.root);assert.equal(r.status,404);assert.equal((await r.text()).includes(f.root),false);
});
test('caption gateway uses its own hash and text/vtt and never falls back to media',async t=>{
 const f=await clipFixture(t),req=request(f,{query:`sha=${f.entry.captions.sha256}`});const r=await f.server.clipResource(req,f.entry.id,'captions',[f.entry],f.root);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'text/vtt; charset=utf-8');assert.deepEqual(Buffer.from(await r.arrayBuffer()),f.captions);assert.equal((await f.server.clipResource(request(f),f.entry.id,'captions',[f.entry],f.root)).status,409);
});
test('actual catalog resolves three existing pinned passages and leaks no proposal URLs or private records',async()=>{
 const a=offlineApp(),route=a.load('app/clips/catalog/route.ts'),r=await route.GET(new Request('http://local.invalid/clips/catalog'));assert.equal(r.status,200);const data=await r.json();assert.equal(data.texts.length,3);for(const clip of data.texts){assert.ok(clip.quote.length>0&&clip.quote.length<=600);assert.match(clip.readerHref,/^\/great-books\//);assert.match(clip.discussHref,/^\/circles\/passages\?/);assert.ok(clip.credit.includes('Project Gutenberg'));}
 for(const bad of ['apology_01_plato.mp3','BH_Accretion','inspection.json','reviewedBy','sourceStartMs'])assert.equal(JSON.stringify(data).includes(bad),false);
 assert.equal((await route.GET(new Request('http://local.invalid/clips/catalog?url=https://evil.invalid'))).status,400);
});
