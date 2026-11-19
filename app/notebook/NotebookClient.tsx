'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import styles from '../great-books/reading.module.css';

type BookOption = { id: string; title: string; author: string };
type Note = { id: string; bookId: string; passage: string; text: string; createdAt: string; updatedAt: string };

const STORAGE_KEY = 'soe-notebook-v1';
const MAX_NOTES = 500;
const MAX_TEXT = 5000;

function loadNotes(): Note[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Note => !!item && typeof item === 'object'
      && typeof (item as Note).id === 'string' && typeof (item as Note).text === 'string'
      && typeof (item as Note).bookId === 'string').slice(0, MAX_NOTES);
  } catch { return []; }
}

function saveNotes(notes: Note[]): boolean {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes)); return true; } catch { return false; }
}

function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function NotebookClient({ books }: { books: BookOption[] }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [ready, setReady] = useState(false);
  const [bookId, setBookId] = useState(books[0]?.id ?? 'general');
  const [passage, setPassage] = useState('');
  const [text, setText] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    setNotes(loadNotes());
    const params = new URLSearchParams(window.location.search);
    const book = params.get('book');
    if (book && books.some(item => item.id === book)) { setBookId(book); setFilter(book); }
    setReady(true);
  }, [books]);

  const titles = useMemo(() => new Map(books.map(book => [book.id, `${book.title} (${book.author})`])), [books]);
  const visible = filter === 'all' ? notes : notes.filter(note => note.bookId === filter);

  function persist(next: Note[], message: string) {
    if (saveNotes(next)) { setNotes(next); setStatus(message); }
    else setStatus('This browser would not save the note. Private browsing or full storage can cause this. Download your notes to keep them.');
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if (!body) { setStatus('Write something first.'); return; }
    const now = new Date().toISOString();
    if (editing) {
      persist(notes.map(note => note.id === editing ? { ...note, bookId, passage: passage.trim().slice(0, 300), text: body.slice(0, MAX_TEXT), updatedAt: now } : note), 'Note updated.');
      setEditing(null);
    } else {
      if (notes.length >= MAX_NOTES) { setStatus(`The notebook holds ${MAX_NOTES} notes. Download and remove some to add more.`); return; }
      persist([{ id: newId(), bookId, passage: passage.trim().slice(0, 300), text: body.slice(0, MAX_TEXT), createdAt: now, updatedAt: now }, ...notes], 'Note saved on this device.');
    }
    setPassage(''); setText('');
  }

  function edit(note: Note) {
    setEditing(note.id); setBookId(note.bookId); setPassage(note.passage); setText(note.text); setStatus('Editing a note.');
  }

  function remove(note: Note) {
    if (!window.confirm('Remove this note from this device?')) return;
    persist(notes.filter(item => item.id !== note.id), 'Note removed.');
    if (editing === note.id) { setEditing(null); setPassage(''); setText(''); }
  }

  function download() {
    const lines = notes.map(note => [
      `## ${titles.get(note.bookId) ?? 'General'}`,
      note.passage ? `Passage: ${note.passage}` : '',
      `Written: ${new Date(note.createdAt).toLocaleString()}`,
      '', note.text, '',
    ].filter((line, index) => line !== '' || index > 2).join('\n'));
    const blob = new Blob([`# My Society of Explorers notebook\n\n${lines.join('\n')}`], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'soe-notebook.md'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <>
    <section className={styles.panel} aria-labelledby="new-note">
      <h2 id="new-note" className={styles.sectionTitle}>{editing ? 'Edit note' : 'New note'}</h2>
      <form onSubmit={submit}>
        <label className={styles.label} htmlFor="note-book">Book</label>
        <select id="note-book" className={styles.input} value={bookId} onChange={event => setBookId(event.target.value)}>
          {books.map(book => <option key={book.id} value={book.id}>{book.title} ({book.author})</option>)}
          <option value="general">General note</option>
        </select>
        <label className={styles.label} htmlFor="note-passage">Passage or place (optional)</label>
        <input id="note-passage" className={styles.input} value={passage} maxLength={300} placeholder="For example: Book I, Thrasymachus on justice" onChange={event => setPassage(event.target.value)} />
        <label className={styles.label} htmlFor="note-text">Your note</label>
        <textarea id="note-text" className={styles.input} rows={6} value={text} maxLength={MAX_TEXT} placeholder="What did you notice? What question would you bring to the table?" onChange={event => setText(event.target.value)} />
        <p className={styles.nav}>
          <button className={styles.button} type="submit" disabled={!ready}>{editing ? 'Save changes' : 'Save note'}</button>
          {editing && <button className={styles.button} type="button" onClick={() => { setEditing(null); setPassage(''); setText(''); setStatus(''); }}>Cancel</button>}
        </p>
        <p className={styles.status} role="status" aria-live="polite">{status}</p>
      </form>
    </section>
    <section className={styles.panel} aria-labelledby="my-notes">
      <h2 id="my-notes" className={styles.sectionTitle}>My notes ({notes.length})</h2>
      <p className={styles.nav}>
        <label className={styles.label} htmlFor="note-filter">Show</label>
        <select id="note-filter" className={styles.input} value={filter} onChange={event => setFilter(event.target.value)}>
          <option value="all">All books</option>
          {books.map(book => <option key={book.id} value={book.id}>{book.title}</option>)}
          <option value="general">General notes</option>
        </select>
        {notes.length > 0 && <button className={styles.button} type="button" onClick={download}>Download notes</button>}
      </p>
      {!ready && <p className={styles.help}>Loading your notes…</p>}
      {ready && visible.length === 0 && <p className={styles.help}>No notes yet. <Link href="/great-books">Open a book</Link>, read a little, and come back with one line.</p>}
      {visible.map(note => <article key={note.id} className={styles.book}>
        <h3 className={styles.sectionTitle}>{titles.get(note.bookId) ?? 'General note'}</h3>
        {note.passage && <p className={styles.help}>{note.passage}</p>}
        <p style={{ whiteSpace: 'pre-wrap' }}>{note.text}</p>
        <p className={styles.nav}>
          <span className={styles.help}>{new Date(note.updatedAt).toLocaleDateString()}</span>
          {note.bookId !== 'general' && <Link href={`/great-books/${note.bookId}`}>Open the book</Link>}
          <button className={styles.button} type="button" onClick={() => edit(note)}>Edit</button>
          <button className={styles.button} type="button" onClick={() => remove(note)}>Remove</button>
        </p>
      </article>)}
    </section>
  </>;
}
