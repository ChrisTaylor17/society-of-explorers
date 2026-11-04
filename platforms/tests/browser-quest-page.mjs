// Actual product QuestCircle TSX, React, auth bridge and platform DOM host.
// SDK methods/API replies/Next Link/CSS are explicit non-issued test adapters.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../../',import.meta.url)),require=createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json'),{chromium}=require('playwright');
const origin='https://quest-page-fixture.test',subject='11111111-1111-4111-8111-111111111111',member='22222222-2222-4222-8222-222222222222',circle='44444444-4444-4444-8444-444444444444';
const item=(id,extra={})=>({id,member_name:'Fictional Reader',content:'CURRENT_PRIVATE_CONTRIBUTION',created_at:'2026-11-04T10:00:00Z',is_mine:false,visibility:'visible',parentMessageId:null,rootMessageId:id,...extra});
const items=Array.from({length:25},(_,i)=>item(`${String(i+1).padStart(8,'0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`));
let selected='supabase',hold=false,release=null,held=false;
const requests=[],unexpected=[],errors=[],stories=[];
const bundle=fs.readFileSync(path.join(root,'platforms/evidence/quest-page-fixture/page.mjs'));
const html='<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><style>[hidden]{display:none}body{margin:0;background:#101d1a;color:#eee}main{max-width:900px;padding:20px;overflow-wrap:anywhere}button{min-height:48px}textarea{width:100%}article{padding:12px 0}</style><div id="root"></div><script type="module" src="/page.mjs"></script></html>';
const browser=await chromium.launch({headless:true,executablePath:'/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},args:['--disable-background-networking','--disable-component-update','--no-first-run']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin){unexpected.push(request.url());await route.abort();return;}
  if(url.pathname==='/'){await route.fulfill({status:200,contentType:'text/html',body:html});return;}
  if(url.pathname==='/page.mjs'){await route.fulfill({status:200,contentType:'text/javascript',body:bundle});return;}
  if(url.pathname==='/api/auth/member'){
   assert.equal(url.search,'');assert.equal(request.method(),'GET');assert.equal(request.headers().authorization,undefined);requests.push({kind:'member',selected});
   await route.fulfill({status:200,contentType:'application/json',headers:{'Cache-Control':'private,no-store'},body:JSON.stringify({member:{id:member,supabase_auth_id:subject,display_name:'Fictional Reader'},auth:{provider:selected,subject:selected==='supabase'?subject:member}})});return;
  }
  if(url.pathname===`/api/circles/${circle}/discussion`){
   assert.equal(request.method(),'GET');assert.equal(request.headers().authorization,'Bearer NONISSUED_QUEST_PAGE_FIXTURE');requests.push({kind:'archive',query:url.search});
   if(hold){held=true;await new Promise(r=>release=r);try{await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({kind:'archive',circleId:circle,limit:25,nextCursor:null,items:[item(member,{content:'STALE_PRIVATE_RESPONSE_MUST_STAY_CLEARED'})]})});}catch(error){if(!request.failure())throw error;}return;}
   const body=url.searchParams.has('before')?{kind:'archive',circleId:circle,limit:25,nextCursor:null,items:[item(member,{content:'OLDER_PRIVATE_CONTRIBUTION'})]}:{kind:'archive',circleId:circle,limit:25,nextCursor:items.at(-1).id,items};
   await route.fulfill({status:200,contentType:'application/json',headers:{'Cache-Control':'private,no-store'},body:JSON.stringify(body)});return;
  }
  unexpected.push(request.url());await route.abort();
 });
 await page.goto(origin+'/');await page.bringToFront();await page.getByRole('button',{name:'Connect signed-in account',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.questQa.factories()),0);assert.equal(await page.evaluate(()=>window.questQa.providerCalls()),0);assert.equal(requests.length,0);stories.push('actual QuestCircle mount performs no SDK construction, provider method or private request');
 const connect=async()=>{await page.getByRole('button',{name:'Connect signed-in account',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('member-session-check').disabled);};
 const check=async()=>{await page.locator('#member-session-check').click();};
 await connect();assert.equal(await page.evaluate(()=>window.questQa.factories()),1);assert.equal(await page.evaluate(()=>window.questQa.providerCalls()),0);assert.equal(requests.length,0);stories.push('explicit Connect constructs only the test SDK; Check remains a separate action');
 await check();await page.waitForFunction(()=>!document.getElementById('circle-archive-open').disabled);assert.equal(requests.filter(r=>r.kind==='archive').length,0);assert.equal(requests.filter(r=>r.kind==='member').length,1);stories.push('manual Check requires matching selected-cookie metadata before Circle controls enable');
 await page.locator('#circle-archive-open').click();await page.waitForFunction(()=>document.querySelectorAll('#circle-archive-messages article').length===25);await page.locator('#circle-archive-next').click();await page.getByText('OLDER_PRIVATE_CONTRIBUTION',{exact:true}).waitFor();assert.equal(requests.filter(r=>r.kind==='archive').length,2);stories.push('actual component and platform host load archive 25 then older cursor page after renewed subject verification');
 const cleared=await page.evaluate(()=>{window.questQa.providerChanged();return document.getElementById('circle-archive-messages').textContent===''&&document.getElementById('circle-draft').value==='';});assert.equal(cleared,true);assert.equal(await page.evaluate(()=>window.questQa.subscriptions()),0);stories.push('actual shared account-selection event synchronously clears private DOM and detaches SDK observation');
 selected='wallet';await connect();await check();await page.waitForFunction(()=>document.getElementById('member-session-status').textContent.includes('Could not confirm'));assert.equal(await page.locator('#circle-archive-open').isDisabled(),true);assert.equal(requests.filter(r=>r.kind==='archive').length,2);stories.push('selected wallet refuses the retained Google SDK subject before any private Circle request');
 await page.evaluate(()=>window.questQa.providerChanged());selected='supabase';await connect();await check();await page.waitForFunction(()=>!document.getElementById('circle-archive-open').disabled);
 hold=true;await page.locator('#circle-archive-open').click({noWaitAfter:true});for(let i=0;i<100&&!held;i++)await new Promise(r=>setTimeout(r,5));assert.equal(held,true);
 await page.evaluate(()=>window.questQa.providerChanged());release();await page.waitForTimeout(50);assert.equal(await page.locator('#circle-archive-messages').innerText(),'');assert.doesNotMatch(await page.locator('body').innerText(),/STALE_PRIVATE_RESPONSE_MUST_STAY_CLEARED/);assert.equal(await page.evaluate(()=>window.questQa.subscriptions()),0);stories.push('account retirement while an actual fetch is held fences its late private response');
 await page.evaluate(()=>window.questQa.unmount());assert.equal(await page.evaluate(()=>window.questQa.subscriptions()),0);assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
 const report={status:'PASS',stories,requests,unexpected,errors,scope:'Actual product QuestCircle TSX/React/auth bridge/platform DOM with test-only SDK, Next Link and CSS adapters; HTTPS requests intercepted locally; no issued credentials, real provider, headset or native-device proof',bundleSHA256:createHash('sha256').update(bundle).digest('hex')};
 fs.writeFileSync(path.join(root,'platforms/evidence/quest-page-browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}
