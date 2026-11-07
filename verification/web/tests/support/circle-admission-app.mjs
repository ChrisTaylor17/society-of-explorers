// Current actual routes/SQL, synthetic identities and an in-memory Postgres
// backend. No hosted account, issued key or real network transport is used.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {participationApp,IDS} from './participation-app.mjs';
import {creationInput,requestId} from './participation-db.mjs';
export {IDS,requestId};
export async function admissionApp(){
 const f=await participationApp();
 try{
  await f.db.exec('ALTER TABLE public.members ADD COLUMN supabase_auth_id uuid UNIQUE, ADD COLUMN wallet_address text; UPDATE public.members SET supabase_auth_id=id;');
  for(const name of ['account-deletion-requests-apply.sql','account-erasure-access-apply.sql','circle-admission-apply.sql'])
   await f.db.exec(await readFile(new URL('../../../../docs/sql/'+name,import.meta.url),'utf8'));
  const handlers=new Map();
  async function dispatch(path,{method='POST',body,headers={}}={}){
   const match=/^\/api\/circles\/([a-f0-9-]+)\/(invitation-review|invitations|join-invited|invitations\/revoke|discussion)$/.exec(path);
   assert.ok(match,'Only exact admission/test discussion paths are allowed');
   const file='app/api/circles/[circleId]/'+match[2]+'/route.ts';
   if(!handlers.has(file))handlers.set(file,f.app.load(file));
   const handler=handlers.get(file)[method];assert.equal(typeof handler,'function');
   return handler(f.request(body,path,headers),{params:Promise.resolve({circleId:match[1]})});
  }
  async function create({host=IDS.newcomer,admissionMode='host_approval'}={}){
   f.setActor(host);
   const input=await creationInput(f.db,{format:'online',city:null,region:null,venueName:null,venueType:'online',onlineUrl:'https://meeting.example.invalid/PRIVATE_SYNTHETIC_ROOM',admissionMode});
   const response=await f.dispatch('/api/circles','POST',{expectedMemberId:host,requestId:requestId(),...input});
   const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;
  }
  return{...f,dispatchAdmission:dispatch,create,revision:async circleId=>Number((await f.db.query('SELECT circle_participation_revision r FROM book_cohorts WHERE id=$1',[circleId])).rows[0].r)};
 }catch(error){await f.db.close();throw error;}
}
