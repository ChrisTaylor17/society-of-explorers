import fs from 'node:fs';import path from 'node:path';import{createHash}from'node:crypto';
const hashes={},sha=b=>createHash('sha256').update(b).digest('hex');
function read(file){const s=fs.lstatSync(file);if(s.isSymbolicLink()||s.size&&!s.blocks)throw Error('Refuse source placeholder/link '+file);const b=fs.readFileSync(file),name=path.relative(process.cwd(),file);if(!name.startsWith('..')&&!name.split(path.sep).includes('node_modules'))hashes[name]=sha(b);return b;}
read(path.resolve('platforms/tests/bundle-native-account-setup.mjs'));
const output='verification/web/evidence/native-account-setup-fixture';
const primitive=`import React from 'react';
function style(value){const v=Object.assign({},...(Array.isArray(value)?value:[value]));for(const pair of [['paddingVertical','paddingTop','paddingBottom'],['paddingHorizontal','paddingLeft','paddingRight'],['marginVertical','marginTop','marginBottom']])if(pair[0]in v){v[pair[1]]=v[pair[0]];v[pair[2]]=v[pair[0]];delete v[pair[0]];}if(typeof v.lineHeight==='number')v.lineHeight=v.lineHeight+'px';return v;}
function box(tag){return function Primitive(p){return React.createElement(tag,{'aria-label':p.accessibilityLabel,'aria-live':p.accessibilityLiveRegion,role:p.accessibilityRole==='radiogroup'?'radiogroup':undefined,style:style([tag==='span'?{display:'block'}:{},p.style,p.contentContainerStyle])},p.children);};}
export const SafeAreaView=box('main'),ScrollView=box('div'),View=box('div'),Text=box('span'),ActivityIndicator=box('span');
export const Pressable=p=>React.createElement('button',{'aria-label':p.accessibilityLabel,role:['checkbox','radio'].includes(p.accessibilityRole)?p.accessibilityRole:'button','aria-checked':['checkbox','radio'].includes(p.accessibilityRole)?p.accessibilityState?.checked:undefined,disabled:p.disabled,onClick:p.onPress,style:style(p.style)},p.children);
export const TextInput=p=>React.createElement('textarea',{'aria-label':p.accessibilityLabel,disabled:!p.editable,value:p.value,maxLength:p.maxLength,onChange:e=>p.onChangeText(e.target.value),style:style(p.style)});
export const StyleSheet={create:x=>x},Platform={OS:'android'};
export const AppState={get currentState(){return window.nativeQa?.appState.currentState??'active';},addEventListener(name,fn){return window.nativeQa.appState.addEventListener(name,fn);}};`;
const result=await Bun.build({entrypoints:['platforms/tests/native-account-setup-entry.tsx'],outdir:output,target:'browser',format:'esm',naming:'page.[ext]',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'native-primitives-explicit-double',setup(build){
 // Native node_modules is an older linked runtime with offloaded files. Use
 // only the already-materialized canonical web React for these explicit doubles.
 const reactFiles={'react':'react/index.js','react/jsx-runtime':'react/jsx-runtime.js','react/jsx-dev-runtime':'react/jsx-dev-runtime.js','react-dom/client':'react-dom/client.js'};
 build.onResolve({filter:/^(?:react(?:\/jsx(?:-dev)?-runtime)?|react-dom\/client)$/},args=>({path:path.resolve('node_modules',reactFiles[args.path])}));
 build.onResolve({filter:/^react-native$/},()=>({path:'primitives',namespace:'native-fixture'}));
 build.onLoad({filter:/.*/,namespace:'native-fixture'},()=>({contents:primitive,loader:'js',resolveDir:process.cwd()}));
 build.onLoad({filter:/\.(?:[cm]?[jt]sx?|json)$/},args=>({contents:read(args.path).toString(),loader:args.path.endsWith('.tsx')?'tsx':args.path.endsWith('.ts')?'ts':args.path.endsWith('.json')?'json':'jsx',resolveDir:path.dirname(args.path)}));
}}]});for(const log of result.logs)console.error(String(log));if(!result.success)throw Error('Native account setup fixture bundle failed');
for(const[name,expected]of Object.entries({...hashes}))if(sha(read(name))!==expected)throw Error('Source changed '+name);
fs.writeFileSync(output+'/source-manifest.json',JSON.stringify({sourceHashes:hashes,bunVersion:Bun.version,scope:'Actual native MemberCircleScreen and CircleScreen with portable account/owner controllers in cached React/Chromium. React Native DOM primitives/AppState and SDK identity are explicit doubles; browser driver composes actual canonical account handlers and local SQL. No native compilation, OS networking/storage, issued credential or provider/device acceptance.'},null,2)+'\n');console.log('Built actual native existing-account setup composition with explicit platform doubles.');
