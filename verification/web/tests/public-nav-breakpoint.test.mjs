import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../package.json',import.meta.url));
const ts = require('typescript');
const filename = new URL('../../../components/PublicNav.tsx',import.meta.url);
const source = ts.transpileModule(fs.readFileSync(filename,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
}).outputText;

// Execute the actual component's menu effect with synthetic DOM/media events.
// Native focus containment and CSS layout are checked separately in the browser.
function fixture(width, overflow='auto') {
  const effects=[],refs=[],updates=[],mediaListeners=new Set(),windowListeners=new Map(),queries=[];
  let stateIndex=0,refIndex=0,focus=null,dialogNode,showCount=0;
  const dialog={open:false,showModal(){this.open=true;showCount++;},close(){this.open=false;dialogNode.props.onClose();}};
  refs.push({current:dialog},{current:{focus(){focus='close';}}},{current:{focus(){focus='brand';}}});
  const body={style:{overflow}};
  const media={matches:false,addEventListener(type,fn){assert.equal(type,'change');mediaListeners.add(fn);},removeEventListener(type,fn){assert.equal(type,'change');mediaListeners.delete(fn);}};
  const windowStub={scrollY:0,matchMedia(query){queries.push(query);const match=query.match(/^\(min-width: (\d+)px\)$/);assert.ok(match);media.matches=width>=Number(match[1]);return media;},addEventListener(type,fn){windowListeners.set(type,fn);},removeEventListener(type){windowListeners.delete(type);}};
  const denied=()=>{throw Error('Auth/provider/account dependency must remain unused');};
  const mocks={
    react:{useState(initial){const i=stateIndex++;return [i===1?true:initial,value=>updates.push([i,value])];},useEffect(fn){effects.push(fn);},useId:()=> 'synthetic-navigation',useRef(){return refs[refIndex++];}},
    'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'fragment'},
    'next/link':{default:'a'},'@/lib/auth/getSession':{getMemberSession:denied},'@/components/AccountSignOut':{default:denied},'@/lib/auth/providerSelection':{subscribeAuthProviderChanges:denied},
  };
  const loadedModule={exports:{}};
  const context=vm.createContext({window:windowStub,document:{body}});
  new vm.Script(`(function(require,module,exports){${source}\n})`).runInContext(context)(name=>{assert.ok(name in mocks,`Unstubbed import: ${name}`);return mocks[name];},loadedModule,loadedModule.exports);
  const tree=loadedModule.exports.default({checkSession:false});
  const walk=node=>Array.isArray(node)?node.flatMap(walk):node&&typeof node==='object'?[node,...walk(node.props?.children)]:[];
  const nodes=walk(tree);dialogNode=nodes.find(node=>node.type==='dialog');
  const cleanup=effects[0]();
  effects[2](); // checkSession=false must not call session/provider dependencies.
  return {dialog,body,updates,queries,mediaListeners,cleanup,style:nodes.find(node=>node.type==='style').props.children,
    focus:()=>focus,showCount:()=>showCount,
    resize(next){const limit=Number(queries[0].match(/\d+/)[0]);media.matches=next>=limit;for(const fn of mediaListeners)fn();},
  };
}

test('menu stays open at mobile, old boundary, tablet and the last compact width',()=>{
  for(const width of [320,390,640,641,1024,1399]){
    const f=fixture(width);assert.equal(f.dialog.open,true,`width ${width}`);assert.equal(f.focus(),'close');assert.equal(f.showCount(),1);assert.equal(f.body.style.overflow,'hidden');assert.deepEqual(f.updates,[]);f.cleanup();assert.equal(f.body.style.overflow,'auto');assert.equal(f.mediaListeners.size,0);
  }
});

test('the real desktop boundary closes an open menu and returns focus to the brand',()=>{
  for(const width of [1400,1600]){
    const f=fixture(width);assert.equal(f.dialog.open,false);assert.equal(f.focus(),'brand');assert.deepEqual(f.updates,[[1,false]]);f.cleanup();assert.equal(f.body.style.overflow,'auto');
  }
});

test('resizing inside the compact range keeps the dialog; crossing desktop closes it',()=>{
  const f=fixture(390,'scroll');f.resize(641);assert.equal(f.dialog.open,true);f.resize(1399);assert.equal(f.dialog.open,true);f.resize(1400);assert.equal(f.dialog.open,false);assert.equal(f.focus(),'brand');f.cleanup();assert.equal(f.body.style.overflow,'scroll');assert.equal(f.mediaListeners.size,0);
});

test('unmount cleanup restores the prior scroll policy and removes its media listener',()=>{
  const f=fixture(1024,'clip');assert.equal(f.body.style.overflow,'hidden');f.cleanup();assert.equal(f.body.style.overflow,'clip');assert.equal(f.mediaListeners.size,0);
});

test('rendered CSS and menu lifecycle share the same desktop boundary',()=>{
  const f=fixture(1024);const desktop=Number(f.queries[0].match(/\d+/)[0]);
  const maximum=Number(f.style.match(/max-width: (\d+)px/)[1]);const minimum=Number(f.style.match(/min-width: (\d+)px/)[1]);
  assert.equal(desktop,1400);assert.equal(minimum,desktop);assert.equal(maximum,desktop-1);f.cleanup();
});
