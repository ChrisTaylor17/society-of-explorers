import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const sourceHashes={},root=process.cwd(),output='verification/web/evidence/thinker-reward-fixture';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function read(name){const stat=fs.lstatSync(name);if(stat.isSymbolicLink()||!stat.isFile()||stat.size&&!stat.blocks)throw Error('Refuse linked/offloaded source: '+name);const bytes=fs.readFileSync(name),relative=path.relative(root,name);if(!relative.startsWith('..')&&!relative.split(path.sep).includes('node_modules'))sourceHashes[relative]=hash(bytes);return bytes;}
read('verification/web/scripts/bundle-thinker-reward-test.mjs');
const result=await Bun.build({entrypoints:['verification/web/tests/thinker-reward-entry.tsx'],outdir:output,target:'browser',format:'esm',naming:'page.[ext]',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'explicit-thinker-reward-credentials',setup(build){
 build.onResolve({filter:/^@\/lib\/circles\/client$/},()=>({path:'credentials',namespace:'thinker-reward-fixture'}));
 build.onLoad({filter:/.*/,namespace:'thinker-reward-fixture'},()=>({loader:'js',contents:'export async function circleHeaders(){return window.thinkerRewardQa.credentials();}'}));
 build.onResolve({filter:/supabase|anthropic|openai/i},args=>{throw Error('Forbidden provider/SDK dependency: '+args.path);});
 build.onLoad({filter:/\.(?:[cm]?[jt]sx?|json)$/},args=>({contents:read(args.path).toString(),loader:args.path.endsWith('.tsx')?'tsx':args.path.endsWith('.ts')?'ts':args.path.endsWith('.json')?'json':'jsx',resolveDir:path.dirname(args.path)}));
}}]});
for(const log of result.logs)console.error(String(log));if(!result.success)throw Error('Thinker reward fixture bundle failed');
for(const [name,expected]of Object.entries({...sourceHashes}))if(hash(read(name))!==expected)throw Error('Source changed during bundle: '+name);
fs.writeFileSync(output+'/source-manifest.json',JSON.stringify({sourceHashes,bunVersion:Bun.version,scope:'Actual ThinkerRewardNotice/useThinkerRewards, strict receipt parser and providerSelection subscription in cached React/Chromium. Only circleHeaders credential supplier is an explicit double. GET receipt replies and nonabortable credential/header/JSON delays are synthetic. No actual API/SQL/account/provider, balance mutation or production acceptance.'},null,2)+'\n');
console.log('Built actual Thinker reward hook/notice with explicit credentials and receipt transport doubles.');
