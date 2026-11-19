import type { Metadata } from 'next';
import Link from 'next/link';
import { GREAT_BOOKS } from '@/lib/books/catalog';
import { readBookEdition } from '@/lib/books/editions';
import ReadingNav, { ReadingFooter } from './ReadingNav';
import LibraryBrowser, { type LibraryEdition } from './LibraryBrowser';
import styles from './reading.module.css';

export const metadata: Metadata = { title: 'Free Great Books Library', description: 'Complete, credited Great Books editions, free to read. Explore source texts and join a welcoming reading Circle.' };
export default async function GreatBooksLibrary() {
  const results = await Promise.all(GREAT_BOOKS.map(book => readBookEdition(book.id).catch(() => null)));
  const editions: LibraryEdition[] = results.flatMap(value => value ? [{ bookId: value.bookId, editionId: value.edition.editionId, blockCount: value.edition.blockCount,
    licenseNotice: value.edition.licenseNotice, translators: value.edition.translators, editors: value.edition.editors, illustrators: value.edition.illustrators,
    sourceCatalogUrl: value.edition.sourceCatalogUrl, downloadUrl: value.edition.downloadUrl }] : []);
  return <div className={styles.page}>
    <ReadingNav />
    <main id="main" className={styles.main}>
      <h1 className={styles.title}>Read deeply. Talk generously.</h1>
      <p className={styles.lead}>A free library of complete Great Books editions, with the actual authors, translators and source credits. Read at your own pace, then explore the questions with other people.</p>
      <p className={styles.help}>Our community grows from Christian-conservative American roots and welcomes readers of every background and belief. Read charitably, stay with the text, and make room for disagreement.</p>
      <nav className={styles.nav} aria-label="Reading community"><Link href="/circles">Find a reading Circle</Link><Link href="/circles/path">Explore the 12-week reading path</Link><Link href="/circles/norms">Community norms</Link></nav>
      <section className={styles.panel} aria-labelledby="root-kernel-title">
        <h2 id="root-kernel-title" className={styles.sectionTitle}>Root Kernel Scripture studies</h2>
        <p className={styles.help}>Read Scripture in the World English Bible Classic, compare two readings of each passage, and bring a question to your salon.</p>
        <nav className={styles.nav} aria-label="Root Kernel studies">
          <Link className={styles.bookLink} href="/great-books/scripture/philemon">Read and discuss Philemon</Link>
          <Link className={styles.bookLink} href="/great-books/scripture/luke-good-samaritan">Read and discuss the Good Samaritan</Link>
        </nav>
      </section>
      <section className={styles.panel} aria-label="Free editions and rights">
        <h2 className={styles.sectionTitle}>Free source editions</h2>
        {editions[0] && <p className={styles.notice}>{editions[0].licenseNotice}</p>}
        <p className={styles.help}>{editions.length} of {GREAT_BOOKS.length} local editions are currently verified. The source editions are identified by Project Gutenberg as public domain in the United States. Rights outside the United States have not been assessed here; check your local law.</p>
        <p className={styles.help}><a href="https://www.gutenberg.org/policy/license.html" target="_blank" rel="noopener noreferrer">Read the Project Gutenberg License</a>. Every book page includes its edition credits, license and free original archive. Reading requires no sign-in. Community memberships and optional AI services are separate from the texts.</p>
      </section>
      <LibraryBrowser editions={editions} />
    </main>
    <ReadingFooter />
  </div>;
}
