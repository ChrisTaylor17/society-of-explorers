// Actual component → actual canonical API → actual SQL. Identity is explicitly
// synthetic; all HTTPS requests are fulfilled locally without DNS/provider use.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createBookSalonHttpFixture, bookSalonRequest } from './support/book-salon-http-fixture.mjs';
import { IDS, CIRCLE_SQL_CHAIN, LIVE_CATALOG_SHA256, LIVE_FIXTURE_EXCEPTIONS } from './support/circle-live-db.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url)),evidence=path.join(root,'verification/web/evidence');
const fixtureDir=path.join(evidence,'legacy-salon-fixture'),origin='https://salon-composed.test';
const salonId='33333333-3333-4333-8333-333333333333',endpoint=`/api/book-salons/${salonId}`;
const manifest=JSON.parse(fs.readFileSync(path.join(fixtureDir,'source-manifest.json'),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=[...new Set([...Object.keys(manifest.sourceHashes),...CIRCLE_SQL_CHAIN,
  'docs/sql/circle-legacy-baseline-preflight.sql','docs/sql/circle-legacy-baseline-apply.sql',
  'docs/sql/book-salon-conversation.sql','app/api/book-salons/[cohortId]/route.ts','app/api/auth/member/route.ts',
  'lib/book-salons/conversation.ts','lib/http/routeError.ts',
  'verification/web/tests/support/circle-live-db.mjs','verification/web/tests/support/book-salon-http-fixture.mjs',
  'verification/web/tests/fixtures/circle-live-catalog-2026-11-04.json',
  'verification/web/tests/browser-legacy-salon-composed.mjs','verification/web/scripts/deny-build-network.cjs',
])];
const sourceHashes=()=>Object.fromEntries(files.map(name=>[name,hash(fs.readFileSync(path.join(root,name)))]));
const beforeHashes=sourceHashes();
for(const [name,expected] of Object.entries(manifest.sourceHashes))assert.equal(beforeHashes[name],expected,'Re-bundle changed source: '+name);
const bundle=fs.readFileSync(path.join(fixtureDir,'page.js'));
const css=fs.readFileSync(path.join(fixtureDir,fs.readdirSync(fixtureDir).find(name=>name.endsWith('.css'))));
assert.throws(()=>fetch('https://fixture.invalid/never-send'),/EXTERNAL_NETWORK_DISABLED_IN_PRIVATE_BUILD/);
const cleanup=[],f=await createBookSalonHttpFixture({after:fn=>cleanup.push(fn)},{salonId,actorBMembership:true});
const require=createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
const {chromium}=require('playwright');
const requests=[],stories=[],errors=[],unexpected=[],routeErrors=[];
const postCalls=()=>f.calls.filter(c=>c.kind==='rpc'&&c.name==='soe_book_salon_messages_post').length;
const readCalls=()=>f.calls.filter(c=>c.kind==='rpc'&&c.name==='soe_book_salon_messages_read').length;
let selected='A',holdPost=false,holdFresh=false,postHeld=false,freshHeld=false,releasePost,releaseFresh,changeOnPost=false,failure=null;
const reportPath=path.join(evidence,'legacy-salon-composed-browser.json');
const browser=await chromium.launch({headless:true,
  executablePath:'/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},
  args:['--disable-background-networking','--disable-component-update','--no-first-run']});
try {
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
  page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
    try {
      const request=route.request(),url=new URL(request.url());
      if(url.origin!==origin){unexpected.push(url.origin+url.pathname);await route.abort();return;}
      if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/page.css"></head><body><div id="root"></div><script type="module" src="/page.mjs"></script></body></html>'});
      if(url.pathname==='/page.mjs')return route.fulfill({contentType:'text/javascript',body:bundle});
      if(url.pathname==='/page.css')return route.fulfill({contentType:'text/css',body:css});
      assert.equal(request.headers().authorization,undefined,'Explicit selected wallet fixture uses no SDK bearer');
      const req=bookSalonRequest(undefined,{method:request.method(),raw:request.postData()??undefined,url:request.url(),headers:request.headers()});
      let response;
      if(url.pathname==='/api/auth/member')response=await f.memberRoute.GET(req);
      else if(url.pathname===endpoint){
        assert.equal(request.headers().referer,undefined);
        if(request.method()==='POST'){
          if(changeOnPost){changeOnPost=false;selected='B';f.setActor(IDS.reviewer);}
          response=await f.route.POST(req,{params:Promise.resolve({cohortId:salonId})});
          if(holdPost&&response.status===200){holdPost=false;postHeld=true;await new Promise(resolve=>{releasePost=resolve;});postHeld=false;}
        }else{
          assert.equal(request.method(),'GET');response=await f.route.GET(req,{params:Promise.resolve({cohortId:salonId})});
          if(holdFresh&&postCalls()>0){holdFresh=false;freshHeld=true;await new Promise(resolve=>{releaseFresh=resolve;});freshHeld=false;}
        }
      }else{unexpected.push(url.pathname);await route.abort();return;}
      const bytes=Buffer.from(await response.arrayBuffer()),body=JSON.parse(bytes.toString());
      requests.push({path:url.pathname,method:request.method(),status:response.status,selected,
        ...(request.method()==='POST'?{outcome:body.outcome}:{}),privateNoStore:/private.*no-store/.test(response.headers.get('cache-control')??'')});
      if(url.pathname===endpoint)assert.doesNotMatch(JSON.stringify(body),/member_id|sender_name|sender_type|passage_reference|PRIVATE_SQL_DETAILS/);
      await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:bytes});
    }catch(error){routeErrors.push(error.message);try{await route.abort();}catch{}}
  });
  const status=text=>page.getByRole('status').filter({hasText:text}).waitFor();
  const loaded=()=>status('Public discussion loaded.');
  const reload=async()=>{await page.getByRole('button',{name:'Reload discussion',exact:true}).click();await loaded();};
  const prepare=async()=>{await page.getByRole('button',{name:'Prepare to post',exact:true}).click();await page.getByLabel('Your public message',{exact:true}).waitFor();};
  const waitFlag=async getter=>{for(let n=0;n<1000&&!getter();n++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(getter(),true);};
  await page.goto(origin);await loaded();
  assert.equal(requests.filter(r=>r.path==='/api/auth/member').length,0);
  assert.equal(await page.evaluate(()=>window.salonQa.sdkCalls),0);
  assert.equal(await page.getByLabel('Your public message',{exact:true}).count(),0);
  assert.match(await page.locator('main').innerText(),/2 total members/);
  assert.match(await page.getByRole('complementary',{name:'Published member profiles'}).innerText(),/Published profiles \(0\)/);
  const history=page.getByRole('region',{name:'Public message history'});
  assert.equal(await history.locator('article').count(),3);
  assert.match(await history.innerText(),/Unattributed message/);
  assert.doesNotMatch(await page.locator('main').innerText(),/Synthetic host|Synthetic reviewer|legacy member label|legacy thinker label|\(you\)/);
  stories.push('Actual component initial public GET executes canonical API and service-only SQL with three preserved historical messages, two total members and zero published profiles; no explicit identity request, SDK lookup or editable draft');

  // Controlled owner-side fixture changes exercise the real roster predicate;
  // this story does not claim an owner profile API/publication migration proof.
  await f.db.query("UPDATE members SET profile_visibility='public',display_name='Published composed host' WHERE id=$1",[IDS.host]);
  await reload();
  assert.match(await page.getByRole('complementary',{name:'Published member profiles'}).innerText(),/Published profiles \(1\)[\s\S]*Published composed host/);
  assert.doesNotMatch(await page.getByRole('complementary',{name:'Published member profiles'}).innerText(),/Synthetic reviewer/);
  await f.db.query("UPDATE members SET profile_visibility='private' WHERE id=$1",[IDS.host]);
  await reload();
  assert.match(await page.getByRole('complementary',{name:'Published member profiles'}).innerText(),/Published profiles \(0\)/);
  assert.doesNotMatch(await page.getByRole('complementary',{name:'Published member profiles'}).innerText(),/Published composed host/);
  assert.match(await page.locator('main').innerText(),/2 total members/);
  stories.push('Controlled synthetic private→public→private database changes flow through actual SQL/API GET and component reload; only the published display appears and total membership remains separately two');

  await prepare();
  const draft=page.getByLabel('Your public message',{exact:true});
  await draft.fill('COMPOSED_CONFIRMED_PUBLIC_MESSAGE');
  holdPost=true;holdFresh=true;
  await page.getByRole('button',{name:'Post public message',exact:true}).click();
  await waitFlag(()=>postHeld);
  assert.equal(postCalls(),1);
  assert.equal((await f.db.query('SELECT count(*)::int AS n FROM seminar_messages WHERE cohort_id=$1 AND content=$2',[salonId,'COMPOSED_CONFIRMED_PUBLIC_MESSAGE'])).rows[0].n,1);
  assert.doesNotMatch(await history.innerText(),/COMPOSED_CONFIRMED_PUBLIC_MESSAGE/);
  assert.doesNotMatch(await page.getByRole('status').innerText(),/Posted and confirmed/);
  releasePost();releasePost=null;
  await waitFlag(()=>freshHeld);
  assert.doesNotMatch(await page.getByRole('status').innerText(),/Posted and confirmed/);
  releaseFresh();releaseFresh=null;
  await status('Posted and confirmed in public history.');
  assert.equal(await draft.inputValue(),'');
  assert.match(await history.innerText(),/Published composed host \(you\)[\s\S]*COMPOSED_CONFIRMED_PUBLIC_MESSAGE/);
  const postIndex=requests.findIndex(r=>r.path===endpoint&&r.method==='POST'&&r.status===200);
  assert.ok(postIndex>=0&&requests.slice(postIndex+1).some(r=>r.path===endpoint&&r.method==='GET'&&r.status===200));
  stories.push('Explicit Prepare loads actual private member metadata; real POST commits one SQL message but the component shows no optimistic result or success until the separately held fresh GET matches the actual receipt');

  await draft.fill('STALE_A_DRAFT_NO_BROWSER_POST');
  const postsBefore=requests.filter(r=>r.method==='POST').length;
  selected='B';f.setActor(IDS.reviewer);
  await page.getByRole('button',{name:'Post public message',exact:true}).click();
  await status('Message was not sent. Sign-in changed.');
  assert.equal(requests.filter(r=>r.method==='POST').length,postsBefore);
  assert.equal(await page.getByLabel('Your public message',{exact:true}).count(),0);
  assert.doesNotMatch(await page.locator('main').innerText(),/STALE_A_DRAFT_NO_BROWSER_POST|\(you\)/);
  stories.push('A missed selection event still causes the actual member metadata read to reveal B; A draft is cleared before any POST or SQL write');

  selected='A';f.setActor(IDS.host);await reload();await prepare();
  await page.getByLabel('Your public message',{exact:true}).fill('STALE_A_DRAFT_SERVER_REFUSAL');
  const beforeMessages=(await f.db.query('SELECT id,member_id,member_name,content FROM seminar_messages ORDER BY id')).rows;
  changeOnPost=true;
  await page.getByRole('button',{name:'Post public message',exact:true}).click();
  await status('Message was not sent. Your sign-in changed.');
  assert.ok(requests.some(r=>r.path===endpoint&&r.method==='POST'&&r.status===409&&r.selected==='B'&&r.outcome==='not_attempted'));
  assert.equal(postCalls(),1,'Actual server expectedMemberId guard must refuse before a second SQL mutation');
  assert.deepEqual((await f.db.query('SELECT id,member_id,member_name,content FROM seminar_messages ORDER BY id')).rows,beforeMessages);
  assert.equal(await page.getByLabel('Your public message',{exact:true}).count(),0);
  assert.doesNotMatch(await page.locator('main').innerText(),/STALE_A_DRAFT_SERVER_REFUSAL|\(you\)/);
  stories.push('Selection switched only at POST interception after all browser checks; actual canonical API returns409/not_attempted for expected A under B before the post RPC, all message rows remain identical and the UI retires the draft');
  assert.equal(await page.evaluate(()=>window.salonQa.sdkCalls),0);
  assert.deepEqual(errors,[]);assert.deepEqual(routeErrors,[]);assert.deepEqual(unexpected,[]);
  assert.equal(requests.every(r=>r.privateNoStore),true);
  await context.close();
}catch(error){failure=error.stack??String(error);throw error;}
finally {
  if(releasePost)releasePost();if(releaseFresh)releaseFresh();
  await browser.close();for(const fn of cleanup.reverse())await fn();
  const afterHashes=sourceHashes(),unchanged=JSON.stringify(afterHashes)===JSON.stringify(beforeHashes);
  const report={status:failure||!unchanged?'FAIL':'PASS',failure,stories,requests,errors,routeErrors,unexpected,
    sqlReads:readCalls(),sqlPostCalls:postCalls(),sdkProviderCalls:0,sourceUnchanged:unchanged,
    sourceHashesBefore:beforeHashes,sourceHashesAfter:afterHashes,bundleSHA256:hash(bundle),cssSHA256:hash(css),
    catalogSHA256:LIVE_CATALOG_SHA256,fixtureExceptions:LIVE_FIXTURE_EXCEPTIONS,
    scope:'Actual frozen LegacySalon, canonical auth/session/rendering helpers, exact canonical salon/auth-member API handlers, DTO parser, baseline+9 Circle SQL+ordinary salon SQL on one cached PostgreSQL17.5 PGlite service-role transport. Explicit synthetic wallet identity verification, existing test-only SDK/NextLink/fixed route adapters, additional synthetic salon/A+B membership, controlled fixture publication changes and entirely intercepted virtual HTTPS. Not real wallet/Supabase authentication, hosted PostgREST, owner profile publication API, realtime, production SQL or deployment acceptance.'};
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,stories:stories.length,sqlReads:report.sqlReads,sqlPostCalls:report.sqlPostCalls,sourceUnchanged:unchanged,receipt:'verification/web/evidence/legacy-salon-composed-browser.json'}));
  if(!unchanged)process.exitCode=1;
}
