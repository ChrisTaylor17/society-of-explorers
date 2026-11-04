'use client';
import { useCallback, useId, useRef, useState } from 'react';
import {
  parseMessageDecisionReceipt, parseMessageReviewDetail, parseMessageReviewQueue,
  type MessageReviewDetail, type MessageReviewQueue,
} from '@/lib/circles/message-moderation';
import { useReviewAccess } from '@/lib/circles/useReviewAccess';
import { body, button, card, fieldLabel, h2, input, lead, primary, small } from '@/lib/circles/ui';
import { messageReasonLabel } from '@/app/circles/messages/MessageActions';
import styles from '@/app/circles/messages/safety.module.css';

const hideReasons = ['safety', 'harassment', 'spam', 'misleading', 'inappropriate'];
const restoreReasons = ['no_violation', 'insufficient_evidence', 'resolved'];
type Pending = { circleId: string; messageId: string; payload: { action: 'hide' | 'restore'; expectedRevision: number; contentHash: string; requestId: string; reason: string; summary: string; evidenceReportId: string | null; evidenceExcerpt: string | null } };

export default function MessageReviews() {
  const id = useId();
  const [queue, setQueue] = useState<MessageReviewQueue | null>(null);
  const [detail, setDetail] = useState<MessageReviewDetail | null>(null);
  const [notice, setNotice] = useState('Load your assigned message reviews to check current access.');
  const [action, setAction] = useState<'' | 'hide' | 'restore'>('');
  const [reason, setReason] = useState('');
  const [summary, setSummary] = useState('');
  const [source, setSource] = useState('message');
  const [excerpt, setExcerpt] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const sending = useRef(false);
  const focusCase = useCallback((element: HTMLHeadingElement | null) => { element?.focus({ preventScroll: true }); }, []);
  const clearDraft = useCallback(() => { setAction(''); setReason(''); setSummary(''); setSource('message'); setExcerpt(''); setConfirmed(false); }, []);
  const retire = useCallback(() => {
    setQueue(null); setDetail(null); setPending(null); clearDraft(); sending.current = false;
    setNotice('Private reports, evidence and drafts cleared. Load assigned message reviews to check access again. A decision already sent may still have been saved.');
  }, [clearDraft]);
  const { active, busy, perform } = useReviewAccess(retire);
  const disabled = !active || busy;
  const endpoint = (circleId: string, messageId: string) => `/api/admin/circles/${encodeURIComponent(circleId)}/messages/${encodeURIComponent(messageId)}`;
  function unavailable(status?: number) {
    setQueue(null); setDetail(null); setPending(null); clearDraft();
    setNotice(status === 401 ? 'Sign in to load assigned message reviews.' : status === 403 ? 'No eligible assignment is available. Review access excludes conflicts with the author, Circle host, participants and reporters.' : status === 404 ? 'This message review is no longer available.' : status === 409 ? 'This message or its reports changed. Load a fresh case before deciding.' : 'Review information could not be loaded. An empty queue or saved decision is not being assumed.');
  }
  function loadQueue(after: string | null = null) {
    if (disabled || sending.current) return;
    setQueue(null); setDetail(null); setPending(null); clearDraft(); setNotice('Checking assigned message reviews…');
    void perform(`/api/admin/circles/messages${after ? `?after=${encodeURIComponent(after)}` : ''}`, { method: 'GET' }, ({ status, body }) => {
      const value = status === 200 ? parseMessageReviewQueue(body) : null;
      if (!value || (after && value.nextCursor === after)) return unavailable(status);
      setQueue(value); setNotice(value.items.length ? 'Assigned message reviews loaded. Open a case to review current evidence.' : 'No assigned message reviews were returned on this page.');
    }, () => unavailable());
  }
  function loadDetail(circleId: string, messageId: string, saved = false) {
    if (disabled || sending.current) return;
    setQueue(null); setDetail(null); setPending(null); clearDraft(); setNotice(saved ? 'Decision confirmed. Loading current case…' : 'Loading current message and reports…');
    void perform(endpoint(circleId, messageId), { method: 'GET' }, ({ status, body }) => {
      const value = status === 200 ? parseMessageReviewDetail(body) : null;
      if (!value || value.circle.id !== circleId || value.message.id !== messageId) return unavailable(status);
      setDetail(value); setNotice(saved ? 'Decision confirmed. Current case loaded; another decision requires a new review.' : 'Current case loaded. A report is an allegation, not a finding.');
    }, () => unavailable());
  }
  function send(request: Pending) {
    if (disabled || sending.current) return;
    sending.current = true; setPending(null); setQueue(null); setDetail(null); clearDraft(); setNotice('Saving reviewed decision…');
    void perform(endpoint(request.circleId, request.messageId), { method: 'POST', body: JSON.stringify(request.payload) }, ({ status, body }) => {
      sending.current = false;
      const receipt = status === 200 ? parseMessageDecisionReceipt(body) : null;
      const valid = receipt && receipt.requestId === request.payload.requestId && receipt.circleId === request.circleId && receipt.messageId === request.messageId
        && receipt.decision.action === request.payload.action && receipt.decision.reason === request.payload.reason
        && receipt.decision.summary === request.payload.summary && receipt.safety.revision > request.payload.expectedRevision
        && (receipt.replayed || request.payload.action !== 'hide' || receipt.safety.visibility === 'hidden' || receipt.safety.visibility === 'withdrawn');
      if (valid) {
        // The hook releases its own fence before this callback. A fresh read is
        // allowed here; the old decision never supplies a new case snapshot.
        setNotice('Decision confirmed. Load a fresh case before another decision.');
        void perform(endpoint(request.circleId, request.messageId), { method: 'GET' }, ({ status: readStatus, body: readBody }) => {
          const current = readStatus === 200 ? parseMessageReviewDetail(readBody) : null;
          if (!current || current.circle.id !== request.circleId || current.message.id !== request.messageId || current.revision < receipt.safety.revision) return unavailable(readStatus);
          setDetail(current); setNotice('Decision confirmed. Current case loaded; another decision requires a new review.');
        }, () => { unavailable(); setNotice('Decision was confirmed, but the current case could not be loaded. Load assigned reviews to continue.'); });
      } else if ([400, 401, 403, 404, 409, 413, 429].includes(status)) unavailable(status);
      else { setPending(request); setNotice('The decision reply could not be confirmed. It may have been saved. Retry the exact same decision manually, or load a fresh queue and inspect its history.'); }
    }, sent => {
      sending.current = false; setPending(request);
      setNotice(sent ? 'The decision reply was lost. It may have been saved. Retry the exact same decision manually or load a fresh queue.' : 'The decision was not sent. Retry it manually or load a fresh queue to check access.');
    });
  }
  function decide(event: React.FormEvent) {
    event.preventDefault();
    if (!detail || disabled || sending.current || !detail.complete || !confirmed || !action || !reason) return;
    const cleanSummary = summary.trim();
    const cleanExcerpt = excerpt.trim();
    const evidence = source === 'message' ? detail.message.content : detail.reports.find(report => report.id === source)?.note;
    if (!(action === 'hide' ? hideReasons : restoreReasons).includes(reason) || cleanSummary.length < 20 || cleanSummary.length > 1000) { setNotice('Choose a conduct reason and write an author-facing explanation of 20 to 1,000 characters.'); return; }
    if (action === 'hide' && (cleanExcerpt.length < 5 || cleanExcerpt.length > 500 || !evidence?.includes(cleanExcerpt))) { setNotice('Copy an exact excerpt of 5 to 500 characters from the selected evidence source.'); return; }
    send({ circleId: detail.circle.id, messageId: detail.message.id, payload: {
      action, expectedRevision: detail.revision, contentHash: detail.contentHash, requestId: crypto.randomUUID(), reason, summary: cleanSummary,
      evidenceReportId: action === 'hide' && source !== 'message' ? source : null, evidenceExcerpt: action === 'hide' ? cleanExcerpt : null,
    } });
  }
  return <div className={styles.scope}>
    <p role="status" aria-live="polite" style={{ ...lead, marginBottom: '1rem' }}>{notice}</p>
    <p style={{ ...small, marginBottom: '1rem' }}>Private evidence is available only to eligible assigned reviewers. This page cannot grant access. Never copy reporter identities or private allegations into the explanation shown to the author.</p>
    <button type="button" style={button} disabled={disabled} onClick={() => loadQueue()}>Load assigned message reviews</button>
    {pending && <div className={styles.row} style={{ marginTop: '1rem' }}><button type="button" style={button} disabled={disabled} onClick={() => send(pending)}>Retry exact decision</button></div>}
    {queue && <section aria-label="Assigned message review queue">
      <ul className={styles.list}>{queue.items.map(item => <li key={`${item.circleId}:${item.messageId}`} style={card}>
        <h2 style={{ ...h2, marginTop: 0 }}>{item.circleTitle}</h2><p style={body}>{item.visibility === 'visible' ? 'Visible' : item.visibility === 'hidden' ? 'Hidden' : 'Author withdrawn'} · {item.openReports} open reports</p>
        <button type="button" style={button} disabled={disabled} onClick={() => loadDetail(item.circleId, item.messageId)}>Review message in {item.circleTitle}</button>
      </li>)}</ul>
      {queue.nextCursor && <button type="button" style={button} disabled={disabled} onClick={() => loadQueue(queue.nextCursor)}>Next page of message reviews</button>}
    </section>}
    {detail && <section aria-label="Current message review" className={styles.stack} style={{ marginTop: '1.5rem' }}>
      <h2 ref={focusCase} tabIndex={-1} style={{ ...h2, margin: 0 }}>{detail.circle.title}</h2>
      <p style={body}>{detail.message.visibility === 'withdrawn' ? 'The author withdrew this message. Lifting a moderator restriction cannot return it to member views.' : detail.message.visibility === 'hidden' ? 'This message is hidden from member views.' : 'This message is visible to eligible members.'}</p>
      <div style={card}><h3 style={fieldLabel}>Restricted message evidence</h3><p style={small}>{detail.message.member_name} · <time dateTime={detail.message.created_at}>{new Date(detail.message.created_at).toUTCString()}</time></p><p style={{ ...body, whiteSpace: 'pre-wrap' }}>{detail.message.content}</p></div>
      <h3 style={h2}>Open reports</h3>
      {!detail.complete && <p role="alert" style={body}>The full case is not available in this view. Decisions are disabled until all evidence can be reviewed.</p>}
      {!detail.reports.length && <p style={small}>No open reports. Check the message and previous decisions before changing moderator restrictions.</p>}
      <ol className={styles.list}>{detail.reports.map((report, index) => <li key={report.id} style={card}>
        <h4 style={fieldLabel}>Report {index + 1}: {messageReasonLabel(report.reason)}</h4><p style={{ ...body, whiteSpace: 'pre-wrap' }}>{report.note || 'No additional details.'}</p><time style={small} dateTime={report.created_at}>{new Date(report.created_at).toUTCString()}</time>
      </li>)}</ol>
      <form onSubmit={decide}>
        <fieldset disabled={disabled || !detail.complete} className={styles.stack} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
          <legend style={h2}>Human decision</legend>
          <label htmlFor={`${id}-action`} style={fieldLabel}>Moderator restriction</label>
          <select id={`${id}-action`} style={input} required value={action} onChange={event => { setAction(event.target.value as 'hide' | 'restore'); setReason(''); setExcerpt(''); setConfirmed(false); }}><option value="">Choose a decision</option><option value="hide">Hide or keep hidden</option><option value="restore">Lift moderator restriction</option></select>
          <label htmlFor={`${id}-reason`} style={fieldLabel}>Reason based on conduct</label>
          <select id={`${id}-reason`} style={input} required value={reason} onChange={event => { setReason(event.target.value); setConfirmed(false); }}><option value="">Choose a reason</option>{(action === 'hide' ? hideReasons : restoreReasons).map(value => <option key={value} value={value}>{messageReasonLabel(value)}</option>)}</select>
          {action === 'hide' && <>
            <label htmlFor={`${id}-source`} style={fieldLabel}>Evidence source</label><select id={`${id}-source`} style={input} value={source} onChange={event => { setSource(event.target.value); setExcerpt(''); setConfirmed(false); }}><option value="message">Message text</option>{detail.reports.map((report, index) => <option key={report.id} value={report.id}>Report {index + 1}</option>)}</select>
            <label htmlFor={`${id}-excerpt`} style={fieldLabel}>Exact evidence excerpt</label><textarea id={`${id}-excerpt`} style={input} rows={3} minLength={5} maxLength={500} required value={excerpt} onChange={event => { setExcerpt(event.target.value); setConfirmed(false); }} aria-describedby={`${id}-evidence-help`} />
            <p id={`${id}-evidence-help`} style={small}>Quote the selected source exactly. Evidence stays private; an allegation alone is not proof of a violation.</p>
          </>}
          <label htmlFor={`${id}-summary`} style={fieldLabel}>Author-facing explanation</label><textarea id={`${id}-summary`} style={input} rows={4} minLength={20} maxLength={1000} required value={summary} onChange={event => { setSummary(event.target.value); setConfirmed(false); }} aria-describedby={`${id}-summary-help`} />
          <p id={`${id}-summary-help`} style={small}>Only the author can read this explanation outside the review team. Explain the conduct finding and next step without identifying reporters or copying private report details.</p>
          <label className={styles.check}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} required />I reviewed the evidence and conflicts, and checked that the author explanation protects reporter privacy.</label>
          <button type="submit" style={primary} disabled={!action || !reason || !confirmed}>Save message decision</button>
        </fieldset>
      </form>
      <h3 style={h2}>Decision history</h3>
      {!detail.decisions.length && <p style={small}>No human decisions recorded.</p>}
      <ol className={styles.list}>{detail.decisions.map(decision => <li key={decision.id} style={card}><p style={fieldLabel}>{decision.action === 'hide' ? 'Hidden' : 'Moderator restriction lifted'} · {messageReasonLabel(decision.reason)}</p><p style={{ ...body, whiteSpace: 'pre-wrap' }}>{decision.summary}</p><time style={small} dateTime={decision.created_at}>{new Date(decision.created_at).toUTCString()}</time></li>)}</ol>
      <p style={small}>Review history and restricted evidence are retained. This view does not erase messages or reports. Lifting a moderator restriction never undoes the author’s withdrawal.</p>
    </section>}
  </div>;
}
