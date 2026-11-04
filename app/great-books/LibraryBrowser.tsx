'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { GREAT_BOOKS } from '@/lib/books/catalog';
import { interpretBookmark, type BookEditionResponse } from '@/lib/books/bookmarks';
import { useReadingAccess } from './useReadingAccess';
import styles from './reading.module.css';

export type LibraryEdition = { bookId: string } & Pick<BookEditionResponse['edition'], 'editionId' | 'blockCount' | 'licenseNotice' | 'translators' | 'editors' | 'illustrators' | 'sourceCatalogUrl' | 'downloadUrl'>;
const DESCRIPTIONS: Record<string, string> = {
  republic: 'A dialogue on justice, education and the life of a good society.',
  meditations: 'An emperor’s reflections on duty, character and what lies within our control.',
  'genealogy-of-morals': 'Three essays questioning the origins and meanings of moral judgments.',
  apology: 'Plato’s account of Socrates’ defense before the Athenian court.',
  odyssey: 'An epic of homecoming, hospitality, loyalty and the trials of Odysseus.',
  'divine-comedy': 'Dante’s journey through Hell, Purgatory and Paradise, with the source edition’s credits and illustrations.',
  hamlet: 'Shakespeare’s tragedy of a Danish prince confronting grief, duty and uncertainty.',
  relativity: 'Einstein’s introduction to the special and general theories for readers willing to follow the argument.',
};
export default function LibraryBrowser({ editions }: { editions: LibraryEdition[] }) {
  const [query, setQuery] = useState(''), [author, setAuthor] = useState('all');
  const [progress, setProgress] = useState<Record<string, string>>({}), [notice, setNotice] = useState('Saved reading places are private. Load them only when you choose.');
  const clear = useCallback(() => { setProgress({}); setNotice('Private saved-place summaries were cleared. Load them again to check your current account.'); }, []);
  const { active, busy, run } = useReadingAccess(clear);
  const byBook = useMemo(() => new Map(editions.map(edition => [edition.bookId, edition])), [editions]);
  const filtered = GREAT_BOOKS.filter(book => (author === 'all' || book.author === author) &&
    `${book.title} ${book.author} ${DESCRIPTIONS[book.id]} ${byBook.get(book.id)?.translators.map(person => person.name).join(' ') || ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  function loadProgress() {
    if (!active || busy) return;
    setProgress({}); setNotice('Loading your saved-place summaries…');
    void run('/api/great-books/progress', { method: 'GET' }, response => response.json(), value => {
      if (!value || typeof value !== 'object' || !Array.isArray(value.progress) || value.progress.length > 1000) return setNotice('Saved places could not be understood. No empty history is being assumed.');
      const next: Record<string, string> = {};
      for (const row of value.progress) {
        if (!row || typeof row !== 'object' || typeof row.book_id !== 'string') return setNotice('Saved places could not be understood.');
        const edition = byBook.get(row.book_id); if (!edition) continue;
        if (next[row.book_id]) return setNotice('Saved places could not be understood.');
        const bookmark = interpretBookmark(row.section_id, edition.editionId, edition.blockCount);
        next[row.book_id] = bookmark.status === 'current' ? row.completed === true ? 'This edition marked finished' : 'Saved place in this edition'
          : bookmark.status === 'legacy' ? 'Earlier bookmark needs a fresh choice'
          : bookmark.status === 'edition_changed' ? 'Saved place belongs to another edition' : 'Earlier bookmark needs review';
      }
      setProgress(next); setNotice(Object.keys(next).length ? 'Saved-place summaries loaded. Open a book to load and resume its exact place.' : 'No saved places are available for these editions.');
    }, error => setNotice(error.status === 401 ? 'Sign in to load saved places. Every complete book remains free to read.' : 'Saved places could not be loaded. No empty history is being assumed.'));
  }
  return <>
    <section className={styles.panel} aria-label="Find a book">
      <label htmlFor="library-search" className={styles.label}>Search title, author, translator or subject</label>
      <input id="library-search" className={styles.input} type="search" value={query} onChange={event => setQuery(event.target.value)} />
      <label htmlFor="library-author" className={styles.label}>Author</label>
      <select id="library-author" className={styles.input} value={author} onChange={event => setAuthor(event.target.value)}><option value="all">All authors</option>{[...new Set(GREAT_BOOKS.map(book => book.author))].sort().map(name => <option key={name} value={name}>{name}</option>)}</select>
      <p role="status" className={styles.status}>{filtered.length} {filtered.length === 1 ? 'book' : 'books'} match.</p>
    </section>
    <section className={styles.panel} aria-label="Private reading summaries">
      <p className={styles.status} role="status">{notice}</p><button type="button" className={styles.button} disabled={!active || busy} onClick={loadProgress}>Load my saved-place summaries</button>
    </section>
    <div className={styles.grid} aria-label="Great Books library">
      {filtered.map(book => {
        const edition = byBook.get(book.id);
        return <article key={book.id} className={styles.book}>
          <h2><Link className={styles.bookLink} href={`/great-books/${book.id}`}>{book.title}</Link></h2>
          <p>{book.author} · {book.year}</p><p>{DESCRIPTIONS[book.id]}</p>
          {edition ? <>
            <p className={styles.help}>{edition.translators.length ? `Translation: ${edition.translators.map(person => `${person.name}${person.appliesTo ? ` (${person.appliesTo})` : ''}`).join('; ')}` : 'Read in the source language of this edition.'}</p>
            {edition.editors.length > 0 && <p className={styles.help}>Editing: {edition.editors.join('; ')}</p>}
            {edition.illustrators.length > 0 && <p className={styles.help}>Illustrations: {edition.illustrators.join('; ')}</p>}
            <p className={styles.help}>Complete local source edition · Public domain in the United States.</p>
          </> : <p className={styles.help}>The verified local edition is currently unavailable.</p>}
          {progress[book.id] && <p className={styles.help}>{progress[book.id]}</p>}
          <Link className={styles.bookLink} href={`/great-books/${book.id}`}>Read complete edition free</Link>
          {edition && <nav className={styles.nav} aria-label={`${book.title} source`}><a href={edition.sourceCatalogUrl} target="_blank" rel="noopener noreferrer">Source and edition details</a><a href={edition.downloadUrl} download>Download original archive</a></nav>}
        </article>;
      })}
    </div>
  </>;
}
