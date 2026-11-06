import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
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

test('the stock archive stays outside clip storage and only its exact source pin passes review', async () => {
 const app = offlineApp();
 const entry = app.load('lib/clips/registry.json').find(item => item.id === 'which-height');
 const { verifyClip } = app.load('lib/clips/server.ts');
 assert.equal(existsSync(new URL(`../../../content/clips/${entry.source.path}`, import.meta.url)), false);
 assert.ok(await verifyClip(entry, { territory: null }));
 for (const change of [{ path: 'other-source.mp4' }, { bytes: entry.source.bytes - 1 }, { sha256: '0'.repeat(64) }]) {
  assert.equal(await verifyClip({ ...entry, source: { ...entry.source, ...change } }, { territory: null }), null);
 }
});

test('a direct Reel lookup reuses the current media review and refuses missing, held and ambiguous IDs', async () => {
 const app = offlineApp();
 const { approvedReel } = app.load('lib/clips/server.ts');
 const entry = app.load('lib/clips/registry.json').find(item => item.id === 'night-sky-traffic');
 assert.equal((await approvedReel(entry.id)).title, 'Who gets the night sky?');
 for (const id of ['not-a-reviewed-reel', 'how-a-circle-works', '../night-sky-traffic']) assert.equal(await approvedReel(id), null);
 assert.equal(await approvedReel(entry.id, [entry, entry]), null);
 assert.equal(await approvedReel(entry.id, [{ ...entry, status: 'held' }]), null);
 assert.equal(await approvedReel(entry.id, [{ ...entry, asset: { ...entry.asset, sha256: '0'.repeat(64) } }]), null);
});

test('direct Reel metadata uses the configured application host and verified public copy', async () => {
 const app = offlineApp();
 app.context.process.env.VERCEL_PROJECT_PRODUCTION_URL = 'public-app.example.test';
 app.setMock('next/navigation', () => ({ notFound() { throw Error('Fixture 404'); } }));
 app.setMock('next/link', () => ({ default: () => null }));
 app.setMock('../../ClipPlayer', () => ({ default: () => null }));
 app.setMock('../../clips.module.css', () => ({}));
 const page = app.load('app/clips/watch/[clipId]/page.tsx');
 const params = clipId => ({ params: Promise.resolve({ clipId }) });
 const meta = await page.generateMetadata(params('night-sky-traffic'));
 assert.equal(meta.title, 'Who gets the night sky?');
 assert.equal(meta.openGraph.title, meta.title);
 assert.equal(meta.openGraph.url, 'https://public-app.example.test/clips/watch/night-sky-traffic');
 assert.equal(meta.alternates.canonical, meta.openGraph.url);
 assert.equal(meta.openGraph.images[0].url, 'https://public-app.example.test/opengraph-image');
 assert.equal((await page.generateMetadata(params('missing'))).robots.index, false);
 await assert.rejects(() => page.default(params('missing')), /Fixture 404/);
});

const ccBy = 'https://creativecommons.org/licenses/by/4.0/';
const pexels = 'https://www.pexels.com/terms-of-service/';
const report = 'https://www.usgs.gov/media/videos/october-17-2026-video-kilauea-summit-lava-fountaining-episode-55';
for (const [id, page, credit, seconds, license = ccBy, referenceUrl] of [
 ['night-sky-traffic', 'https://www.eso.org/public/videos/eso2607d/', 'B. Häußler/ESO', 24],
 ['telescope-first-tilt', 'https://www.eso.org/public/videos/potw2643a/', 'ESO/Cimolai/Apical/G. Vecchia', 20],
 ['which-height', 'https://www.pexels.com/video/kilauea-volcano-eruption-in-hawaii-33378632/', 'James Lee via Pexels', 20, pexels, report],
]) test(`the retained ${id} Reel returns linked attribution, bounded media and complete timed text`, async () => {
 const app = offlineApp();
 const catalog = app.load('app/clips/catalog/route.ts');
 const response = await catalog.GET(new Request('http://local.invalid/clips/catalog'));
 const dto = await response.json();
 const reel = dto.media.find(clip => clip.id === id);
 assert.ok(reel);
 assert.equal(reel.sourcePage, page);
 assert.equal(reel.credit, credit);
 assert.equal(reel.attribution.licenseUrl, license);
 assert.equal(reel.attribution.referenceUrl, referenceUrl);
 assert.equal(reel.attribution.captionPresentation, 'embedded-text');
 assert.equal(reel.durationMs, seconds * 1000);
 assert.ok(reel.media.bytes < 4_000_000);
 for (const hidden of ['eso2607d-source.mp4', 'potw2643a-source.m4v', 'cdn.eso.org', 'videos.pexels.com', 'pexels-33378632-source.mp4', '-inspection.json', 'sourceStartMs']) {
  assert.equal(JSON.stringify(dto).includes(hidden), false);
 }
 const request = href => new Request('http://local.invalid' + href);
 const params = { params: Promise.resolve({ clipId: reel.id }) };
 const media = app.load('app/clips/media/[clipId]/route.ts');
 const captions = app.load('app/clips/captions/[clipId]/route.ts');
 const file = await media.GET(request(reel.media.href), params);
 assert.equal(file.status, 200);
 const bytes = Buffer.from(await file.arrayBuffer());
 assert.equal(bytes.length, reel.media.bytes);
 assert.equal(createHash('sha256').update(bytes).digest('hex'), reel.media.sha256);
 const text = await (await captions.GET(request(reel.captions.href), params)).text();
 assert.equal((text.match(/-->/gu) || []).length, 4);
 assert.ok(text.includes(`00:00:${seconds}.000`));
 if (referenceUrl) {
  const transcript = reel.transcript.replace(/\s+/gu, ' ');
  assert.match(transcript, /Archive footage of Kīlauea/);
  assert.match(transcript, /25,000 feet above sea level/);
  assert.match(transcript, /just over 700 feet/);
  assert.match(transcript, /Bring a question to a Circle/);
  const { parsePublicMediaClip } = app.load('lib/clips/contracts.ts');
  assert.equal(parsePublicMediaClip({ ...reel, attribution: { ...reel.attribution, referenceUrl: undefined } }), null);
  assert.equal(parsePublicMediaClip({ ...reel, attribution: { ...reel.attribution, referenceUrl: 'https://other.invalid/report' } }), null);
 } else assert.match(reel.transcript, /Bring your reason to a\s+Circle\./);
});
