'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { COMPANIONS, type CompanionId } from '@/lib/library/sessions';
import { askLibrary, saveToNotebook, type AskResult } from './libraryClient';
import styles from './library.module.css';

export type GuidePart = { title: string; quote: string; detail: string; question: string; startN: number; endN: number };

/** The salon guide: one question per part of the reading, and a follow-up on your answer. */
export default function SalonGuide({ slug, bookId, work, companion, parts }: { slug: string; bookId: string; work: string; companion: CompanionId; parts: GuidePart[] }) {
  return <div className={styles.parts}>
    {parts.map((part, index) => <GuideQuestion key={part.title} index={index} part={part} slug={slug} bookId={bookId} work={work} companion={companion} />)}
  </div>;
}

function GuideQuestion({ index, part, slug, bookId, work, companion }: { index: number; part: GuidePart; slug: string; bookId: string; work: string; companion: CompanionId }) {
  const [answer, setAnswer] = useState(''), [result, setResult] = useState<AskResult | null>(null);
  const [status, setStatus] = useState(''), [busy, setBusy] = useState(false), [signIn, setSignIn] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const name = COMPANIONS[companion].name;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !answer.trim()) return;
    const owned = new AbortController(); controller.current = owned;
    setBusy(true); setResult(null); setStatus(`${name} is reading your answer…`);
    const deadline = setTimeout(() => owned.abort(), 30_000);
    const outcome = await askLibrary({ session: slug, mode: 'guide', part: index, answer: answer.trim() }, owned.signal);
    clearTimeout(deadline);
    if (controller.current !== owned) return;
    controller.current = null; setBusy(false);
    if (outcome.ok) { setResult(outcome.value); setStatus(''); }
    else if (outcome.message === 'signin') { setSignIn(true); setStatus(''); }
    else setStatus(outcome.message);
  }
  function save() {
    const note = `Salon question: ${part.question}\nMy answer: ${answer.trim()}${result ? `\n${name} (AI voice): ${result.reply}` : ''}`;
    setStatus(saveToNotebook(bookId, `${work}: ${part.title}`, note) ? 'Saved to your notebook on this device.' : 'Your browser didn’t allow saving here.');
  }

  return <article className={styles.part}>
    <p className={styles.eyebrow}>Part {index + 1} · ¶{part.startN}{part.endN > part.startN ? `–${part.endN}` : ''}</p>
    <h3 className={styles.h3}>{part.title}</h3>
    <blockquote className={styles.quote}>“{part.quote}”</blockquote>
    <p style={{ margin: 0 }}>{part.detail} <a href={`#p-${part.startN}`}>Read this part</a></p>
    <p className={styles.question}><strong>Question:</strong> {part.question}</p>
    <form onSubmit={submit} className={styles.noPrint}>
      <label htmlFor={`guide-${index}`} className={styles.label}>Your answer, in a sentence or two</label>
      <textarea id={`guide-${index}`} className={styles.input} rows={3} maxLength={1500} value={answer} onChange={event => { setAnswer(event.target.value); setResult(null); }} />
      <div className={styles.row}>
        <button type="submit" className={styles.button} disabled={busy || !answer.trim()}>{busy ? 'Reading…' : `Hear ${name}’s follow-up`}</button>
        {answer.trim() && <button type="button" className={styles.button} onClick={save}>Save to notebook</button>}
      </div>
    </form>
    {signIn && <p className={styles.status}>The follow-up needs a free account. <Link href={`/login?next=${encodeURIComponent(`/library/${slug}#salon-guide`)}`}>Sign in</Link>, and you’ll come back here. You can still bring your answer to the salon.</p>}
    <p role="status" aria-live="polite" className={styles.status}>{status}</p>
    {result && <div className={styles.reply}>
      <p className={styles.voice}>AI voice of {name}, drawn from the text. Not the real person.</p>
      <p style={{ margin: 0 }}>{result.reply}</p>
    </div>}
  </article>;
}
