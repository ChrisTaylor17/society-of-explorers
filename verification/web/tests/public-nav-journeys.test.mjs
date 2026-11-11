import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require=createRequire(new URL('../../../package.json',import.meta.url));
const React=require('react');
const {renderToString}=require('react-dom/server');
const ts=require('typescript');
const filename=new URL('../../../components/PublicNav.tsx',import.meta.url);
const source=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const primary=[['/explore','Explore'],['/salons/pilot','Salons Proposed plan'],['/fellowship','Christian fellowship'],['/great-books','Library']];
const previous=['https://prompts-mvp.vercel.app','/practice','/feed','/circles','/fellowship','/manifesto','/roadmap','/movement','/vision','/council','/join'];
const publicHrefs=[...primary.map(x=>x[0]),'/practice','/feed','/circles','/experience','/council','/join','/structure','/manifesto','/roadmap','/movement','/vision','https://prompts-mvp.vercel.app'];
const text=html=>html.replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const anchors=html=>[...html.matchAll(/<a\b([^>]*)href="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/g)].map(m=>({href:m[2],attributes:m[1]+m[3],label:text(m[4])}));
const surface=(html,label)=>{const match=html.match(new RegExp(`<nav\\b[^>]*aria-label="${label}"[^>]*>([\\s\\S]*?)<\\/nav>`));assert.ok(match,`Missing ${label}`);return match[1];};

function render({checkSession=false,name=null,checked=false,pending=false}={}) {
  let index=0;
  const accounts=[];
  const values=[false,false,name,checked,pending];
  const denied=()=>{throw Error('Session/provider access forbidden; only injected display state is used');};
  const mocks={
    react:{...React,useState:()=>[values[index++],()=>{}]},
    'react/jsx-runtime':require('react/jsx-runtime'),
    'next/link':{default:React.forwardRef(function Link(props,ref){return React.createElement('a',{...props,ref});})},
    '@/lib/auth/getSession':{getMemberSession:denied},
    '@/lib/auth/providerSelection':{subscribeAuthProviderChanges:denied},
    '@/components/AccountSignOut':{default:props=>{accounts.push({available:props.available,resumeWalletSignOut:props.resumeWalletSignOut});return null;}},
  };
  const loadedModule={exports:{}};
  new vm.Script(`(function(require,module,exports){${source}\n})`).runInNewContext({})(name=>{assert.ok(name in mocks,`Unstubbed import ${name}`);return mocks[name];},loadedModule,loadedModule.exports);
  const html=renderToString(React.createElement(loadedModule.exports.default,{checkSession}));
  assert.equal(index,5);
  return {html,accounts};
}

test('all rendered navigation surfaces lead with the four intended journeys',()=>{
  const {html}=render();
  for(const label of ['Primary navigation','Mobile navigation','Site links without JavaScript']){
    const links=anchors(surface(html,label));
    const main=links.filter(a=>a.attributes.includes('soe-nav-primary-link'));
    assert.deepEqual(main.map(a=>[a.href,a.label]),primary,label);
  }
});

test('each surface retains every previous destination exactly once and groups secondary links',()=>{
  const {html}=render();
  for(const label of ['Primary navigation','Mobile navigation','Site links without JavaScript']){
    const nav=surface(html,label),links=anchors(nav);
    assert.equal(new Set(links.map(a=>a.href)).size,links.length,`Duplicate destination in ${label}`);
    for(const href of previous)assert.equal(links.filter(a=>a.href===href).length,1,href);
    assert.deepEqual(links.filter(a=>publicHrefs.includes(a.href)).map(a=>a.href),publicHrefs);
    assert.match(nav,/<summary>More from SoE<\/summary>/);
    for(const group of ['Community & practice','Vision & ideas','Separate destination'])assert.ok(text(nav).includes(group));
  }
});

test('all local public destinations resolve to existing page source without inventing a library route',()=>{
  const links=anchors(surface(render().html,'Site links without JavaScript'));
  assert.equal(links.length,16);
  for(const {href} of links.filter(a=>a.href.startsWith('/'))){
    assert.ok(fs.existsSync(new URL(`../../../app${href}/page.tsx`,import.meta.url)),`Missing local page: ${href}`);
  }
  assert.equal(links.some(a=>a.href==='/library'),false);
  assert.equal(links.find(a=>a.label==='Library')?.href,'/great-books');
});

test('salon and venture labels remain proposals and Atlas is visibly separate from Library',()=>{
  for(const label of ['Primary navigation','Mobile navigation','Site links without JavaScript']){
    const nav=surface(render().html,label),links=anchors(nav);
    assert.equal(links.find(a=>a.href==='/salons/pilot')?.label,'Salons Proposed plan');
    assert.equal(links.find(a=>a.href==='/structure')?.label,'Build & ventures · proposed');
    assert.equal(links.find(a=>a.href==='https://prompts-mvp.vercel.app')?.label,'Atlas · external');
    assert.ok(text(nav).includes('Atlas opens a different website.'));
  }
});

test('synthetic member display retains Insights, dashboard and sign-out props only in normal surfaces',()=>{
  const {html,accounts}=render({checkSession:true,name:'Local tester',checked:true,pending:true});
  for(const label of ['Primary navigation','Mobile navigation']){
    const links=anchors(surface(html,label));
    assert.equal(links.filter(a=>a.href==='/insights').length,1);
    assert.equal(links.findIndex(a=>a.href==='/insights')+1,links.findIndex(a=>a.href==='/council'));
    assert.equal(links.filter(a=>a.href==='/dashboard').length,1);
    assert.equal(links.some(a=>a.href==='/login'),false);
  }
  assert.deepEqual(accounts,[{available:true,resumeWalletSignOut:true},{available:true,resumeWalletSignOut:true}]);
  const native=surface(html,'Site links without JavaScript');
  assert.doesNotMatch(native,/\/insights|\/dashboard|\/login|Local tester/i);
});

test('disabled session checking and unresolved identity expose no inferred member links',()=>{
  for(const state of [{checkSession:false,name:'Local tester',checked:true,pending:true},{checkSession:true,checked:false}]){
    const {html,accounts}=render(state);
    for(const label of ['Primary navigation','Mobile navigation']){
      const links=anchors(surface(html,label));
      assert.equal(links.some(a=>a.href==='/insights'||a.href==='/dashboard'),false);
      assert.equal(links.filter(a=>a.href==='/login').length,1);
    }
    assert.deepEqual(accounts,[{available:false,resumeWalletSignOut:false},{available:false,resumeWalletSignOut:false}]);
  }
});
