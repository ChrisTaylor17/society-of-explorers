'use client';

import Link from 'next/link';
import { useLayoutEffect, useMemo, useRef } from 'react';
import type { BookEditionResponse } from '@/lib/books/bookmarks';
import { readingReturnHref } from '@/lib/circles/reading-program';
import { useSavedReading } from './useSavedReading';
import styles from './reading.module.css';

export default function SavedReadingTools({ metadata, currentIndex, frameReady, jump, returnSearch }: {
  metadata: BookEditionResponse; currentIndex: number; frameReady: boolean; jump: (index: number) => void; returnSearch: string;
}) {
  const { bookId, edition } = metadata;
  const model = useSavedReading(bookId, edition.editionId, edition.blockCount);
  const context = useMemo(() => ({ bookId, editionId: edition.editionId, currentIndex, frameReady }), [bookId, edition.editionId, currentIndex, frameReady]);
  const rendered = useRef<typeof context | null>(null);
  useLayoutEffect(() => { rendered.current = context; return () => { rendered.current = null; }; }, [context]);
  const current = () => rendered.current === context;
  const disabled = !model.active || model.busy;
  const ready = model.phase === 'ready', reviewing = model.phase === 'review';
  return <section className={styles.panel} aria-labelledby="saved-place-title">
    <h2 id="saved-place-title" className={styles.sectionTitle}>Your saved place</h2>
    <p className={styles.status} role="status">{model.message}</p>
    <div className={styles.controls}>
      <button type="button" className={styles.button} disabled={disabled || reviewing} onClick={model.load}>Load my saved place</button>
      {ready && model.state?.status === 'saved' && model.state.bookmark?.status === 'current'
        && <button type="button" className={styles.button} disabled={disabled || !frameReady} onClick={() => { if (current() && frameReady) model.go(jump); }}>Go to saved place</button>}
      <button type="button" className={styles.button} disabled={disabled || !frameReady || !ready} onClick={() => { if (current() && frameReady) model.prepare('save', currentIndex); }}>Save this place</button>
      {ready && model.state?.status === 'saved' && <button type="button" className={styles.button} disabled={disabled} onClick={() => model.prepare('remove', currentIndex)}>Review removing saved place</button>}
      {model.phase === 'unknown' && model.state && <button type="button" className={styles.button} disabled={disabled} onClick={model.retry}>Review retry of same saved-place change</button>}
    </div>
    <label className={styles.check}><input type="checkbox" checked={model.finished} disabled={disabled || !ready} onChange={event => model.finish(event.target.checked)} />Mark this edition finished when I save.</label>
    {model.review && <section aria-label="Review saved-place change" className={styles.panel}>
      <h3 className={styles.sectionTitle}>{model.review.action === 'save' ? 'Review saving this place' : 'Review removing your saved place'}</h3>
      <p>{metadata.title} · {metadata.author}</p>
      {model.review.action === 'save' ? <>
        <p>Source edition: {edition.sourceTitle}. {edition.translators.length ? `Translation: ${edition.translators.map(person => person.name).join(', ')}.` : `By ${edition.sourceAuthor}.`}</p>
        <p>Reading position {model.review.blockIndex + 1} of {edition.blockCount}. {model.review.completed ? 'Mark this edition finished.' : 'Keep this edition unfinished.'}</p>
        <p>This replaces your one private saved place for this book.</p>
      </> : <p>This removes your private saved place and finished marker for this book. The free source edition remains available.</p>}
      <div className={styles.controls}>
        <button type="button" className={styles.button} disabled={disabled || (model.review.action === 'save' && !frameReady)} onClick={() => { if (current() && (model.review?.action === 'remove' || frameReady)) model.confirm(); }}>{model.review.action === 'save' ? 'Confirm saving this place' : 'Confirm removing saved place'}</button>
        <button type="button" className={styles.button} disabled={disabled} onClick={model.cancel}>Cancel saved-place review</button>
      </div>
    </section>}
    <p className={styles.help}><Link className={styles.bookLink} href={`/login?${new URLSearchParams({ next: readingReturnHref(bookId, returnSearch) })}`}>Sign in</Link> or <Link className={styles.bookLink} href={`/login?${new URLSearchParams({ mode: 'signup', next: readingReturnHref(bookId, returnSearch) })}`}>create a free account</Link> to use account-based tools. Reading the complete edition remains free. Your reading place is never saved automatically.</p>
    <p className={styles.help}>Leaving this reader clears its private recovery details. A request already sent may still complete; load the saved place when you return.</p>
  </section>;
}
