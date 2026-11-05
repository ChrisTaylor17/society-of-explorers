import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const hashes={},sha=value=>createHash('sha256').update(value).digest('hex');
function read(file){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size&&!s.blocks)throw Error('Refuse unavailable input '+file);const bytes=fs.readFileSync(file);hashes[path.relative(process.cwd(),file)]=sha(bytes);return bytes;}
read(path.resolve('verification/web/scripts/bundle-published-profile-web.mjs'));
const output='verification/web/evidence/published-profile-web-fixture';
const result=await Bun.build({entrypoints:['verification/web/tests/support/published-profile-web-entry.tsx'],outdir:output,target:'browser',format:'esm',naming:'page.[ext]',define:{
 'process.env.NODE_ENV':'"development"','process.env.NEXT_PUBLIC_SUPABASE_URL':'"https://native-auth-provider.test"','process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY':'"sb_publishable_NONISSUED_NATIVE_OWNED_AUTH"',
},plugins:[{name:'explicit-published-profile-browser-ports',setup(build){
 build.onResolve({filter:/^(?:@\/lib\/circles\/client|\.\/client)$/},()=>({path:'credentials',namespace:'profile-links'}));
 build.onResolve({filter:/^@\/lib\/supabase\/client$/},()=>({path:'auth',namespace:'profile-links'}));
 build.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'profile-links'}));
 build.onLoad({filter:/.*/,namespace:'profile-links'},args=>({contents:args.path==='credentials'?'export const circleHeaders=()=>window.publishedProfileQa.credentials();'
  :args.path==='auth'?'export const createClient=()=>window.publishedProfileQa.factory();'
  :"import React from 'react';export default function Link({prefetch: _prefetch, ...props}){return React.createElement('a',props,props.children);}",loader:'js',resolveDir:process.cwd()}));
 build.onLoad({filter:/\.(?:[cm]?[jt]sx?|json|css)$/},args=>({contents:read(args.path).toString(),loader:args.path.endsWith('.tsx')?'tsx':args.path.endsWith('.ts')?'ts':args.path.endsWith('.json')?'json':args.path.endsWith('.css')?'css':'jsx',resolveDir:path.dirname(args.path)}));
}}]});
for(const log of result.logs)console.error(String(log));if(!result.success)throw Error('Published-profile component bundle failed');
for(const[name,hash]of Object.entries({...hashes}))if(sha(read(path.resolve(name)))!==hash)throw Error('Changed source '+name);
fs.writeFileSync(output+'/source-manifest.json',JSON.stringify({sourceHashes:hashes,bunVersion:Bun.version,scope:'Actual Circle detail, discussion, message actions, Quest component/generated host/view, profile links and CSS. Explicit synthetic browser credentials/SDK identity/events and Next Link port. Full navigation uses the canonical dynamic published-profile server component with cosmetic navigation/footer ports.'},null,2)+'\n');
console.log('Built published-profile web and Quest navigation components.');
