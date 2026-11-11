'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GREAT_BOOKS } from '@/lib/books/catalog';
import type { BookEditionResponse } from '@/lib/books/bookmarks';
import { parseReadingProgressResponse } from '@/lib/books/reading-progress';
import { memberSessionDto } from '@/lib/auth/memberDto';
import { circleHeaders } from '@/lib/circles/client';
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
  const searchInput = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<Record<string, string>>({}), [notice, setNotice] = useState('Saved reading places are private. Load them only when you choose.');
  const lifetime = useRef(0), [epoch, setEpoch] = useState(0);
  const invalidate = useCallback((render = true) => { lifetime.current++; if (render) setEpoch(lifetime.current); }, []);
  const [online, setOnline] = useState(true);
  const clear = useCallback(() => { invalidate(); setProgress({}); setNotice('Private saved-place summaries were cleared. Load them again to check your current account.'); }, [invalidate]);
  const { active, busy, run, cancel } = useReadingAccess(clear);
  const stop = useRef(cancel);
  useEffect(() => { stop.current = cancel; }, [cancel]);
  useEffect(() => {
    setEpoch(lifetime.current);
    const offline = () => { stop.current(); setOnline(false); }, reconnect = () => setOnline(true);
    if (navigator.onLine === false) offline();
    window.addEventListener('offline', offline); window.addEventListener('online', reconnect);
    return () => { invalidate(false); window.removeEventListener('offline', offline); window.removeEventListener('online', reconnect); };
  }, [invalidate]);
  const byBook = useMemo(() => new Map(editions.map(edition => [edition.bookId, edition])), [editions]);
  const filtered = GREAT_BOOKS.filter(book => (author === 'all' || book.author === author) &&
    `${book.title} ${book.author} ${DESCRIPTIONS[book.id]} ${byBook.get(book.id)?.translators.map(person => person.name).join(' ') || ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  function loadProgress() {
    if (!active || !online || busy || epoch !== lifetime.current) return;
    invalidate();
    setProgress({}); setNotice('Loading your saved-place summaries…');
    void run('/api/auth/member', { method: 'GET' }, async (response, signal, current) => {
      const proof = await response.json(), member = memberSessionDto(proof?.member);
      if (!current() || !member || !['supabase', 'wallet'].includes(proof?.auth?.provider) || typeof proof.auth.subject !== 'string' || !proof.auth.subject) throw Error('Member check unavailable');
      const headers = await circleHeaders(); if (!current()) throw Error('Saved-place summaries retired');
      const result = await fetch('/api/great-books/progress', { headers, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal });
      if (!current() || !result.ok) throw Error('Saved-place summaries unavailable');
      const value = parseReadingProgressResponse(await result.json());
      if (!current() || !value || value.memberId !== member.id.toLowerCase()) throw Error('Saved-place owner changed');
      return value;
    }, value => {
      const next: Record<string, string> = {};
      for (const row of value.progress) {
        if (row.status !== 'saved') continue;
        const edition = byBook.get(row.bookId), bookmark = row.bookmark;
        next[row.bookId] = !edition || row.edition.editionId !== edition.editionId || row.edition.blockCount !== edition.blockCount
          ? 'Saved place needs an available matching source edition'
          : bookmark?.status === 'current' ? row.completed === true ? 'This edition marked finished' : 'Saved place in this edition'
          : bookmark?.status === 'legacy' ? 'Earlier bookmark needs a fresh choice'
          : bookmark?.status === 'edition_changed' ? 'Saved place belongs to another edition' : 'Earlier bookmark needs review';
      }
      setProgress(next); setNotice(Object.keys(next).length ? 'Saved-place summaries loaded. Open a book to load and resume its exact place.' : 'No saved places are available for these editions.');
    }, error => setNotice(error.status === 401 ? 'Sign in to load saved places. Every complete book remains free to read.' : 'Saved places could not be loaded. No empty history is being assumed.'));
  }
  return <>
    <section className={styles.panel} aria-label="Find a book">
      <label htmlFor="library-search" className={styles.label}>Search title, author, translator or subject</label>
      <input ref={searchInput} id="library-search" className={styles.input} type="search" value={query} onChange={event => setQuery(event.target.value)} />
      <label htmlFor="library-author" className={styles.label}>Author</label>
      <select id="library-author" className={styles.input} value={author} onChange={event => setAuthor(event.target.value)}><option value="all">All authors</option>{[...new Set(GREAT_BOOKS.map(book => book.author))].sort().map(name => <option key={name} value={name}>{name}</option>)}</select>
      {(query || author !== 'all') && <button type="button" className={styles.button} style={{ marginTop: '1rem' }} onClick={() => { setQuery(''); setAuthor('all'); searchInput.current?.focus(); }}>Clear search and author filters</button>}
      <p role="status" className={styles.status}>{filtered.length} {filtered.length === 1 ? 'book' : 'books'} match.</p>
      {filtered.length === 0 && <p className={styles.help}>No books match both filters. Try a different title, author or translator, or clear the filters to browse the full library.</p>}
    </section>
    <section className={styles.panel} aria-label="Private reading summaries">
      <p className={styles.status} role="status">{notice}</p><button type="button" className={styles.button} disabled={!active || !online || busy} onClick={loadProgress}>Load my saved-place summaries</button>
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
          <Link className={styles.bookLink} href={`/great-books/${book.id}`}>{edition ? 'Read complete edition free' : 'Check edition availability'}</Link>
          {edition && <nav className={styles.nav} aria-label={`${book.title} source`}><a href={edition.sourceCatalogUrl} target="_blank" rel="noopener noreferrer">Source and edition details</a><a href={edition.downloadUrl} download>Download original archive</a></nav>}
        </article>;
      })}
    </div>
  </>;
}
