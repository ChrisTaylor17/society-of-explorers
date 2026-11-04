// Uses the recovered project's existing FakeDb and actual TypeScript modules.
// This is a Node test loader, not an emulation of the Bun test runner.
import vm from 'node:vm';import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {webcrypto} from 'node:crypto';
const nodeRequire=createRequire(import.meta.url),dependenciesRequire=createRequire(path.resolve('../../package.json')),ts=dependenciesRequire('typescript');
export function offlineApp({root=path.resolve('../..')}={}){
 const projectRequire=createRequire(path.join(root,'package.json'));
 const cache=new Map(),mocks=new Map();
 const context=vm.createContext({console,URL,URLSearchParams,Headers,Request,Response,ReadableStream,TextEncoder,TextDecoder,AbortController,crypto:webcrypto,Buffer,structuredClone,setTimeout,clearTimeout,setInterval,clearInterval,queueMicrotask,process:{env:{NEXTAUTH_SECRET:'OFFLINE_FIXTURE_ONLY_'.repeat(4)},cwd:()=>root,versions:process.versions},fetch:()=>{throw Error('Network forbidden in offline route test');}});
 function load(filename){
   const full=path.resolve(root,filename);if(!full.startsWith(root+path.sep))throw Error('Project import escaped test root');
   if(cache.has(full))return cache.get(full).exports;
   const m={exports:{}};cache.set(full,m);
   if(full.endsWith('.json')) {m.exports=JSON.parse(fs.readFileSync(full,'utf8'));return m.exports;}
   const source=fs.readFileSync(full,'utf8'),compiled=ts.transpileModule(source,{fileName:full,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
   const require=specifier=>{
     if(specifier==='server-only')return {};
     if(specifier==='bun:test')return {mock:{module:(name,factory)=>mocks.set(name,factory)}};
     if(mocks.has(specifier))return mocks.get(specifier)();
     if(specifier.startsWith('@/')||specifier.startsWith('.')){
       let target=specifier.startsWith('@/')?path.join(root,specifier.slice(2)):path.resolve(path.dirname(full),specifier);
       if(!fs.existsSync(target))target=['.ts','.tsx','.js','.mjs'].map(ext=>target+ext).find(p=>fs.existsSync(p))??target;
       return load(path.relative(root,target));
     }
     if(['net','node:net','http','node:http','https','node:https','tls','node:tls','dns','node:dns'].includes(specifier))throw Error('Network module forbidden in offline route test');
     return specifier.startsWith('node:')?nodeRequire(specifier):projectRequire(specifier);
   };
   new vm.Script('(function(require,module,exports,__filename,__dirname){'+compiled+'\n})',{filename:full}).runInContext(context)(require,m,m.exports,full,path.dirname(full));return m.exports;
 }
 const fakes=load('tests/security/fakes.ts');fakes.installMocks();
 // The original FakeDb is unchanged. Its NextResponse double drops init headers;
 // make only that transport shim match NextResponse.json's real header semantics.
 const next=mocks.get('next/server')();
 next.NextResponse.json=(data,init={})=>{
   const headers=new Headers(init.headers);headers.set('content-type','application/json');
   return new next.NextResponse(JSON.stringify(data),{...init,headers});
 };
 mocks.set('next/server',()=>next);
 return {load,fakes,setMock:(name,factory)=>mocks.set(name,factory),setUser:user=>{context.__authUser=user;},context};
}
