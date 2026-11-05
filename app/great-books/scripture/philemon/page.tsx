import type { Metadata } from 'next';
import Link from 'next/link';
import edition from '@/content/root-kernel/philemon.web-classic.json';
import ReadingNav, { ReadingFooter } from '../../ReadingNav';
import reading from '../../reading.module.css';
import study from './study.module.css';

export const metadata: Metadata = {
  title: 'Philemon · Root Kernel Scripture Study',
  description: 'Read the complete Letter to Philemon in the World English Bible Classic and compare two readings of its opening blessing.',
};

const catechism = 'https://www.vatican.va/content/catechism/en/part_one/section_two/chapter_one/article_1/paragraph_2_the_father.html';
const unitarian = 'https://www.biblicalunitarian.com/articles/what-do-biblical-unitarians-believe';
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
          <p className={reading.help}>Paul names the Father and Jesus together in one blessing. The greeting distinguishes them and leaves their relationship to be explored in other passages.</p>
          <section className={study.perspective} aria-labelledby="nicene-reading">
            <h3 id="nicene-reading">Nicene Christian reading</h3>
            <p>This reading hears the Father and the Son as distinct persons named together in the blessing. In Nicene theology, their distinction is compatible with their sharing the one divine nature.</p>
            <a href={catechism} rel="noreferrer">Catholic Catechism, paragraphs 253–255</a>
          </section>
          <section className={study.perspective} aria-labelledby="unitarian-reading">
            <h3 id="unitarian-reading">Biblical Unitarian reading</h3>
            <p>This reading takes “God our Father” as naming the one God and “the Lord Jesus Christ” as naming the Messiah whom God made Lord. It sees the shared blessing as compatible with the Father granting authority to Jesus.</p>
            <a href={unitarian} rel="noreferrer">Biblical Unitarian statement of beliefs</a>
          </section>
          <p className={reading.help}>The greeting alone leaves the later doctrinal question open. Compare it with <a href="https://ebible.org/eng-web/JHN17.htm#V3" rel="noreferrer">John 17:3</a> and <a href="https://ebible.org/eng-web/PHP02.htm#V5" rel="noreferrer">Philippians 2:5–11</a>.</p>
        </aside>
      </div>

      <section className={reading.panel} aria-labelledby="salon-questions">
        <h2 className={reading.sectionTitle} id="salon-questions" tabIndex={-1}>Questions for your salon</h2>
        <ol className={study.questions}>
          <li>How does each reading account for both the distinction and the shared blessing in <a href="#verse-3">verse 3</a>?</li>
          <li>What would it ask of Philemon to receive Onesimus as a beloved brother in <a href="#verse-16">verse 16</a>? What does the letter leave open about what happened next?</li>
        </ol>
        <Link className={reading.bookLink} href="/circles">Find a reading Circle</Link>
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
