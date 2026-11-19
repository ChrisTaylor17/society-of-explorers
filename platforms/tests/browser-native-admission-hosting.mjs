import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const ROOT=process.cwd(),[run,...extra]=process.argv.slice(2);assert(run&&!extra.length&&/^[a-z0-9-]{1,48}$/.test(run));
assert(process.execArgv.some(v=>v.endsWith('/deny-build-network.cjs')));
const dir=path.join(ROOT,'verification/web/evidence/native-admission-hosting-fixture-'+run),out=path.join(ROOT,'verification/web/evidence/native-admission-hosting-browser-'+run+'.json');assert(!fs.existsSync(out));
const sha=b=>createHash('sha256').update(b).digest('hex'),sourceHashes=JSON.parse(fs.readFileSync(path.join(dir,'source-manifest.json'))).sourceHashes;
sourceHashes['platforms/tests/browser-native-admission-hosting.mjs']=sha(fs.readFileSync(new URL(import.meta.url)));
const stories=[],http=[],errors=[],unexpected=[],cleanup={browser:false,database:false};let fixture,browser,page,failure,lost=false;
const write=status=>fs.writeFileSync(out,JSON.stringify({status,stories,http,errors,unexpected,cleanup,sourceHashes,failure,scope:'Actual CircleHostingScreen/shared hosting controller/native JS bridge ports in React DOM/Chromium. iOS/Android names select explicit React Native primitives/AppState/platform/bridge/owner doubles. Actual canonical route handlers and current PGlite SQL; no installed app, provider or native network/storage acceptance.'},null,2)+'\n');
const pass=label=>{stories.push(label);console.log('PASS '+stories.length+': '+label);write('RUNNING');};
try{
 for(const[name,hash]of Object.entries(sourceHashes))assert.equal(sha(fs.readFileSync(path.join(ROOT,name))),hash,name);
 process.chdir(path.join(ROOT,'verification/web'));const {admissionApp,IDS}=await import('../../verification/web/tests/support/circle-admission-app.mjs');
 const require=createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
 browser=await require('playwright').chromium.launch({headless:true,timeout:15000,executablePath:'/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},args:['--disable-background-networking','--disable-component-update','--no-first-run']});
 const context=await browser.newContext({viewport:{width:390,height:850},serviceWorkers:'block'});page=await context.newPage();page.setDefaultTimeout(6500);page.on('pageerror',e=>errors.push(String(e)));
 await context.route('**/*',async route=>{try{
  const req=route.request(),url=new URL(req.url());if(url.origin!=='https://offline.invalid'){unexpected.push(url.origin+url.pathname);await route.abort();return;}
  if(url.pathname==='/'){await route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#0b1018"><div id="root"></div><script src="/fixture.js"></script></body></html>'});return;}
  if(url.pathname==='/fixture.js'){await route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(dir,'page.js'))});return;}
  if(url.pathname==='/favicon.ico'){await route.fulfill({status:204});return;}
  assert(fixture);fixture.setActor(IDS.newcomer);const headers=await req.allHeaders();assert.equal(headers.cookie,undefined);assert.equal(headers.apikey,undefined);assert.equal(headers.authorization,'Bearer NONISSUED_SYNTHETIC_NATIVE');
  if(url.pathname==='/api/auth/member'){await route.fulfill({contentType:'application/json',body:JSON.stringify({member:{id:IDS.newcomer,supabase_auth_id:IDS.newcomer,display_name:'Synthetic phone host'},auth:{provider:'supabase',subject:IDS.newcomer}})});return;}
  assert(/^\/api\/circles(?:\/start|\/[a-f0-9-]+)?$/.test(url.pathname),'Unexpected API path');const body=req.postData()?JSON.parse(req.postData()):undefined;
  const entry={path:url.pathname,method:req.method(),admissionMode:body?.admissionMode??null,bodySha256:sha(req.postData()??''),status:null};http.push(entry);
  const result=await fixture.dispatch(url.pathname,req.method(),body);entry.status=result.status;
  if(lost&&url.pathname==='/api/circles'&&req.method()==='POST'&&result.status===200){lost=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic lost post-commit reply',outcome:'unknown'})});return;}
  await route.fulfill({status:result.status,contentType:'application/json',body:await result.text()});
 }catch(e){errors.push(String(e));try{await route.abort();}catch{}}});
 await page.goto('https://offline.invalid');await page.waitForFunction(()=>window.nativeAdmissionQa);
 const button=name=>page.getByRole('button',{name,exact:true});
 const waitPhase=phase=>page.waitForFunction(phase=>window.nativeAdmissionQa.model()?.phase===phase,phase);
 async function show(platform,capability){if(fixture)await fixture.close();fixture=await admissionApp();await page.evaluate(value=>window.nativeAdmissionQa.show(value),{platform,capability,memberId:IDS.newcomer});await page.waitForFunction(()=>window.nativeAdmissionQa.model()?.connected&&window.nativeAdmissionQa.model()?.online&&window.nativeAdmissionQa.model()?.active);}
 async function fill(){await button('Check hosting access').click();await waitPhase('editing');
  await page.getByLabel('Circle name',{exact:true}).fill('Phone host approval salon');await page.getByRole('radio',{name:'Online',exact:true}).click();
  await page.getByLabel('Private meeting link (HTTPS)',{exact:true}).fill('https://meeting.fixture.invalid/native-screen');
  await page.getByLabel('Start on or after (YYYY-MM-DD)',{exact:true}).fill(new Date(Date.now()+2*86400000).toISOString().slice(0,10));
  await page.getByRole('radio',{name:/ · UTC$/}).click();await page.getByRole('radio',{name:'Host approval required',exact:true}).click();
  await page.getByRole('checkbox',{name:'I agree to the community norms and to host this free Circle',exact:true}).click();
  await button('Review Circle listing').click();await waitPhase('review');assert.match(await page.locator('body').innerText(),/Only people you approve can join/);}
 for(const platform of ['ios','android']){
  await show(platform,true);await fill();assert.equal((await fixture.db.query('SELECT count(*)::int n FROM book_cohorts WHERE created_by=$1',[IDS.newcomer])).rows[0].n,0);
  await page.getByRole('checkbox',{name:'Create this free Circle with my account',exact:true}).click();const old=await page.evaluate(()=>window.nativeAdmissionQa.retain('Confirm and list Circle'));
  await page.evaluate(()=>window.nativeAdmissionQa.activity('background'));await page.waitForFunction(()=>!document.querySelector('input'));await page.evaluate(()=>window.nativeAdmissionQa.activity('active'));
  await fill();await page.screenshot({path:path.join(dir,platform+'-review.png'),fullPage:true});await page.getByRole('checkbox',{name:'Create this free Circle with my account',exact:true}).click();const before=http.length;await page.evaluate(id=>window.nativeAdmissionQa.invoke(id),old);await page.waitForTimeout(40);assert.equal(http.length,before);
  lost=true;await button('Confirm and list Circle').click();await waitPhase('unknown');await button('Check hosting access').click();await waitPhase('unknown');await button('Review exact Circle creation retry').click();await waitPhase('review');
  assert.match(await page.locator('body').innerText(),/Only people you approve can join/);await page.getByRole('checkbox',{name:'Create this free Circle with my account',exact:true}).click();await button('Confirm exact Circle creation retry').click();await waitPhase('created');
  const rows=(await fixture.db.query('SELECT circle_admission_mode FROM book_cohorts WHERE created_by=$1',[IDS.newcomer])).rows;assert.equal(rows.length,1);assert.equal(rows[0].circle_admission_mode,'host_approval');
  const posts=http.filter(r=>r.path==='/api/circles'&&r.method==='POST').slice(-2);assert.equal(posts[0].bodySha256,posts[1].bodySha256);assert.equal(posts[0].admissionMode,'host_approval');assert.equal(posts[1].admissionMode,'host_approval');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(dir,platform+'-created.png'),fullPage:true});
  pass(platform+' simulated native screen preserves private mode through review/background retirement/stale callback/lost reply/exact retry, creates once and fits390px.');
 }
 await show('android',false);await button('Check hosting access').click();await waitPhase('editing');assert(await page.getByRole('radio',{name:'Host approval required',exact:true}).isDisabled());assert.equal(await page.getByRole('radio',{name:'Open joining',exact:true}).getAttribute('aria-checked'),'true');
 pass('Older native capability keeps host approval disabled while open joining remains available.');
 await page.evaluate(()=>window.nativeAdmissionQa.close());assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 for(const[name,hash]of Object.entries(sourceHashes))assert.equal(sha(fs.readFileSync(path.join(ROOT,name))),hash,'Source changed '+name);
}catch(e){failure=e.stack||String(e);if(page){try{failure+='\n'+(await page.locator('body').innerText()).slice(-1500);}catch{}}throw e;}finally{
 if(browser){await browser.close();cleanup.browser=true;}if(fixture){await fixture.close();cleanup.database=true;}write(failure?'FAIL':'PASS');
}
