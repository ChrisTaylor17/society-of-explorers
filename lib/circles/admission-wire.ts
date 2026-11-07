import { canonicalAdmissionUuid, exactAdmissionKeys, isCircleApprovalCode, parseCircleInvitationIssueInput,
  parseCircleInvitationRecovery, parseCircleInvitationReviewInput, parseCircleInvitedJoinInput, parseCircleInvitationRevokeInput } from './admission';
import { membershipRecord } from './membership';

export const CIRCLE_ADMISSION_POLICY = 'member-bound-circle-admission-v1';
export const CIRCLE_ADMISSION_BODY_MAX_BYTES = 4096;
export const CIRCLE_ADMISSION_ACTIONS = ['admission-access','recipient-code','invitation-review','invitations','invitation-check','join-invited','invitation-receipt','invitations/revoke'] as const;
export type CircleAdmissionAction = typeof CIRCLE_ADMISSION_ACTIONS[number];
export function circleAdmissionInput(action:CircleAdmissionAction,value:unknown):Record<string,unknown>|null {
 if(action==='invitation-review')return parseCircleInvitationReviewInput(value);
 if(action==='invitations')return parseCircleInvitationIssueInput(value);
 if(action==='join-invited')return parseCircleInvitedJoinInput(value);
 if(action==='invitation-receipt')return parseCircleInvitationRecovery(value);
 if(action==='invitations/revoke')return parseCircleInvitationRevokeInput(value);
 if(!membershipRecord(value)||!canonicalAdmissionUuid(value.expectedMemberId))return null;
 const expectedMemberId=value.expectedMemberId;
 if(action==='admission-access')return exactAdmissionKeys(value,['expectedMemberId'])?{expectedMemberId}:null;
 if(action==='recipient-code')return exactAdmissionKeys(value,['expectedMemberId','shareConsent'])&&value.shareConsent===true?{expectedMemberId,shareConsent:true}:null;
 if(action==='invitation-check')return exactAdmissionKeys(value,['expectedMemberId','invitationToken'])&&isCircleApprovalCode(value.invitationToken)?{expectedMemberId,invitationToken:value.invitationToken}:null;
 return null;
}
export function circleAdmissionMutationBody(action:CircleAdmissionAction,value:unknown):string {
 const parsed=circleAdmissionInput(action,value);if(!parsed)throw Error('A current reviewed invitation request is required');return JSON.stringify(parsed);
}
/** A narrow request wire, not authorization. The server verifies signatures,
 * current accounts, consent, revisions, capacity and receipts independently. */
const bytes=(value:string)=>{let n=0;for(const char of value){const c=char.codePointAt(0)!;n+=c<128?1:c<2048?2:c<65536?3:4;}return n;};
export function validateCircleAdmissionRequest(method:string,path:string,raw:unknown):boolean {
 try{
  const match=/^\/api\/circles\/([0-9a-f-]{36})\/(admission-access|recipient-code|invitation-review|invitations|invitation-check|join-invited|invitation-receipt|invitations\/revoke)$/.exec(path);
  return method==='POST'&&!!match&&canonicalAdmissionUuid(match[1])&&typeof raw==='string'&&bytes(raw)<=CIRCLE_ADMISSION_BODY_MAX_BYTES
    &&circleAdmissionMutationBody(match[2] as CircleAdmissionAction,JSON.parse(raw))===raw;
 }catch{return false;}
}
