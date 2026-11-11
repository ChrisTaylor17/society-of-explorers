'use client';
import Link from 'next/link';
import { useCallback, useRef } from 'react';
import { useCircleAdmission } from '@/lib/circles/useCircleAdmission';
import type { CircleAdmissionActivity } from '@/lib/circles/admission-activity';
import { isCircleApprovalCode, isCircleRecipientCode } from '@/lib/circles/admission';
import { circleDetailHref } from '@/lib/circles/discovery';
import { withReelDiscussion, type ReelDiscussionId } from '@/lib/clips/salon';
import { withFellowshipTopic, type FellowshipTopicId } from '@/lib/fellowship/topics';
import { body, button, card, fieldLabel, h1, h2, input, primary, small } from '@/lib/circles/ui';
import styles from '../participation.module.css';

export default function CircleAdmission({circleId,activity,embedded=false,fromOnline=false,reel,fellowship}:{circleId:string;activity?:CircleAdmissionActivity;embedded?:boolean;fromOnline?:boolean;reel?:ReelDiscussionId;fellowship?:FellowshipTopicId}) {
 const flow=useCircleAdmission(circleId,activity),disabled=!flow.active||flow.busy,locked=disabled||flow.uncertain||!!flow.intent;
 const contextHref=(href:string)=>withFellowshipTopic(withReelDiscussion(href,reel),fellowship);
 const returnPath=contextHref(`/circles/${circleId}/admission${fromOnline?'?from=online':''}`);
 const Heading=embedded?'h2':'h1';
 const access=flow.access,intent=flow.intent,statusRef=useRef<HTMLParagraphElement>(null);
 const focusReview=useCallback((node:HTMLHeadingElement|null)=>node?.focus({preventScroll:true}),[]);
 const confirmLabel=intent?.kind==='issue'?'Issue approval code':intent?.kind==='join'?'Confirm join':'Confirm revocation';
 const code=(label:string,value:string)=><label style={fieldLabel}>{label}<textarea aria-label={label} readOnly value={value} autoComplete="off" spellCheck={false} rows={5}
   onFocus={event=>event.currentTarget.select()} style={{...input,width:'100%',boxSizing:'border-box',overflowWrap:'anywhere'}}/></label>;
 return <div className={styles.scope} onClickCapture={event=>{
  if((flow.uncertain||flow.busy||flow.intent)&&(event.target as HTMLElement).closest('a'))event.preventDefault();
 }}>
  <Heading style={h1}>Salon invitations</Heading>
  <p style={body}>A salon’s name, description and schedule are public. Host approval controls membership; it does not hide the listing or secure an external video room. The host manages entry to that room.</p>
  <p style={small}><Link href={contextHref(circleDetailHref(circleId,fromOnline))}>Salon details</Link> · <Link href={`/login?next=${encodeURIComponent(returnPath)}`}>Sign in</Link>. Approval codes stay out of links. Paste them only into this private form.</p>
  <p ref={statusRef} tabIndex={-1} role="status" aria-live="polite" style={body}>{flow.notice}</p>
  <div className={styles.row}>
   <button type="button" style={button} disabled={disabled||!!intent} onClick={flow.load}>Check invitation access</button>
   <button type="button" style={button} disabled={disabled} onClick={flow.close}>Close private invitation view</button>
   {flow.canRecover&&<button type="button" style={button} disabled={disabled||!!intent} onClick={flow.recover}>Check earlier invitation result</button>}
  </div>
  {flow.uncertain&&<p style={small}>A sent request may still complete. Other changes are paused. Checking an earlier join result is read only and cannot join you again. Closing or leaving this page forgets how to check that result; it does not cancel the change.</p>}
  {access&&<>
   <p style={body}><strong>{access.title}</strong> · Signed in as {flow.account} (account {access.memberId.slice(0,8)}).</p>
   <p style={small}>{access.admissionMode==='host_approval'?'Membership requires this host’s approval.':'This salon uses open joining; use its regular membership controls.'}{access.isMember?' You are currently a member.':''}</p>
   {access.admissionMode==='host_approval'&&!access.isMember&&<section className={styles.stack} style={card} aria-label="Get a host approval">
    <h2 style={h2}>Give the host your sharing code</h2>
    <p style={body}>Choose to let this salon’s host see your member name and account reference. The sharing code lasts one hour, works only for this salon, and gives no membership or access to messages. Send it privately to the host.</p>
    <label className={styles.check}><input type="checkbox" disabled={locked} checked={flow.shareConsent} onChange={e=>flow.consent(e.target.checked)}/>I choose to share my member name and account reference with this salon’s host.</label>
    <button type="button" style={button} disabled={locked||!flow.shareConsent} onClick={flow.generate}>Create my sharing code</button>
    {flow.recipientCode&&code('My one-hour sharing code',flow.recipientCode)}
   </section>}
   {access.canIssue&&<section className={styles.stack} style={card} aria-label="Host approval controls">
    <h2 style={h2}>Approve a recipient</h2>
    <p style={body}>Ask the person to create their own sharing code here. Review their name before issuing a 24-hour approval. Anyone with a forwarded approval still needs the exact recipient account.</p>
    <label style={fieldLabel}>Recipient sharing code<textarea aria-label="Recipient sharing code" rows={4} autoComplete="off" spellCheck={false} value={flow.hostCode} disabled={locked} onChange={e=>flow.edit('hostCode',e.target.value.trim())} style={{...input,width:'100%',boxSizing:'border-box'}}/></label>
    <button type="button" style={primary} disabled={locked||!isCircleRecipientCode(flow.hostCode)} onClick={flow.reviewHost}>Review recipient</button>
    {flow.issuedApproval&&<>{code('Approval code for the reviewed recipient',flow.issuedApproval)}<p style={small}>Send only to the reviewed person, together with this salon’s public address. Issuing a code has not joined them. A later membership or host change can make it unusable.</p></>}
   </section>}
   {!access.isMember&&access.admissionMode==='host_approval'&&<section className={styles.stack} style={card} aria-label="Use host approval">
    <h2 style={h2}>Review the host’s approval</h2>
    <p style={body}>Paste the approval the host gave you. Reviewing it will check the account and salon; joining requires a separate confirmation.</p>
    <label style={fieldLabel}>Host approval code<textarea aria-label="Host approval code" rows={4} autoComplete="off" spellCheck={false} value={flow.approvalText} disabled={locked} onChange={e=>flow.edit('approvalText',e.target.value.trim())} style={{...input,width:'100%',boxSizing:'border-box'}}/></label>
    <button type="button" style={primary} disabled={locked||!isCircleApprovalCode(flow.approvalText)} onClick={flow.reviewJoin}>Review my approval</button>
   </section>}
   {access.canRevoke&&<section className={styles.stack} style={card} aria-label="Revoke outstanding approvals">
    <h2 style={h2}>Revoke outstanding approvals</h2>
    <p style={body}>All unused approvals for this salon will stop working. Existing members stay. You can issue new approvals after revocation.</p>
    <button type="button" style={button} disabled={locked} onClick={flow.reviewRevoke}>Review revocation</button>
   </section>}
  </>}
  {intent&&<section aria-label="Review invitation action" className={styles.stack} style={card}>
   <h2 style={h2} tabIndex={-1} ref={focusReview}>{intent.kind==='issue'?'Review this recipient':intent.kind==='join'?'Review joining this salon':'Review revoking outstanding approvals'}</h2>
   <p style={body}>Salon: {access?.title}. Account: {flow.account} ({access?.memberId.slice(0,8)}).</p>
   {intent.kind==='issue'&&<><p style={body}>Recipient: {intent.review.targetLabel} (account {intent.review.targetMemberId.slice(0,8)}).</p><p style={small}>Approval expires {intent.review.expiresAt}. It admits only this account after that person explicitly confirms.</p></>}
   {intent.kind==='join'&&<p style={body}>This approval is for your current account and expires {intent.check.expiresAt}. Joining shares your membership with the salon and permits its member conversation. The listing remains public.</p>}
   {intent.kind==='revoke'&&<p style={body}>Revoke outstanding approvals. Existing members will remain. If a reply is lost, checking the earlier result will not revoke a second time.</p>}
   <label className={styles.check}><input type="checkbox" disabled={disabled} checked={flow.confirmed} onChange={e=>flow.check(e.target.checked)}/>I reviewed the account, recipient and effects above and want to {intent.kind==='issue'?'issue this approval':intent.kind==='join'?'join this salon':'revoke outstanding approvals'}.</label>
   <div className={styles.row}><button type="button" style={primary} disabled={disabled||!flow.confirmed} onClick={flow.confirm}>{confirmLabel}</button><button type="button" style={button} disabled={disabled} onClick={()=>{flow.cancel();if(document.visibilityState==='visible'&&document.hasFocus())statusRef.current?.focus({preventScroll:true});}}>Cancel invitation review</button></div>
  </section>}
  <p style={small}>Codes and names clear when this tab loses focus, goes offline, or changes account. Return, check access and paste a code again if needed. A sent join keeps only enough information in this open view to check its result. This page does not save codes for later.</p>
 </div>;
}
