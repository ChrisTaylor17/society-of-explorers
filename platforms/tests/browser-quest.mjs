// Real Chromium DOM/fetch with intercepted non-issued auth/API fixtures.
// This does not execute Supabase Auth, WebXR, a native bridge or a headset.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),require=createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
const {chromium}=require('playwright'),origin='https://platform-fixture.invalid',circle='11111111-1111-4111-8111-111111111111',threadRoot='22222222-2222-4222-8222-222222222222',child='33333333-3333-4333-8333-333333333333',older='44444444-4444-4444-8444-444444444444';
const item=(id,extra={})=>({id,member_name:'Fictional Reader',content:'SYNTHETIC_ARCHIVE_CONTRIBUTION',created_at:'2026-11-04T10:00:00Z',is_mine:false,visibility:'visible',parentMessageId:null,rootMessageId:id,...extra});
const items=Array.from({length:25},(_,i)=>item(`${String(i+1).padStart(8,'0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`));
const bootstrap=`
import {mountExistingMemberCircle} from './member-circle-page.mjs';
const subscribers=new Set();let calls=0;
const auth={async getSession(){calls++;return{data:{session:{access_token:'NONISSUED_FIXTURE',user:{id:'fictional-reader'}}}}},async getUser(jwt){calls++;if(jwt!=='NONISSUED_FIXTURE')throw Error('Unexpected fixture token');return{data:{user:{id:'fictional-reader'}}}},onAuthStateChange(fn){subscribers.add(fn);return{data:{subscription:{unsubscribe(){subscribers.delete(fn)}}}}}};
const config={origin:location.origin,circleId:'${circle}',auth};
window.fixture={calls:()=>calls,subscriptions:()=>subscribers.size,emit(event){for(const fn of subscribers)fn(event,null);},tryMount(){return mountExistingMemberCircle({window,document,config})}};
window.mounted=window.fixture.tryMount();
`;
const original=fs.readFileSync(path.join(root,'platforms/quest/circle.html'),'utf8'),html=original.replace('<script type="module" src="./circle-page.mjs"></script>',`<script type="module">${bootstrap}</script>`);
const requests=[],unexpected=[],stories=[],errors=[];
const browser=await chromium.launch({headless:true,executablePath:'/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},args:['--disable-background-networking','--disable-component-update','--no-first-run']});
try{
 const page=await browser.newPage({viewport:{width:320,height:780}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin){unexpected.push(request.url());await route.abort();return;}
  if(url.pathname==='/circle.html'){await route.fulfill({status:200,contentType:'text/html',body:html});return;}
  if(url.pathname.startsWith(`/api/circles/${circle}/discussion`)){
   assert.equal(request.method(),'GET');assert.equal(request.headers().authorization,'Bearer NONISSUED_FIXTURE');requests.push(url.pathname+url.search);
   let body;
   if(url.searchParams.has('message')){
    body={kind:'thread',circleId:circle,limit:25,nextCursor:null,root:item(threadRoot,{visibility:'hidden',content:null}),focus:item(url.searchParams.get('message'),{rootMessageId:threadRoot,parentMessageId:threadRoot,content:'FOCUS_OUTSIDE_PAGE'}),items:[item(child,{rootMessageId:threadRoot,parentMessageId:threadRoot,content:'INDEPENDENT_REPLY'})]};
   }else if(url.searchParams.has('before')){assert.equal(url.searchParams.get('before'),items.at(-1).id);body={kind:'archive',circleId:circle,limit:25,nextCursor:null,items:[item(older,{content:'OLDER_THAN_LATEST_100'})]};}
   else body={kind:'archive',circleId:circle,limit:25,nextCursor:items.at(-1).id,items};
   await route.fulfill({status:200,contentType:'application/json',headers:{'Cache-Control':'no-store'},body:JSON.stringify(body)});return;
  }
  const name=url.pathname.slice(1),allowed=['member-circle-page.mjs','circle-view.mjs','circle-host.mjs','quest.css'];
  if(allowed.includes(name)){await route.fulfill({status:200,contentType:name.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(path.join(root,'platforms/quest',name))});return;}
  unexpected.push(request.url());await route.abort();
 });
 await page.goto(origin+'/circle.html');await page.bringToFront();await page.waitForFunction(()=>Boolean(window.mounted));
 assert.equal(await page.evaluate(()=>window.fixture.calls()),0);assert.equal(requests.length,0);stories.push('deferred provider verification: mount makes zero auth methods or API calls');
 await page.getByRole('button',{name:'Check member session',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('circle-archive-open').disabled);
 assert.ok(await page.evaluate(()=>window.fixture.calls())>=2);assert.equal(requests.length,0);stories.push('explicit fake provider verification alone does not load private discussion');
 await page.getByRole('button',{name:'Open complete discussion archive',exact:true}).click();await page.waitForFunction(()=>document.getElementById('circle-archive-messages').querySelectorAll('article').length===25);
 assert.equal(await page.locator('#circle-composer').isVisible(),false);await page.getByRole('button',{name:'Older messages',exact:true}).click();await page.getByText('OLDER_THAN_LATEST_100',{exact:true}).waitFor();assert.equal(requests.length,2);stories.push('actual archive controls load bounded pages and older-than-100 contribution through canonical cursor');
 await page.getByRole('button',{name:'Open thread',exact:true}).click();await page.getByText('FOCUS_OUTSIDE_PAGE',{exact:true}).waitFor();await page.getByText('INDEPENDENT_REPLY',{exact:true}).waitFor();await page.getByText('This contribution is restricted by moderation.',{exact:true}).waitFor();stories.push('thread shows held root tombstone, independent reply and selected focus outside reply page');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);await page.screenshot({path:path.join(root,'platforms/evidence/quest-archive-320.png'),fullPage:true});stories.push('320px actual browser page fits without horizontal overflow');
 await page.evaluate(()=>window.fixture.emit('SIGNED_OUT'));assert.equal(await page.locator('#circle-archive-messages').innerText(),'');assert.equal(await page.locator('#circle-draft').inputValue(),'');assert.equal(requests.length,3);stories.push('synchronous fake signout clears archive and composer with no automatic read');
 await page.evaluate(()=>{document.getElementById('circle-archive-status').remove();window.mounted.dispose();});assert.equal(await page.evaluate(()=>window.fixture.subscriptions()),0);
 const result=await page.evaluate(()=>{const calls=window.fixture.calls();try{window.fixture.tryMount();return{threw:false};}catch{return{threw:true,callsSame:calls===window.fixture.calls(),subscriptions:window.fixture.subscriptions()};}});
 assert.deepEqual(result,{threw:true,callsSame:true,subscriptions:0});stories.push('missing markup fails before attaching provider subscription; disposal removes existing subscription');
 assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
 const report={status:'PASS',stories,requests,unexpected,errors,scope:'Actual Chromium DOM/fetch with non-issued intercepted auth/API fixtures; no SDK, headset, WebXR or native-device acceptance',sharedBundleSHA256:(await import('node:crypto')).createHash('sha256').update(fs.readFileSync(path.join(root,'platforms/quest/circle-host.mjs'))).digest('hex')};
 fs.writeFileSync(path.join(root,'platforms/evidence/quest-browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}
