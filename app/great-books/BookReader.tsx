'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getBook } from '@/lib/books/catalog';
import { parseBookEditionResponse, type BookEditionResponse } from '@/lib/books/bookmarks';
import ReadingNav, { ReadingFooter } from './ReadingNav';
import EditionCredits from './EditionCredits';
import ReaderTools from './ReaderTools';
import ReadingCommunity from './ReadingCommunity';
import PassageTools from './PassageTools';
import PassageContext from './PassageContext';
import { capturePassageSelection } from '@/lib/books/passage-text';
import { parsePassageReaderIntent } from '@/lib/books/passages';
import { getReadingEdition, matchesReadingEdition, readingDiscoveryHref } from '@/lib/circles/reading-program';
import styles from './reading.module.css';

type EditionState = { status: 'loading' | 'error' | 'missing' } | { status: 'ready'; metadata: BookEditionResponse };
export default function BookReader({ bookId, search }: { bookId: string; search?: string }) {
  return <Reader key={`${bookId}:${search ?? ''}`} bookId={bookId} search={search} />;
}
function Reader({ bookId, search }: { bookId: string; search?: string }) {
  const book = getBook(bookId);
  const [state, setState] = useState<EditionState>({ status: 'loading' }), [retry, setRetry] = useState(0);
  const [frameStatus, setFrameStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [fontSize, setFontSize] = useState(20), [index, setIndex] = useState(0), [jumpNotice, setJumpNotice] = useState('');
  const frameRef = useRef<HTMLIFrameElement>(null), blocks = useRef<HTMLElement[]>([]), disposeFrame = useRef<() => void>(() => {});
  useEffect(() => {
    let owned = true;
    const controller = new AbortController();
    setState({ status: 'loading' }); setFrameStatus('loading'); setIndex(0); setJumpNotice('');
    const deadline = setTimeout(() => { controller.abort(); if (owned) setState({ status: 'error' }); }, 15_000);
    void (async () => {
      try {
        const response = await fetch(`/api/great-books/text/${encodeURIComponent(bookId)}`, { cache: 'no-store', redirect: 'error', credentials: 'omit', signal: controller.signal });
        if (!response.ok) { if (owned && !controller.signal.aborted) setState({ status: response.status === 404 ? 'missing' : 'error' }); return; }
        const value: unknown = await response.json();
        if (!owned || controller.signal.aborted) return;
        const metadata = parseBookEditionResponse(value);
        if (!metadata || metadata.bookId !== bookId) setState({ status: 'error' });
        else setState({ status: 'ready', metadata });
      } catch { if (owned && !controller.signal.aborted) setState({ status: 'error' }); }
      finally { clearTimeout(deadline); }
    })();
    return () => { owned = false; controller.abort(); clearTimeout(deadline); disposeFrame.current(); blocks.current = []; };
  }, [bookId, retry]);
  useEffect(() => {
    if (state.status !== 'ready' || frameStatus !== 'loading') return;
    const deadline = setTimeout(() => setFrameStatus('error'), 15_000);
    return () => clearTimeout(deadline);
  }, [state, frameStatus]);
  useEffect(() => { frameRef.current?.contentDocument?.documentElement.style.setProperty('--reader-font-size', `${fontSize}px`); }, [fontSize, frameStatus]);
  useEffect(() => () => disposeFrame.current(), []);

  function frameLoaded() {
    disposeFrame.current();
    const document = frameRef.current?.contentDocument, window = frameRef.current?.contentWindow;
    if (state.status !== 'ready' || !document || !window) return setFrameStatus('error');
    const found = Array.from(document.querySelectorAll<HTMLElement>('[data-reading-index]'));
    if (found.length !== state.metadata.edition.blockCount || found.some((element, position) => element.dataset.readingIndex !== String(position))) return setFrameStatus('error');
    blocks.current = found; document.documentElement.style.setProperty('--reader-font-size', `${fontSize}px`);
    let queued = false, disposed = false;
    const update = () => {
      queued = false; if (disposed) return;
      const line = Math.max(40, window.innerHeight * .2);
      const visible = document.elementFromPoint?.(Math.max(1, window.innerWidth / 2), line)?.closest<HTMLElement>('[data-reading-index]');
      if (visible) { const position = Number(visible.dataset.readingIndex); if (Number.isSafeInteger(position) && position >= 0 && position < found.length) { setIndex(position); return; } }
      let start = 0, end = found.length;
      while (start < end) { const middle = Math.floor((start + end) / 2); if (found[middle].getBoundingClientRect().top <= line) start = middle + 1; else end = middle; }
      setIndex(Math.max(0, start - 1));
    };
    const scroll = () => { if (!queued) { queued = true; window.requestAnimationFrame(update); } };
    window.addEventListener('scroll', scroll, { passive: true }); window.addEventListener('resize', scroll);
    disposeFrame.current = () => { disposed = true; window.removeEventListener('scroll', scroll); window.removeEventListener('resize', scroll); };
    setFrameStatus('ready'); update();
  }
  const jump = useCallback((position: number) => {
    const element = blocks.current[position]; if (!element) return;
    element.scrollIntoView({ block: 'start', behavior: 'auto' }); element.setAttribute('tabindex', '-1'); element.focus({ preventScroll: true });
    setIndex(position); setJumpNotice(`Moved to reading block ${position + 1}.`);
  }, []);
  function jumpHeading(id: string) {
    const element = frameRef.current?.contentDocument?.getElementById(id);
    if (!element) return setJumpNotice('That heading could not be located in this edition.');
    element.scrollIntoView({ block: 'start', behavior: 'auto' }); element.setAttribute('tabindex', '-1'); element.focus({ preventScroll: true });
    setJumpNotice(`Moved to ${element.textContent?.trim() || 'the chosen heading'}.`);
  }
  const select = useCallback(() => frameRef.current?.contentWindow?.getSelection()?.toString() || '', []);
  const capture = () => state.status === 'ready' && frameRef.current?.contentDocument
    ? capturePassageSelection(frameRef.current.contentDocument, blocks.current, state.metadata)
    : { ok: false as const, reason: 'Open the complete edition before selecting a passage.' };
  const ready = state.status === 'ready' && frameStatus === 'ready';
  const passageIntent = parsePassageReaderIntent(bookId, new URLSearchParams(search));
  const edition = state.status === 'ready' ? getReadingEdition(bookId, state.metadata.edition.editionId) : null;
  const discussionHref = edition && state.status === 'ready' && matchesReadingEdition(state.metadata, edition)
    ? readingDiscoveryHref({ bookId, editionId: edition.editionId, from: 0, to: edition.blockCount - 1 }) : '/circles';
  return <div className={styles.page}>
    <ReadingNav />
    <main id="main" className={styles.main}>
      <nav className={styles.nav} aria-label="Reader links"><Link href="/great-books">Back to free library</Link><Link href={`/notebook?book=${encodeURIComponent(bookId)}`}>Write in your notebook</Link><Link href={discussionHref}>{discussionHref === '/circles' ? 'Browse reading Circles' : 'Discuss this edition in a Circle'}</Link></nav>
      <h1 className={styles.title}>{book?.title || 'Book not found'}</h1>
      {book && <p className={styles.lead}>{book.author} · {book.year}</p>}
      {state.status === 'loading' && <p role="status" className={styles.status}>Loading the complete local edition…</p>}
      {(state.status === 'error' || frameStatus === 'error') && <div className={styles.panel}><p role="alert">The complete edition could not be opened. No partial text is being presented as the full book.</p><button type="button" className={styles.button} onClick={() => setRetry(value => value + 1)}>Retry complete edition</button></div>}
      {state.status === 'missing' && <p role="status">This edition is not available. <Link href="/great-books">Return to the library</Link>.</p>}
      {state.status === 'ready' && <>
        <EditionCredits metadata={state.metadata} />
        {!passageIntent.present && <ReadingCommunity metadata={state.metadata} currentIndex={index} frameReady={ready} jump={jump} search={search} />}
        <PassageContext metadata={state.metadata} frameReady={ready} jump={jump} search={search} />
        <section aria-label="Complete book reader">
          <h2 className={styles.sectionTitle}>Complete source edition</h2>
          <p className={styles.help}>Scroll within the book to read the full edition, including its introduction, notes, source credits and license. Selecting or clicking a passage does not call an AI or voice service.</p>
          <div className={styles.controls} role="group" aria-label="Reading display controls">
            <button type="button" className={styles.button} disabled={fontSize <= 16} onClick={() => setFontSize(value => Math.max(16, value - 2))} aria-label="Decrease book text size">Smaller text</button>
            <span aria-live="polite">Book text: {fontSize} pixels</span>
            <button type="button" className={styles.button} disabled={fontSize >= 30} onClick={() => setFontSize(value => Math.min(30, value + 2))} aria-label="Increase book text size">Larger text</button>
          </div>
          {state.metadata.edition.contents.length > 0 && <div style={{ margin: '1rem 0' }}><label htmlFor="reading-contents" className={styles.label}>Go to a heading</label><select id="reading-contents" className={styles.input} defaultValue="" disabled={!ready} onChange={event => { if (event.target.value) jumpHeading(event.target.value); event.target.value = ''; }}><option value="">Choose a part or chapter</option>{state.metadata.edition.contents.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>}
          {frameStatus === 'loading' && <p role="status" className={styles.status}>Opening the book…</p>}
          <p aria-live="off" className={styles.status}>{ready ? `Approximate visible place: reading block ${(index + 1).toLocaleString()} of ${state.metadata.edition.blockCount.toLocaleString()}.` : ''}</p>
          <p role="status" className={styles.status}>{jumpNotice}</p>
          <nav className={styles.nav} aria-label="Bypass book frame"><a href="#reading-tools">Skip the book to saved place and optional tools</a></nav>
          {frameStatus !== 'error' && <iframe data-reading-frame="true" key={`${state.metadata.edition.editionId}-${retry}`} ref={frameRef} className={styles.frame} title={`${state.metadata.title} — complete source edition`} src={state.metadata.edition.documentUrl} sandbox="allow-same-origin" referrerPolicy="no-referrer" onLoad={frameLoaded} onError={() => setFrameStatus('error')} aria-busy={frameStatus === 'loading'} />}
        </section>
        <PassageTools key={`passage:${state.metadata.edition.editionId}`} metadata={state.metadata} currentIndex={index} frameReady={ready} capture={capture} />
        <div id="reading-tools" tabIndex={-1}><ReaderTools key={state.metadata.edition.editionId} edition={state.metadata} currentIndex={index} frameReady={ready} jump={jump} select={select} returnSearch={search} /></div>
      </>}
    </main>
    <ReadingFooter />
  </div>;
}
