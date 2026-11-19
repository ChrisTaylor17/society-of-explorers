/* Native anchors deliberately keep the recovery usable without JavaScript. */
/* eslint-disable @next/next/no-html-link-for-pages */
import 'server-only';
import { getBook } from '@/lib/books/catalog';
import { isEditionId, type BookEditionResponse } from '@/lib/books/bookmarks';
import { readBookEdition } from '@/lib/books/editions';
import { parsePassageReaderIntent } from '@/lib/books/passages';
import { matchesReadingEdition, parseReaderContext } from '@/lib/circles/reading-program';
import { isUuid } from '@/lib/ids/uuid';
import EditionCredits from './EditionCredits';
import styles from './reading.module.css';

type ReadingWithoutScripts =
  | { status: 'ready'; metadata: BookEditionResponse; selection: boolean }
  | { status: 'missing' | 'unavailable' | 'mismatch' | 'invalid' };

/** Public local edition lookup only. Never resolve an account or a Circle. */
export async function readingWithoutScripts(bookId: string, search: string): Promise<ReadingWithoutScripts> {
  const query = new URLSearchParams(search);
  const allowed = new Set(['edition', 'from', 'to', 'circle', 'passageBlock', 'passageStart', 'passageEnd']);
  if (Array.from(query.keys()).some(key => !allowed.has(key) || query.getAll(key).length !== 1)) return { status: 'invalid' };
  const requestedEdition = query.get('edition');
  if (requestedEdition !== null && !isEditionId(requestedEdition)) return { status: 'invalid' };
  if (query.has('circle') && !isUuid(query.get('circle'))) return { status: 'invalid' };
  const range = query.has('from') || query.has('to');
  const passage = parsePassageReaderIntent(bookId, query);
  if (passage.invalid || (range && passage.present) || ((range || passage.present) && requestedEdition === null)) return { status: 'invalid' };
  let metadata: BookEditionResponse | null;
  try { metadata = await readBookEdition(bookId); }
  catch { return { status: 'unavailable' }; }
  if (!metadata) return { status: 'missing' };
  if (requestedEdition !== null && requestedEdition !== metadata.edition.editionId) return { status: 'mismatch' };
  if (range) {
    const intent = parseReaderContext(bookId, query);
    if (intent.invalid || !intent.context || !matchesReadingEdition(metadata, intent.context)) return { status: 'invalid' };
  }
  if (passage.present && (!passage.reference || passage.reference.blockIndex >= metadata.edition.blockCount)) return { status: 'invalid' };
  return { status: 'ready', metadata, selection: range || passage.present };
}

export default function NoScriptBookReader({ bookId, reading }: { bookId: string; reading: ReadingWithoutScripts }) {
  const book = getBook(bookId);
  const notices = {
    missing: 'This book is not available in the local library. Choose another reading below.',
    unavailable: 'The complete edition could not be verified. No partial text or replacement edition is being offered.',
    mismatch: 'The link asks for a different edition from the one currently available. No replacement edition has been opened.',
    invalid: 'The linked edition or passage information could not be verified. Return to the library to choose a reading.',
  };
  return <div className={styles.page}>
    <main id="main" className={styles.main}>
      <nav className={styles.nav} aria-label="Reading without JavaScript"><a href="/great-books">Return to the free library</a></nav>
      <h1 className={styles.title}>{book?.title || 'Book not found'}</h1>
      <h2 className={styles.sectionTitle}>Read without JavaScript</h2>
      {reading.status === 'ready' ? <>
        <p className={styles.notice}>The complete credited source edition is available as a reading page. It includes the introduction, notes and license.</p>
        {reading.selection && <p className={styles.notice}>Your link includes a reading selection. This option opens the whole edition from the beginning, without positioning or highlighting that selection.</p>}
        <nav className={styles.nav} aria-label="Complete edition without JavaScript"><a className={styles.button} href={reading.metadata.edition.documentUrl}>Open the complete credited edition</a></nav>
        <p className={styles.help}>Use your browser&apos;s Back button to return to these reading options.</p>
        <EditionCredits metadata={reading.metadata} />
      </> : <p role="status" className={styles.notice}>{notices[reading.status]}</p>}
      <p className={styles.help}>Saved places, discussion and optional reading tools need JavaScript; some also require sign-in. They are unavailable in this reading-only view.</p>
      <nav className={styles.nav} aria-label="Library recovery"><a href="/great-books">Choose another book</a></nav>
    </main>
  </div>;
}
