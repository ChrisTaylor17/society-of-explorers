import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const hashes={},runtimeHashes={},sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function read(name){const info=fs.lstatSync(name);if(!info.isFile()||info.isSymbolicLink()||(info.size&&!info.blocks))throw Error('Refuse linked/offloaded source: '+name);const bytes=fs.readFileSync(name),relative=path.relative(process.cwd(),name);if(!relative.startsWith('..')&&!relative.split(path.sep).includes('node_modules'))hashes[relative]=sha(bytes);else runtimeHashes[path.resolve(name)]=sha(bytes);return bytes;}
const mode=process.env.SOE_REVIEWER_BASELINE==='1'?'baseline':'fixed',output='verification/web/evidence/reviewer-retained-actions-'+mode+'-all-fixture';
if(mode==='baseline'&&fs.existsSync(output))throw Error('Baseline bundle already exists; preserve it');
const originals={};
if(mode==='baseline')for(const name of ['app/moderation/messages/MessageReviews.tsx','app/moderation/circles/CircleReviews.tsx','app/moderation/ReviewCoverage.tsx']){const bytes=read(name),out='verification/web/evidence/reviewer-retained-actions-originals/'+name;fs.mkdirSync(path.dirname(out),{recursive:true});if(fs.existsSync(out)){if(sha(read(out))!==sha(bytes))throw Error('Original source changed: '+name);}else fs.writeFileSync(out,bytes,{flag:'wx'});originals[out]=sha(bytes);}
const result=await Bun.build({entrypoints:['verification/web/tests/reviewer-retained-actions-entry.tsx'],outdir:output,target:'browser',format:'esm',naming:'page.[ext]',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'explicit-reviewer-retained-ports',setup(build){
 build.onResolve({filter:/^@\/lib\/supabase\/client$/},()=>({path:'sdk',namespace:'reviewer-retained'}));
 build.onResolve({filter:/^(?:@\/lib\/circles\/client|\.\/client)$/},args=>args.importer.endsWith('useReviewAccess.ts')?({path:'credentials',namespace:'reviewer-retained'}):undefined);
 build.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'reviewer-retained'}));
 build.onLoad({filter:/.*/,namespace:'reviewer-retained'},args=>({loader:'js',resolveDir:process.cwd(),contents:args.path==='sdk'?'export function createClient(){return window.reviewerRetainedQa.factory();}':args.path==='credentials'?'export async function circleHeaders(json){return window.reviewerRetainedQa.credentials(json);}':'import React from "react";export default function Link({children,href,prefetch,replace,scroll,...p}){return React.createElement("a",{href,...p},children);}'}));
 build.onLoad({filter:/\.(?:[cm]?[jt]sx?|json|css)$/},args=>({contents:read(args.path).toString(),loader:args.path.endsWith('.tsx')?'tsx':args.path.endsWith('.ts')?'ts':args.path.endsWith('.json')?'json':args.path.endsWith('.css')?'css':'jsx',resolveDir:path.dirname(args.path)}));
}}]});
for(const log of result.logs)console.error(String(log));if(!result.success)throw Error('Reviewer retained actions bundle failed');
for(const[name,expected]of Object.entries({...hashes}))if(sha(read(name))!==expected)throw Error('Source changed while bundling: '+name);
fs.writeFileSync(output+'/source-manifest.json',JSON.stringify({mode,sourceHashes:hashes,runtimeHashes,originals,bunVersion:Bun.version,scope:'Actual MessageReviews, ReviewCoverage, parsers and useReviewAccess with Bun CSS modules. Explicit browser credential/SDK-event/NextLink ports. Baseline product leaves are copied byte-for-byte before edits.'},null,2)+'\n');
console.log('Built actual reviewer retained-action '+mode+' fixture.');
