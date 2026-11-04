import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {offlineApp} from './support/offline-app.mjs';
test('actual retained original video crosses catalog gateway HEAD Range and anonymous hash-verifying client',async()=>{
 const a=offlineApp(),catalog=a.load('app/clips/catalog/route.ts'),media=a.load('app/clips/media/[clipId]/route.ts'),captions=a.load('app/clips/captions/[clipId]/route.ts');
 const catalogResponse=await catalog.GET(new Request('http://local.invalid/clips/catalog'));assert.equal(catalogResponse.status,200);const dto=await catalogResponse.json(),clip=dto.media.find(x=>x.id==='how-a-circle-works');assert.ok(clip);assert.equal(clip.kind,'video');assert.equal(clip.durationMs,23955);assert.equal(clip.sourcePage,null);assert.match(clip.reviewLabel,/local automated checks/);assert.ok(clip.transcript.includes('Every faith and view is welcome.'));
 for(const secret of ['circle-intro-source.html','circle-intro-inspection.json','sourceStartMs','publishable','reviewer','mediaUrl','LibriVox','svs.gsfc.nasa.gov'])assert.equal(JSON.stringify(dto).includes(secret),false);
 const props={params:Promise.resolve({clipId:clip.id})},request=new Request('http://local.invalid'+clip.media.href);const bytesResponse=await media.GET(request,props);assert.equal(bytesResponse.status,200);const bytes=await bytesResponse.arrayBuffer();assert.equal(bytes.byteLength,clip.media.bytes);assert.equal(createHash('sha256').update(Buffer.from(bytes)).digest('hex'),clip.media.sha256);
 const head=await media.HEAD(new Request(request.url,{method:'HEAD'}),props);assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),String(clip.media.bytes));assert.equal((await head.arrayBuffer()).byteLength,0);
 const seek=await media.GET(new Request(request.url,{headers:{range:'bytes=0-31'}}),props);assert.equal(seek.status,206);assert.deepEqual(Buffer.from(await seek.arrayBuffer()),Buffer.from(bytes).subarray(0,32));
 const calls=[];a.context.fetch=async(href,options)=>{calls.push({href,options});return href.startsWith('/clips/captions/')?captions.GET(new Request('http://local.invalid'+href),props):media.GET(new Request('http://local.invalid'+href),props);};
 const client=a.load('lib/clips/client.ts'),signal=new AbortController().signal;const [loaded,subtitles]=await Promise.all([client.fetchClipBytes(clip.media.href,clip.media.sha256,clip.media.bytes,clip.media.mime,signal),client.fetchClipBytes(clip.captions.href,clip.captions.sha256,clip.captions.bytes,'text/vtt',signal)]);
 assert.equal(loaded.byteLength,clip.media.bytes);assert.ok(new TextDecoder().decode(subtitles).startsWith('WEBVTT'));assert.equal(calls.length,2);for(const call of calls){assert.equal(call.options.credentials,'omit');assert.equal(call.options.referrerPolicy,'no-referrer');assert.equal(call.options.redirect,'error');}
});
