import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ONLINE_CIRCLES_HREF } from '@/lib/circles/discovery';
import { readingStartHref } from '@/lib/circles/reading-program';
import { lukeGoodSamaritan as study } from '@/lib/root-kernel/luke-good-samaritan';
import ReadingNav, { ReadingFooter } from '../../ReadingNav';
import reading from '../../reading.module.css';
import CircleReturnLink from '../philemon/CircleReturnLink';
import styles from '../philemon/study.module.css';

export const metadata: Metadata = {
  title: 'The Good Samaritan · Root Kernel Scripture Study',
  description: 'Read Luke 10:25–37 and bring the question of neighbor love to your Circle.',
};

export default function GoodSamaritanStudyPage() {
  const { source, range } = study;
  return <div className={reading.page}>
    <ReadingNav />
    <main id="main" className={reading.main}>
      <header className={styles.intro}>
        <p className={styles.kicker}>Root Kernel · Scripture study</p>
        <h1 className={reading.title}>{source.title}</h1>
        <p className={reading.lead}>Read {range}, compare two readings of the story, and bring a question to your salon.</p>
        <nav className={reading.nav} aria-label="In this study">
          <a href="#scripture">Read the passage</a>
          <a href="#study-notes">Compare readings</a>
          <a href="#host-guide">Host guide</a>
          <a href="#edition-sources">Edition and rights</a>
        </nav>
      </header>
      <div className={styles.columns}>
        <article className={styles.scripture} aria-labelledby="scripture">
          <h2 className={reading.sectionTitle} id="scripture" tabIndex={-1}>Scripture · {range}</h2>
          <Suspense fallback={null}><CircleReturnLink study={study.id} /></Suspense>
          <p className={reading.help}>{source.edition} · {study.extent}</p>
          {source.paragraphs.map(paragraph => <p className={styles.paragraph} key={paragraph[0].verse}>
            {paragraph.map(({ verse, text }, index) => <span className={styles.verse} id={`verse-${verse}`} key={verse} tabIndex={-1}>
              {index > 0 ? ' ' : null}<sup className={styles.verseNumber}>{verse}</sup>{' '}
              <span data-verse-text={verse} style={{ whiteSpace: 'pre-wrap' }}>{text}</span>
              {verse === 27 ? <sup className={styles.noteMark}><a href="#publisher-references" aria-label="Publisher cross-references for verse 27">*</a></sup> : null}
            </span>)}
          </p>)}
          <section className={styles.footnotes} aria-labelledby="publisher-references">
            <h3 id="publisher-references">Publisher cross-references</h3>
            <ol>{source.footnotes.map(note => <li key={note.href}>
              <a href={`#verse-${note.verse}`}>Verse {note.verse}</a>{' · '}<a href={note.href} rel="noreferrer">{note.text}</a>
            </li>)}</ol>
          </section>
        </article>
        <aside className={styles.notes} aria-labelledby="study-notes">
          <p className={styles.kicker}>Study notes · {range}</p>
          <h2 className={reading.sectionTitle} id="study-notes" tabIndex={-1}>{study.notesTitle}</h2>
          <p>{study.intro}</p>
          {study.perspectives.map(({ id, title, detail, source: citation }) => <section key={id} className={styles.perspective} aria-labelledby={id}>
            <h3 id={id}>{title}</h3><p>{detail}</p><a href={citation.href} rel="noreferrer">{citation.label}</a>
          </section>)}
          <p className={reading.help}>{study.comparison}</p>
        </aside>
      </div>
      <section className={reading.panel} aria-labelledby="host-guide">
        <h2 className={reading.sectionTitle} id="host-guide" tabIndex={-1}>A 45-minute salon</h2>
        <p className={reading.help}>{study.meetingNote}</p>
        <ol className={styles.questions}>{study.agenda.map(item => <li key={item.title}>
          <strong>{item.minutes} min · {item.title}</strong> {item.detail}
        </li>)}</ol>
        <h3>Questions for your salon</h3>
        <ol className={styles.questions}>{study.questions.map(({ before, verse, after }) => <li key={verse}>
          {before}<a href={`#verse-${verse}`}>verse {verse}</a>{after}
        </li>)}</ol>
        <nav className={reading.nav} aria-label="Salon next steps">
          <Link href={ONLINE_CIRCLES_HREF}>Find an online reading Circle</Link>
          <Link href={readingStartHref(study.selection) + '&format=online'}>Host a Good Samaritan salon</Link>
        </nav>
      </section>
      <section className={reading.panel} aria-labelledby="edition-sources">
        <h2 className={reading.sectionTitle} id="edition-sources" tabIndex={-1}>Edition and rights</h2>
        <p className={reading.help}>{study.metadata.edition.licenseNotice} The passage and cross-references come from the publisher. The discussion notes are original to this study.</p>
        <nav className={reading.nav} aria-label="Edition sources">
          <a href={source.publisherUrl} rel="noreferrer">Read the publisher’s edition</a>
          <a href={source.rightsUrl} rel="noreferrer">Publisher reuse terms</a>
          <Link href="/great-books">Back to the free library</Link>
        </nav>
      </section>
    </main>
    <ReadingFooter />
  </div>;
}
