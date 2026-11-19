import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const ROOT=process.cwd(),output='verification/web/evidence/published-profile-web-browser.json',sha=b=>createHash('sha256').update(b).digest('hex');
function read(name){const p=path.resolve(ROOT,name),s=fs.lstatSync(p);assert(s.isFile()&&!s.isSymbolicLink()&&(!s.size||s.blocks),'Unavailable input '+name);return fs.readFileSync(p);}
read('verification/web/tests/support/public-profile-app.mjs');
process.chdir(path.join(ROOT,'verification/web'));
const {createPublicProfileApp,publicProfileAppHashes,ORIGIN,TOKENS,SUBJECTS}=await import('../tests/support/public-profile-app.mjs');
const startedAt=new Date().toISOString(),stories=[],errors=[],unexpected=[],http=[],cleanup={browser:'pending',database:'pending'};
let browser,fixture,sourceHashes={},bundle,css,failure=null,stats=null;
const write=status=>fs.writeFileSync(path.join(ROOT,output),JSON.stringify({status,startedAt,completedAt:new Date().toISOString(),stories,errors,unexpected,http,cleanup,sourceHashes,stats,failure,bundleSHA256:bundle?sha(bundle):null,cssSHA256:css?sha(css):null,
 scope:'Actual CircleDetail, conversation, DiscussionBrowser, MessageActions, PublishedProfileLink, QuestCircle/generated host/view and CSS in cached Chromium; canonical HTTP/SQL profile publication and Circle projections. Full link navigations render actual ExplorerProfilePage and publication loader, with cosmetic PublicNav/Footer and Next notFound ports. Browser credentials/SDK/provider, Next Link and HTTP delivery are explicit doubles; no real provider, hosted PostgREST, Next runtime server, headset or physical native device.'},null,2)+'\n');
const pass=name=>{stories.push(name);write('RUNNING');console.log('PASS '+stories.length+': '+name);};
write('RUNNING');
try{
 assert(process.execArgv.some(x=>x.endsWith('/deny-build-network.cjs')),'Startup network guard required');
 const require=createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');read(require.resolve('playwright'));
 const executablePath='/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';read(executablePath);
 const projectRequire=createRequire(path.join(ROOT,'package.json'));
 const {renderToStaticMarkup}=projectRequire('react-dom/server');
 bundle=read('verification/web/evidence/published-profile-web-fixture/page.js');css=read('verification/web/evidence/published-profile-web-fixture/page.css');
 sourceHashes={...JSON.parse(read('verification/web/evidence/published-profile-web-fixture/source-manifest.json')).sourceHashes,...await publicProfileAppHashes()};
 for(const name of ['verification/web/scripts/browser-published-profile-web.mjs','app/explorer/[id]/page.tsx','lib/site/shareCard.ts'])sourceHashes[name]=sha(read(name));
 for(const[name,hash]of Object.entries(sourceHashes))assert.equal(sha(read(name)),hash,'Stale source '+name);
 fixture=await createPublicProfileApp();
 fixture.app.setMock('@/components/PublicNav',()=>({__esModule:true,default:()=>null}));fixture.app.setMock('@/components/PublicFooter',()=>({__esModule:true,default:()=>null}));
 fixture.app.setMock('next/navigation',()=>({notFound(){throw Error('SYNTHETIC_NEXT_NOT_FOUND');}}));
 const publicPage=fixture.app.load('app/explorer/[id]/page.tsx');
 const circleId=await fixture.seedCircle({title:'Published-profile navigation Circle'});await fixture.join(circleId);
 const message=await fixture.post({circleId,content:'A synthetic visible author contribution.'});
 const auth=who=>({Authorization:'Bearer '+TOKENS[who]});
 async function publication(who,visibility){
  const response=await fixture.dispatch('/api/members/profile',{headers:auth(who)});assert.equal(response.status,200);const owner=await response.json();
  const saved=await fixture.dispatch('/api/members/profile',{method:'POST',headers:auth(who),body:{expectedMemberId:owner.memberId,expectedRevision:owner.revision,patch:{...owner.profile,displayName:who==='other'?'Published host':'Published author',bio:'PUBLIC_NAVIGATION_BIO_'+who,visibility}}});
  assert.equal(saved.status,200);return saved.json();
 }
 await publication('other','public');await publication('author','public');
 browser=await require('playwright').chromium.launch({headless:true,timeout:15000,executablePath,env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},args:['--disable-background-networking','--disable-component-update','--no-first-run']});
 const context=await browser.newContext({viewport:{width:320,height:850}}),p=await context.newPage();p.setDefaultTimeout(8000);
 p.on('pageerror',error=>errors.push(error.stack||String(error)));
 p.on('console',message=>{if(message.type()==='error'&&!/^Failed to load resource: the server responded with a status of (400|401|403|404|409|503)/.test(message.text()))errors.push(message.text());});
 await context.route('**/*',async route=>{try{
  const req=route.request(),url=new URL(req.url()),headers=await req.allHeaders();
  if(url.origin!==ORIGIN){unexpected.push(url.origin+url.pathname);await route.abort();return;}
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/page.css"><body style="margin:0;background:#0a0a0a;color:#f5f0e8;font-family:system-ui,sans-serif"><div id="root"></div><script type="module" src="/page.mjs"></script></body></html>'});
  if(url.pathname==='/page.mjs')return route.fulfill({contentType:'text/javascript',body:bundle});
  if(url.pathname==='/page.css')return route.fulfill({contentType:'text/css',body:css});
  const explorer=/^\/explorer\/([0-9a-f-]+)$/.exec(url.pathname);
  if(explorer){
   assert.equal(req.method(),'GET');assert.equal(headers.authorization,undefined);assert.equal(headers.cookie,undefined);assert.equal(headers.referer,undefined);assert.equal(url.search,'');
   let html,status=200;
   try{html=renderToStaticMarkup(await publicPage.default({params:Promise.resolve({id:explorer[1]})}));}
   catch(error){if(error.message!=='SYNTHETIC_NEXT_NOT_FOUND')throw error;status=404;html='<main><h1>Profile unavailable</h1></main>';}
   http.push({path:url.pathname,method:'GET',status,publicNavigation:true,credentialFree:true,referrerFree:true});
   return route.fulfill({status,headers:{'content-type':'text/html','cache-control':'private, no-store'},body:'<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><body>'+html+'</body></html>'});
  }
  if(!url.pathname.startsWith('/api/')){unexpected.push(url.pathname);await route.abort();return;}
  assert.equal(headers.cookie,undefined);assert.equal(headers.apikey,undefined);
  const response=await fixture.dispatch(url.pathname+url.search,{method:req.method(),headers,body:req.postData()??undefined});
  http.push({path:url.pathname+url.search,method:req.method(),status:response.status});
  await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
 }catch(error){errors.push(error.stack||String(error));try{await route.abort();}catch{}}});
 const button=name=>p.getByRole('button',{name,exact:true});
 const settle=()=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 async function show(screen,extra={}){
  await p.goto(ORIGIN);await p.waitForFunction(()=>window.publishedProfileQa);
  await p.evaluate(value=>window.publishedProfileQa.show(value),{screen,circleId,token:TOKENS.author,subject:SUBJECTS.author,...extra});await settle();
 }
 async function currentCircle(){await show('circle');await button('Load current Circle access').click();await p.getByRole('link',{name:'View host’s published profile',exact:true}).waitFor();}
 async function archive(){await show('discussion');await button('Load current discussion archive').click();await p.getByRole('link',{name:'View published profile',exact:true}).first().waitFor();}
 await currentCircle();
 assert.equal(http.filter(x=>x.publicNavigation).length,0,'Profile link must not prefetch');
 await p.getByRole('link',{name:'View host’s published profile',exact:true}).click();await p.getByRole('heading',{name:'Published host',exact:true}).waitFor();
 assert.match(await p.locator('body').innerText(),/PUBLIC_NAVIGATION_BIO_other/);
 assert.doesNotMatch(await p.locator('body').innerText(),/PRIVATE_|supabase_auth_id|profile_revision/);
 pass('Fresh Circle host reference opens the actual published page only on click, with no bearer, cookie, referrer or prefetch.');
 await currentCircle();await publication('other','private');
 await p.getByRole('link',{name:'View host’s published profile',exact:true}).click();await p.getByRole('heading',{name:'Profile unavailable'}).waitFor();
 assert.doesNotMatch(await p.locator('body').innerText(),/Published host|PUBLIC_NAVIGATION/);
 pass('A previously rendered host link rechecks publication on full navigation and withholds the now-private profile.');
 await show('circle');await button('Load current Circle access').click();await p.getByText('Published-profile navigation Circle',{exact:true}).waitFor();
 assert.equal(await p.getByRole('link',{name:'View host’s published profile',exact:true}).count(),0);
 await button('Read circle conversation').click();await p.getByRole('link',{name:'View published profile',exact:true}).first().waitFor();
 await p.getByRole('link',{name:'View published profile',exact:true}).first().click();await p.getByRole('heading',{name:'Published author',exact:true}).waitFor();
 pass('Current private host has no profile link; latest conversation opens a separately published author through the canonical page.');
 await archive();await p.getByRole('link',{name:'View published profile',exact:true}).first().click();await p.getByRole('heading',{name:'Published author',exact:true}).waitFor();
 pass('Discussion archive preserves a visible author publication reference into the shared message card and actual page.');
 await archive();await publication('author','private');await button('Check message actions').first().click();await p.getByText('Current message loaded. Actions use this checked version.',{exact:true}).waitFor();
 assert.equal(await p.getByRole('link',{name:'View published profile',exact:true}).count(),0);await publication('author','public');
 pass('A fresh message-state check removes an older author link when publication has been withdrawn.');
 await show('discussion',{messageId:message.id});await button('Load current thread').click();await p.getByRole('link',{name:'View published profile',exact:true}).first().waitFor();
 await p.evaluate(()=>window.publishedProfileQa.network(false));await settle();assert.equal(await p.getByRole('link',{name:'View published profile',exact:true}).count(),0);
 await p.evaluate(()=>window.publishedProfileQa.network(true));await settle();assert.equal(await p.getByRole('link',{name:'View published profile',exact:true}).count(),0);
 pass('Thread profile links retire with offline private content and do not reappear merely on reconnect.');
 await fixture.hide({circleId,messageId:message.id});await show('discussion');await button('Load current discussion archive').click();await p.getByText('Message hidden from member views.',{exact:true}).first().waitFor();
 assert.equal(await p.getByRole('link',{name:'View published profile',exact:true}).count(),0);
 pass('A hidden contribution retains its tombstone without an author profile link.');
 const next=await fixture.post({circleId,content:'A synthetic Quest profile navigation contribution.'});assert.ok(next.id);
 fixture.setCookieActor('author');await show('quest');await button('Connect signed-in account').click();await button('Check member session').click();
 await p.waitForFunction(()=>!document.getElementById('circle-refresh').disabled);await p.locator('#circle-refresh').click();await p.locator('#circle-messages a[href^="/explorer/"]').first().waitFor();
 await p.screenshot({path:path.join(ROOT,'verification/web/evidence/published-profile-quest-320.png'),fullPage:true});
 await p.locator('#circle-messages a[href^="/explorer/"]').first().click();await p.getByRole('heading',{name:'Published author',exact:true}).waitFor();
 pass('Actual Quest Browser composition opens a latest-message author profile through the regular published page.');
 fixture.setCookieActor('author');await show('quest');await button('Connect signed-in account').click();await button('Check member session').click();await p.waitForFunction(()=>!document.getElementById('circle-refresh').disabled);await p.locator('#circle-refresh').click();await p.locator('#circle-messages a[href^="/explorer/"]').first().waitFor();
 fixture.beforeHttp(({path,method})=>path.startsWith('/api/book-salons/')&&method==='POST'?Response.json({error:'Synthetic lost legacy reply'},{status:503}):null);
 await p.locator('#circle-draft').fill('Synthetic uncertain legacy post');await p.locator('#circle-post').click();
 await p.waitForFunction(()=>document.getElementById('circle-write-status').textContent.includes('Could not confirm whether'));
 assert.equal(await p.locator('#circle-messages a[href^="/explorer/"]').count(),0);assert.equal(await p.locator('#circle-refresh').isEnabled(),true);
 fixture.beforeHttp(null);await p.locator('#circle-refresh').click();await p.locator('#circle-new').waitFor();await p.locator('#circle-new').click();await p.locator('#circle-messages a[href^="/explorer/"]').first().waitFor();
 pass('An unconfirmed Quest legacy post hides profile navigation while preserving manual conversation review and explicit recovery.');

 fixture.setCookieActor('author');await show('quest');await button('Connect signed-in account').click();await button('Check member session').click();await p.waitForFunction(()=>!document.getElementById('circle-refresh').disabled);
 await p.locator('#circle-archive-open').click();await p.locator('#circle-archive-messages a[href^="/explorer/"]').first().waitFor();
 await publication('author','private');await p.locator('#circle-archive-messages a[href^="/explorer/"]').first().click();await p.getByRole('heading',{name:'Profile unavailable'}).waitFor();
 pass('Quest archive links also recheck current publication rather than retaining the earlier public profile.');
 for(const profileId of [null,'not-a-member-id','https://outside.invalid','AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA']){
  await show('link',{profileId});assert.equal(await p.getByRole('link').count(),0);
 }
 pass('Absent, malformed, external and noncanonical publication references produce no navigation.');
 await p.evaluate(()=>window.publishedProfileQa.unmount());await settle();stats=await p.evaluate(()=>window.publishedProfileQa.stats());assert.deepEqual(stats,{subscriptions:0});
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 for(const[name,hash]of Object.entries(sourceHashes))assert.equal(sha(read(name)),hash,'Source changed during proof '+name);
 await context.close();
}catch(error){failure=error.stack||String(error);write('FAIL');console.error(failure);}
finally{
 if(browser){await browser.close();cleanup.browser='closed';}
 if(fixture){await fixture.close();cleanup.database='closed';}
 write(failure?'FAIL':'PASS');
}
if(failure)process.exitCode=1;
