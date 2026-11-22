'use client';

import Link from 'next/link';
import { useState } from 'react';
import { saveToNotebook } from './libraryClient';
import styles from './library.module.css';

/** Return: a few sentences back, kept in the private notebook on this device. */
export default function ReturnNote({ bookId, work, question }: { bookId: string; work: string; question: string }) {
  const [text, setText] = useState(''), [status, setStatus] = useState('');
  return <form className={styles.returnBox} onSubmit={event => {
    event.preventDefault();
    if (!text.trim()) return;
    if (saveToNotebook(bookId, `${work}: ${question}`, text.trim())) { setText(''); setStatus('Saved to your notebook on this device.'); }
    else setStatus('Your browser didn’t allow saving here.');
  }}>
    <label htmlFor="return-note" className={styles.label}>Your answer to “{question}”</label>
    <textarea id="return-note" className={styles.input} rows={5} maxLength={5000} value={text} onChange={event => { setText(event.target.value); setStatus(''); }} placeholder="Three to ten sentences. Only you can see this." />
    <div className={styles.row}>
      <button type="submit" className={styles.primary} disabled={!text.trim()}>Save to my notebook</button>
      <Link className={styles.secondary} href={`/notebook?book=${encodeURIComponent(bookId)}`}>Open notebook</Link>
    </div>
    <p role="status" aria-live="polite" className={styles.status}>{status}</p>
  </form>;
}
