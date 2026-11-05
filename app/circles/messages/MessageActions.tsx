'use client';

import { useCallback, useId, useRef, useState } from 'react';
import type { DiscussionMessage } from '@/lib/circles/discussion-reader';
import { parseMessageActionReceipt, parseMessageSafetyState, type MessageSafetyState } from '@/lib/circles/message-moderation';
import { useReviewAccess } from '@/lib/circles/useReviewAccess';
import { REPORT_REASONS, REPORT_LABELS, type ReportReason } from '@/lib/circles/report';
import { body, button, card, fieldLabel, h2, input, primary, small } from '@/lib/circles/ui';
import styles from './safety.module.css';
import { MessagePassageContext } from '@/app/great-books/PassageContext';
import Link from 'next/link';
import { discussionHref } from '@/lib/circles/thread';
import PublishedProfileLink from '@/components/PublishedProfileLink';

export const WITHDRAWAL_PRIVACY = 'Withdrawal removes the message from member views. It is not physical erasure: restricted evidence may remain for safety review. The retention policy is not yet finalized.';
export const messageReasonLabel = (reason: string) => reason === 'misleading' ? 'Misleading content' : reason === 'no_violation' ? 'No violation found' : reason === 'insufficient_evidence' ? 'Insufficient evidence' : reason === 'resolved' ? 'Concern resolved' : REPORT_LABELS[reason as ReportReason] || reason;
type Props = { circleId: string; message: DiscussionMessage; active?: boolean; initialState?: MessageSafetyState; onAccessDenied?: (status: number) => void; onCurrentState?: (state: MessageSafetyState) => void };
type Pending = { action: 'report' | 'withdraw'; expectedRevision: number; contentHash: string | null; requestId: string; reason?: ReportReason; note?: string | null };

/** A keyed lifetime prevents a reply or private draft crossing message identities. */
export default function MessageActions(props: Props) {
  // The portable conversation projection represents held content as a new
  // tombstone string. A fresh projection must replace an older checked body.
  return <MessageCard key={JSON.stringify([props.circleId, props.message.id, props.message.content, props.message.is_mine, props.message.publicProfileId, props.initialState?.revision])} {...props} />;
}
function MessageCard({ circleId, message, active: parentActive = true, initialState, onAccessDenied, onCurrentState }: Props) {
  const id = useId();
  const [state, setState] = useState<MessageSafetyState | null>(initialState || null);
  const [open, setOpen] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [notice, setNotice] = useState('');
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const sending = useRef(false);
  const focusHeading = useCallback((element: HTMLHeadingElement | null) => { element?.focus({ preventScroll: true }); }, []);
  const opener = useRef<HTMLButtonElement>(null);
  const clearDraft = useCallback(() => { setReason(''); setNote(''); setConfirmed(false); setPending(null); }, []);
  const retire = useCallback(() => {
    setState(null); setOpen(false); setCleared(true); clearDraft(); sending.current = false;
    setNotice('Message details and drafts cleared. Check the current message to continue. A request already sent may still have been saved.');
  }, [clearDraft]);
  const { active, busy, perform } = useReviewAccess(retire);
  const disabled = !parentActive || !active || busy;
  const url = `/api/circles/${encodeURIComponent(circleId)}/messages/${encodeURIComponent(message.id)}`;
  const matches = (value: MessageSafetyState) => value.circleId === circleId && value.message.id === message.id;
  function unavailable(status?: number) {
    setState(null); setCleared(true); clearDraft();
    if (status === 401 || status === 403 || status === 404) onAccessDenied?.(status);
    setNotice(status === 401 ? 'Sign in to check this message.' : status === 403 || status === 404 ? 'This message is not available for this account.' : status === 409 ? 'This message changed. Check the current message before choosing another action.' : status === 429 ? 'Too many requests. Wait before checking this message again.' : 'Current message information could not be loaded. No action is being assumed.');
  }
  function load() {
    if (disabled || sending.current) return;
    setOpen(true); setState(null); setCleared(true); clearDraft(); setNotice('Checking current message and access…');
    void perform(url, { method: 'GET' }, ({ status, body: value }) => {
      const current = status === 200 ? parseMessageSafetyState(value) : null;
      if (!current || !matches(current)) return unavailable(status);
      setState(current); setCleared(false); setNotice('Current message loaded. Actions use this checked version.');
      onCurrentState?.(current);
    }, () => unavailable());
  }
  function send(request: Pending) {
    if (disabled || sending.current) return;
    sending.current = true; setPending(null); setState(null); setCleared(true); setReason(''); setNote(''); setConfirmed(false);
    setNotice(request.action === 'withdraw' ? 'Withdrawing message…' : 'Sending private report…');
    void perform(url, { method: 'POST', body: JSON.stringify(request) }, ({ status, body: value }) => {
      sending.current = false;
      const receipt = status === 200 ? parseMessageActionReceipt(value) : null;
      const valid = receipt && receipt.requestId === request.requestId && receipt.circleId === circleId && receipt.messageId === message.id
        && matches(receipt.state) && receipt.state.revision >= request.expectedRevision
        && (receipt.state.contentHash === null || receipt.state.contentHash === request.contentHash)
        && (request.action === 'withdraw' ? 'withdrawn' in receipt && receipt.withdrawn === true && receipt.state.message.visibility === 'withdrawn' : 'received' in receipt && receipt.received === true);
      if (valid) {
        setState(receipt.state); setCleared(false);
        setNotice(request.action === 'withdraw' ? 'Withdrawal confirmed. The message is removed from member views.' : 'Report received for private human review. A report is an allegation, not a finding.');
        onCurrentState?.(receipt.state);
      } else if ([400, 401, 403, 404, 409, 413, 429].includes(status)) unavailable(status);
      else { setPending(request); setNotice('The reply could not be confirmed. The request may have been saved. You can retry the exact same request manually, or check the current message.'); }
    }, sent => {
      sending.current = false; setPending(request);
      setNotice(sent ? 'The reply was lost. The request may have been saved. Retry the exact same request manually or check the current message.' : 'The request was not sent. You can retry it manually or check the current message.');
    });
  }
  function submit(action: 'report' | 'withdraw') {
    if (!state || !confirmed || (action === 'report' ? !state.canReport || !reason : !state.canWithdraw)) return;
    send({ action, expectedRevision: state.revision, contentHash: state.contentHash, requestId: crypto.randomUUID(), ...(action === 'report' ? { reason: reason as ReportReason, note: note.trim() || null } : {}) });
  }
  const visible = parentActive && active;
  const content = cleared ? null : state ? state.message.content : message.content;
  const byline = state?.message || message;
  const visibility = state?.message.visibility || initialState?.message.visibility;
  return <article className={styles.scope} style={card} aria-busy={busy}>
    {visible && !cleared ? <>
      <p style={{ ...small, marginBottom: '.5rem' }}>{byline.member_name}{byline.is_mine ? ' · you' : ''} · <time dateTime={byline.created_at}>{new Date(byline.created_at).toUTCString()}</time></p>
      <PublishedProfileLink profileId={state ? state.message.publicProfileId : message.publicProfileId} active={!disabled && !pending && (visibility === undefined || visibility === 'visible')} />
      <p style={{ ...body, whiteSpace: 'pre-wrap', margin: 0 }}>{content === null ? visibility === 'withdrawn' ? 'Message withdrawn by its author.' : 'Message hidden from member views.' : content}</p>
      {content !== null && <MessagePassageContext content={content} />}
      {content !== null && <p style={small}><Link href={discussionHref(circleId, message.id)} prefetch={false}>Open discussion thread and replies</Link></p>}
    </> : <p style={small}>Message content cleared. Check current access to read it again.</p>}
    <button ref={opener} type="button" style={{ ...button, marginTop: '12px' }} disabled={disabled} aria-expanded={open && visible} aria-controls={`${id}-actions`} onClick={load}>Check message actions</button>
    {visible && notice && <p role="status" style={{ ...small, marginTop: '12px' }}>{notice}</p>}
    {visible && open && <section id={`${id}-actions`} aria-label="Current message actions" className={styles.stack} style={{ marginTop: '12px' }}>
      <h3 tabIndex={-1} ref={focusHeading} style={{ ...h2, margin: 0 }}>Current message actions</h3>
      {state && <>
        <p style={small}>{state.message.visibility === 'visible' ? 'Visible to eligible Circle members.' : state.message.visibility === 'withdrawn' ? 'Withdrawn by the author. A reviewer cannot undo this withdrawal.' : 'Hidden from member views after human review.'}</p>
        {state.explanations.map(explanation => <div key={explanation.id}>
          <p style={fieldLabel}>{explanation.action === 'hide' ? 'Hidden' : 'Moderator restriction lifted'} · {messageReasonLabel(explanation.reason)}</p>
          <p style={{ ...body, whiteSpace: 'pre-wrap' }}>{explanation.summary}</p><time style={small} dateTime={explanation.created_at}>{new Date(explanation.created_at).toUTCString()}</time>
        </div>)}
        {state.canReport && <>
          <p style={small}>Reports are private to eligible assigned reviewers. Describe conduct, rather than political or religious disagreement. Do not include unnecessary personal details.</p>
          <label style={fieldLabel} htmlFor={`${id}-reason`}>Report reason</label>
          <select id={`${id}-reason`} style={input} value={reason} disabled={disabled} onChange={event => { setReason(event.target.value as ReportReason); setConfirmed(false); }}><option value="">Choose a reason</option>{REPORT_REASONS.map(value => <option key={value} value={value}>{messageReasonLabel(value)}</option>)}</select>
          <label style={fieldLabel} htmlFor={`${id}-note`}>Private report details (optional)</label>
          <textarea id={`${id}-note`} style={input} rows={3} maxLength={1000} value={note} disabled={disabled} onChange={event => { setNote(event.target.value); setConfirmed(false); }} />
        </>}
        {state.canWithdraw && <p id={`${id}-privacy`} style={small}>{WITHDRAWAL_PRIVACY}</p>}
        {(state.canReport || state.canWithdraw) && <label className={styles.check}><input type="checkbox" checked={confirmed} disabled={disabled} onChange={event => setConfirmed(event.target.checked)} />{state.canWithdraw ? 'I understand withdrawal removes this message from member views and cannot be undone here.' : 'I checked this message and want to send this report for private human review.'}</label>}
        {state.canReport && <button type="button" style={primary} disabled={disabled || !reason || !confirmed} onClick={() => submit('report')}>Send private report</button>}
        {state.canWithdraw && <button type="button" style={primary} disabled={disabled || !confirmed} aria-describedby={`${id}-privacy`} onClick={() => submit('withdraw')}>Withdraw my message</button>}
        {!state.canReport && !state.canWithdraw && <p style={small}>No report or withdrawal action is available for this message.</p>}
      </>}
      {pending && <button type="button" style={button} disabled={disabled} onClick={() => send(pending)}>Retry exact {pending.action === 'withdraw' ? 'withdrawal' : 'report'}</button>}
      <button type="button" style={button} disabled={busy} onClick={() => { setOpen(false); clearDraft(); opener.current?.focus(); }}>Close message actions</button>
    </section>}
  </article>;
}
