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
read(process.execPath);read('platforms/tests/bundle-native-message-reviewer.mjs');
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
const primitive=`import React from 'react';
function style(value){const v=Object.assign({},...[value].flat(Infinity).filter(x=>x&&typeof x==='object'));for(const pair of [['paddingVertical','paddingTop','paddingBottom'],['paddingHorizontal','paddingLeft','paddingRight'],['marginVertical','marginTop','marginBottom']])if(pair[0]in v){v[pair[1]]=v[pair[0]];v[pair[2]]=v[pair[0]];delete v[pair[0]];}if(typeof v.lineHeight==='number')v.lineHeight=v.lineHeight+'px';return v;}
function box(tag){return function Primitive(p){return React.createElement(tag,{'aria-label':p.accessibilityLabel,'aria-live':p.accessibilityLiveRegion,role:p.accessibilityRole==='radiogroup'?'radiogroup':undefined,style:style([tag==='span'?{display:'block'}:{display:'flex',flexDirection:'column',boxSizing:'border-box'},p.style,p.contentContainerStyle])},p.children);};}
export const SafeAreaView=box('main'),ScrollView=box('div'),View=box('div'),Text=box('span'),ActivityIndicator=box('span');
export const Pressable=p=>React.createElement('button',{'aria-label':p.accessibilityLabel,role:['checkbox','radio'].includes(p.accessibilityRole)?p.accessibilityRole:'button','aria-checked':['checkbox','radio'].includes(p.accessibilityRole)?p.accessibilityState?.checked:undefined,disabled:p.disabled,onClick:p.onPress,style:style([{display:'flex',flexDirection:'column',boxSizing:'border-box'},p.style])},p.children);
export const TextInput=p=>React.createElement(p.multiline?'textarea':'input',{'aria-label':p.accessibilityLabel,type:p.secureTextEntry?'password':'text',disabled:p.editable===false,value:p.value,maxLength:p.maxLength,autoComplete:'off',onChange:e=>p.onChangeText(e.target.value),style:style([{boxSizing:'border-box',width:'100%',fontFamily:'inherit'},p.style])});
export const UIManager={getViewManagerConfig:()=>null},codegenNativeComponent=()=>()=>null;
export const StyleSheet={create:x=>x},Platform={OS:'android'},TurboModuleRegistry={get:()=>null};
export const AppState={get currentState(){return window.nativeReviewerQa?.appState.currentState??'active';},addEventListener(name,fn){return window.nativeReviewerQa.appState.addEventListener(name,fn);}};`;
const output='verification/web/evidence/native-message-reviewer-fixture';
const result=await Bun.build({entrypoints:['platforms/tests/native-message-reviewer-entry.tsx'],outdir:output,target:'browser',format:'esm',naming:'page.[ext]',define:{
 'process.env.NODE_ENV':'"development"','process.env.NEXT_PUBLIC_SUPABASE_URL':'"https://email-recovery-provider.test"',
 'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY':'"sb_publishable_NONISSUED_WEB_RECOVERY_SESSION"',
},plugins:[{name:'actual-recovery-cached-runtime',setup(build){
 build.onResolve({filter:/^@supabase\/auth-js$/},()=>({path:path.join(authRoot,'index.js')}));
  build.onResolve({filter:/^react-native$/},()=>({path:'primitives',namespace:'native-reviewer-fixture'}));
  build.onLoad({filter:/.*/,namespace:'native-reviewer-fixture'},()=>({contents:primitive,loader:'js',resolveDir:process.cwd()}));
 const reactFiles={'react':'react/index.js','react/jsx-runtime':'react/jsx-runtime.js','react/jsx-dev-runtime':'react/jsx-dev-runtime.js','react-dom/client':'react-dom/client.js'};
 build.onResolve({filter:/^(?:react(?:\/jsx(?:-dev)?-runtime)?|react-dom\/client)$/},args=>({path:path.resolve('node_modules',reactFiles[args.path])}));
 build.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'recovery-fixture'}));
 build.onLoad({filter:/.*/,namespace:'recovery-fixture'},()=>({loader:'js',resolveDir:process.cwd(),contents:'import React from "react";export default function Link({children,href,prefetch,replace,scroll,...props}){return React.createElement("a",{href,...props},children);}'}));
 build.onLoad({filter:/\.(?:[cm]?[jt]sx?|json|css)$/},args=>({contents:read(args.path).toString(),loader:args.path.endsWith('.tsx')?'tsx':args.path.endsWith('.ts')?'ts':args.path.endsWith('.json')?'json':args.path.endsWith('.css')?'css':'jsx',resolveDir:path.dirname(args.path)}));
}}]});
for(const log of result.logs)console.error(String(log));if(!result.success)throw Error('Native reviewer account bundle failed');
for(const[n,h]of Object.entries({...sourceHashes,...runtimeHashes}))if(sha(read(n))!==h)throw Error('Changed bundle input '+n);
fs.writeFileSync(output+'/source-manifest.json',JSON.stringify({sourceHashes,runtimeHashes,bunVersion:Bun.version,
 scope:'Actual registered native App, OwnedAccountScreen, MemberCircleScreen, MessageReviewsScreen, portable reviewer controller, ordinary auth controller, strict native JS ports and cached AuthClient2.99.3. React Native DOM primitives, protected OS storage, lifecycle and provider delivery are explicit browser doubles. No Kotlin/Hermes/device or real provider acceptance.'},null,2)+'\n');
console.log('Built actual native reviewer account composition and cached SDK.');
