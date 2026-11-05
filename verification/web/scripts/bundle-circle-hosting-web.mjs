import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const hashes={},sha=value=>createHash('sha256').update(value).digest('hex');
function read(file){const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size&&!stat.blocks)throw Error('Refuse unavailable source '+file);const bytes=fs.readFileSync(file);hashes[path.relative(process.cwd(),file)]=sha(bytes);return bytes;}
read(path.resolve('verification/web/scripts/bundle-circle-hosting-web.mjs'));
const css=Buffer.concat([read(path.resolve('app/circles/participation.module.css')),read(path.resolve('app/circles/reading-program.module.css'))]);
const [run,...extra]=process.argv.slice(2);
if(extra.length||(run!==undefined&&(run.length>64||run.split('-').some(part=>!part||/[^a-z0-9]/.test(part)))))throw Error('Expected one optional evidence run name');
const output='verification/web/evidence/circle-hosting-web-fixture'+(run?'-'+run:'');
if(run)fs.mkdirSync(output);
const result=await Bun.build({entrypoints:['verification/web/tests/support/circle-hosting-web-entry.tsx'],outdir:output,target:'browser',format:'esm',naming:'page.[ext]',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'explicit-browser-auth-delivery',setup(build){
 build.onResolve({filter:/^@\/lib\/circles\/client$/},()=>({path:'credentials',namespace:'saved-double'}));
 build.onResolve({filter:/^@\/lib\/supabase\/client$/},()=>({path:'auth',namespace:'saved-double'}));
 build.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'saved-double'}));
 build.onResolve({filter:/(?:participation|reading-program)\.module\.css$/},()=>({path:'css',namespace:'saved-double'}));
 build.onLoad({filter:/.*/,namespace:'saved-double'},args=>({contents:args.path==='credentials'?'export const circleHeaders=()=>window.hostingQa.credentials();'
  :args.path==='auth'?'export const createClient=()=>({auth:{onAuthStateChange(listener){return {data:{subscription:{unsubscribe:window.hostingQa.subscribe(listener)}}};}}});'
  :args.path==='link'?"import React from 'react';export default function Link({prefetch: _prefetch, ...props}){return React.createElement('a',props,props.children);}":'export default new Proxy({}, {get:(_,key)=>key});',loader:'js',resolveDir:process.cwd()}));
 build.onLoad({filter:/\.(?:[cm]?[jt]sx?|json)$/},args=>({contents:read(args.path).toString(),loader:args.path.endsWith('.tsx')?'tsx':args.path.endsWith('.ts')?'ts':args.path.endsWith('.json')?'json':'jsx',resolveDir:path.dirname(args.path)}));
}}]});
for(const log of result.logs)console.error(String(log));if(!result.success)throw Error('Circle hosting component bundle failed');
for(const[name,hash]of Object.entries({...hashes}))if(sha(read(path.resolve(name)))!==hash)throw Error('Changed source '+name);
fs.writeFileSync(output+'/participation.css',css);
fs.writeFileSync(output+'/source-manifest.json',JSON.stringify({sourceHashes:hashes,bunVersion:Bun.version,scope:'Actual web StartCircleForm/useCircleHosting and reading-plan editor and Circle stylesheet in cached Chromium. Browser credential delivery/auth events and Next Link routing are explicit doubles. Canonical server member authority and hosting handlers execute current disposable SQL; no provider account or deployed browser session.'},null,2)+'\n');
console.log('Built actual web Circle hosting components with explicit browser authority delivery.');
