import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const hashes={},sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function read(name){const info=fs.statSync(name);if(info.size&&!info.blocks)throw Error('Refuse offloaded source: '+name);const bytes=fs.readFileSync(name),relative=path.relative(process.cwd(),name);if(!relative.startsWith('..')&&!relative.split(path.sep).includes('node_modules'))hashes[relative]=sha(bytes);return bytes;}
const output='verification/web/evidence/review-coverage-fixture';
const result=await Bun.build({entrypoints:['verification/web/tests/review-coverage-entry.tsx'],outdir:output,target:'browser',format:'esm',naming:'page.[ext]',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'explicit-review-coverage-ports',setup(build){
 build.onResolve({filter:/^@\/lib\/supabase\/client$/},()=>({path:'sdk',namespace:'coverage-fixture'}));
 build.onResolve({filter:/^(?:@\/lib\/circles\/client|\.\/client)$/},args=>args.importer.endsWith('useReviewAccess.ts')?({path:'credentials',namespace:'coverage-fixture'}):undefined);
 build.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'coverage-fixture'}));
 build.onLoad({filter:/.*/,namespace:'coverage-fixture'},args=>({loader:'js',resolveDir:process.cwd(),contents:args.path==='sdk'?'export function createClient(){return window.coverageQa.factory();}':args.path==='credentials'?'export async function circleHeaders(json){return window.coverageQa.credentials(json);}':'import React from "react";export default function Link({children,href,prefetch,replace,scroll,...p}){return React.createElement("a",{href,...p},children);}'}));
 build.onLoad({filter:/\.(?:[cm]?[jt]sx?|json|css)$/},args=>({contents:read(args.path).toString(),loader:args.path.endsWith('.tsx')?'tsx':args.path.endsWith('.ts')?'ts':args.path.endsWith('.json')?'json':args.path.endsWith('.css')?'css':'jsx',resolveDir:path.dirname(args.path)}));
}}]});
for(const log of result.logs)console.error(String(log));if(!result.success)throw Error('Review coverage bundle failed');
for(const[name,expected]of Object.entries({...hashes}))if(sha(read(name))!==expected)throw Error('Source changed while bundling: '+name);
fs.writeFileSync(output+'/source-manifest.json',JSON.stringify({sourceHashes:hashes,bunVersion:Bun.version,scope:'Actual CircleReviews, MessageReviews, ReviewCoverage, parsers and useReviewAccess; actual Bun CSS modules; explicit credential/SDK event/NextLink ports. Global Next/PostCSS/fonts and hosted providers excluded.'},null,2)+'\n');
console.log('Built both actual human review screens and bounded coverage UI.');
