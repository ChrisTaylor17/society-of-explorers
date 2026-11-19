'use client';
import { useCallback, useRef, useState } from 'react';
import { useReviewAccess } from '@/lib/circles/useReviewAccess';
import { REPORT_LABELS, REPORT_REASONS, type ReportReason } from '@/lib/circles/report';
import { button, fieldLabel, input, ivory85, small } from '@/lib/circles/ui';

type ReportRequest = { circleId: string; requestId: string; reason: ReportReason; note: string };
export default function ReportButton({ circleId }: { circleId: string }) {
  // A keyed inner view prevents one Circle's draft from carrying to another.
  return <ReportForm key={circleId} circleId={circleId} />;
}
function ReportForm({ circleId }: { circleId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('safety');
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState<ReportRequest | null>(null);
  const sending = useRef(false);
  const focusReason = useCallback((element: HTMLSelectElement | null) => { element?.focus(); }, []);
  const retire = useCallback(() => { setOpen(false); setNote(''); setReason('safety'); setDone(false); setUncertain(null); sending.current = false; setMessage('Report details were cleared. A report already sent may still have been received.'); }, []);
  const { active, busy, perform } = useReviewAccess(retire);

  function transmit(payload: ReportRequest) {
    if (!active || busy || sending.current) return;
    sending.current = true; setMessage('Sending report…');
    void perform('/api/circles/report', { method: 'POST', body: JSON.stringify(payload) }, ({ status, body }) => {
      sending.current = false;
      if (status === 200 && body && typeof body === 'object' && (body as Record<string, unknown>).received === true) {
        setDone(true); setNote(''); setUncertain(null); setMessage(null);
      } else if ([400, 403, 404, 409, 413, 429].includes(status)) {
        setUncertain(null); setMessage(status === 429 ? 'Please wait before sending more reports.' : 'This report was not accepted. Check the form and try again.');
      } else {
        setUncertain(payload); setNote(''); setMessage('We could not confirm the reply. Your report may have arrived. You can explicitly retry the same report; it will not create another copy.');
      }
    }, sent => {
      sending.current = false;
      if (sent) { setUncertain(payload); setNote(''); setMessage('The reply was lost. Your report may have arrived. You can explicitly retry the same report; it will not create another copy.'); }
      else { setUncertain(null); setMessage('The report was not sent. Check your connection and try again.'); }
    });
  }
  function send(event: React.FormEvent) {
    event.preventDefault();
    if (!active || busy || sending.current) return;
    transmit({ circleId, requestId: crypto.randomUUID(), reason, note });
  }
  if (done) return <p role="status" style={{ ...small, color: ivory85 }}>Your report was received for Circle review, not sent to the host. This does not mean a reviewer has read it yet.</p>;
  if (uncertain) return <div><p role="status" style={small}>{message}</p><button type="button" style={button} disabled={!active || busy} onClick={() => transmit(uncertain)}>Retry the same report</button><button type="button" style={button} disabled={busy} onClick={retire}>Close and clear report</button></div>;
  if (!open) return <div>
    <button type="button" onClick={() => { setOpen(true); setMessage(null); }} disabled={!active || busy} style={{ ...button, fontSize: '12px' }}>Report this circle</button>
    {message && <p role="status" style={small}>{message}</p>}
    <p style={{ ...small, marginTop: '8px' }}>If anyone is in immediate danger, call your local emergency number first.</p>
  </div>;
  return <form onSubmit={send} style={{ display: 'grid', gap: '12px', maxWidth: '520px' }}>
    <fieldset disabled={busy || !active} style={{ border: 0, padding: 0, minWidth: 0, display: 'grid', gap: '12px' }}>
      <legend style={fieldLabel}>Report this Circle privately</legend>
      <div><label htmlFor="report-reason" style={fieldLabel}>What is wrong?</label><select ref={focusReason} id="report-reason" value={reason} onChange={event => setReason(event.target.value as ReportReason)} style={input}>{REPORT_REASONS.map(value => <option key={value} value={value}>{REPORT_LABELS[value]}</option>)}</select></div>
      <div><label htmlFor="report-note" style={fieldLabel}>Details (optional)</label><textarea id="report-note" value={note} onChange={event => setNote(event.target.value)} maxLength={1000} rows={3} style={{ ...input, resize: 'vertical' }} aria-describedby="report-help" /></div>
      <p id="report-help" style={small}>Describe conduct or a listing problem. Political or religious disagreement alone is not a violation. Details are for assigned reviewers; do not include information that is unnecessary to the report.</p>
      {message && <p role="status" style={{ ...small, color: ivory85 }}>{message}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}><button type="submit" style={button}>{busy ? 'Sending…' : 'Send report'}</button><button type="button" onClick={retire} style={button}>Cancel and clear</button></div>
    </fieldset>
  </form>;
}
