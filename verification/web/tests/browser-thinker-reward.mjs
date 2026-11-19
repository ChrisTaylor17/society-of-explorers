import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),origin='https://thinker-reward-fixture.test';
const dir=path.join(root,'verification/web/evidence/thinker-reward-fixture'),reportPath=path.join(root,'verification/web/evidence/thinker-reward-browser.json');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function read(name){const s=fs.lstatSync(name);if(s.isSymbolicLink()||!s.isFile()||s.size&&!s.blocks)throw Error('Refuse linked/offloaded input: '+name);return fs.readFileSync(name);}
const stories=[],requests=[],unexpected=[],pageErrors=[],consoleErrors=[],routeErrors=[],contexts=[];
const cleanup={status:'pending',error:null};let failure=null,browser=null,bundle=null,manifest=null,priorReceipt=null;
const runner='verification/web/tests/browser-thinker-reward.mjs',sourceHashes={[runner]:hash(read(path.join(root,runner)))};
if(fs.existsSync(reportPath)){const bytes=read(reportPath);priorReceipt={sha256:hash(bytes),receipt:JSON.parse(bytes)};}
const report=status=>({status,stories,requests,unexpected,pageErrors,consoleErrors,routeErrors,cleanup,sourceHashes,bundleSHA256:bundle?hash(bundle):null,priorReceipt,scope:manifest?.scope??'Setup incomplete'});
const write=status=>fs.writeFileSync(reportPath,JSON.stringify({...report(status),failure},null,2)+'\n');
const pass=story=>{stories.push(story);write('RUNNING');console.log('PASS '+stories.length+': '+story);};
async function bounded(work,ms){let timer;try{return await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Owned cleanup timed out')),ms);})]);}finally{clearTimeout(timer);}}
write('RUNNING');
try{
 assert(process.execArgv.some(arg=>arg.endsWith('/deny-build-network.cjs')),'Startup network guard required');
 bundle=read(path.join(dir,'page.js'));manifest=JSON.parse(read(path.join(dir,'source-manifest.json')));Object.assign(sourceHashes,manifest.sourceHashes);
 for(const [name,expected]of Object.entries(sourceHashes))assert.equal(hash(read(path.join(root,name))),expected,'Re-bundle changed source: '+name);
 const playwright='/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json';read(playwright);const require=createRequire(playwright),{chromium}=require('playwright');
 const executablePath='/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';fs.statSync(executablePath);
 browser=await chromium.launch({headless:true,timeout:15000,executablePath,env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},args:['--disable-background-networking','--disable-component-update','--no-first-run']});
 async function fixture(){
  const context=await browser.newContext({viewport:{width:320,height:844}});contexts.push(context);const page=await context.newPage();page.setDefaultTimeout(4000);await page.clock.install();
  page.on('pageerror',e=>pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('Failed to load resource:'))consoleErrors.push(m.text());});
  const state={mode:'confirmed',amount:8,replayed:true,gets:0};
  await context.route('**/*',async route=>{try{
   const req=route.request(),url=new URL(req.url());
   if(url.origin!==origin){unexpected.push(req.url());await route.abort();return;}
   if(url.pathname==='/'){await route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><body style="margin:0;background:#171717;color:#eee"><div id="root"></div><script type="module" src="/page.mjs"></script></body></html>'});return;}
   if(url.pathname==='/page.mjs'){await route.fulfill({contentType:'text/javascript',body:bundle});return;}
   if(url.pathname==='/favicon.ico'){await route.fulfill({status:204});return;}
   if(url.pathname!=='/api/thinker'){unexpected.push(req.url());await route.abort();return;}
   assert.equal(req.method(),'GET');assert.deepEqual([...url.searchParams.keys()],['requestId']);const requestId=url.searchParams.get('requestId');assert.match(requestId,/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);assert.equal(req.postData(),null);assert.equal(req.headers().authorization,undefined);assert.equal(req.headers().referer,undefined);
   state.gets++;requests.push({method:'GET',mode:state.mode,requestId,bodyAbsent:true,referrerAbsent:true});
   if(state.mode==='network'){await route.abort();return;}
   let body={status:'confirmed',requestId,amount:state.amount,eventId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',replayed:state.replayed};
   if(state.mode==='unknown')body={status:'unknown',requestId};
   if(state.mode==='wrong-id')body.requestId='ffffffff-ffff-4fff-8fff-ffffffffffff';
   if(state.mode==='bad-event')body.eventId='not-a-uuid';
   if(state.mode==='extra')body.private='PRIVATE_EXTRANEOUS_FIELD';
   await route.fulfill({status:state.mode==='error'?503:200,contentType:'application/json',body:state.mode==='broken'?'{notJSON':JSON.stringify(body)});
  }catch(error){routeErrors.push(error.stack||String(error));try{await route.abort();}catch{}}});
  await page.goto(origin);await page.waitForFunction(()=>window.thinkerRewardQa?.mounted);
  const start=async(amount=8,label='Socrates')=>page.evaluate(({amount,label})=>window.thinkerRewardQa.start(label,amount),{amount,label});
  const finish=async id=>{await page.evaluate(id=>window.thinkerRewardQa.finish(id),id);await page.getByText('Reward unconfirmed.',{exact:false}).waitFor();};
  const unknown=async(amount=8)=>{const id=await start(amount);assert.ok(id);await finish(id);return id;};
  const receipt=(requestId,amount=8,replayed=false)=>({status:'confirmed',requestId,amount,eventId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',replayed});
  const observe=(id,value)=>page.evaluate(({id,value})=>window.thinkerRewardQa.observe(id,value),{id,value});
  const check=()=>page.getByRole('button',{name:'Check reward only',exact:true}).click();
  const settled=()=>page.getByRole('button',{name:'Check reward only',exact:true}).waitFor({state:'visible'}).then(()=>page.waitForFunction(()=>!document.querySelector('aside button')?.disabled));
  const hold=async kind=>{await page.evaluate(kind=>{window.thinkerRewardQa.holdNext=kind;},kind);await check();await page.waitForFunction(()=>window.thinkerRewardQa.held!==null);};
  const release=()=>page.evaluate(()=>window.thinkerRewardQa.release());
  return{page,context,state,start,finish,unknown,receipt,observe,check,settled,hold,release};
 }
 {
  const f=await fixture();assert.equal(f.state.gets,0);assert.equal(await f.page.getByRole('complementary').count(),0);
  const id=await f.start();await f.page.getByRole('status').filter({hasText:'Reward pending.'}).waitFor();assert.equal(f.state.gets,0);await f.finish(id);assert.equal(f.state.gets,0);
  for(const button of await f.page.locator('aside button').all()){const box=await button.boundingBox();assert(box&&box.height>=44&&box.width>=44,'Unknown-state touch targets must be44px');}
  const unknownBox=await f.page.getByRole('complementary').boundingBox();assert(unknownBox&&unknownBox.x>=0&&unknownBox.x+unknownBox.width<=320);
  await f.page.screenshot({path:path.join(root,'verification/web/evidence/thinker-reward-unknown-320.png')});
  const button=f.page.getByRole('button',{name:'Check reward only',exact:true});await button.focus();assert.equal(await button.evaluate(el=>el===document.activeElement),true);await f.page.keyboard.press('Enter');
  await f.page.getByRole('status').filter({hasText:'8 EXP award confirmed.'}).waitFor();assert.equal(f.state.gets,1);assert.equal(await f.page.getByRole('button',{name:'Check reward only',exact:true}).count(),0);
  for(const button of await f.page.locator('aside button').all()){const box=await button.boundingBox();assert(box&&box.height>=44&&box.width>=44,'Confirmed-state touch targets must be44px');}
  const stats=await f.page.evaluate(()=>window.thinkerRewardQa.stats());assert.equal(stats.calls.length,1);for(const c of stats.calls){assert.equal(c.method,'GET');assert.equal(c.cache,'no-store');assert.equal(c.credentials,'same-origin');assert.equal(c.redirect,'error');assert.equal(c.referrerPolicy,'no-referrer');}
  assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await f.page.screenshot({path:path.join(root,'verification/web/evidence/thinker-reward-320.png')});
  pass('actual hook has no automatic lookup; pending→unknown→explicit keyboard GET confirms original replayed8 receipt;GET only, no POST/provider,320px fit and44px unknown/confirmed controls');await f.context.close();
 }
 {
  const f=await fixture(),id=await f.start(4);await f.observe(id,f.receipt(id,8));await f.finish(id);assert.equal(await f.page.getByText('EXP award confirmed.',{exact:false}).count(),0);
  for(const mode of ['wrong-id','bad-event','extra','unknown','error','broken','network']){f.state.mode=mode;f.state.amount=4;await f.check();await f.settled();assert.equal(await f.page.getByText('EXP award confirmed.',{exact:false}).count(),0);assert.equal(await f.page.getByText('PRIVATE_EXTRANEOUS_FIELD',{exact:false}).count(),0);}
  f.state.mode='confirmed';f.state.amount=4;await f.check();await f.page.getByRole('status').filter({hasText:'4 EXP award confirmed.'}).waitFor();
  await f.observe(id,f.receipt(id,8));assert.equal(await f.page.getByText('8 EXP award confirmed.',{exact:false}).count(),0);
  const gets=f.state.gets,live=await f.start(8,'Plato');await f.observe(live,f.receipt(live,8,false));await f.page.getByRole('status').filter({hasText:'8 EXP award confirmed.'}).waitFor();
  await f.observe(live,f.receipt(live,8,true));assert.equal(await f.page.getByRole('status').count(),1);assert.equal(f.state.gets,gets);
  pass('strict request/event/amount/shape matching plus HTTP/JSON/network failures cannot confirm; exact4 manual receipt and valid8 live receipt confirm once, duplicate/replayed stream adds no result or lookup');await f.context.close();
 }
 {
  const f=await fixture(),id=await f.unknown();await f.hold('body');await f.page.evaluate(()=>window.thinkerRewardQa.retire());await f.page.getByRole('complementary').waitFor({state:'detached'});
  assert.equal((await f.page.evaluate(()=>window.thinkerRewardQa.heldState())).aborted,true);await f.observe(id,f.receipt(id));await f.release();await f.page.clock.runFor(1);assert.equal(await f.page.getByRole('complementary').count(),0);assert.equal(f.state.gets,1);
  pass('actual provider-selection retirement aborts held receipt JSON and clears results; late SSE and nonabortable body cannot restore old-account notice or auto-fetch');await f.context.close();
 }
 for(const kind of ['credentials','headers','body']){
  const f=await fixture();await f.unknown();await f.hold(kind);await f.page.clock.fastForward(8001);await f.settled();
  if(kind!=='credentials')assert.equal((await f.page.evaluate(()=>window.thinkerRewardQa.heldState())).aborted,true);
  assert.equal(await f.page.getByText('EXP award confirmed.',{exact:false}).count(),0);assert.equal(f.state.gets,kind==='credentials'?0:1);
  await f.release();await f.page.clock.runFor(1);assert.equal(await f.page.getByText('EXP award confirmed.',{exact:false}).count(),0);
  await f.check();await f.page.getByRole('status').filter({hasText:'8 EXP award confirmed.'}).waitFor();assert.equal(f.state.gets,kind==='credentials'?1:2);
  pass('one8-second deadline covers nonabortable '+kind+'; late result stays unknown, separate manual GET may recover without resend');await f.context.close();
 }
 {
  const f=await fixture(),id=await f.unknown();await f.hold('body');await f.page.evaluate(()=>window.thinkerRewardQa.unmount());await f.page.waitForFunction(()=>!window.thinkerRewardQa.mounted);
  assert.equal((await f.page.evaluate(()=>window.thinkerRewardQa.heldState())).aborted,true);await f.observe(id,f.receipt(id));await f.release();await f.page.clock.runFor(1);assert.equal(await f.page.locator('main').count(),0);
  await f.page.evaluate(()=>window.thinkerRewardQa.show());await f.page.waitForFunction(()=>window.thinkerRewardQa.mounted);assert.equal(await f.page.getByRole('complementary').count(),0);assert.equal(f.state.gets,1);
  pass('unmount aborts and retires held manual receipt and late stream; fresh mount has no old result or automatic request');await f.context.close();
 }
 {
  const f=await fixture();const ids=await f.page.evaluate(()=>{const out=[];for(let i=0;i<33;i++){const id=window.thinkerRewardQa.start('Unresolved '+i,8);out.push(id);if(id)window.thinkerRewardQa.finish(id);}return out;});
  assert(ids.slice(0,32).every(Boolean));assert.equal(ids[32],null);assert.equal(await f.page.getByRole('status').count(),32);await f.page.getByRole('alert').waitFor();assert.equal(f.state.gets,0);
  await f.page.getByRole('button',{name:'Dismiss result',exact:true}).first().click();await f.observe(ids[0],f.receipt(ids[0]));assert.equal(await f.page.getByText('EXP award confirmed.',{exact:false}).count(),0);assert.equal(await f.page.getByRole('alert').count(),0);
  assert.ok(await f.start());assert.equal(await f.page.getByRole('status').count(),32);assert.equal(f.state.gets,0);
  pass('32 unresolved keys bound in-memory results;33rd returns null, dismissal frees one slot and late dismissed receipt cannot restore a success');await f.context.close();
 }
}catch(error){failure=error.stack||String(error);}
finally{
 write(failure?'FAIL':'CLEANING_UP');
 try{if(browser)await bounded(()=>browser.close(),5000);cleanup.status='closed';}catch(error){cleanup.status='failed';cleanup.error=error.message;failure??=error.stack||String(error);}
 // Final acceptance is AFTER owned cleanup and every asynchronous error channel.
 try{assert.deepEqual(unexpected,[]);assert.deepEqual(pageErrors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(routeErrors,[]);for(const[name,expected]of Object.entries(sourceHashes))assert.equal(hash(read(path.join(root,name))),expected,'Source changed during proof: '+name);}catch(error){failure??=error.stack||String(error);}
 write(failure?'FAIL':'PASS');
}
if(failure)throw Error(failure);
console.log('PASS actual Thinker reward Chromium: '+stories.length+' stories; synthetic GET receipts only, no provider/POST/database.');
