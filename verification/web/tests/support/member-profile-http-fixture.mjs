import assert from 'node:assert/strict';
import {offlineApp} from './offline-app.mjs';
import {profileDb,runProfileSql,updateProfile,A,B} from './member-profile-fixture.mjs';
export function profileRequest(body, {method='POST',headers={},raw,url='https://soe.invalid/api/members/profile?memberId='+B}={}) {
 const req=new Request(url,{method,headers:{'content-type':'application/json',origin:new URL(url).origin,'x-member-id':B,...headers},...(method==='POST'?{body:raw??JSON.stringify(body),duplex:'half'}:{})});
 req.cookies={get:()=>undefined};return req;
}
export async function createMemberProfileFixture(t,{install=true}={}) {
 const db=await profileDb(t);if(install)await runProfileSql(db,'apply');const app=offlineApp();let actor=A,commitThenLose=false,wrongOwner=false;const calls=[];
 app.setMock('@/lib/getAuthenticatedMember',()=>({getAuthenticatedMember:async()=>actor?{memberId:actor,member:{id:actor},auth:{provider:'wallet',subject:actor}}:null}));
 app.setMock('@/lib/supabase/admin',()=>({getSupabaseAdmin:()=>({
  from(table){assert.equal(table,'members');let columns,owner;return {select(value){columns=value;assert.equal(columns,'id,display_name,bio,discipline,skills,project_description,seeking,philosophy,profile_visibility,profile_revision');return this;},eq(key,value){assert.equal(key,'id');owner=value;return this;},async single(){calls.push({kind:'read',owner});try{await db.exec('SET ROLE service_role');const data=(await db.query('SELECT '+columns+' FROM members WHERE id=$1',[wrongOwner?B:owner])).rows[0];return {data,error:null};}catch(error){return {data:null,error:{code:error.code,message:'PRIVATE_SQL_DETAILS'}};}finally{await db.exec('RESET ROLE');}}};},
  async rpc(name,args){assert.equal(name,'soe_member_profile_update');calls.push({kind:'write',args:structuredClone(args)});try{const data=await updateProfile(db,args.p_actor,args.p_expected_revision,args.p_patch);if(commitThenLose){commitThenLose=false;throw Error('SYNTHETIC_LOST_RECEIPT');}return {data,error:null};}catch(error){if(error.message==='SYNTHETIC_LOST_RECEIPT')throw error;return {data:null,error:{code:error.code,message:'PRIVATE_SQL_DETAILS'}};}},
 })}));
 return {db,app,calls,route:app.load('app/api/members/profile/route.ts'),setActor:value=>{actor=value;},loseAfterCommit:()=>{commitThenLose=true;},returnWrongOwner:()=>{wrongOwner=true;}};
}
