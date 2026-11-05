import fs from 'node:fs';import path from 'node:path';import{createHash}from'node:crypto';
const hashes={},sha=b=>createHash('sha256').update(b).digest('hex');
function read(file){const s=fs.lstatSync(file);if(s.isSymbolicLink()||s.size&&!s.blocks)throw Error('Refuse source placeholder/link '+file);const b=fs.readFileSync(file),name=path.relative(process.cwd(),file);if(!name.startsWith('..'))hashes[name]=sha(b);return b;}
read(path.resolve('platforms/tests/bundle-native-public-profile.mjs'));
// Bun's cached package loader does not call onLoad for every transitive package
// input. Pin the SDK's explicit ESM import closure independently, without walking
// a dependency directory or touching the incomplete native node_modules tree.
const authRoot=path.resolve('node_modules/@supabase/auth-js/dist/module'),runtimeSeen=new Set();
const authPackage=JSON.parse(read(path.resolve('node_modules/@supabase/auth-js/package.json')));
const tslibPackage=JSON.parse(read(path.resolve('node_modules/tslib/package.json')));
if(authPackage.version!=='2.99.3'||tslibPackage.version!=='2.8.1')throw Error('Review changed cached authentication runtime');
function bindSdk(file){
 if(runtimeSeen.has(file))return;runtimeSeen.add(file);const source=read(file).toString();
 for(const match of source.matchAll(/^(?:import|export)[^\n;]*\sfrom\s*["']([^"']+)["']/gm)){
  const spec=match[1];let next;
  if(spec.startsWith('.')){next=path.resolve(path.dirname(file),spec);if(!next.endsWith('.js'))next+='.js';if(!next.startsWith(authRoot+path.sep))throw Error('SDK import escaped reviewed root');}
  else if(spec==='tslib')next=path.resolve('node_modules/tslib/tslib.es6.mjs');
  else throw Error('Review new SDK import '+spec);
  bindSdk(next);
 }
}
bindSdk(path.join(authRoot,'index.js'));
if(runtimeSeen.size!==19)throw Error('Review changed cached SDK import closure');
const output='verification/web/evidence/native-public-profile-fixture';
const primitive=`import React from 'react';
function style(value){const v=Object.assign({},...[value].flat(Infinity).filter(x=>x&&typeof x==='object'));for(const pair of [['paddingVertical','paddingTop','paddingBottom'],['paddingHorizontal','paddingLeft','paddingRight'],['marginVertical','marginTop','marginBottom']])if(pair[0]in v){v[pair[1]]=v[pair[0]];v[pair[2]]=v[pair[0]];delete v[pair[0]];}if(typeof v.lineHeight==='number')v.lineHeight=v.lineHeight+'px';return v;}
function box(tag){return function Primitive(p){return React.createElement(tag,{'aria-label':p.accessibilityLabel,'aria-live':p.accessibilityLiveRegion,role:p.accessibilityRole==='radiogroup'?'radiogroup':undefined,style:style([tag==='span'?{display:'block',whiteSpace:'pre-wrap',overflowWrap:'anywhere'}:{display:'flex',flexDirection:'column',boxSizing:'border-box'},p.style,p.contentContainerStyle])},p.children);};}
export const SafeAreaView=box('main'),ScrollView=box('div'),View=box('div'),Text=box('span'),ActivityIndicator=box('span');
function capture(kind,p,callback){window.nativeQa?.capture(kind,p.accessibilityLabel,callback);return callback;}
export const Pressable=p=>React.createElement('button',{'aria-label':p.accessibilityLabel,role:['checkbox','radio'].includes(p.accessibilityRole)?p.accessibilityRole:'button','aria-checked':['checkbox','radio'].includes(p.accessibilityRole)?p.accessibilityState?.checked:undefined,disabled:p.disabled,onClick:capture('press',p,p.onPress),style:style([{display:'flex',flexDirection:'column',boxSizing:'border-box'},p.style])},p.children);
export const TextInput=p=>{const onChangeText=capture('change',p,p.onChangeText);return React.createElement(p.multiline?'textarea':'input',{'aria-label':p.accessibilityLabel,type:p.secureTextEntry?'password':'text',disabled:p.editable===false,value:p.value,maxLength:p.maxLength,autoComplete:'off',onChange:e=>onChangeText(e.target.value),style:style([{boxSizing:'border-box',width:'100%',fontFamily:'inherit'},p.style])});};
export const StyleSheet={create:x=>x},Platform={OS:'android'},TurboModuleRegistry={get:()=>null};
export const AppState={get currentState(){return window.nativeQa?.appState.currentState??'active';},addEventListener(name,fn){return window.nativeQa.appState.addEventListener(name,fn);}};`;
const result=await Bun.build({entrypoints:['platforms/tests/native-public-profile-entry.tsx'],outdir:output,target:'browser',format:'esm',naming:'page.[ext]',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'native-primitives-explicit-double',setup(build){
 // Native node_modules is an older linked runtime with offloaded files. Use
 // only the already-materialized canonical web React for these explicit doubles.
 const reactFiles={'react':'react/index.js','react/jsx-runtime':'react/jsx-runtime.js','react/jsx-dev-runtime':'react/jsx-dev-runtime.js','react-dom/client':'react-dom/client.js'};
 build.onResolve({filter:/^(?:react(?:\/jsx(?:-dev)?-runtime)?|react-dom\/client)$/},args=>({path:path.resolve('node_modules',reactFiles[args.path])}));
 build.onResolve({filter:/^@supabase\/auth-js$/},()=>({path:path.resolve('node_modules/@supabase/auth-js/dist/module/index.js')}));
 build.onResolve({filter:/^react-native$/},()=>({path:'primitives',namespace:'native-fixture'}));
 build.onLoad({filter:/.*/,namespace:'native-fixture'},()=>({contents:primitive,loader:'js',resolveDir:process.cwd()}));
 build.onLoad({filter:/\.(?:[cm]?[jt]sx?|json)$/},args=>({contents:read(args.path).toString(),loader:args.path.endsWith('.tsx')?'tsx':args.path.endsWith('.ts')?'ts':args.path.endsWith('.json')?'json':'jsx',resolveDir:path.dirname(args.path)}));
}}]});for(const log of result.logs)console.error(String(log));if(!result.success)throw Error('Native public profile fixture bundle failed');
for(const[name,expected]of Object.entries({...hashes}))if(sha(read(name))!==expected)throw Error('Source changed '+name);
fs.writeFileSync(output+'/source-manifest.json',JSON.stringify({sourceHashes:hashes,bunVersion:Bun.version,scope:'Actual native App/OwnedAccountScreen, owned AuthClient 2.99.3, native JS auth/member/anonymous profile ports and Circle host/author public profile screens; canonical bearer/account/profile/Circle handlers plus identity/Circle/publication SQL in cached React/Chromium. React Native primitives/AppState and native module/provider/server delivery are explicit doubles. SDK executes in Chromium, not Hermes. No native compilation, OS storage/networking, provider configuration, issued credential or device acceptance.'},null,2)+'\n');console.log('Built actual native App native-public-profile composition and cached AuthClient with explicit platform doubles.');
