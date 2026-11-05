// Historical unsafe-behavior reproduction. No product fix or release PASS claim.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),origin='https://message-ai-fixture.test';
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=n=>{const p=path.isAbsolute(n)?n:path.join(ROOT,n),s=fs.lstatSync(p);assert(s.isFile()&&!s.isSymbolicLink()&&(!s.size||s.blocks),n);return fs.readFileSync(p);};
const result={status:'RUNNING',startedAt:new Date().toISOString(),scope:'Historical actual MessageAiConsent React component + current consent GET/POST handlers + disposable PGlite consent/allowance SQL. Credential supplier, SDK events, server actor and PostgREST transport are explicit doubles. The original request is held before handler execution and deliberately completes after browser abort. No remote provider or production operation. This records an unsafe baseline, not release acceptance.',observations:[],http:[],errors:[],sourceHashes:{},cleanup:{browser:'pending',database:'pending'}};
let browser,f,db,held=null,holdNext=false,page;
const file='verification/web/evidence/consent-recovery-baseline-browser.json';
const write=()=>fs.writeFileSync(path.join(ROOT,file),JSON.stringify(result,null,2)+'\n');
const hashes=result.sourceHashes;
async function bounded(fn,ms=5000){let timer;try{return await Promise.race([fn(),new Promise((_,no)=>timer=setTimeout(()=>no(Error('Bounded baseline operation timed out')),ms))]);}finally{clearTimeout(timer);}}
try{
 assert(process.execArgv.some(v=>v.endsWith('/deny-build-network.cjs')));
 process.chdir(path.join(ROOT,'verification/web'));
 const bundle=read('verification/web/evidence/consent-recovery-baseline-fixture/page.js'),css=read('verification/web/evidence/consent-recovery-baseline-fixture/page.css');
 Object.assign(hashes,JSON.parse(read('verification/web/evidence/consent-recovery-baseline-fixture/source-manifest.json')).sourceHashes,
  JSON.parse(read('verification/web/evidence/consent-recovery-baseline.json')).sourceHashes);
 for(const n of ['verification/web/tests/browser-consent-recovery-baseline.mjs','verification/web/scripts/bundle-consent-recovery-baseline.mjs'])hashes[n]=sha(read(n));
 for(const[n,h]of Object.entries(hashes))assert.equal(sha(read(n)),h,'Stale source '+n);
 const mod=await import('./support/message-ai-app.mjs'),database=await import('./support/message-ai-allowance-db.mjs');
 db=await database.createMessageAiAllowanceDb();f=await mod.messageAiApp({fixture:db,allowance:null});Object.assign(hashes,mod.MESSAGE_AI_SOURCE_HASHES);
 const requestPath=f.messagePath+'/ai-consent';
 const require=createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
 read(require.resolve('playwright'));
 const executablePath='/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';read(executablePath);
 browser=await require('playwright').chromium.launch({headless:true,executablePath,env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},args:['--disable-background-networking','--disable-component-update','--no-first-run']});
 const context=await browser.newContext({viewport:{width:320,height:850}});page=await context.newPage();page.setDefaultTimeout(5000);
 page.on('pageerror',e=>result.errors.push(e.stack||String(e)));
 await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());try{
  assert.equal(url.origin,origin);
  if(url.pathname==='/'){await route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/page.css"><body style="margin:0;padding:16px;background:#101d1a;color:#eee;box-sizing:border-box"><div id="root"></div><script>window.baseline='+JSON.stringify({circleId:f.circleId,messageId:f.messageId})+'</script><script type="module" src="/page.mjs"></script></body></html>'});return;}
  if(url.pathname==='/page.mjs'){await route.fulfill({contentType:'text/javascript',body:bundle});return;}
  if(url.pathname==='/page.css'){await route.fulfill({contentType:'text/css',body:css});return;}
  assert.equal(url.pathname,requestPath);assert(['GET','POST'].includes(req.method()));
  let gate;
  if(holdNext&&req.method()==='POST'){holdNext=false;let release;const promise=new Promise(resolve=>{release=resolve;});gate={release,done:false,body:req.postData()};held=gate;await promise;}
  // Ignoring the browser AbortSignal here is deliberate: it cannot establish
  // cancellation of an already dispatched request before a server transaction.
  const response=await f.dispatch(url.pathname,req.method(),req.postData()??undefined),body=await response.text();
  result.http.push({method:req.method(),path:url.pathname,status:response.status,body:req.postData(),response:JSON.parse(body),held:Boolean(gate)});
  if(gate){gate.done=true;gate.response=JSON.parse(body);}
  try{await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body});}catch(error){if(!gate)throw error;}
 }catch(error){result.errors.push(error.stack||String(error));try{await route.abort();}catch{}}});
 await page.goto(origin);
 const button=name=>page.getByRole('button',{name,exact:true});
 const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await button('Check AI review settings').click();await page.getByText('AI review permission is off for this message.',{exact:true}).waitFor();
 await page.getByRole('checkbox').check();holdNext=true;await button('Allow Anthropic review of this message').click();
 await bounded(async()=>{while(!held)await new Promise(r=>setTimeout(r,10));});
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.getByText('AI review settings cleared. Check current settings again. A change already sent may have been saved.',{exact:true}).waitFor();
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await button('Check AI review settings').click();
 await page.getByText('AI review permission is off for this message.',{exact:true}).waitFor();
 assert.equal(await button('Revoke future AI review').count(),0);
 assert.equal(await page.getByText('Current AI review settings checked.',{exact:true}).count(),1);
 result.observations.push({name:'held enable survives retirement; unchanged GET replaces uncertainty with off state and offers no revoke',currentUi:await page.locator('body').innerText(),heldBody:held.body});
 held.release();await bounded(async()=>{while(!held.done)await new Promise(r=>setTimeout(r,10));});await settle();
 const actual=await (await f.dispatch(requestPath)).json();assert.equal(actual.allowed,true);assert.equal(actual.consentRevision,1);
 assert.equal(await page.getByText('AI review permission is off for this message.',{exact:true}).count(),1);
 await page.screenshot({path:path.join(ROOT,'verification/web/evidence/consent-recovery-baseline-stale-off-320.png'),fullPage:true});
 result.observations.push({name:'late original enable commits while current component still presents off and no revoke',actual,uiStillOff:true});
 await button('Check AI review settings').click();await button('Revoke future AI review').waitFor();
 await button('Revoke future AI review').click();await page.getByText('Future AI review revoked. A request already in progress may still transmit or complete; text already sent to Anthropic cannot be recalled.',{exact:true}).waitFor();
 assert.equal((await(await f.dispatch(requestPath)).json()).allowed,false);
 result.observations.push({name:'manual read after late commit finally exposes revoke; ordinary revoke succeeds',finalAllowed:false});
 assert.equal(f.providerCalls.length,0);result.providerCalls=0;
 assert.deepEqual(result.errors,[]);for(const[n,h]of Object.entries(hashes))assert.equal(sha(read(n)),h,'Source changed '+n);
 result.status='REPRODUCED';
}catch(error){result.status='FAILED';result.failure=error.stack||String(error);if(page)result.failedView=await page.locator('body').innerText().catch(()=>null);process.exitCode=1;}
finally{
 if(held&&!held.done){held.release();await bounded(async()=>{while(!held.done)await new Promise(r=>setTimeout(r,10));}).catch(()=>{});}
 if(page)await page.evaluate(()=>window.aiQa?.unmount()).catch(()=>{});
 if(browser){await browser.close();result.cleanup.browser='closed';}
 if(f)await f.close();if(db){await db.db.close();result.cleanup.database='closed';}
 result.completedAt=new Date().toISOString();write();
}
console.log(JSON.stringify({status:result.status,observations:result.observations.map(x=>x.name),http:result.http.length,errors:result.errors,failure:result.failure,cleanup:result.cleanup}));
