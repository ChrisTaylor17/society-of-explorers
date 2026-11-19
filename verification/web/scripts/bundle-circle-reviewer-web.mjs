import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const sourceHashes={},runtimeHashes={},sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function read(name){const info=fs.lstatSync(name);if(!info.isFile()||info.isSymbolicLink()||(info.size&&!info.blocks))throw Error('Refuse linked/offloaded source: '+name);const bytes=fs.readFileSync(name),relative=path.relative(process.cwd(),name);if(!relative.startsWith('..')&&!relative.split(path.sep).includes('node_modules'))sourceHashes[relative]=sha(bytes);else runtimeHashes[path.resolve(name)]=sha(bytes);return bytes;}
read('verification/web/scripts/bundle-circle-reviewer-web.mjs');read(process.execPath);
const output='verification/web/evidence/circle-reviewer-web-fixture';
const result=await Bun.build({entrypoints:['verification/web/tests/reviewer-retained-actions-entry.tsx'],outdir:output,target:'browser',format:'esm',naming:'page.[ext]',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'current-listing-reviewer-ports',setup(build){
 build.onResolve({filter:/^@\/lib\/supabase\/client$/},()=>({path:'sdk',namespace:'listing-reviewer'}));
 build.onResolve({filter:/^(?:@\/lib\/circles\/client|\.\/client)$/},args=>args.importer.endsWith('useReviewAccess.ts')?({path:'credentials',namespace:'listing-reviewer'}):undefined);
 build.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'listing-reviewer'}));
 build.onLoad({filter:/.*/,namespace:'listing-reviewer'},args=>({loader:'js',resolveDir:process.cwd(),contents:args.path==='sdk'?'export function createClient(){return window.reviewerRetainedQa.factory();}':args.path==='credentials'?'export async function circleHeaders(json){return window.reviewerRetainedQa.credentials(json);}':'import React from "react";export default function Link({children,href,prefetch,replace,scroll,...p}){return React.createElement("a",{href,...p},children);}'}));
 build.onLoad({filter:/\.(?:[cm]?[jt]sx?|json|css)$/},args=>({contents:read(args.path).toString(),loader:args.path.endsWith('.tsx')?'tsx':args.path.endsWith('.ts')?'ts':args.path.endsWith('.json')?'json':args.path.endsWith('.css')?'css':'jsx',resolveDir:path.dirname(args.path)}));
}}]});
for(const log of result.logs)console.error(String(log));if(!result.success)throw Error('Circle reviewer web bundle failed');
for(const[name,expected]of Object.entries({...sourceHashes,...runtimeHashes}))if(sha(read(name))!==expected)throw Error('Changed bundle input '+name);
fs.writeFileSync(output+'/source-manifest.json',JSON.stringify({sourceHashes,runtimeHashes,bunVersion:Bun.version,scope:'Actual CircleReviews/ReviewCoverage/useReviewAccess with retained-action entry. Explicit SDK/credential/NextLink doubles; current canonical handlers/SQL run separately in the browser proof.'},null,2)+'\n');
console.log('Built current Circle-listing reviewer web fixture.');
