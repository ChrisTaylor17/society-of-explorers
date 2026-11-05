import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { parseReviewCoveragePage, REVIEW_COVERAGE_PAGE_SIZE, type ReviewCoverageEvidence, type ReviewCoveragePage } from '@/lib/circles/review-coverage';
import type { useReviewAccess } from '@/lib/circles/useReviewAccess';
import { REPORT_LABELS, type ReportReason } from '@/lib/circles/report';
import { body, button, card, fieldLabel, h2, small } from '@/lib/circles/ui';
import styles from '@/app/circles/messages/safety.module.css';
import { messageReasonLabel } from '@/app/circles/messages/MessageActions';

export type ReviewCoverageBinding = Pick<ReviewCoveragePage, 'sessionId' | 'circleId' | 'messageId' | 'revision' | 'contentHash' | 'complete' | 'expiresAt' | 'totalReports'>;

/** Only a committed render may initiate a user action. Claiming it retires all
 * sibling callbacks synchronously, before React paints the resulting state. */
export function useReviewActionFence() {
  const current = useRef<object | null>(null);
  const [, redraw] = useReducer(value => value + 1, 0);
  const token = {};
  useLayoutEffect(() => {
    current.current = token;
    return () => { if (current.current === token) current.current = null; };
  });
  const retire = useCallback(() => { current.current = null; redraw(); }, []);
  return { retire, claim() { if (current.current !== token) return false; retire(); return true; } };
}
type Props = {
  endpoint: string; circleId: string; messageId: string | null; revision: number; contentHash: string | null;
  active: boolean; busy: boolean; perform: ReturnType<typeof useReviewAccess>['perform'];
  onProof: (proof: ReviewCoverageBinding | null) => void;
  onEvidence: (evidence: ReviewCoverageEvidence) => void;
  onAction: () => void; onClearDraft: () => void; onUnavailable: (status?: number) => void;
};

/** One bounded page and one server progress receipt. The parent owns the same
 * request lifetime and at most one selected note; no report-page cache exists. */
export default function ReviewCoverage({ endpoint, circleId, messageId, revision, contentHash, active, busy, perform,
  onProof, onEvidence, onAction, onClearDraft, onUnavailable }: Props) {
  const [page, setPage] = useState<ReviewCoveragePage | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState('Start a full case review to read and acknowledge every report page. No reports are closed by reviewing pages.');
  const fence = useReviewActionFence();
  const retireActions = fence.retire;
  const lifetime = useRef({ mounted: false, sequence: 0 });
  useLayoutEffect(() => {
    const life = lifetime.current; life.mounted = true;
    return () => { life.mounted = false; life.sequence++; };
  }, []);
  const expiresAt = page?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const sequence = lifetime.current.sequence;
    const expire = () => {
      if (!lifetime.current.mounted || lifetime.current.sequence !== sequence) return;
      lifetime.current.sequence++; retireActions();
      setPage(null); setSessionId(null); setConfirmed(false);
      onProof(null); onClearDraft();
      setNotice('This review session expired. Start a new full case review before deciding.');
    };
    const remaining = Date.parse(expiresAt) - Date.now();
    const timer = setTimeout(expire, Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [page, expiresAt, onProof, onClearDraft, retireActions]);
  const focusPage = useCallback((element: HTMLHeadingElement | null) => element?.focus({ preventScroll: true }), []);
  const disabled = busy || !active;
  function unknown(sent: boolean, mutation: boolean) {
    fence.retire();
    setPage(null); setConfirmed(false); onProof(null); onClearDraft();
    setNotice(mutation && sent
      ? 'The acknowledgement reply could not be confirmed and may have been saved. Refresh review progress manually; nothing is retried automatically.'
      : 'The report page could not be confirmed. Refresh review progress manually, or start a new full case review. No coverage is being assumed.');
  }
  function receive(status: number, body: unknown, expectedSession: string | null, requestedPage?: number) {
    fence.retire();
    const value = status === 200 ? parseReviewCoveragePage(body) : null;
    if (!value || value.circleId !== circleId || value.messageId !== messageId || value.revision !== revision || value.contentHash !== contentHash
      || (expectedSession !== null && value.sessionId !== expectedSession) || (requestedPage !== undefined && value.pageNumber !== requestedPage)
      || Date.parse(value.expiresAt) <= Date.now()) {
      setPage(null); setConfirmed(false); onProof(null); onClearDraft();
      if ([401, 403, 404, 409].includes(status)) { setSessionId(null); onUnavailable(status); }
      else unknown(false, false);
      return;
    }
    setSessionId(value.sessionId); setPage(value); setConfirmed(false);
    onProof({ sessionId: value.sessionId, circleId: value.circleId, messageId: value.messageId, revision: value.revision,
      contentHash: value.contentHash, complete: value.complete, expiresAt: value.expiresAt, totalReports: value.totalReports });
    setNotice(value.complete ? 'Every report page is acknowledged for this current case. Check your conduct finding and explanation before deciding.'
      : value.acknowledged ? 'Previously acknowledged report page loaded. You may revisit evidence without advancing review progress.'
        : 'Read every report on this page, then explicitly acknowledge it to continue. A report is an allegation, not a finding.');
  }
  function start() {
    if (disabled || !fence.claim()) return;
    const sequence = ++lifetime.current.sequence;
    onAction(); onProof(null); onClearDraft(); setSessionId(null); setPage(null); setConfirmed(false);
    setNotice('Starting a full review of the current case…');
    void perform(endpoint, { method: 'POST', body: JSON.stringify({ action: 'start', expectedRevision: revision, contentHash }) },
      ({ status, body }) => { if (lifetime.current.mounted && lifetime.current.sequence === sequence) receive(status, body, null); },
      sent => { if (lifetime.current.mounted && lifetime.current.sequence === sequence) unknown(sent, true); });
  }
  function readPage(pageNumber?: number) {
    if (disabled || !sessionId || !fence.claim()) return;
    const sequence = ++lifetime.current.sequence;
    const currentSession = sessionId;
    onAction(); setConfirmed(false); setPage(null); setNotice('Checking the current report page and review progress…');
    const query = `?sessionId=${encodeURIComponent(currentSession)}${pageNumber === undefined ? '' : `&page=${pageNumber}`}`;
    void perform(endpoint + query, { method: 'GET' },
      ({ status, body }) => { if (lifetime.current.mounted && lifetime.current.sequence === sequence) receive(status, body, currentSession, pageNumber); },
      () => { if (lifetime.current.mounted && lifetime.current.sequence === sequence) unknown(false, false); });
  }
  function acknowledge() {
    if (disabled || !page || page.acknowledged || page.complete || !confirmed || !fence.claim()) return;
    const sequence = ++lifetime.current.sequence;
    const current = page;
    onAction(); setPage(null); setConfirmed(false); onProof(null); setNotice('Recording this report-page acknowledgement…');
    void perform(endpoint, { method: 'POST', body: JSON.stringify({ action: 'ack', sessionId: current.sessionId, pageToken: current.pageToken }) },
      ({ status, body }) => { if (lifetime.current.mounted && lifetime.current.sequence === sequence) receive(status, body, current.sessionId); },
      sent => { if (lifetime.current.mounted && lifetime.current.sequence === sequence) unknown(sent, true); });
  }
  if (!active) return null;
  const totalPages = page ? Math.max(1, Math.ceil(page.totalReports / REVIEW_COVERAGE_PAGE_SIZE)) : 0;
  const frontier = page ? Math.min(totalPages, Math.floor(page.reviewedReports / REVIEW_COVERAGE_PAGE_SIZE) + 1) : 0;
  return <section aria-label="Full report review" className={`${styles.scope} ${styles.stack}`}>
    <h3 style={h2}>Full report review</h3>
    <p role="status" aria-live="polite" style={body}>{notice}</p>
    <div className={styles.row}>
      <button type="button" style={button} disabled={disabled} onClick={start}>{sessionId ? 'Restart full case review' : 'Start full case review'}</button>
      {sessionId && <button type="button" style={button} disabled={disabled} onClick={() => readPage()}>Refresh review progress</button>}
    </div>
    {page && <>
      <h4 key={`${page.sessionId}:${page.pageNumber}:${page.pageToken}`} ref={focusPage} tabIndex={-1} style={fieldLabel}>Report page {page.pageNumber} of {totalPages}</h4>
      <p style={body}>Reviewed {page.reviewedReports} of {page.totalReports} reports.</p>
      <p style={small}>{page.acknowledged ? 'This page is acknowledged.' : 'This page has not been acknowledged.'} Reading or revisiting a page does not acknowledge it.</p>
      <ol start={(page.pageNumber - 1) * REVIEW_COVERAGE_PAGE_SIZE + 1} className={styles.list}>
        {page.reports.map((report, index) => <li key={report.id} style={card}>
          <h5 style={fieldLabel}>Report {(page.pageNumber - 1) * REVIEW_COVERAGE_PAGE_SIZE + index + 1}: {messageId !== null ? messageReasonLabel(report.reason) : REPORT_LABELS[report.reason as ReportReason] || report.reason}</h5>
          <p style={{ ...body, whiteSpace: 'pre-wrap' }}>{report.note || 'No additional details.'}</p>
          <time style={small} dateTime={report.created_at}>{new Date(report.created_at).toUTCString()}</time>
          <div style={{ marginTop: '12px' }}><button type="button" style={button} disabled={disabled || !report.note || report.note.trim().length < 5}
            onClick={() => { if (disabled || !fence.claim()) return; onAction(); onEvidence({ id: report.id, note: report.note, label: `Report ${(page.pageNumber - 1) * REVIEW_COVERAGE_PAGE_SIZE + index + 1}` }); }}>Use report {(page.pageNumber - 1) * REVIEW_COVERAGE_PAGE_SIZE + index + 1} as evidence</button></div>
        </li>)}
      </ol>
      <div className={styles.row}>
        {page.pageNumber > 1 && <button type="button" style={button} disabled={disabled} onClick={() => readPage(page.pageNumber - 1)}>Previous report page</button>}
        {page.pageNumber < frontier && <button type="button" style={button} disabled={disabled} onClick={() => readPage(page.pageNumber + 1)}>Next issued report page</button>}
        {page.pageNumber < frontier && <button type="button" style={button} disabled={disabled} onClick={() => readPage()}>Return to current review page</button>}
      </div>
      {!page.acknowledged && !page.complete && <>
        <label className={styles.check}><input type="checkbox" checked={confirmed} disabled={disabled} onChange={event => { if (disabled || !fence.claim()) return; setConfirmed(event.target.checked); }} />I reviewed every report on this page and considered missing context and counterevidence.</label>
        <button type="button" style={button} disabled={disabled || !confirmed} onClick={acknowledge}>Acknowledge this report page</button>
      </>}
      <p style={small}>Progress expires after inactivity or when review access changes. Restarting requires a fresh review. Only the current page and one chosen evidence note stay on this page; reports and progress are never stored in browser storage.</p>
    </>}
  </section>;
}
