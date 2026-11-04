import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,symlink} from 'node:fs/promises';
import path from 'node:path';
import {clipFixture} from './support/clip-fixture.mjs';
const context={territory:null,now:Date.parse('2026-11-04T12:00:00Z')};
const copy=value=>JSON.parse(JSON.stringify(value));
test('clip verification starts with all external network transports disabled',()=>assert.throws(()=>fetch('https://fixture.invalid/never-send'),/EXTERNAL_NETWORK_DISABLED_IN_PRIVATE_BUILD/));
test('actual pinned waveform and complete captions produce a whitelisted credited public clip',async t=>{
 const f=await clipFixture(t),result=await f.server.verifyClip({...f.entry,privateReviewer:'PRIVATE_REVIEW',proposal:'PRIVATE_PROPOSAL'},context,f.root);assert.ok(result);assert.equal(result.public.kind,'audio');assert.equal(result.public.transcript,'A quiet synthetic tone.');assert.equal(result.public.sourcePage,null);assert.match(result.public.reviewLabel,/local automated checks/);assert.equal(result.public.media.href,`/clips/media/synthetic-tone?sha=${f.entry.asset.sha256}`);for(const x of ['PRIVATE_REVIEW','PRIVATE_PROPOSAL',f.root,'source.html','inspection.json'])assert.equal(JSON.stringify(result.public).includes(x),false);
});
test('publication flags alone, held entries, missing artifacts and missing inspection facts never publish',async t=>{
 const f=await clipFixture(t);assert.equal(await f.server.verifyClip({publishable:true},context,f.root),null);
 for(const change of [{publishable:false},{status:'held'},{inspection:null},{source:null},{captions:null}])assert.equal(await f.server.verifyClip({...f.entry,...change},context,f.root),null);
 for(const key of ['assetSha256','sourceSha256','captionsSha256','durationMs','checks']){const saved=f.facts[key];delete f.facts[key];await f.inspect();assert.equal(await f.server.verifyClip(f.entry,context,f.root),null);f.facts[key]=saved;}
});
test('changed or truncated local files fail closed even when a registry entry remains approved',async t=>{
 const f=await clipFixture(t);const changed=Buffer.from(f.bytes);changed[70]^=1;await writeFile(path.join(f.root,'tone.wav'),changed);assert.equal(await f.server.verifyClip(f.entry,context,f.root),null);await writeFile(path.join(f.root,'tone.wav'),f.bytes.subarray(0,100));assert.equal(await f.server.verifyClip(f.entry,context,f.root),null);
});
test('absolute traversal and symlink escapes cannot make arbitrary local files public',async t=>{
 const f=await clipFixture(t);for(const name of ['../tone.wav','/etc/passwd','nested//tone.wav','nested/../../tone.wav','tone\\file.wav']){const entry=copy(f.entry);entry.asset.path=name;assert.equal(await f.server.verifyClip(entry,context,f.root),null);}
 const outside=path.join(f.project,'outside.wav');await writeFile(outside,f.bytes);await symlink(outside,path.join(f.root,'outside-link.wav'));const e=copy(f.entry);e.asset.path='outside-link.wav';assert.equal(await f.server.verifyClip(e,context,f.root),null);
});
test('timing MIME tracks derivative proof future dates and missing permissions refuse independently',async t=>{
 const f=await clipFixture(t);
 for(const mutate of [e=>e.review.sourceEndMs=999,e=>e.asset.mime='text/html',e=>e.asset.mime='video/mp4',e=>e.review.checkedAt='2099-01-01T00:00:00Z',e=>e.review.permissions=['display']]){const e=copy(f.entry);mutate(e);assert.equal(await f.server.verifyClip(e,context,f.root),null);}
 f.facts.audioTracks=0;await f.inspect();assert.equal(await f.server.verifyClip(f.entry,context,f.root),null);f.facts.audioTracks=1;f.facts.externalAssets=true;await f.inspect();assert.equal(await f.server.verifyClip(f.entry,context,f.root),null);
});
test('unknown request territory cannot publish a US-only review and duplicate IDs never produce an unusable public entry',async t=>{
 const f=await clipFixture(t);const e=copy(f.entry);e.review.territories=['US'];assert.equal(await f.server.verifyClip(e,context,f.root),null);assert.ok(await f.server.verifyClip(e,{...context,territory:'US'},f.root));assert.equal((await f.server.approvedMedia([f.entry,f.entry],context,f.root)).length,0);assert.equal((await f.server.approvedMedia(Array(13).fill(f.entry),context,f.root)).length,0);
});
test('third-party performance needs exact source allowlist and separate text/performance permissions',async t=>{
 const f=await clipFixture(t),e=copy(f.entry);e.source.kind='third-party';e.source.pageUrl='https://librivox.org/apology-by-plato/';e.source.mediaUrl='https://www.archive.org/download/apology_plato_bn_librivox/apology_01_plato.mp3';e.review.mode='documentary-rights';e.review.territories=['US'];
 assert.equal(await f.server.verifyClip(e,{...context,territory:'US'},f.root),null);
 Object.assign(f.facts,{sourceStartMs:0,sourceEndMs:1000,sourceDurationMs:1000});f.facts.rights={decision:'approved',sourcePage:e.source.pageUrl,sourceMedia:e.source.mediaUrl,credit:e.credit,checkedAt:e.review.checkedAt,validUntil:null,components:['text','performance'].map(kind=>({kind,basis:'public-domain',policyUrl:'https://librivox.org/pages/public-domain/',territories:['US'],permissions:e.review.permissions}))};await f.inspect();e.inspection=f.entry.inspection;assert.ok(await f.server.verifyClip(e,{...context,territory:'US'},f.root));assert.equal(await f.server.verifyClip(e,context,f.root),null);
 e.source.mediaUrl='https://evil.invalid/arbitrary.mp3';assert.equal(await f.server.verifyClip(e,{...context,territory:'US'},f.root),null);e.source.mediaUrl=f.facts.rights.sourceMedia;f.facts.rights.components.pop();await f.inspect();e.inspection=f.entry.inspection;assert.equal(await f.server.verifyClip(e,{...context,territory:'US'},f.root),null);
});
test('caption coverage bad timing executable markup and broken UTF8 fail closed',async t=>{
 const f=await clipFixture(t);for(const text of ['WEBVTT\n\n00:00:00.500 --> 00:00:01.000\nLate start.\n','WEBVTT\n\n00:00:00.000 --> 00:00:00.100\nMissing most content.\n','WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n<script>bad</script>\n','not captions'])assert.equal(f.server.captionTranscript(Buffer.from(text),1000),null);assert.equal(f.server.captionTranscript(Uint8Array.from([255,254]),1000),null);
});
test('video track and NASA silent-derivative requirements bind the private inspection receipt',async t=>{
 const f=await clipFixture(t),e=copy(f.entry);e.kind='video';e.asset={...await f.file('synthetic-header.webm',Buffer.from([26,69,223,163,0,0,0,0,0,0,0,0,0,0,0,0])),mime:'video/webm',durationMs:1000,width:320,height:180};
 // Header-only bytes isolate the gate/receipt checks; this is not evidence that
 // the fixture decodes. Actual first-party video decoding is a browser check.
 Object.assign(f.facts,{assetSha256:e.asset.sha256,audioTracks:0,videoTracks:1,width:320,height:180});f.facts.checks.push('frames-reviewed');await f.inspect();e.inspection=f.entry.inspection;assert.ok(await f.server.verifyClip(e,context,f.root));
 f.facts.width=321;await f.inspect();e.inspection=f.entry.inspection;assert.equal(await f.server.verifyClip(e,context,f.root),null);f.facts.width=320;
 e.source.kind='third-party';e.source.pageUrl='https://svs.gsfc.nasa.gov/13326/';e.source.mediaUrl='https://svs.gsfc.nasa.gov/vis/a010000/a013300/a013326/BH_Accretion_Disk_Sim_360_1080.webm';e.review.mode='documentary-rights';Object.assign(f.facts,{sourceStartMs:0,sourceEndMs:1000,sourceDurationMs:1000});f.facts.rights={decision:'approved',sourcePage:e.source.pageUrl,sourceMedia:e.source.mediaUrl,credit:e.credit,checkedAt:e.review.checkedAt,validUntil:null,components:[{kind:'visuals',basis:'public-domain',policyUrl:'https://svs.gsfc.nasa.gov/help/',territories:['WORLDWIDE'],permissions:e.review.permissions}]};await f.inspect();e.inspection=f.entry.inspection;assert.equal(await f.server.verifyClip(e,context,f.root),null);f.facts.checks.push('all-audio-removed');await f.inspect();e.inspection=f.entry.inspection;assert.ok(await f.server.verifyClip(e,context,f.root));f.facts.audioTracks=1;await f.inspect();e.inspection=f.entry.inspection;assert.equal(await f.server.verifyClip(e,context,f.root),null);
});
