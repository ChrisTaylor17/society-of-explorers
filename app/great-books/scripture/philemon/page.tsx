import type { Metadata } from 'next';
import Link from 'next/link';
import { ONLINE_CIRCLES_HREF } from '@/lib/circles/discovery';
import { philemonEdition as edition, PHILEMON_COMPARISON, PHILEMON_FURTHER_READING,
  PHILEMON_GREETING, PHILEMON_PERSPECTIVES, PHILEMON_SALON_QUESTIONS } from '@/lib/root-kernel/philemon-study';
import ReadingNav, { ReadingFooter } from '../../ReadingNav';
import reading from '../../reading.module.css';
import study from './study.module.css';

export const metadata: Metadata = {
  title: 'Philemon · Root Kernel Scripture Study',
  description: 'Read the complete Letter to Philemon in the World English Bible Classic and compare two readings of its opening blessing.',
};

const footnotesByVerse = new Map(edition.footnotes.map((note, index) => [note.verse, index + 1]));

export default function PhilemonStudyPage() {
  return <div className={reading.page}>
    <ReadingNav />
    <main id="main" className={reading.main}>
      <header className={study.intro}>
        <p className={study.kicker}>Root Kernel · Scripture study</p>
        <h1 className={reading.title}>{edition.title}</h1>
        <p className={reading.lead}>Read Paul’s short letter, compare how two traditions hear its greeting, and bring a question to your next salon.</p>
        <nav className={reading.nav} aria-label="In this study">
          <a href="#verse-3">Go to verse 3</a>
          <a href="#study-notes">Compare readings</a>
          <a href="#salon-questions">Salon questions</a>
          <a href="#edition-sources">Edition and rights</a>
        </nav>
      </header>

      <div className={study.columns}>
        <article className={study.scripture} aria-labelledby="scripture">
          <h2 className={reading.sectionTitle} id="scripture">Scripture · Philemon 1</h2>
          <p className={reading.help}>{edition.edition} · Complete letter</p>
          {edition.paragraphs.map(paragraph => <p className={study.paragraph} key={paragraph[0].verse}>
            {paragraph.map(({ verse, text }, index) => {
              const note = footnotesByVerse.get(verse);
              return <span className={study.verse} id={`verse-${verse}`} key={verse} tabIndex={-1}>
                {index > 0 ? ' ' : null}<sup className={study.verseNumber}>{verse}</sup>{' '}
                <span data-verse-text={verse}>{text}</span>
                {note ? <sup className={study.noteMark}><a href={`#publisher-note-${note}`} aria-label={`Publisher footnote for verse ${verse}`}>{note === 1 ? '†' : '‡'}</a></sup> : null}
              </span>;
            })}
          </p>)}
          <section className={study.footnotes} aria-labelledby="publisher-footnotes">
            <h3 id="publisher-footnotes">Publisher footnotes</h3>
            <ol>
              {edition.footnotes.map(({ verse, text }, index) => <li id={`publisher-note-${index + 1}`} key={verse} tabIndex={-1}>
                <a href={`#verse-${verse}`}>Verse {verse}</a>{' · '}<span data-publisher-footnote={verse}>{text}</span>
              </li>)}
            </ol>
          </section>
        </article>

        <aside className={study.notes} aria-labelledby="study-notes">
          <p className={study.kicker}>Study notes · Philemon 1:3</p>
          <h2 className={reading.sectionTitle} id="study-notes" tabIndex={-1}>Two readings of the greeting</h2>
          <p className={reading.help}>{PHILEMON_GREETING}</p>
          {PHILEMON_PERSPECTIVES.map(({ id, title, detail, source }) => (
            <section key={id} className={study.perspective} aria-labelledby={id}>
              <h3 id={id}>{title}</h3>
              <p>{detail}</p>
              <a href={source.href} rel="noreferrer">{source.label}</a>
            </section>
          ))}
          <p className={reading.help}>{PHILEMON_COMPARISON} Compare it with{' '}
            <a href={PHILEMON_FURTHER_READING[0].href} rel="noreferrer">{PHILEMON_FURTHER_READING[0].label}</a>{' and '}
            <a href={PHILEMON_FURTHER_READING[1].href} rel="noreferrer">{PHILEMON_FURTHER_READING[1].label}</a>.
          </p>
        </aside>
      </div>

      <section className={reading.panel} aria-labelledby="salon-questions">
        <h2 className={reading.sectionTitle} id="salon-questions" tabIndex={-1}>Questions for your salon</h2>
        <ol className={study.questions}>
          {PHILEMON_SALON_QUESTIONS.map(({ before, verse, after }) => (
            <li key={verse}>{before}<a href={`#verse-${verse}`}>verse {verse}</a>{after}</li>
          ))}
        </ol>
        <nav className={reading.nav} aria-label="Salon next steps">
          <Link href={ONLINE_CIRCLES_HREF}>Find an online reading Circle</Link>
          <Link href="/circles/host#philemon-salon">Host a Philemon salon</Link>
        </nav>
      </section>

      <section className={reading.panel} aria-labelledby="edition-sources">
        <h2 className={reading.sectionTitle} id="edition-sources" tabIndex={-1}>Edition and rights</h2>
        <p className={reading.help}>The publisher dedicates the {edition.edition} to the public domain. The Scripture and the two publisher footnotes are reproduced from that edition. The interpretation notes are separate study material.</p>
        <nav className={reading.nav} aria-label="Edition sources">
          <a href={edition.publisherUrl} rel="noreferrer">Read the publisher’s edition</a>
          <a href={edition.rightsUrl} rel="noreferrer">Publisher reuse terms</a>
          <Link href="/great-books">Back to the free library</Link>
        </nav>
      </section>
    </main>
    <ReadingFooter />
  </div>;
}
