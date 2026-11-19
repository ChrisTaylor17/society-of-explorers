import type { Metadata } from 'next';
import { GREAT_BOOKS } from '@/lib/books/catalog';
import ReadingNav, { ReadingFooter } from '../great-books/ReadingNav';
import NotebookClient from './NotebookClient';
import styles from '../great-books/reading.module.css';

export const metadata: Metadata = {
  title: 'Reading notebook',
  description: 'A private reading notebook for the Great Books. Notes stay on your device.',
};

export default function NotebookPage() {
  const books = GREAT_BOOKS.map(book => ({ id: book.id, title: book.title, author: book.author }));
  return <div className={styles.page}>
    <ReadingNav />
    <main id="main" className={styles.main}>
      <h1 className={styles.title}>Your reading notebook</h1>
      <p className={styles.lead}>Write down the passage that stopped you, the question you want to bring to the salon, and what you think now.</p>
      <p className={styles.help}>Notes are saved only in this browser on this device. Nothing is sent to us. Use Download to keep a copy or move it to another device.</p>
      <NotebookClient books={books} />
    </main>
    <ReadingFooter />
  </div>;
}
