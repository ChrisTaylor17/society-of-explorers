import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const ROOT = process.cwd(), origin = process.env.SOE_PUBLIC_READER_ORIGIN, run = process.env.SOE_READER_PROOF_RUN;
assert(/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(origin)); assert(/^reader-heading-probe-[0-9]+$/.test(run));
assert(process.execArgv.some(v => v.endsWith('/deny-build-network.cjs')));
const resident = n => { const p = path.resolve(ROOT, n), s = fs.lstatSync(p); assert(s.isFile() && !s.isSymbolicLink() && (!s.size || s.blocks)); return p; };
const read = n => fs.readFileSync(resident(n)), hash = n => createHash('sha256').update(read(n)).digest('hex');
const output = `verification/web/evidence/${run}.json`; assert(!fs.existsSync(output));
const sourceNames = ['verification/web/scripts/reader-heading-probe.mjs','app/great-books/BookReader.tsx','content/great-books/hamlet/reader.html','verification/web/evidence/built-shell-server-ready.json'];
const result = { scope: 'Actual built-server focused diagnostic. Keyboard observations plus a separately marked programmatic selectOption diagnostic; no product source changes or source document mutation.', sourceHashes: Object.fromEntries(sourceNames.map(n => [n,hash(n)])), requests: [], blocked: [], cases: [], cleanup: 'pending' };
const require = createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
resident(require.resolve('playwright'));
const executablePath = resident('/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
let browser;
try {
  browser = await require('playwright').chromium.launch({headless:true,executablePath,env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},args:['--disable-background-networking','--disable-component-update','--no-first-run']});
  const context = await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block',acceptDownloads:false});
  await context.route('**/*', async route => { const q=route.request(); if(new URL(q.url()).origin!==origin || q.method()!=='GET'){result.blocked.push(q.url());return route.abort();}result.requests.push(new URL(q.url()).pathname);await route.continue(); });
  const page = await context.newPage();
  async function setup() {
    await page.goto(origin+'/great-books/hamlet',{waitUntil:'networkidle'});await page.locator('iframe[aria-busy="false"]').waitFor();
    await page.evaluate(() => {
      window.headingProbeEvents=[];
      const select=document.querySelector('#reading-contents');
      for(const type of ['keydown','keyup','change','input','focus','blur']) select.addEventListener(type,e=>window.headingProbeEvents.push({type,key:e.key,value:select.value,active:document.activeElement.tagName}),true);
    });
    for(let n=0;n<80;n++){await page.keyboard.press('Tab');if(await page.locator('#reading-contents').evaluate(e=>e===document.activeElement))return;}
    throw Error('Select not reached by keyboard');
  }
  async function observe() { return page.evaluate(() => {
    const s=document.querySelector('#reading-contents'), f=document.querySelector('iframe'), d=f.contentDocument, a=document.activeElement, b=d.activeElement;
    return { selectValue:s.value, active:a.tagName, frameActive:{tag:b.tagName,id:b.id,text:b.textContent.slice(0,120)}, notices:Array.from(document.querySelectorAll('[role="status"]')).map(e=>e.textContent), events:window.headingProbeEvents, options:Array.from(s.options).map(o=>({value:o.value,label:o.label,present:!!d.getElementById(o.value)})) };
  }); }
  for(const keys of [['t'],['End'],['Home','ArrowDown']]){
    await setup(); const steps=[];
    for(const key of keys){await page.keyboard.press(key);steps.push({key,observation:await observe()});}
    result.cases.push({kind:'keyboard',keys,steps});
  }
  await setup(); const first=await page.locator('#reading-contents option').nth(1).getAttribute('value');
  await page.locator('#reading-contents').selectOption(first); result.cases.push({kind:'programmatic-diagnostic-only',value:first,observation:await observe()});
  const screenshot=`verification/web/evidence/${run}.png`;assert(!fs.existsSync(screenshot));await page.screenshot({path:screenshot,fullPage:true});result.screenshot={path:screenshot,sha256:hash(screenshot)};
  for(const [n,h] of Object.entries(result.sourceHashes))assert.equal(hash(n),h);
  result.status='COMPLETE';
}catch(error){result.status='ERROR';result.error=String(error);process.exitCode=1;}
finally{if(browser){await browser.close();result.cleanup='closed';}fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(output);}
