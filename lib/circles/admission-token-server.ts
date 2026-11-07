import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { admissionTime, canonicalAdmissionUuid, exactAdmissionKeys, CIRCLE_INVITATION_LIFETIME_MS, CIRCLE_INVITATION_MAX_LENGTH } from './admission';
import { membershipInteger, membershipRecord } from './membership';

const PURPOSE = 'soe.circle.invitation.v1';
const PREFIX = 'soe-ci1';
export type CircleInvitationClaims = { purpose: typeof PURPOSE; circleId: string; memberId: string; hostMemberId: string;
  invitationRevision: number; nonce: string; issuedAt: string; expiresAt: string };

function key(purpose: string = PURPOSE): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error('Invitation signing is unavailable');
  return createHmac('sha256', secret).update('Society of Explorers\0' + purpose).digest();
}
function claims(value: unknown): CircleInvitationClaims | null {
  if (!membershipRecord(value) || !exactAdmissionKeys(value, ['purpose', 'circleId', 'memberId', 'hostMemberId', 'invitationRevision', 'nonce', 'issuedAt', 'expiresAt'])
    || value.purpose !== PURPOSE || ![value.circleId, value.memberId, value.hostMemberId, value.nonce].every(canonicalAdmissionUuid)
    || !membershipInteger(value.invitationRevision) || value.invitationRevision < 1 || !admissionTime(value.issuedAt) || !admissionTime(value.expiresAt)) return null;
  const duration = Date.parse(value.expiresAt) - Date.parse(value.issuedAt);
  if (duration <= 0 || duration > CIRCLE_INVITATION_LIFETIME_MS) return null;
  return { purpose: PURPOSE, circleId: value.circleId as string, memberId: value.memberId as string, hostMemberId: value.hostMemberId as string,
    invitationRevision: value.invitationRevision, nonce: value.nonce as string, issuedAt: value.issuedAt, expiresAt: value.expiresAt };
}
export function signCircleInvitation(input: Omit<CircleInvitationClaims, 'purpose'>): string {
  const value = claims({ purpose: PURPOSE, ...input });
  if (!value) throw new Error('A reviewed invitation is required');
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  const message = PREFIX + '.' + payload;
  return message + '.' + createHmac('sha256', key()).update(message).digest('base64url');
}
/** Verify signature, purpose, recipient, Circle and bounded lifetime. SQL checks
 * current expiry after exact receipt lookup, so an expired committed request can
 * be settled without using that old approval to create another membership. */
export function verifyCircleInvitation(token: string, circleId: string, memberId: string): CircleInvitationClaims | null {
  if (token.length > CIRCLE_INVITATION_MAX_LENGTH) return null;
  const match = /^soe-ci1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return null;
  const payload = Buffer.from(match[1], 'base64url'), signature = Buffer.from(match[2], 'base64url');
  if (payload.toString('base64url') !== match[1] || signature.toString('base64url') !== match[2]) return null;
  const expected = createHmac('sha256', key()).update(PREFIX + '.' + match[1]).digest();
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null;
  let value: CircleInvitationClaims | null;
  try { value = claims(JSON.parse(payload.toString('utf8'))); } catch { return null; }
  return value && value.circleId === circleId && value.memberId === memberId
    && Date.parse(value.issuedAt) <= Date.now() + 60_000 ? value : null;
}
export const circleInvitationProofHash = (token: string) => createHash('sha256').update(token).digest('hex');

const RECIPIENT_PURPOSE='soe.circle.recipient-consent.v1';
export function signCircleRecipientCode(circleId:string,memberId:string,nonce:string): {recipientCode:string;expiresAt:string} {
  if(![circleId,memberId,nonce].every(canonicalAdmissionUuid)) throw Error('A current member is required');
  const issued=new Date(),issuedAt=issued.toISOString(),expiresAt=new Date(issued.getTime()+60*60*1000).toISOString();
  const payload=Buffer.from(JSON.stringify({purpose:RECIPIENT_PURPOSE,circleId,memberId,nonce,issuedAt,expiresAt})).toString('base64url');
  const message='soe-cr1.'+payload;
  return {recipientCode:message+'.'+createHmac('sha256',key(RECIPIENT_PURPOSE)).update(message).digest('base64url'),expiresAt};
}
export function verifyCircleRecipientCode(code:string,circleId:string): string|null {
  if(code.length>1000) return null;
  const m=/^soe-cr1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(code);if(!m)return null;
  const payload=Buffer.from(m[1],'base64url'),sig=Buffer.from(m[2],'base64url');
  if(payload.toString('base64url')!==m[1] || sig.toString('base64url')!==m[2])return null;
  const expected=createHmac('sha256',key(RECIPIENT_PURPOSE)).update('soe-cr1.'+m[1]).digest();
  if(sig.length!==expected.length || !timingSafeEqual(sig,expected))return null;
  try {
    const v=JSON.parse(payload.toString('utf8'));
    if(!membershipRecord(v) || !exactAdmissionKeys(v,['purpose','circleId','memberId','nonce','issuedAt','expiresAt']) || v.purpose!==RECIPIENT_PURPOSE || v.circleId!==circleId
      || ![v.circleId,v.memberId,v.nonce].every(canonicalAdmissionUuid) || !admissionTime(v.issuedAt) || !admissionTime(v.expiresAt))return null;
    const now=Date.now(),issued=Date.parse(v.issuedAt),expires=Date.parse(v.expiresAt);
    return issued<=now+60000 && expires>now && expires>issued && expires-issued<=60*60*1000 ? v.memberId as string : null;
  }catch{return null;}
}
