import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root=fileURLToPath(new URL('../../',import.meta.url)),require=createRequire(path.join(root,'package.json')),ts=require('typescript');
/** Actual TS/TSX with explicitly supplied platform primitives; no native claim. */
export function sourceLoader(mocks={}){
 const cache=new Map(),context=vm.createContext({console,URL,URLSearchParams,AbortController,Headers,Request,Response,TextEncoder,TextDecoder,structuredClone,setTimeout,clearTimeout,queueMicrotask,process:{env:{}},fetch(){throw Error('External network disabled');}});
 function load(relative){
  const full=path.resolve(root,relative);if(!full.startsWith(root))throw Error('Outside canonical source');
  if(cache.has(full))return cache.get(full).exports;
  const info=fs.lstatSync(full);
  if(info.isSymbolicLink()||!info.isFile()||(info.size&&!info.blocks))throw Error('Refuse nonmaterialized or linked canonical source');
  const module={exports:{}};cache.set(full,module);
  const output=ts.transpileModule(fs.readFileSync(full,'utf8'),{fileName:full,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  function localRequire(name){
   if(Object.hasOwn(mocks,name))return mocks[name];
   if(name.startsWith('.')||name.startsWith('@/')){
    let target=name.startsWith('@/')?path.join(root,name.slice(2)):path.resolve(path.dirname(full),name);
    if(!fs.existsSync(target))target=['.ts','.tsx','.mjs','.js'].map(ext=>target+ext).find(p=>fs.existsSync(p));
    if(!target)throw Error('Missing relative source');return load(path.relative(root,target));
   }
   return require(name);
  }
  new vm.Script('(function(require,module,exports){'+output+'\n})',{filename:full}).runInContext(context)(localRequire,module,module.exports);return module.exports;
 }
 return load;
}
