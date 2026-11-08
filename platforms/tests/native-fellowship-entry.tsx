import React from 'react';
import {createRoot} from 'react-dom/client';
import App from '../native/App';
import {MemberCircleScreen} from '../native/MemberCircleScreen';
const root=createRoot(document.getElementById('root')!);
const origin='https://native-fellowship.test',id='11111111-1111-4111-8111-111111111111',memberId='22222222-2222-4222-8222-222222222222';
const platform=new URL(location.href).searchParams.get('platform')==='ios'?'ios':'android';
let epoch=0,preparations=0,closed=0,state='active',memberLive=true;
const listeners=new Map<string,Set<Function>>(),callbacks=new Map<string,Function>(),held=new Map<string,Function>(),bindingListeners=new Set<Function>(),accountListeners=new Set<Function>(),calls:any[]=[];
const publicCircle={id,title:'Fixture salon',description:'Synthetic listing only',format:'online',format_label:'Online',city:null,region:null,venue_name:null,venue_label:'Online',meeting_label:'Tuesday',weekday:2,time:'19:00',timezone:'UTC',start_date:'2030-01-01',first_meeting:'2030-01-01',next_meeting:'2030-01-01',week:1,reading:{week:1,title:'Synthetic reading',slug:'synthetic-reading',author:'Synthetic author',selection:'Synthetic selection'},reading_program:null,program_length:12,member_count:1,max_members:8,spots_left:7,status:'forming',host_name:'Fixture host',going_next:null,phase:'upcoming'};
const connectivity={snapshot:()=> 'online' as const,subscribe:()=>()=>{}};
const publicTransport=async(url,options)=>{calls.push({lane:'public',url,method:options.method,headers:options.headers});return{url,status:200,redirected:false,json:async()=>({ready:true,circles:[publicCircle],page:{limit:25,nextCursor:null,asOf:'2029-12-20T12:00:00Z'}})};};
const owner={scope:()=>memberLive?'fixture-scope':null,subscribe:()=>()=>{},bearer:async()=> 'NONISSUED_FIXTURE'};
const transport=async(url,options)=>{calls.push({lane:'member',url,method:options.method});return{url,status:url===origin+'/api/circles/'+id?200:503,redirected:false,json:async()=>({ready:true,circle:{...publicCircle,hidden:false},revision:1,viewer:{signed_in:true,is_member:true,is_host:false},ended:false,capabilities:{canJoin:false,canLeave:true,canRsvp:true,canComplete:false,canReadConversation:true},meetings:[{date:'2030-01-01',going:0,my_status:null}],online_url:'https://meeting.example.invalid/private-fixture'})};};
const bindingModel=()=>({phase:memberLive?'ready':'unavailable',canCheck:true,busy:false,message:'Synthetic sign-in state'});
const accountModel=()=>({canOpenCircle:memberLive,member:memberLive?{id:memberId}:null,canCheck:true,message:'Synthetic member state'});
const config={origin,auth:{}},host={origin,owner,transport,publicTransport};
const retained:any={config,connectivity,host,binding:{model:bindingModel,subscribe(fn){bindingListeners.add(fn);fn(bindingModel());return()=>bindingListeners.delete(fn);},activity(){},connectivity(){},start:async()=>{},stop(){},owner},account:{model:accountModel,subscribe(fn){accountListeners.add(fn);fn(accountModel());return()=>accountListeners.delete(fn);},activity(){},connectivity(){},connect(){}},discardOtherMemberViews(){},profile:()=>null,savedReading:()=>null,hosting:()=>null,admission:()=>null,disconnect(){},close(){closed++;}};
const qa={platform,get state(){return state;},listen(name,fn){const set=listeners.get(name)??new Set();listeners.set(name,set);set.add(fn);return{remove(){set.delete(fn);}};},capture(label,fn){callbacks.set(label,fn);},hold(label){held.set(label,callbacks.get(label)!);},replay(label){held.get(label)?.();},
 activity(name,value='active'){if(platform==='ios'&&(name==='blur'||name==='focus')){value=name==='blur'?'inactive':'active';name='change';}if(name==='change')state=value;for(const fn of [...listeners.get(name)??[]])fn(value);},
 stats:()=>({preparations,closed,calls:[...calls],listeners:[...listeners.values()].reduce((n,s)=>n+s.size,0)}),
 retireMember(){memberLive=false;for(const fn of [...bindingListeners])fn(bindingModel());for(const fn of [...accountListeners])fn(accountModel());},
 showMember(){memberLive=true;root.render(<React.StrictMode key={++epoch}><MemberCircleScreen config={config as any} retained={retained} connectivity={connectivity} onClose={()=>{}}/></React.StrictMode>);},
 show(){state='active';calls.length=0;root.render(<React.StrictMode key={++epoch}><App ownedAccountPrepare={async()=>{preparations++;throw Error('No provider configured in fixture');}} publicCirclesPrepare={async()=>({origin,publicTransport,connectivity,close(){closed++;}})}/></React.StrictMode>);},
 unmount(){root.render(<div>Unmounted</div>);},
};Object.assign(window,{fellowshipQa:qa});qa.show();
