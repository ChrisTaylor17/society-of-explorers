'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { COMPANIONS, COMPANION_IDS, type CompanionId } from '@/lib/library/sessions';
import { askLibrary, hasSignIn, saveToNotebook, type AskResult } from './libraryClient';
import styles from './library.module.css';

type Picked = { n: number; text: string; excerpt: string };

/** The thinker in the margin. Tap any paragraph of the text to bring it here. */
export default function MarginReader({ slug, bookId, companion, work }: { slug: string; bookId: string; companion: CompanionId; work: string }) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [open, setOpen] = useState(false);
  const [thinker, setThinker] = useState<CompanionId>(companion);
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<AskResult | null>(null);
  const [status, setStatus] = useState('');
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const name = COMPANIONS[thinker].name;

  useEffect(() => { void hasSignIn().then(value => setNeedsSignIn(!value)); }, []);
  useEffect(() => () => controller.current?.abort(), []);

  useEffect(() => {
    const root = document.getElementById('reading-text');
    if (!root) return;
    function choose(element: HTMLElement) {
      const n = Number(element.dataset.n);
      if (!Number.isSafeInteger(n)) return;
      const text = element.querySelector<HTMLElement>('[data-body]')?.innerText.trim() || '';
      const selection = window.getSelection();
      let excerpt = '';
      if (selection && !selection.isCollapsed && element.contains(selection.anchorNode) && element.contains(selection.focusNode)) {
        excerpt = selection.toString().trim().slice(0, 700);
      }
      root!.querySelectorAll('[data-selected="true"]').forEach(node => node.removeAttribute('data-selected'));
      element.setAttribute('data-selected', 'true');
      controller.current?.abort(); setBusy(false);
      setPicked({ n, text, excerpt }); setResult(null); setStatus(''); setOpen(true);
      if (window.matchMedia('(min-width: 901px)').matches) questionRef.current?.focus({ preventScroll: true });
    }
    const click = (event: MouseEvent) => {
      const element = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-n]');
      if (element && root.contains(element)) choose(element);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const element = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-n]');
      if (element && root.contains(element)) { event.preventDefault(); choose(element); }
    };
    root.addEventListener('click', click); root.addEventListener('keydown', key);
    return () => { root.removeEventListener('click', click); root.removeEventListener('keydown', key); };
  }, []);

  async function ask(event?: React.FormEvent) {
    event?.preventDefault();
    if (!picked || busy) return;
    controller.current?.abort();
    const owned = new AbortController(); controller.current = owned;
    setBusy(true); setResult(null); setStatus(`Asking ${name}…`);
    const deadline = setTimeout(() => owned.abort(), 30_000);
    const outcome = await askLibrary({ session: slug, mode: 'margin', thinker, block: picked.n, excerpt: picked.excerpt, question: question.trim() }, owned.signal);
    clearTimeout(deadline);
    if (controller.current !== owned) return;
    controller.current = null; setBusy(false);
    if (outcome.ok) { setResult(outcome.value); setStatus(''); return; }
    if (outcome.message === 'signin') { setNeedsSignIn(true); setStatus(''); return; }
    setStatus(outcome.message);
  }

  function jump(n: number) {
    const element = document.getElementById(`p-${n}`);
    if (!element) return;
    element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (!window.matchMedia('(min-width: 901px)').matches) setOpen(false);
  }

  function save() {
    if (!picked || !result) return;
    const note = `${question.trim() ? `Q: ${question.trim()}\n` : ''}${COMPANIONS[thinker].name} (AI voice): ${result.reply}`;
    setStatus(saveToNotebook(bookId, `${work}, ¶${picked.n}: ${picked.excerpt || picked.text.slice(0, 400)}`, note) ? 'Saved to your notebook on this device.' : 'Your browser didn’t allow saving here.');
  }

  const loginHref = `/login?next=${encodeURIComponent(`/library/${slug}`)}`;
  return <aside className={styles.margin} data-open={open ? 'true' : 'false'} aria-label="Thinker in the margin">
    <div className={styles.marginHead}>
      <p className={styles.marginTitle}>{picked ? `✦ ${name} on ¶${picked.n}` : `✦ ${name} in the margin`}</p>
      <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close the margin">×</button>
    </div>
    {!picked && <p className={styles.empty}>Tap any paragraph to bring it here and ask {name} about it. Select a few words first to ask about just those.</p>}
    {picked && !open && <p className={styles.empty}><button type="button" className={styles.button} onClick={() => setOpen(true)}>Open ¶{picked.n}</button></p>}
    {picked && <div className={styles.marginBody}>
      <blockquote className={styles.excerpt}>{picked.excerpt || picked.text}</blockquote>
      <form onSubmit={ask}>
        <label htmlFor="margin-question" className={styles.label}>Your question (optional)</label>
        <textarea ref={questionRef} id="margin-question" className={styles.input} rows={2} maxLength={500} value={question} placeholder="What does he mean here?" onChange={event => setQuestion(event.target.value)} />
        <label htmlFor="margin-thinker" className={styles.label}>Thinker</label>
        <select id="margin-thinker" className={styles.input} value={thinker} onChange={event => { setThinker(event.target.value as CompanionId); setResult(null); }}>
          {COMPANION_IDS.map(id => <option key={id} value={id}>{COMPANIONS[id].name}{id === companion ? ' (this reading’s companion)' : ''}</option>)}
        </select>
        <div className={styles.row}>
          <button type="submit" className={styles.primary} disabled={busy}>{busy ? 'Asking…' : `Ask ${name}`}</button>
          {busy && <button type="button" className={styles.button} onClick={() => { controller.current?.abort(); controller.current = null; setBusy(false); setStatus('Stopped.'); }}>Stop</button>}
        </div>
      </form>
      {needsSignIn && <p className={styles.status}>Asking needs a free account. <Link href={loginHref}>Sign in</Link>, and you’ll come straight back here. Reading is free without one.</p>}
      <p role="status" aria-live="polite" className={styles.status}>{status}</p>
      {result && <div className={styles.reply}>
        <p className={styles.voice}>AI voice of {COMPANIONS[result.thinker as CompanionId]?.name || name}, drawn from the text. Not the real person.</p>
        <p style={{ margin: 0 }}>{result.reply}</p>
        {result.quotes.some(quote => quote.n) && <div className={styles.refs}>
          {result.quotes.filter(quote => quote.n).map(quote => <a key={`${quote.n}-${quote.text}`} href={`#p-${quote.n}`} onClick={event => { event.preventDefault(); jump(quote.n!); }}>“{quote.text.length > 48 ? `${quote.text.slice(0, 46)}…` : quote.text}” ¶{quote.n}</a>)}
        </div>}
        <div className={styles.row}><button type="button" className={styles.button} onClick={save}>Save to notebook</button></div>
      </div>}
    </div>}
  </aside>;
}
