import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const sourceHashes={},runtimeHashes={},sha=value=>createHash('sha256').update(value).digest('hex');
function read(name){
 const file=path.resolve(name),info=fs.lstatSync(file);
 if(!info.isFile()||info.isSymbolicLink()||info.size&&!info.blocks)throw Error('Refuse linked/offloaded input '+name);
 const bytes=fs.readFileSync(file),relative=path.relative(process.cwd(),file);
 if(!relative.startsWith('..')&&!relative.split(path.sep).includes('node_modules'))sourceHashes[relative]=sha(bytes);else runtimeHashes[file]=sha(bytes);
 return bytes;
}
read(process.execPath);read('verification/web/scripts/bundle-web-login.mjs');
const authRoot=path.resolve('node_modules/@supabase/auth-js/dist/module'),seen=new Set();
if(JSON.parse(read('node_modules/@supabase/auth-js/package.json')).version!=='2.99.3'||JSON.parse(read('node_modules/tslib/package.json')).version!=='2.8.1')throw Error('Review changed cached SDK');
function bindSdk(file){
 if(seen.has(file))return;seen.add(file);const source=read(file).toString();
 for(const match of source.matchAll(/^(?:import|export)[^\n;]*\sfrom\s*["']([^"']+)["']/gm)){
  const spec=match[1];let next;
  if(spec.startsWith('.')){next=path.resolve(path.dirname(file),spec);if(!next.endsWith('.js'))next+='.js';if(!next.startsWith(authRoot+path.sep))throw Error('SDK import escaped root');}
  else if(spec==='tslib')next=path.resolve('node_modules/tslib/tslib.es6.mjs');else throw Error('Unreviewed SDK import');
  bindSdk(next);
 }
}
bindSdk(path.join(authRoot,'index.js'));if(seen.size!==19)throw Error('Review SDK closure');
const output='verification/web/evidence/web-login-fixture';
const result=await Bun.build({entrypoints:['verification/web/tests/web-login-entry.tsx'],outdir:output,target:'browser',format:'esm',naming:'page.[ext]',define:{
 'process.env.NODE_ENV':'"development"','process.env.NEXT_PUBLIC_SUPABASE_URL':'"https://web-login-provider.test"',
 'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY':'"sb_publishable_NONISSUED_WEB_LOGIN"',
},plugins:[{name:'actual-account-cached-runtime',setup(build){
 build.onResolve({filter:/^@supabase\/auth-js$/},()=>({path:path.join(authRoot,'index.js')}));
 build.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'login-router'}));
 build.onLoad({filter:/.*/,namespace:'login-router'},()=>({loader:'js',contents:`const router={push:path=>window.loginQa.navigations.push({method:'push',path}),replace:path=>window.loginQa.navigations.push({method:'replace',path}),refresh:()=>{}};export const useRouter=()=>router;`}));
 build.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'account-fixture'}));
 build.onLoad({filter:/.*/,namespace:'account-fixture'},()=>({loader:'js',resolveDir:process.cwd(),contents:'import React from "react";export default function Link({children,href,prefetch,replace,scroll,...props}){return React.createElement("a",{href,...props},children);}'}));
 build.onLoad({filter:/\.(?:[cm]?[jt]sx?|json|css)$/},args=>({contents:read(args.path).toString(),loader:args.path.endsWith('.tsx')?'tsx':args.path.endsWith('.ts')?'ts':args.path.endsWith('.json')?'json':args.path.endsWith('.css')?'css':'jsx',resolveDir:path.dirname(args.path)}));
}}]});
for(const log of result.logs)console.error(String(log));if(!result.success)throw Error('Recovery component bundle failed');
for(const[n,h]of Object.entries({...sourceHashes,...runtimeHashes}))if(sha(read(n))!==h)throw Error('Changed bundle input '+n);
fs.writeFileSync(output+'/source-manifest.json',JSON.stringify({sourceHashes,runtimeHashes,bunVersion:Bun.version,
 scope:'Actual Login, Confirmation and Completion, isolated AuthClient2.99.3 and SSR0.9.0 cookie implementation, PublicNav/Footer and CSS. Next router records navigation and NextLink becomes an anchor. No auth component/client mocks. Synthetic provider configuration and intercepted delivery only; no live provider or deployed Next claim.'},null,2)+'\n');
console.log('Built actual Login/Confirmation/Completion and cached SDK/SSR.');
