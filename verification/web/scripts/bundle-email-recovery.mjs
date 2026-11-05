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
read(process.execPath);read('verification/web/scripts/bundle-email-recovery.mjs');
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
const output='verification/web/evidence/email-recovery-fixture';
const result=await Bun.build({entrypoints:['verification/web/tests/email-recovery-entry.tsx'],outdir:output,target:'browser',format:'esm',naming:'page.[ext]',define:{
 'process.env.NODE_ENV':'"development"','process.env.NEXT_PUBLIC_SUPABASE_URL':'"https://email-recovery-provider.test"',
 'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY':'"sb_publishable_NONISSUED_WEB_RECOVERY_SESSION"',
},plugins:[{name:'actual-recovery-cached-runtime',setup(build){
 build.onResolve({filter:/^@supabase\/auth-js$/},()=>({path:path.join(authRoot,'index.js')}));
 build.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'recovery-fixture'}));
 build.onLoad({filter:/.*/,namespace:'recovery-fixture'},()=>({loader:'js',resolveDir:process.cwd(),contents:'import React from "react";export default function Link({children,href,prefetch,replace,scroll,...props}){return React.createElement("a",{href,...props},children);}'}));
 build.onLoad({filter:/\.(?:[cm]?[jt]sx?|json|css)$/},args=>({contents:read(args.path).toString(),loader:args.path.endsWith('.tsx')?'tsx':args.path.endsWith('.ts')?'ts':args.path.endsWith('.json')?'json':args.path.endsWith('.css')?'css':'jsx',resolveDir:path.dirname(args.path)}));
}}]});
for(const log of result.logs)console.error(String(log));if(!result.success)throw Error('Recovery component bundle failed');
for(const[n,h]of Object.entries({...sourceHashes,...runtimeHashes}))if(sha(read(n))!==h)throw Error('Changed bundle input '+n);
fs.writeFileSync(output+'/source-manifest.json',JSON.stringify({sourceHashes,runtimeHashes,bunVersion:Bun.version,
 scope:'Actual Recovery component, emailRecovery controller, cached AuthClient2.99.3 and CSS. Only NextLink becomes an ordinary browser anchor; no SDK replacement. Synthetic public provider configuration. Chromium proof does not establish real email delivery, deployed redirect settings, provider credentials or native acceptance.'},null,2)+'\n');
console.log('Built actual web recovery component and cached SDK.');
