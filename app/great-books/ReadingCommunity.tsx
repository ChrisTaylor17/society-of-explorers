'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { BookEditionResponse } from '@/lib/books/bookmarks';
import { getReadingEdition, matchesReadingEdition, parseReaderContext, parseReadingProgram, readingDiscoveryHref,
  readingSelectionAt, readingSessionLabel, readingStartHref, starterReadingContext, type ReadingContext } from '@/lib/circles/reading-program';
import styles from './reading.module.css';

type Intent = ReturnType<typeof parseReaderContext>;
type CircleState = { status: 'checking' | 'error' | 'mismatch' } | { status: 'ready'; title: string };

/** Public reading context only. This component never requests credentials,
 * creates membership, saves progress or transports a selected quotation. */
export default function ReadingCommunity({ metadata, currentIndex, frameReady, jump, search }: {
  metadata: BookEditionResponse; currentIndex: number; frameReady: boolean; jump: (index: number) => void; search?: string;
}) {
  const [intent, setIntent] = useState<Intent | null>(null), [circle, setCircle] = useState<CircleState | null>(null), [retry, setRetry] = useState(0);
  const jumped = useRef(false);
  const pinned = getReadingEdition(metadata.bookId, metadata.edition.editionId);
  const editionMatches = Boolean(pinned && matchesReadingEdition(metadata, pinned));
  useEffect(() => {
    setIntent(parseReaderContext(metadata.bookId, new URLSearchParams(search ?? window.location.search)));
    jumped.current = false;
  }, [metadata.bookId, search]);
  useEffect(() => {
    if (!intent?.circleId || intent.invalid || !intent.context) { setCircle(null); return; }
    if (!editionMatches || intent.context.editionId !== metadata.edition.editionId) { setCircle({ status: 'mismatch' }); return; }
    const controller = new AbortController(); let owned = true;
    setCircle({ status: 'checking' });
    const deadline = setTimeout(() => { controller.abort(); if (owned) setCircle({ status: 'error' }); }, 15_000);
    void (async () => {
      try {
        const response = await fetch(`/api/circles/${intent.circleId}`, { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal });
        if (!response.ok) throw new Error('Circle unavailable');
        const value: unknown = await response.json();
        if (!owned || controller.signal.aborted) return;
        const outer = value && typeof value === 'object' ? value as Record<string, unknown> : null;
        const c = outer?.ready === true && outer.circle && typeof outer.circle === 'object' ? outer.circle as Record<string, unknown> : null;
        const program = c && parseReadingProgram(c.reading_program);
        const starter = c?.reading_program === null && c.program_length === 12 ? [2, 5].map(starterReadingContext).find(s => s?.bookId === intent.context!.bookId
          && s.editionId === intent.context!.editionId && s.from === intent.context!.from && s.to === intent.context!.to) : null;
        const agreed = Boolean(starter || (program && matchesReadingEdition(metadata, program) && program.bookId === intent.context!.bookId
          && program.editionId === intent.context!.editionId && program.sessions.some(s => s.from === intent.context!.from && s.to === intent.context!.to)));
        const valid = c?.id === intent.circleId && c.hidden === false && typeof c.title === 'string' && c.title.trim().length > 0 && c.title.length <= 200 && agreed;
        setCircle(valid ? { status: 'ready', title: c!.title as string } : { status: 'mismatch' });
      } catch { if (owned && !controller.signal.aborted) setCircle({ status: 'error' }); }
      finally { clearTimeout(deadline); }
    })();
    return () => { owned = false; controller.abort(); clearTimeout(deadline); };
  }, [intent, editionMatches, metadata, retry]);
  const validContext = intent?.context && editionMatches && intent.context.editionId === metadata.edition.editionId
    && !intent.invalid && (!intent.circleId || circle?.status === 'ready') ? intent.context : null;
  useEffect(() => {
    if (!validContext || !frameReady || jumped.current) return;
    jumped.current = true; jump(validContext.from);
  }, [validContext, frameReady, jump]);
  const selected = editionMatches ? readingSelectionAt(pinned!, currentIndex) : null;
  const context: ReadingContext | null = selected ? { bookId: metadata.bookId, editionId: metadata.edition.editionId, ...selected } : null;
  const whole: ReadingContext | null = pinned && editionMatches ? { bookId: metadata.bookId, editionId: pinned.editionId, from: 0, to: pinned.blockCount - 1 } : null;
  return <section className={styles.panel} aria-label="Read with a Circle">
    <h2 className={styles.sectionTitle}>Read with other people</h2>
    {intent?.invalid && <p role="alert" className={styles.notice}>This reading link has an invalid or changed edition or selection. No agreed reading place has been opened. Choose a new selection from this edition.</p>}
    {intent?.context && !editionMatches && <p role="alert" className={styles.notice}>This edition cannot be matched to the requested Circle reading. No place from another edition has been used.</p>}
    {circle?.status === 'checking' && <p role="status" className={styles.notice}>Checking the Circle’s agreed edition and reading selection…</p>}
    {circle?.status === 'mismatch' && <p role="alert" className={styles.notice}>This link does not match the Circle’s agreed edition and selection. Open the Circle to choose one of its planned readings.</p>}
    {circle?.status === 'error' && <div><p role="alert" className={styles.notice}>The Circle’s reading could not be verified. No agreed place has been assumed.</p><button type="button" className={styles.button} onClick={() => setRetry(v => v + 1)}>Check Circle reading again</button></div>}
    {validContext && <div>
      <p className={styles.notice}>{circle?.status === 'ready' ? `Agreed reading for ${circle.title}: ` : 'Linked reading selection: '}{readingSessionLabel(validContext, validContext)}.</p>
      <p className={styles.help}>Reading positions {validContext.from + 1}–{validContext.to + 1} in this exact edition. The complete book, credits and license remain available below.</p>
      <button type="button" className={styles.button} disabled={!frameReady} onClick={() => jump(validContext.from)}>Go to linked reading</button>
    </div>}
    {intent?.circleId && <nav className={styles.nav} aria-label="Return to linked Circle"><Link href={`/circles/${intent.circleId}`}>Return to the Circle and discussion</Link></nav>}
    {whole && <>
      <p className={styles.help}>Find people reading this book and edition, or plan a free weekly Circle. Joining, posting and creating a Circle each require their own confirmation.</p>
      <nav className={styles.nav} aria-label="Find people reading this edition"><Link href={readingDiscoveryHref(whole)}>Find Circles reading this edition</Link><Link href={readingStartHref(whole)}>Start a Circle for this edition</Link></nav>
      {context && frameReady && <div>
        <p className={styles.help}>At your current place: {readingSessionLabel(context, context)}.</p>
        <nav className={styles.nav} aria-label="Discuss the current reading selection"><Link href={readingDiscoveryHref(context)}>Find a Circle from this selection</Link><Link href={readingStartHref(context)}>Plan a Circle from this selection</Link></nav>
      </div>}
    </>}
  </section>;
}
