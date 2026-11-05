import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),ORIGIN='https://quest-reviewer.test',PREFIX='verification/web/evidence/quest-reviewer-entry';
const sha=b=>createHash('sha256').update(b).digest('hex'),read=name=>{const p=path.isAbsolute(name)?name:path.join(ROOT,name),s=fs.lstatSync(p);assert(s.isFile()&&!s.isSymbolicLink()&&(!s.size||s.blocks),name);return fs.readFileSync(p);};
const receipt=PREFIX+'.json';let priorReceipt=null;
if(fs.existsSync(path.join(ROOT,receipt))){const bytes=read(receipt),archive=PREFIX+'-prior-'+Date.now()+'.json';fs.writeFileSync(path.join(ROOT,archive),bytes);priorReceipt={path:archive,sha256:sha(bytes)};}
const result={status:'RUNNING',startedAt:new Date().toISOString(),stories:[],http:[],errors:[],sourceHashes:{},runtimeHashes:{},evidenceHashes:{},priorReceipt,cleanup:{browser:'pending',database:'pending'},scope:'Actual QuestReviews connection wrapper and complete MessageReviews/ReviewCoverage/useReviewAccess in Chromium with current canonical reviewer handlers and disposable publication-aware SQL. Account credentials, SDK events, actor resolution, PostgREST and HTTPS delivery are explicit doubles. No real sign-in/provider, independent database contention or Quest headset acceptance.'};
const write=()=>fs.writeFileSync(path.join(ROOT,receipt),JSON.stringify(result,null,2)+'\n'),pass=story=>{result.stories.push(story);write();console.log('PASS '+result.stories.length+': '+story);};
async function bounded(work,ms=10000){let timer;try{return await Promise.race([work(),new Promise((_,no)=>timer=setTimeout(()=>no(Error('Owned operation timed out')),ms))]);}finally{clearTimeout(timer);}}
let browser,page,f,latestQueue;const pending=new Set();write();
try{
 assert(process.execArgv.some(v=>v.endsWith('/deny-build-network.cjs')));process.chdir(path.join(ROOT,'verification/web'));
 const fixture='verification/web/evidence/reviewer-retained-actions-fixed-all-fixture',manifest=JSON.parse(read(fixture+'/source-manifest.json')),bundle=read(fixture+'/page.js'),css=read(fixture+'/page.css');
 Object.assign(result.sourceHashes,manifest.sourceHashes);Object.assign(result.runtimeHashes,manifest.runtimeHashes);
 for(const n of ['page.js','page.css','source-manifest.json'])result.evidenceHashes[fixture+'/'+n]=sha(read(fixture+'/'+n));
 for(const n of ['verification/web/tests/browser-quest-reviewer-entry.mjs','verification/web/tests/support/native-reviewer-app.mjs','app/quest/reviews/page.tsx','app/quest/page.tsx'])result.sourceHashes[n]=sha(read(n));
 const mod=await import('./support/native-reviewer-app.mjs');Object.assign(result.sourceHashes,await mod.nativeReviewerSourceHashes());f=await mod.nativeReviewerApp({reportCount:101});
 const playwrightRoot='/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/',require=createRequire(playwrightRoot+'playwright/package.json'),executablePath='/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
 for(const n of [process.execPath,executablePath,...['playwright/package.json','playwright/index.js','playwright-core/package.json','playwright-core/index.js','playwright-core/browsers.json','playwright-core/lib/bootstrap.js','playwright-core/lib/coreBundle.js','playwright-core/lib/utilsBundle.js'].map(n=>playwrightRoot+n)])result.runtimeHashes[n]=sha(read(n));
 for(const[n,h]of Object.entries({...result.sourceHashes,...result.runtimeHashes}))assert.equal(sha(read(n)),h,'Stale input '+n);
 browser=await require('playwright').chromium.launch({headless:true,executablePath,env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},args:['--disable-background-networking','--disable-component-update','--no-first-run']});
 const context=await browser.newContext({viewport:{width:320,height:850},serviceWorkers:'block',acceptDownloads:false});page=await context.newPage();page.setDefaultTimeout(7000);page.on('pageerror',error=>result.errors.push(error.stack||String(error)));
 await context.route('**/*',route=>{const work=(async()=>{const req=route.request(),url=new URL(req.url());try{
  assert.equal(url.origin,ORIGIN);
  if(url.pathname==='/')return await route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/page.css"><body style="margin:0;padding:16px;box-sizing:border-box;background:#101d1a;color:#eee"><div id="root"></div><script type="module" src="/page.mjs"></script></body></html>'});
  if(url.pathname==='/page.mjs')return await route.fulfill({contentType:'text/javascript',body:bundle});if(url.pathname==='/page.css')return await route.fulfill({contentType:'text/css',body:css});
  assert(url.pathname.startsWith('/api/admin/circles/'));const headers=await req.allHeaders();assert.equal(headers.authorization,undefined);assert.equal(headers.cookie,undefined);
  const entry={method:req.method(),path:url.pathname,bodyKeys:req.postData()?Object.keys(JSON.parse(req.postData())).sort():[],status:null};result.http.push(entry);
  const response=await f.dispatch(url.pathname+url.search,req.method(),req.postData()??undefined),bytes=await response.text();entry.status=response.status;assert.match(response.headers.get('cache-control'),/private.*no-store/);
  if(url.pathname==='/api/admin/circles/messages')latestQueue=JSON.parse(bytes);
  await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:bytes});
 }catch(error){result.errors.push(error.stack||String(error));try{await route.abort();}catch{}}})();pending.add(work);work.finally(()=>pending.delete(work));return work;});
 const button=name=>page.getByRole('button',{name,exact:true}),full=()=>page.getByRole('region',{name:'Full report review',exact:true}),settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const idle=async()=>{await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Load assigned message reviews'&&!b.disabled));await settle();};
 const retain=(node,event='onClick')=>node.evaluate((node,event)=>window.reviewerRetainedQa.retain(node,event),event),invoke=id=>page.evaluate(id=>window.reviewerRetainedQa.invoke(id),id);
 const stats=()=>page.evaluate(()=>({factories:window.reviewerRetainedQa.factoryCalls(),credentials:window.reviewerRetainedQa.credentialCalls(),listeners:window.reviewerRetainedQa.listeners.size}));
 async function connect(){await button('Connect my review account').click();await idle();}
 async function open(id=f.messageId){latestQueue=null;await button('Load assigned message reviews').click();await idle();const index=latestQueue.items.findIndex(x=>x.messageId===id);assert(index>=0);await page.getByRole('region',{name:'Assigned message review queue',exact:true}).getByRole('button').nth(index).click();await idle();}
 async function prepare(){await page.getByLabel('Moderator restriction',{exact:true}).selectOption('restore');await page.getByLabel('Reason based on conduct',{exact:true}).selectOption('no_violation');await page.getByLabel('Author-facing explanation',{exact:true}).fill('The complete reviewed evidence does not establish a conduct violation.');await page.locator('fieldset').getByRole('checkbox').check();}
 await page.goto(ORIGIN+'/?view=quest');await page.bringToFront();await button('Connect my review account').waitFor();await settle();assert.deepEqual(await stats(),{factories:0,credentials:0,listeners:0});assert.equal(result.http.length,0);
 const oldConnect=await retain(button('Connect my review account'));await connect();const mounted=await stats();await invoke(oldConnect);await settle();assert.deepEqual(await stats(),mounted);assert.equal(result.http.length,0);
 pass('Quest reviewer entry creates no account client or request until explicit Connect; retained Connect cannot construct another reviewer view');
 await open();assert.equal(await page.locator('fieldset').locator('select').first().isDisabled(),true);assert.equal(await button('Request AI observations').isDisabled(),true);assert.equal((await page.locator('body').innerText()).includes('PRIVATE_NATIVE_REVIEW_REPORT'),false);
 await button('Start full case review').click();await idle();await full().getByText('Reviewed 0 of 101 reports.',{exact:true}).waitFor();assert.equal(await full().locator('li').count(),50);
 let acknowledgements=0;while(await button('Acknowledge this report page').count()){await full().getByRole('checkbox').check();await button('Acknowledge this report page').click();await idle();acknowledgements++;}
 assert.equal(acknowledgements,3);assert.equal(await page.locator('fieldset').locator('select').first().isDisabled(),false);assert.equal(await button('Request AI observations').isDisabled(),true);
 pass('Quest exposes the full101-report workflow through three deliberate bounded acknowledgements; complete human coverage does not enable AI for a large case');
 await prepare();const oldSubmit=await retain(page.locator('form'),'onSubmit');await button('Save message decision').click();await idle();assert.equal((await f.coverage.counts('message')).decisions,1);assert.equal((await f.coverage.counts('message')).open,0);
 pass('actual current SQL accepts a complete human coverage decision and the Quest view reads fresh case state');
 await button('Request AI observations').click();await idle();assert.equal(f.providerCalls.length,0);assert.equal((await f.coverage.counts('message')).decisions,1);
 pass('an explicit AI request remains server gated and leaves human review available without provider activation or a decision');
 await open(f.secondMessageId);await prepare();let at=result.http.length;await invoke(oldSubmit);await settle();assert.equal(result.http.length,at);assert.equal(await button('Save message decision').isDisabled(),false);
 const oldClose=await retain(button('Close review view'));await button('Close review view').click();await button('Connect my review account').waitFor();assert.equal((await stats()).listeners,0);assert.equal((await page.locator('body').innerText()).includes(f.secondContent),false);at=result.http.length;await invoke(oldSubmit);await invoke(oldClose);await settle();assert.equal(result.http.length,at);
 await connect();await open(f.secondMessageId);at=result.http.length;await invoke(oldClose);await settle();assert.equal(result.http.length,at);await button('Close review view').waitFor();
 pass('close clears private evidence and retires old submission and close callbacks, including after reconnecting to a fresh enabled case');
 await page.evaluate(()=>window.reviewerRetainedQa.holdCredentials());await button('Load assigned message reviews').click();await settle();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await button('Connect my review account').waitFor();at=result.http.length;await page.evaluate(()=>window.reviewerRetainedQa.releaseCredentials());await settle();assert.equal(result.http.length,at);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await settle();assert.equal(result.http.length,at);assert.equal((await stats()).listeners,0);
 pass('focus retirement prevents a held credential request from transmitting; return to focus does not reconnect or reload private reviews');
 await connect();await open(f.secondMessageId);await prepare();await page.evaluate(()=>window.dispatchEvent(new Event('offline')));await button('Connect my review account').waitFor();at=result.http.length;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await settle();assert.equal(result.http.length,at);assert.equal((await stats()).listeners,0);
 await connect();await open(f.secondMessageId);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);for(const b of await page.locator('button:visible').all())assert((await b.boundingBox()).height>=44);await page.screenshot({path:path.join(ROOT,PREFIX+'-320.png'),fullPage:true});result.evidenceHashes[PREFIX+'-320.png']=sha(read(PREFIX+'-320.png'));
 pass('offline closes the private reviewer view, return stays manual, and the320px review layout fits with44px buttons');
 await page.evaluate(()=>window.reviewerRetainedQa.unmount());await settle();assert.equal((await stats()).listeners,0);assert.deepEqual(result.errors,[]);assert.equal(f.providerCalls.length,0);result.aiProviderCalls=0;result.status='PASS';
}catch(error){result.status='FAIL';result.failure=error.stack||String(error);if(page)result.failedView=await page.locator('body').innerText().catch(()=>null);}
finally{
 if(page)await page.evaluate(()=>window.reviewerRetainedQa?.releaseCredentials()).catch(()=>{});await bounded(()=>Promise.allSettled([...pending])).catch(error=>{result.status='FAIL';result.failure??=String(error);});
 if(browser){await bounded(()=>browser.close());result.cleanup.browser='closed';}if(f){await bounded(()=>f.close());result.cleanup.database='closed';}
 try{assert.deepEqual(result.errors,[]);for(const[n,h]of Object.entries({...result.sourceHashes,...result.runtimeHashes,...result.evidenceHashes}))assert.equal(sha(read(n)),h,'Input changed '+n);}catch(error){result.status='FAIL';result.failure??=error.stack||String(error);}
 result.completedAt=new Date().toISOString();write();
}
console.log(JSON.stringify({status:result.status,stories:result.stories.length,http:result.http.length,errors:result.errors,failure:result.failure,cleanup:result.cleanup}));process.exitCode=result.status==='PASS'?0:1;
