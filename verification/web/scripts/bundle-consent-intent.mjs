import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const sourceHashes = {}, runtimeHashes = {};
const hash = value => createHash('sha256').update(value).digest('hex');
function read(name) {
 const info=fs.lstatSync(name);if(!info.isFile()||info.isSymbolicLink()||info.size&&!info.blocks)throw Error('Refusing offloaded source: '+name);
 const bytes=fs.readFileSync(name);
 const relative=path.relative(process.cwd(),name);
 if(!relative.startsWith('..')&&!relative.split(path.sep).includes('node_modules'))sourceHashes[relative]=hash(bytes);
 else runtimeHashes[path.resolve(name)]=hash(bytes);
 return bytes;
}
const output='verification/web/evidence/consent-intent-fixture';
read(process.execPath);
read('verification/web/scripts/bundle-consent-intent.mjs');
const result=await Bun.build({entrypoints:['verification/web/tests/consent-intent-entry.tsx'],outdir:output,target:'browser',format:'esm',naming:'page.[ext]',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'explicit-message-ai-fixture',setup(build){
 build.onResolve({filter:/^@\/lib\/supabase\/client$/},()=>({path:'sdk',namespace:'message-ai-fixture'}));
 build.onResolve({filter:/^(?:@\/lib\/circles\/client|\.\/client)$/},args=>args.importer.endsWith('useReviewAccess.ts')?({path:'credentials',namespace:'message-ai-fixture'}):undefined);
 build.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'message-ai-fixture'}));
  build.onLoad({filter:/.*/,namespace:'message-ai-fixture'},args=>({loader:'js',resolveDir:process.cwd(),contents:args.path==='sdk'?'export function createClient(){return window.aiQa.factory();}':args.path==='credentials'?'export async function circleHeaders(json){return json?{"Content-Type":"application/json"}:{};}':'import React from "react";export default function Link({children,href,prefetch,replace,scroll,...p}){return React.createElement("a",{href,...p},children);}'}));
 build.onLoad({filter:/\.(?:[cm]?[jt]sx?|json|css)$/},args=>({contents:read(args.path).toString(),loader:args.path.endsWith('.tsx')?'tsx':args.path.endsWith('.ts')?'ts':args.path.endsWith('.json')?'json':args.path.endsWith('.css')?'css':'jsx',resolveDir:path.dirname(args.path)}));
}}]});
for(const log of result.logs)console.error(String(log));
if(!result.success)throw Error('Message AI fixture bundle failed');
for(const [name,expected]of Object.entries({...sourceHashes}))if(hash(read(name))!==expected)throw Error('Source changed during bundling: '+name);
for(const [name,expected]of Object.entries({...runtimeHashes}))if(hash(read(name))!==expected)throw Error('Runtime changed during bundling: '+name);
fs.writeFileSync(output+'/source-manifest.json',JSON.stringify({sourceHashes,runtimeHashes,scope:'Actual MessageAiConsent and Contributions components, parsers and useReviewAccess lifecycle. Explicit credential supplier, SDK event subscription and NextLink adapters. Actual CSS module through Bun; no global Next/PostCSS/font acceptance. No provider/account/hosted acceptance.',bunVersion:Bun.version},null,2)+'\n');
console.log('Built current consent intent components with explicit local adapters.');
