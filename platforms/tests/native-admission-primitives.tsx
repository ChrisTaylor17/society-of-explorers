import React from 'react';
function style(v:unknown){const out=Object.assign({},...[v].flat(Infinity).filter(x=>x&&typeof x==='object'));for(const[a,b,c]of [['paddingVertical','paddingTop','paddingBottom'],['paddingHorizontal','paddingLeft','paddingRight'],['marginVertical','marginTop','marginBottom']])if(a in out){out[b]=out[a];out[c]=out[a];delete out[a];}if(typeof out.lineHeight==='number')out.lineHeight=out.lineHeight+'px';return out;}
const box=(tag:string)=>function NativeBox(p:any){return React.createElement(tag,{'aria-label':p.accessibilityLabel,role:p.accessibilityRole==='header'?'heading':p.accessibilityRole==='radiogroup'?'radiogroup':undefined,'aria-level':p.accessibilityRole==='header'?2:undefined,style:style([{display:'flex',flexDirection:'column',boxSizing:'border-box',overflowWrap:'anywhere'},p.style,p.contentContainerStyle])},p.children);}
export const SafeAreaView=box('main'),ScrollView=box('div'),View=box('div'),Text=box('span'),ActivityIndicator=box('span');
export const Pressable=(p:any)=>{window.nativeAdmissionQa.capture(p.accessibilityLabel,p.onPress);return <button aria-label={p.accessibilityLabel} role={['checkbox','radio'].includes(p.accessibilityRole)?p.accessibilityRole:'button'} aria-checked={p.accessibilityState?.checked} disabled={p.disabled} onClick={p.onPress} style={style(p.style)}>{p.children}</button>;};
export const TextInput=(p:any)=><input aria-label={p.accessibilityLabel} value={p.value} maxLength={p.maxLength} disabled={p.editable===false} autoComplete="off" onChange={e=>p.onChangeText(e.target.value)} style={style([{boxSizing:'border-box',width:'100%'},p.style])}/>;
export const StyleSheet={create:(v:unknown)=>v};
export const Platform={get OS(){return window.nativeAdmissionQa.platform;}};
export const AppState={get currentState(){return window.nativeAdmissionQa.state;},addEventListener:(name:string,fn:(value:string)=>void)=>window.nativeAdmissionQa.listen(name,fn)};
export const UIManager={getViewManagerConfig:()=>null};
export const codegenNativeComponent=()=>()=>null;
export const TurboModuleRegistry={get:()=>null};
export const Linking={openURL:async()=>{throw Error('Unexpected external open');}};
