import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const root=process.cwd(),require=createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json'),{chromium}=require('playwright');
const base=JSON.parse(fs.readFileSync('lib/clips/registry.json'))[0],media=fs.readFileSync('content/clips/circle-intro.mp4'),capA=fs.readFileSync('content/clips/circle-intro.vtt');
const capB=Buffer.from(capA.toString().replace('How a Circle works','CORRECTED_CAPTION_VERSION_B')),hash=x=>createHash('sha256').update(x).digest('hex');
const clipA={id:base.id,kind:base.kind,title:base.title,description:base.description,credit:base.credit,reviewLabel:'Original SoE content; local automated checks',territoryLabel:'Reviewed scope: worldwide',checkedAt:base.review.checkedAt,sourcePage:null,durationMs:base.asset.durationMs,media:{href:`/clips/media/${base.id}?sha=${hash(media)}`,sha256:hash(media),bytes:media.length,mime:'video/mp4'},captions:{href:`/clips/captions/${base.id}?sha=${hash(capA)}`,sha256:hash(capA),bytes:capA.length,language:'en'},transcript:'Original caption version A'};
const clipB={...clipA,captions:{...clipA.captions,href:`/clips/captions/${base.id}?sha=${hash(capB)}`,sha256:hash(capB),bytes:capB.length},transcript:'CORRECTED_CAPTION_VERSION_B'};
const html=`<!doctype html><div id="root"></div><script>const urls=new Map(),revoked=[];const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);URL.createObjectURL=blob=>{const url=create(blob);urls.set(url,blob);return url;};URL.revokeObjectURL=url=>{revoked.push(url);revoke(url);};window.clipReview={clipA:${JSON.stringify(clipA)},clipB:${JSON.stringify(clipB)},urls,revoked};</script><script type="module" src="/probe.mjs"></script>`;
let hold=false,release=null,held=false;const errors=[],requests=[];
const browser=await chromium.launch({headless:true,executablePath:'/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},args:['--disable-background-networking','--no-first-run']});
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());assert.equal(url.origin,'https://clip-review.test');
  if(url.pathname==='/'){await route.fulfill({status:200,contentType:'text/html',body:html});return;}
  if(url.pathname==='/probe.mjs'){await route.fulfill({status:200,contentType:'text/javascript',body:fs.readFileSync('verification/web/evidence/clip-lifetime-fixture/probe.mjs')});return;}
  requests.push(url.pathname+url.search);let body,mime;
  if(url.pathname.startsWith('/clips/media/')){body=media;mime='video/mp4';}
  else{body=url.searchParams.get('sha')===hash(capA)?capA:capB;mime='text/vtt';if(hold&&body===capA){held=true;await new Promise(r=>release=r);}}
  try{await route.fulfill({status:200,contentType:mime,headers:{'Content-Length':String(body.length)},body});}catch(error){if(!request.failure())throw error;}
 });
 await page.goto('https://clip-review.test/');await page.getByRole('button',{name:'Load video and captions'}).waitFor();assert.equal(requests.length,0);
 const caption=()=>page.evaluate(async()=>{const track=document.querySelector('track');return track?await window.clipReview.urls.get(track.src).text():null;});
 await page.getByRole('button',{name:'Load video and captions'}).click();await page.locator('video').waitFor();assert.ok((await caption()).includes('How a Circle works'));
 await page.evaluate(()=>window.clipReview.replace(window.clipReview.clipB));await page.getByText('CORRECTED_CAPTION_VERSION_B',{exact:true}).waitFor({state:'attached'});
 assert.equal(await page.locator('video').count(),0,'caption revision clears the previously ready player');
 const firstCleanup=await page.evaluate(()=>({created:window.clipReview.urls.size,revoked:window.clipReview.revoked.length}));assert.equal(firstCleanup.created,2);assert.equal(firstCleanup.revoked,2);assert.equal(requests.length,2,'review change does not automatically reload');
 await page.getByRole('button',{name:'Load video and captions'}).click();await page.locator('video').waitFor();assert.equal(await caption(),capB.toString());
 await page.getByRole('button',{name:'Unload clip'}).click();await page.evaluate(()=>window.clipReview.replace(window.clipReview.clipA));await page.getByText('Original caption version A',{exact:true}).waitFor({state:'attached'});
 hold=true;await page.getByRole('button',{name:'Load video and captions'}).click({noWaitAfter:true});for(let i=0;i<100&&!held;i++)await new Promise(r=>setTimeout(r,5));assert.equal(held,true);
 await page.evaluate(()=>window.clipReview.replace(window.clipReview.clipB));await page.getByText('CORRECTED_CAPTION_VERSION_B',{exact:true}).waitFor({state:'attached'});release();await page.waitForTimeout(50);
 assert.equal(await page.locator('video').count(),0,'late old captions cannot create a player under the new review');
 assert.equal(await page.evaluate(()=>window.clipReview.urls.size),4,'retired pending load creates no object URLs');
 await page.getByRole('button',{name:'Load video and captions'}).click();await page.locator('video').waitFor();assert.equal(await caption(),capB.toString());
 await page.evaluate(()=>window.clipReview.replace({...window.clipReview.clipB,title:'A new reviewed title'}));await page.getByRole('heading',{name:'A new reviewed title'}).waitFor();assert.equal(await page.locator('video').count(),0,'metadata-only review changes reset the player too');
 await page.evaluate(()=>window.clipReview.unmount());const cleanup=await page.evaluate(()=>({created:window.clipReview.urls.size,revoked:window.clipReview.revoked.length}));assert.equal(cleanup.created,6);assert.equal(cleanup.revoked,6);assert.deepEqual(errors,[]);
 const result={status:'PASS',stories:['caption-only review change clears ready player and revokes both prior URLs without automatic reload','explicit reload verifies the new caption bytes','caption revision retires a pending read; late old reply creates no player or URLs','metadata-only review change clears player and all six created URLs are revoked'],unmountCleanup:cleanup,requests,errors,scope:'Actual ClipPlayer and exact current ClipsPage key under React19.2.4/Chromium; CSS map adapted; reviewed first-party bytes and isolated caption-B fixture, no production mutations',sourceHashes:Object.fromEntries(['app/clips/ClipPlayer.tsx','app/clips/page.tsx','lib/clips/server.ts'].map(p=>[p,hash(fs.readFileSync(p))]))};
 fs.writeFileSync('verification/web/evidence/clip-lifetime-browser.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}
