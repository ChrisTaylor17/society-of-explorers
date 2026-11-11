import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require=createRequire(new URL('../../../package.json',import.meta.url));
const React=require('react');
const { renderToString }=require('react-dom/server');
const ts=require('typescript');
const filename=new URL('../../../components/PublicNav.tsx',import.meta.url);
const source=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const forbidden=()=>{throw Error('Auth/provider access forbidden in server-rendered fixture');};
const mocks={
  react:React,'react/jsx-runtime':require('react/jsx-runtime'),
  'next/link':{default:React.forwardRef(function Link(props,ref){return React.createElement('a',{...props,ref});})},
  '@/lib/auth/getSession':{getMemberSession:forbidden},
  '@/lib/auth/providerSelection':{subscribeAuthProviderChanges:forbidden},
  '@/components/AccountSignOut':{default:props=>{assert.equal(props.available,false);assert.equal(props.resumeWalletSignOut,false);return null;}},
};
const loadedModule={exports:{}};
new vm.Script(`(function(require,module,exports){${source}\n})`).runInNewContext({})(name=>{assert.ok(name in mocks,`Unstubbed dependency: ${name}`);return mocks[name];},loadedModule,loadedModule.exports);
const render=props=>renderToString(React.createElement(loadedModule.exports.default,props));
const fallback=html=>{const match=html.match(/<noscript>([\s\S]*?)<\/noscript>/);assert.ok(match,'Native fallback must be server-rendered');return match[1];};
const expected=[
  ['/explore','Explore'],['/salons/pilot','Salons Proposed plan'],['/fellowship','Christian fellowship'],['/great-books','Library'],
  ['/practice','Practice'],['/feed','Feed'],['/circles','Circles'],['/experience','Activities & experiences'],['/council','Council'],['/join','Join'],
  ['/structure','Build & ventures · proposed'],['/manifesto','Manifesto'],['/roadmap','Roadmap'],['/movement','Movement'],['/vision','Vision'],
  ['https://prompts-mvp.vercel.app','Atlas · external'],
];

test('server renders the current public destinations and order inside native details',()=>{
  const html=fallback(render({checkSession:false}));
  assert.match(html,/<details><summary>Site navigation<\/summary>/);
  assert.match(html,/<nav aria-label="Site links without JavaScript">/);
  assert.deepEqual([...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(m=>[m[1],m[2].replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim()]),expected);
});

test('fallback makes no session-dependent identity or account-control assumption',()=>{
  const disabled=fallback(render({checkSession:false})),standard=fallback(render({}));
  assert.equal(disabled,standard);
  assert.doesNotMatch(disabled,/href="\/(?:login|dashboard|insights)"|sign.?out|sign.?in|AccountSignOut/i);
});

test('native disclosure contains no script, form, dead button or inline event handler',()=>{
  const html=fallback(render({checkSession:false}));
  assert.doesNotMatch(html,/<(?:script|form|button)\b|\bon(?:click|keydown|load)=/i);
  assert.doesNotMatch(html,/<details[^>]+\bopen\b/);
});

test('fallback styles hide the inactive opener and enter page flow below the shared boundary',()=>{
  const html=fallback(render({checkSession:false}));
  assert.match(html,/\.soe-public-noscript\s*\{\s*display: none;/);
  assert.match(html,/@media \(max-width: 1399px\)/);
  assert.match(html,/\.soe-public-nav\s*\{\s*position: relative !important;/);
  assert.match(html,/\.soe-public-nav \.show-mobile\s*\{\s*display: none !important;/);
  assert.match(html,/\.soe-public-noscript summary[^}]*min-height: 44px/);
});

test('the standard opener, modal and desktop visibility rules remain server-rendered',()=>{
  const html=render({checkSession:false}).replace(/<noscript>[\s\S]*?<\/noscript>/,'');
  assert.match(html,/aria-label="Open navigation" aria-expanded="false"/);
  assert.match(html,/<dialog[^>]*aria-label="Site navigation"/);
  assert.match(html,/@media \(min-width: 1400px\)/);
  assert.match(html,/@media \(max-width: 1399px\)/);
});
