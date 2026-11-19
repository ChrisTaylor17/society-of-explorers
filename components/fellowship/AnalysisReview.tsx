'use client';
import { useId, useState } from 'react';
import { ANALYSIS_STATUS, correctionProposal, STUDY_REVISION, type ReviewableAnalysis } from '@/lib/fellowship/study';
import styles from '@/app/fellowship/fellowship.module.css';

export default function AnalysisReview({ analysis }: { analysis: ReviewableAnalysis }) {
  const id = useId();
  const [draft, setDraft] = useState(analysis.observation);
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<ReturnType<typeof correctionProposal>>(null);
  const [notice, setNotice] = useState('');
  const candidate = correctionProposal(analysis, draft, reason);
  function download() {
    if (!preview) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(preview, null, 2) + '\n'], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'soe-correction-' + analysis.id + '.json';
    anchor.click(); requestAnimationFrame(() => URL.revokeObjectURL(url));
    setNotice('Proposal downloaded. It has not been submitted or published.');
  }
  return <details data-analysis-review={analysis.id}>
    <summary>Prepare a correction</summary>
    <p className={styles.muted}>{ANALYSIS_STATUS} · revision {STUDY_REVISION} · claim {analysis.id}</p>
    <p>Edit the analysis and give a reason or source to check. Scripture and publisher notes remain unchanged.</p>
    <label className={styles.label} htmlFor={id + '-analysis'}>Proposed analysis
      <textarea id={id + '-analysis'} maxLength={6000} value={draft} onChange={event => { setDraft(event.target.value); setPreview(null); setNotice(''); }} />
    </label>
    <label className={styles.label} htmlFor={id + '-reason'}>Reason and source to check
      <textarea className={styles.reason} id={id + '-reason'} maxLength={3000} value={reason} onChange={event => { setReason(event.target.value); setPreview(null); setNotice(''); }} />
    </label>
    <div className={styles.actions}>
      <button type="button" className={styles.button} disabled={!candidate} onClick={() => { setPreview(candidate); setNotice('Local preview prepared. Review it before downloading.'); }}>Preview my correction</button>
      <button type="button" className={styles.button} disabled={!preview} onClick={download}>Download proposal</button>
      <button type="button" className={styles.button} onClick={() => { setDraft(analysis.observation); setReason(''); setPreview(null); setNotice('Local correction cleared.'); }}>Reset my correction</button>
    </div>
    {preview && <section className={styles.preview} aria-label="Your local correction preview"><strong>Your proposed reading copy</strong><p>{preview.proposedAnalysis}</p><p>Reason: {preview.reasonAndSourceToCheck}</p></section>}
    <p role="status">{notice}</p>
    <p className={styles.muted}>Stays in this open page until you download it. Nothing is submitted or sent to an AI service. A download is a proposal for review, not a change to the shared study. Reloading or leaving the page clears this local draft.</p>
  </details>;
}
