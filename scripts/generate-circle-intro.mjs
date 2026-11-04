import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

assert.ok([...process.execArgv, process.env.NODE_OPTIONS || ''].join(' ').includes('deny-build-network.cjs'), 'Start with the network guard');
const root = process.cwd(), folder = path.join(root, 'content/clips'), evidence = path.join(root, 'verification/web/evidence');
const require = createRequire(import.meta.url), { chromium } = require(process.env.SOE_PLAYWRIGHT_PACKAGE);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const slides = [
  ['How a Circle works', 'Read. Reflect. Share.', 'A good conversation starts with a good question.'],
  ['Choose a Circle', 'Find a time and place that work for you.', 'Read the source before your meeting.'],
  ['Bring your perspective', 'Christian and conservative roots.', 'Every faith and view is welcome.'],
  ['Make room for disagreement', 'Challenge an idea.', 'Treat the person with respect.'],
  ['Share with care', 'Keep other members’ words private.', 'Ask before recording.'],
  ['Start with the reading', 'Find a Circle. Read.', 'Join the conversation.'],
];
const stamp = seconds => `00:00:${String(seconds).padStart(2, '0')}.000`;
const captions = 'WEBVTT\n\n' + slides.map((slide, index) => `${index + 1}\n${stamp(index * 4)} --> ${stamp((index + 1) * 4)}\n${slide.join('\n')}\n`).join('\n');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>SoE original Circle introduction source</title><style>body{margin:0;background:#101d1a}canvas{display:block}</style><canvas id="intro" width="720" height="404" aria-label="Original SoE Circle introduction"></canvas><script>
const slides=${JSON.stringify(slides)};
const canvas=document.getElementById('intro'),ctx=canvas.getContext('2d');
function draw(index){
 ctx.fillStyle='#101d1a';ctx.fillRect(0,0,720,404);
 ctx.fillStyle='#c9a84c';ctx.fillRect(44,40,632,3);
 ctx.font='18px Arial';ctx.fillText('SOCIETY OF EXPLORERS',44,78);
 ctx.fillStyle='#f5f0e8';
 const title=slides[index][0];let size=42;while(size>28){ctx.font=size+'px Georgia';if(ctx.measureText(title).width<=632)break;size--;}
 ctx.fillText(title,44,151);
 ctx.font='27px Arial';ctx.fillText(slides[index][1],44,219);ctx.fillText(slides[index][2],44,265);
 ctx.fillStyle='#b9c9bd';ctx.font='18px Arial';ctx.fillText('READ. REFLECT. SHARE.',44,352);
 ctx.fillStyle='#c9a84c';for(let i=0;i<6;i++){ctx.globalAlpha=i===index?1:.25;ctx.fillRect(532+i*24,340,16,4);}ctx.globalAlpha=1;
}
draw(0);
window.recordIntro=async()=>{
 const choices=['video/mp4;codecs=avc1.42001E','video/webm;codecs=vp8','video/webm;codecs=vp9'];
 const mime=choices.find(type=>MediaRecorder.isTypeSupported(type));if(!mime)throw Error('No supported local video encoder');
 const stream=canvas.captureStream(0);if(stream.getAudioTracks().length)throw Error('Unexpected audio input');
 const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:500000}),chunks=[],frames=[];
 const stopped=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=resolve;recorder.onerror=e=>reject(Error('Local recording failed'));});
 let start=performance.now(),last=-1;
 recorder.start();
 const render=()=>{const index=Math.min(5,Math.floor((performance.now()-start)/4000));draw(index);stream.getVideoTracks()[0].requestFrame();if(index!==last){frames.push(canvas.toDataURL('image/png'));last=index;}};
 render();const timer=setInterval(render,80);await new Promise(resolve=>setTimeout(resolve,24000));clearInterval(timer);recorder.stop();await stopped;stream.getTracks().forEach(track=>track.stop());
 const blob=new Blob(chunks,{type:recorder.mimeType}),url=URL.createObjectURL(blob),video=document.createElement('video');video.muted=true;video.src=url;document.body.append(video);
 await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(Error('Recorded clip cannot decode'));});
 if(!Number.isFinite(video.duration)){video.currentTime=1e8;await new Promise(resolve=>video.onseeked=resolve);video.currentTime=0;}
 await video.play();await new Promise(resolve=>setTimeout(resolve,250));
 const decoded=video.captureStream(),metadata={durationMs:Math.round(video.duration*1000),width:video.videoWidth,height:video.videoHeight,audioTracks:decoded.getAudioTracks().length,videoTracks:decoded.getVideoTracks().length};
 video.pause();decoded.getTracks().forEach(track=>track.stop());video.remove();URL.revokeObjectURL(url);
 const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return {base64:btoa(binary),mime:recorder.mimeType,metadata,frames};
};
</script></html>`;
fs.mkdirSync(folder, { recursive: true }); fs.mkdirSync(evidence, { recursive: true });
fs.writeFileSync(path.join(folder, 'circle-intro-source.html'), html);
fs.writeFileSync(path.join(folder, 'circle-intro.vtt'), captions);
let browser;
try {
 browser = await chromium.launch({ headless: true, executablePath: process.env.SOE_BROWSER_EXECUTABLE });
 const context = await browser.newContext({ viewport: { width: 720, height: 404 }, serviceWorkers: 'block' });
 const requests = []; await context.route('**/*', route => { requests.push(route.request().url()); return route.abort(); });
 const page = await context.newPage(); await page.setContent(html);
 const result = await page.evaluate(() => window.recordIntro());
 fs.writeFileSync(path.join(evidence, 'circle-intro-codec-probe.json'), JSON.stringify({mime:result.mime,metadata:result.metadata,frames:result.frames.length},null,2)+'\n');
 assert.deepEqual(requests, []); assert.equal(result.metadata.audioTracks, 0); assert.equal(result.metadata.videoTracks, 1);
 assert.equal(result.metadata.width, 720); assert.equal(result.metadata.height, 404);
 assert.ok(result.metadata.durationMs >= 23500 && result.metadata.durationMs <= 25500, 'Recorded duration outside the authored sequence');
 assert.equal(result.frames.length, 6);
 const extension = result.mime.startsWith('video/mp4') ? 'mp4' : 'webm', bytes = Buffer.from(result.base64, 'base64');
 const asset = path.join(folder, `circle-intro.${extension}`); fs.writeFileSync(asset, bytes);
 const end = result.metadata.durationMs, finalCaptions = captions.replace('00:00:24.000', `00:00:${String(Math.floor(end/1000)).padStart(2,'0')}.${String(end%1000).padStart(3,'0')}`);
 fs.writeFileSync(path.join(folder, 'circle-intro.vtt'), finalCaptions);
 for (let index = 0; index < result.frames.length; index++) fs.writeFileSync(path.join(evidence, `circle-intro-frame-${index + 1}.png`), Buffer.from(result.frames[index].split(',')[1], 'base64'));
 const inspection = { version: 1, assetSha256: hash(bytes), sourceSha256: hash(Buffer.from(html)), captionsSha256: hash(Buffer.from(finalCaptions)),
   ...result.metadata, externalAssets: false, checks: ['source-created-locally', 'tracks-inspected', 'captions-checked'],
   createdAt: new Date().toISOString(), contentOrigin: 'Original SoE onboarding text and canvas graphics authored for this product task; no external imagery, recording, music or voice.',
   mime: extension === 'mp4' ? 'video/mp4' : 'video/webm', encoderMime: result.mime, chromiumVersion: browser.version(),
   frameSha256: result.frames.map(frame => hash(Buffer.from(frame.split(',')[1], 'base64'))), reviewBoundary: 'Local automated generation and decoded-track checks. Frame review must be recorded separately; no human approval or production publication is implied.' };
 fs.writeFileSync(path.join(folder, 'circle-intro-inspection.json'), JSON.stringify(inspection, null, 2) + '\n');
 fs.writeFileSync(path.join(evidence, 'circle-intro-generation.json'), JSON.stringify({ ...inspection, asset: path.relative(root, asset), bytes: bytes.length, startupNetworkDenied: true, cleanEnvironmentRequired: true, externalRequests: requests }, null, 2) + '\n');
 process.stdout.write(JSON.stringify({ asset: path.relative(root, asset), bytes: bytes.length, mime: result.mime, ...result.metadata, frames: result.frames.length }) + '\n');
} finally { await browser?.close(); }
