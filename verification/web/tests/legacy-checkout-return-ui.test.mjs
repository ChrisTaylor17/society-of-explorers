import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {offlineApp} from './support/offline-app.mjs';

const require=createRequire(path.resolve('../../package.json'));
const tooling=createRequire(path.resolve('tooling/package.json'));
const {JSDOM}=tooling('jsdom');

async function mount(url){
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url,pretendToBeVisual:true}),previous={};
 for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){
  previous[key]=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 }
 const React=require('react'),{createRoot}=require('react-dom/client'),{act}=React,app=offlineApp(),events=[],requests=[];
 app.context.window=dom.window;app.context.document=dom.window.document;
 app.context.fetch=(...args)=>{requests.push(args);throw Error('Network forbidden');};
 app.setMock('@/lib/analytics/client',()=>({track:name=>events.push(name)}));
 const View=app.load('components/CheckoutWelcome.tsx').default,root=createRoot(document.getElementById('root'));
 await act(async()=>root.render(React.createElement(View)));
 return {dom,events,requests,act,async cleanup(){await act(async()=>root.unmount());dom.window.close();for(const [key,value] of Object.entries(previous)){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}};
}

test('a forged legacy return URL never claims payment, changes access or starts billing requests',async()=>{
 const a=await mount('https://offline.invalid/practice?welcome=1&keep=reading#chapter');
 try{
  assert.match(document.body.textContent,/does not confirm a payment or membership change/);
  assert.doesNotMatch(document.body.textContent,/Your payment went through|payment confirmed|membership activated/i);
  assert.equal(document.querySelector('a').getAttribute('href'),'/billing');
  assert.equal(document.querySelector('a').style.minHeight,'44px');
  assert.equal(document.querySelector('button').style.minHeight,'44px');
  assert.equal(a.dom.window.location.href,'https://offline.invalid/practice?keep=reading#chapter');
  assert.deepEqual(a.events,['checkout_welcome_view']);assert.deepEqual(a.requests,[]);
  await a.act(async()=>document.querySelector('button').click());assert.equal(document.querySelector('[role=status]'),null);
 }finally{await a.cleanup();}
});

test('ordinary free reading has no billing banner, transport or analytics event',async()=>{
 const a=await mount('https://offline.invalid/practice?keep=reading');
 try{assert.equal(document.querySelector('[role=status]'),null);assert.deepEqual(a.events,[]);assert.deepEqual(a.requests,[]);}
 finally{await a.cleanup();}
});
