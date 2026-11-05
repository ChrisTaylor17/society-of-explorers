'use client';
import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import {
  CIRCLE_HIDE_REASONS, CIRCLE_RESTORE_REASONS, CIRCLE_REVIEW_REASON_LABELS,
  CIRCLE_SUMMARY_MIN, CIRCLE_SUMMARY_MAX, CIRCLE_EVIDENCE_MIN, CIRCLE_EVIDENCE_MAX,
  parseCircleReviewQueue, parseCircleReviewDetail, parseCircleDecisionReceipt, validateCircleReviewInput,
  type CircleReviewQueue, type CircleReviewDetail, type CircleReviewAction, type CircleReviewReason, type CircleReviewInput,
} from '@/lib/circles/moderation';
import { useReviewAccess } from '@/lib/circles/useReviewAccess';
import { REPORT_LABELS, type ReportReason } from '@/lib/circles/report';
import { body, button, card, fieldLabel, gold, h2, input, ivory85, lead, small } from '@/lib/circles/ui';
import ReviewCoverage, { useReviewActionFence, type ReviewCoverageBinding } from '@/app/moderation/ReviewCoverage';
import type { ReviewCoverageEvidence } from '@/lib/circles/review-coverage';
import styles from '@/app/circles/messages/safety.module.css';

type Pending = { id: string; endpoint: string; payload: CircleReviewInput & { sessionId?: string } };

export default function CircleReviews() {
  const [queue, setQueue] = useState<CircleReviewQueue | null>(null);
  const [detail, setDetail] = useState<CircleReviewDetail | null>(null);
  const [notice, setNotice] = useState('Load your assigned Circles to check current review access.');
  const [action, setAction] = useState<CircleReviewAction | ''>('');
  const [reason, setReason] = useState<CircleReviewReason | ''>('');
  const [summary, setSummary] = useState('');
  const [source, setSource] = useState('listing');
  const [excerpt, setExcerpt] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [coverage, setCoverage] = useState<ReviewCoverageBinding | null>(null);
  const [chosenEvidence, setChosenEvidence] = useState<ReviewCoverageEvidence | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const sending = useRef(false);
  const fence = useReviewActionFence();
  const retireActions = fence.retire;
  const caseContext = useRef<CircleReviewDetail | null>(null);
  const focusCase = useCallback((element: HTMLHeadingElement | null) => { if (element) { element.focus({ preventScroll: true }); if (typeof element.scrollIntoView === 'function') element.scrollIntoView({ block: 'start' }); } }, []);
  const clearDraft = useCallback(() => { retireActions(); setAction(''); setReason(''); setSummary(''); setSource('listing'); setExcerpt(''); setConfirmed(false); setCoverage(null); setChosenEvidence(null); }, [retireActions]);
  const retire = useCallback(() => {
    setQueue(null); caseContext.current = null; setDetail(null); setPending(null); clearDraft(); sending.current = false;
    setNotice('Private review content and drafts were cleared. Load assigned Circles to check access again. A decision already sent may still have been saved.');
  }, [clearDraft]);
  const { active, busy, perform } = useReviewAccess(retire);
  const covered = Boolean(detail && coverage?.complete && coverage.circleId === detail.circle.id && coverage.messageId === null
    && coverage.revision === detail.revision && coverage.contentHash === null);
  const decisionReady = Boolean(detail && (detail.complete || covered));
  function beginAction() { return active && !busy && !sending.current && fence.claim(); }
  function showDetail(value: CircleReviewDetail) {
    const checked = value.complete ? value : { ...value, reports: [] };
    retireActions(); caseContext.current = checked; setDetail(checked);
  }
  const endpoint = (id: string) => `/api/admin/circles/reports/${encodeURIComponent(id)}`;

  function unavailable(status?: number) {
    setQueue(null); caseContext.current = null; setDetail(null); setPending(null); clearDraft();
    setNotice(status === 401 ? 'Sign in before loading assigned Circles.' : status === 403 ? 'No eligible review assignment is available. You cannot review your own Circle, a Circle you participate in, or one you reported.' : status === 404 ? 'This review is no longer available.' : status === 409 ? 'This case changed. Load it again and read the latest reports before deciding.' : 'Review information is unavailable. No empty queue or decision is being assumed.');
  }
  function loadQueue(after: string | null = null) {
    if (!beginAction()) return;
    setQueue(null); caseContext.current = null; setDetail(null); setPending(null); clearDraft(); setNotice('Checking assigned Circles…');
    void perform(`/api/admin/circles/reports${after ? `?after=${encodeURIComponent(after)}` : ''}`, {}, ({ status, body }) => {
      const value = status === 200 ? parseCircleReviewQueue(body) : null;
      if (!value) return unavailable(status);
      setQueue(value); setNotice(value.items.length ? `${value.items.length} assigned ${value.items.length === 1 ? 'Circle needs' : 'Circles need'} review on this page.` : 'No assigned Circles need review on this page.');
    }, () => unavailable());
  }
  function loadDetail(id: string, saved = false) {
    if (!beginAction()) return;
    readDetail(id, saved);
  }
  // A matching decision receipt may start its fresh read after the request
  // lifetime releases. It is not a retained UI callback.
  function readDetail(id: string, saved = false) {
    setQueue(null); caseContext.current = null; setDetail(null); setPending(null); clearDraft(); setNotice(saved ? 'Decision saved. Checking the latest case…' : 'Loading current case…');
    void perform(`/api/admin/circles/reports/${encodeURIComponent(id)}`, {}, ({ status, body }) => {
      const value = status === 200 ? parseCircleReviewDetail(body) : null;
      if (!value || value.circle.id !== id) return unavailable(status);
      showDetail(value); setNotice(saved ? 'Decision saved. Current case loaded; a fresh decision requires a fresh review.' : 'Current case loaded. Read the evidence before deciding.');
    }, () => unavailable());
  }
  function decide(event: React.FormEvent) {
    event.preventDefault();
    if (!detail || !decisionReady || !beginAction()) return;
    if (!confirmed) { setNotice('Confirm that you reviewed this case and the host-facing explanation.'); return; }
    const requestId = crypto.randomUUID();
    const parsed = validateCircleReviewInput({ expectedRevision: detail.revision, requestId, action, reason, summary,
      evidenceReportId: action === 'hide' && source !== 'listing' ? source : null,
      evidenceExcerpt: action === 'hide' ? excerpt : null });
    if (!parsed.ok) { setNotice(parsed.error); return; }
    if (covered && action === 'hide') {
      const evidence = source === 'listing' ? `${detail.circle.title}\n${detail.circle.description || ''}` : chosenEvidence?.id === source ? chosenEvidence.note : null;
      if (!evidence?.includes(parsed.value.evidenceExcerpt || '')) { setNotice('Copy an exact excerpt from the selected evidence source.'); return; }
    }
    send({ id: detail.circle.id, endpoint: endpoint(detail.circle.id) + (covered ? '/coverage/decision' : ''),
      payload: { ...parsed.value, ...(covered && coverage ? { sessionId: coverage.sessionId } : {}) } });
  }
  function send(request: Pending) {
    if (busy || !active || sending.current) return;
    sending.current = true; caseContext.current = null; setDetail(null); setQueue(null); setPending(null); clearDraft(); setNotice('Saving decision…');
    void perform(request.endpoint, { method: 'POST', body: JSON.stringify(request.payload) }, ({ status, body }) => {
      sending.current = false;
      const receipt = status === 200 ? parseCircleDecisionReceipt(body) : null;
      const sessionMatches = !request.payload.sessionId || (body !== null && typeof body === 'object' && 'sessionId' in body && body.sessionId === request.payload.sessionId);
      const valid = receipt && sessionMatches && receipt.decision.action === request.payload.action && receipt.decision.reason === request.payload.reason
        && receipt.decision.summary === request.payload.summary && receipt.revision > request.payload.expectedRevision;
      if (valid) readDetail(request.id, true);
      else if ([400, 401, 403, 404, 409, 413, 429].includes(status)) unavailable(status);
      else { if (request.payload.sessionId) setPending(request); setNotice(request.payload.sessionId ? 'The decision reply could not be confirmed. It may have been saved. Retry the exact same decision manually, or load a fresh queue and inspect history.' : 'The decision reply could not be confirmed. It may have been saved. Load assigned Circles and review the latest history before another decision. Do not resend this decision.'); }
    }, sent => { sending.current = false; if (request.payload.sessionId) setPending(request); setNotice(request.payload.sessionId ? 'The decision reply was lost or not sent. It may have been saved. Retry the exact same decision manually or load a fresh queue.' : sent ? 'The decision reply was lost. It may have been saved. Load assigned Circles and review the latest history before another decision. Do not resend this decision.' : 'The decision was not sent. Load assigned Circles to check access before trying again.'); });
  }
  const reasons = action === 'hide' ? CIRCLE_HIDE_REASONS : CIRCLE_RESTORE_REASONS;
  const disabled = busy || !active;
  return <div className={styles.scope}>
    <p role="status" aria-live="polite" aria-atomic="true" style={{ ...lead, marginBottom: '1rem' }}>{notice}</p>
    <p style={{ ...small, marginBottom: '1rem' }}>Reports stay private to eligible assigned reviewers. This page does not grant access. <Link href="/login?next=/moderation/circles" style={{ color: gold }}>Sign in</Link> · <Link href="/circles/norms" style={{ color: gold }}>Community norms</Link> · <Link href="/moderation/messages" style={{ color: gold }}>Review assigned messages</Link></p>
    <button type="button" style={button} disabled={disabled} onClick={() => loadQueue()}>Load assigned Circles</button>
    {pending && <button type="button" style={button} disabled={disabled} onClick={() => { if (beginAction()) send(pending); }}>Retry exact decision</button>}
    {queue && <section aria-label="Assigned review queue" style={{ marginTop: '1rem' }}>
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '12px' }}>{queue.items.map(item => <li key={item.id} style={{ ...card, overflowWrap: 'anywhere' }}>
        <h2 style={h2}>{item.title}</h2><p style={body}>{item.hidden ? 'Currently hidden' : 'Currently listed'} · {item.openReports} open reports</p>
        <button type="button" style={button} disabled={disabled} onClick={() => loadDetail(item.id)}>Review {item.title}</button>
      </li>)}</ul>
      {queue.nextCursor && <button type="button" style={button} disabled={disabled} onClick={() => loadQueue(queue.nextCursor)}>Next assigned Circles</button>}
    </section>}
    {detail && <section aria-label="Current Circle review" style={{ marginTop: '1rem' }}>
      <h2 ref={focusCase} tabIndex={-1} style={{ ...h2, scrollMarginTop: '6rem' }}>{detail.circle.title}</h2><p style={body}>{detail.circle.hidden ? 'Currently hidden from the directory.' : 'Currently listed in the directory.'}</p>
      <div style={{ ...card, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><h3 style={fieldLabel}>Listing description</h3><p style={body}>{detail.circle.description || 'No description was supplied.'}</p></div>
      <h3 style={h2}>Open reports</h3>
      {!detail.complete ? <><p role="alert" style={body}>This case has more reports than one bounded view. Complete the full report review before deciding. No reports have been closed.</p>
      <ReviewCoverage key={`${detail.circle.id}:${detail.revision}`} endpoint={`${endpoint(detail.circle.id)}/coverage`} circleId={detail.circle.id} messageId={null}
        revision={detail.revision} contentHash={null} active={active} busy={busy} perform={perform}
        onProof={value => { if (caseContext.current !== detail) return; retireActions(); setCoverage(value); }}
        onAction={() => { if (caseContext.current !== detail) return; retireActions(); setConfirmed(false); }}
        onClearDraft={() => { if (caseContext.current === detail) clearDraft(); }}
        onUnavailable={status => { if (caseContext.current === detail) unavailable(status); }}
        onEvidence={evidence => { if (caseContext.current !== detail) return; retireActions(); setChosenEvidence(evidence); setSource(evidence.id); setExcerpt(''); setConfirmed(false); }} /></> : <>
      {detail.reports.length === 0 && <p style={small}>No open reports. Review the listing and previous decisions before changing its visibility.</p>}
      <ol style={{ padding: 0, listStyle: 'none', display: 'grid', gap: '12px' }}>{detail.reports.map((report, index) => <li key={report.id} style={{ ...card, overflowWrap: 'anywhere' }}>
        <h4 style={fieldLabel}>Report {index + 1}: {REPORT_LABELS[report.reason as ReportReason] || report.reason}</h4>
        <p style={{ ...body, whiteSpace: 'pre-wrap' }}>{report.note || 'No additional details.'}</p><time dateTime={report.created_at} style={small}>{new Date(report.created_at).toLocaleString()}</time>
      </li>)}</ol></>}
      <h3 style={h2}>Human decision</h3>
      <form onSubmit={decide} style={{ display: 'grid', gap: '12px' }}>
        <fieldset disabled={disabled || !decisionReady} style={{ border: 0, padding: 0, display: 'grid', gap: '12px', minWidth: 0 }}>
          <legend style={fieldLabel}>Listing visibility and explanation</legend>
          <label style={fieldLabel} htmlFor="review-action">Decision</label>
          <select id="review-action" style={input} value={action} required onChange={event => { if (!decisionReady || !beginAction()) return; setAction(event.target.value as CircleReviewAction); setReason(''); setExcerpt(''); setSource('listing'); setConfirmed(false); }}>
            <option value="">Choose a decision</option><option value="hide">Hide or keep hidden</option><option value="restore">Restore or keep listed</option>
          </select>
          <label style={fieldLabel} htmlFor="review-reason">Reason based on conduct</label>
          <select id="review-reason" style={input} required value={reason} onChange={event => { if (!decisionReady || !beginAction()) return; setReason(event.target.value as CircleReviewReason); setConfirmed(false); }}>
            <option value="">Choose a reason</option>{reasons.map(value => <option key={value} value={value}>{CIRCLE_REVIEW_REASON_LABELS[value]}</option>)}
          </select>
          {action === 'hide' && <>
            <label style={fieldLabel} htmlFor="review-source">Evidence source</label>
            <select id="review-source" style={input} value={source} onChange={event => { if (!decisionReady || !beginAction()) return; setSource(event.target.value); setExcerpt(''); setConfirmed(false); }}>
              <option value="listing">Circle title or description</option>{detail.complete ? detail.reports.map((r, index) => <option key={r.id} value={r.id}>Report {index + 1}</option>) : chosenEvidence && <option value={chosenEvidence.id}>{chosenEvidence.label} (chosen evidence)</option>}
            </select>
            {chosenEvidence && source === chosenEvidence.id && <p style={{ ...small, whiteSpace: 'pre-wrap' }}>Chosen evidence from {chosenEvidence.label}: {chosenEvidence.note}</p>}
            <label style={fieldLabel} htmlFor="review-excerpt">Exact excerpt supporting this reason</label>
            <textarea id="review-excerpt" style={{ ...input, resize: 'vertical' }} required rows={3} minLength={CIRCLE_EVIDENCE_MIN} maxLength={CIRCLE_EVIDENCE_MAX} value={excerpt} onChange={event => { if (!decisionReady || !beginAction()) return; setExcerpt(event.target.value); setConfirmed(false); }} aria-describedby="review-evidence-help" />
            <p id="review-evidence-help" style={small}>Quote the selected source exactly. Evidence stays in reviewer history and is excluded from the host summary. An allegation alone is not proof.</p>
          </>}
          <label style={fieldLabel} htmlFor="review-summary">Host-facing explanation</label>
          <textarea id="review-summary" style={{ ...input, resize: 'vertical' }} rows={4} required minLength={CIRCLE_SUMMARY_MIN} maxLength={CIRCLE_SUMMARY_MAX} value={summary} onChange={event => { if (!decisionReady || !beginAction()) return; setSummary(event.target.value); setConfirmed(false); }} aria-describedby="review-summary-help" />
          <p id="review-summary-help" style={small}>The host can read this explanation. Explain the conduct finding and next step. Do not identify reporters or copy private report details here.</p>
          <label style={{ ...small, color: ivory85, display: 'flex', gap: '10px', alignItems: 'center', minHeight: '44px' }}><input type="checkbox" checked={confirmed} onChange={event => { if (!decisionReady || !beginAction()) return; setConfirmed(event.target.checked); }} style={{ width: '20px', height: '20px', flexShrink: 0 }} required />I reviewed the case, checked for conflicts, and checked that the host explanation protects reporter privacy.</label>
          <button type="submit" style={button} disabled={!action || !reason || !confirmed}>Save reviewed decision</button>
        </fieldset>
      </form>
      <h3 style={h2}>Decision history</h3>
      {detail.decisions.length === 0 && <p style={small}>No human decisions recorded.</p>}
      <ol style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '12px' }}>{detail.decisions.map(decision => <li key={decision.id} style={{ ...card, overflowWrap: 'anywhere' }}>
        <p style={fieldLabel}>{decision.action === 'hide' ? 'Hidden' : 'Listed'} · {CIRCLE_REVIEW_REASON_LABELS[decision.reason]}</p><p style={{ ...body, whiteSpace: 'pre-wrap' }}>{decision.summary}</p><time style={small} dateTime={decision.created_at}>{new Date(decision.created_at).toLocaleString()}</time>
      </li>)}</ol>
      <p style={small}>This view shows the latest 100 decisions. Decisions are recorded on the server. A later report or reviewer can change current visibility; previous history is retained.</p>
    </section>}
  </div>;
}
