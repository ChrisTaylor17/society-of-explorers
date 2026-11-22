import type { Metadata } from 'next';
import Link from 'next/link';
import ReadingNav, { ReadingFooter } from '../great-books/ReadingNav';
import { COMPANIONS, TERM_ONE, getLibrarySession } from '@/lib/library/sessions';
import styles from './library.module.css';

const description = 'Read the great books free, with an AI thinker in the margin to ask about any paragraph, and a salon guide for each reading.';
export const metadata: Metadata = {
  title: 'The Library: read with the thinkers', description,
  alternates: { canonical: '/library' },
  openGraph: { title: 'The Library · Society of Explorers', description, url: '/library', type: 'website' },
  twitter: { card: 'summary', title: 'The Library · Society of Explorers', description },
};

export default function LibraryPage() {
  const salon = getLibrarySession('republic-book-1')!;
  return <div className={styles.page}>
    <ReadingNav />
    <main id="main" className={styles.main}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>The Library</p>
        <h1 className={styles.title}>Read the great books<br /><em>with the thinkers.</em></h1>
        <p className={styles.lead}>Every reading is free. Tap any paragraph and ask a thinker about it in the margin, then bring your answers to a salon.</p>
        <p className={styles.muted} style={{ maxWidth: '40rem', margin: 0 }}>The thinkers are AI voices drawn from the texts, not the real people. Their answers quote the passage so the book stays the main thing.</p>
      </header>

      <section aria-labelledby="next-salon">
        <p className={styles.eyebrow}>Next salon</p>
        <Link href={`/library/${salon.slug}`} className={`${styles.card} ${styles.feature}`}>
          <h2 id="next-salon" className={styles.h3} style={{ fontSize: '1.9rem' }}>{salon.author}, {salon.work}</h2>
          <p style={{ margin: 0, color: 'var(--soe-ivory)', fontSize: '1.15rem' }}>{salon.question}</p>
          <p className={styles.muted} style={{ margin: 0 }}>{salon.salon?.label} · read with {COMPANIONS[salon.companion].name} · {salon.readingTime}</p>
          <span className={styles.primary} style={{ alignSelf: 'start', marginTop: '.5rem' }}>Start reading</span>
        </Link>
      </section>

      <section className={styles.section} aria-labelledby="term-one">
        <p className={styles.eyebrow}>Term 1</p>
        <h2 id="term-one" className={styles.h2}>The examined life</h2>
        <p className={styles.muted} style={{ margin: 0, maxWidth: '42rem' }}>Six readings, one a week. More open as the salons reach them.</p>
        <div className={styles.cards}>
          {TERM_ONE.map(item => {
            const session = item.slug ? getLibrarySession(item.slug) : null;
            const inner = <>
              <p className={styles.eyebrow} style={{ margin: 0 }}>Session {item.n}{session ? ` · with ${COMPANIONS[session.companion].name}` : ' · coming'}</p>
              <h3 className={styles.h3}>{item.reading}</h3>
              <p style={{ margin: 0 }}>{item.question}</p>
            </>;
            return session
              ? <Link key={item.n} href={`/library/${session.slug}`} className={styles.card}>{inner}</Link>
              : <div key={item.n} className={`${styles.card} ${styles.cardSoon}`}>{inner}</div>;
          })}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="whole-books">
        <h2 id="whole-books" className={styles.h3}>Want the whole book?</h2>
        <p style={{ margin: 0 }}>Every complete text is in the <Link href="/great-books">free library</Link>, with credits and sources.</p>
      </section>
    </main>
    <ReadingFooter />
  </div>;
}
