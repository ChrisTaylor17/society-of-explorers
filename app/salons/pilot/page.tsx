import type { Metadata } from 'next';
import Link from 'next/link';
import ReadingNav from '../../great-books/ReadingNav';
import { readingReaderHref } from '@/lib/circles/reading-program';
import { LUKE_STUDY_HREF } from '@/lib/root-kernel/luke-good-samaritan';
import { PHILEMON_STUDY_HREF } from '@/lib/root-kernel/philemon-edition';
import styles from './pilot.module.css';

const description = 'A proposed four-week online salon: Scripture, Plato, optional prayer and honest conversation in a small Christian-rooted fellowship.';
export const metadata: Metadata = {
  title: 'Four-week online salon plan', description,
  alternates: { canonical: '/salons/pilot' },
  robots: { index: false, follow: false },
  openGraph: { title: 'Four-week online salon plan', description, url: '/salons/pilot', type: 'website' },
  twitter: { card: 'summary', title: 'Four-week online salon plan', description },
};

// These positions belong to the reviewed Jowett edition. A replacement edition
// must be curated deliberately rather than inheriting the old paragraph range.
const apologyHref = readingReaderHref({ bookId: 'apology',
  editionId: 'pg-1656-c23a532ff45b46926abb91c193151af3f4aa8d27dc3bb76a3bb8971a427642c7',
}, { from: 44, to: 51 });

const weeks = [
  { number: 1, title: 'Who is my neighbor?', reference: 'Luke 10:25–37 · The Good Samaritan',
    detail: 'Read the complete passage. Notice the change between the lawyer’s question and Jesus’ final question.',
    question: 'What do we owe someone outside our own group?', href: `${LUKE_STUDY_HREF}#scripture`, action: 'Read the Good Samaritan' },
  { number: 2, title: 'What does fellowship require?', reference: 'Philemon · Complete letter',
    detail: 'Read all 25 verses, including the publisher’s notes. Consider both the appeal for Onesimus and what the letter leaves unsaid about slavery.',
    question: 'What changes when we call another person a brother or sister?', href: `${PHILEMON_STUDY_HREF}#scripture`, action: 'Read Philemon' },
  { number: 3, title: 'What would change your mind?', reference: 'Plato’s Apology · Opening defense',
    detail: 'Read the first eight paragraphs after the APOLOGY heading in Benjamin Jowett’s translation. Allow about 15 minutes before the meeting.',
    question: 'How can we tell honest conviction from a belief we refuse to examine?', href: apologyHref, action: 'Open the Apology selection' },
  { number: 4, title: 'What is worth carrying forward?', reference: 'Return to one passage from the first three weeks',
    detail: 'Bring one passage that stayed with you and one question that remains unresolved. No new reading is required.',
    question: 'What changed in how we read, listen or act—and would we return for another four weeks?', href: '#readings', action: 'Revisit the readings' },
] as const;

const agenda = [
  { time: '0–5', title: 'Arrive and reconnect', detail: 'Welcome each person. Offer a short check-in, with room to pass.' },
  { time: '5–10', title: 'Optional prayer or quiet reflection', detail: 'The host may offer a Christian prayer. Joining the prayer is optional; listening quietly is welcome.' },
  { time: '10–25', title: 'Read and notice', detail: 'Read the short text or selected paragraphs aloud. Reading aloud is optional. Let each person name one detail before debating it.' },
  { time: '25–50', title: 'Discuss one good question', detail: 'Ask which words support each reading. Give a differing view a fair hearing and invite quieter people without putting them on the spot.' },
  { time: '50–60', title: 'Close and choose a next step', detail: 'Invite one takeaway or a pass. Confirm the next reading and meeting. Finish on time; any further 15 minutes are optional.' },
] as const;

export default function SalonPilotPage() {
  return <div className={styles.page}>
    <ReadingNav />
    <main id="main" className={styles.main}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>A proposed online salon</p>
          <h1>Four weeks,<br />one small circle.</h1>
          <p className={styles.lead}>Read Scripture and the Great Books. Pray if you wish. Get to know people through a conversation worth returning to.</p>
          <p>Our fellowship is rooted in Christian faith. People who disagree are welcome. You can listen, question, decline to read aloud or pass on any question.</p>
          <p className={styles.status}><strong>Pilot plan</strong> · Host and dates to be confirmed. No sessions are booked through this page.</p>
          <nav className={styles.actions} aria-label="Pilot plan sections">
            <a className={styles.primary} href="#weeks">Explore the four weeks</a>
            <a href="#host-guide">Open the host guide</a>
          </nav>
        </div>
        <aside className={styles.atAGlance} aria-label="Proposed salon format">
          <span className={styles.seal} aria-hidden="true">✦</span>
          <p className={styles.eyebrow}>Meet from anywhere</p>
          <dl>
            <div><dt>People</dt><dd>6–8 adults, including the host</dd></div>
            <div><dt>Rhythm</dt><dd>Once a week, for four weeks</dd></div>
            <div><dt>Time</dt><dd>60 minutes, with an optional 15 after</dd></div>
            <div><dt>Room</dt><dd>An online meeting chosen by your host</dd></div>
          </dl>
        </aside>
      </header>

      <section id="weeks" className={styles.section} aria-labelledby="weeks-title" tabIndex={-1}>
        <p className={styles.eyebrow}>The four-week reading plan</p>
        <h2 id="weeks-title">A text, a question, and each other.</h2>
        <p>Read ahead when you can. During the meeting, stay close to the text and make room for questions that do not have easy answers.</p>
        <div className={styles.weeks}>
          {weeks.map(week => <article key={week.number} className={styles.week} aria-labelledby={`week-${week.number}`}>
            <p className={styles.weekNumber}>Week {week.number}</p>
            <h3 id={`week-${week.number}`}>{week.title}</h3>
            <p className={styles.reference}>{week.reference}</p>
            <p>{week.detail}</p>
            <p className={styles.question}>{week.question}</p>
            <Link href={week.href} prefetch={false}>{week.action}<span aria-hidden="true"> →</span></Link>
          </article>)}
        </div>
      </section>

      <section id="host-guide" className={styles.section} aria-labelledby="host-title" tabIndex={-1}>
        <p className={styles.eyebrow}>A repeatable evening</p>
        <h2 id="host-title">A simple guide for the host.</h2>
        <p>Use the same rhythm each week. Share the reading and one question beforehand; aim to keep preparation within 30 minutes.</p>
        <ol className={styles.agenda}>
          {agenda.map(item => <li key={item.time}><span className={styles.time}>{item.time} min</span><div><h3>{item.title}</h3><p>{item.detail}</p></div></li>)}
        </ol>
        <div className={styles.hostNotes}>
          <section aria-labelledby="before-meeting"><h3 id="before-meeting">Before the first meeting</h3>
            <ul>
              <li>Confirm the host, weekly dates and invited adults. Choose a backup host who can open the room if needed.</li>
              <li>Keep the meeting link within the invited group. Set up a waiting room and test both hosts’ access.</li>
              <li>Keep recording and automatic transcription off. Ask before repeating someone’s personal story outside the group.</li>
              <li>Explain that prayer is optional and disagreement is welcome. Interrupt personal attacks and give everyone room to speak.</li>
            </ul>
          </section>
          <section aria-labelledby="after-meeting"><h3 id="after-meeting">After each meeting</h3>
            <ul>
              <li>Privately note how many people attended for at least 30 minutes, how many returned and how long preparation took.</li>
              <li>Ask what helped and what made attendance difficult. Let people decline to answer; avoid collecting sensitive personal details.</li>
              <li>After week four, ask whether members and the host want another cycle. A small group can guide improvements; it cannot establish broad demand.</li>
            </ul>
          </section>
        </div>
      </section>

      <section id="readings" className={styles.section} aria-labelledby="readings-title" tabIndex={-1}>
        <p className={styles.eyebrow}>Keep the sources close</p>
        <h2 id="readings-title">Return to the readings.</h2>
        <nav className={styles.readings} aria-label="Pilot readings">
          <Link href={`${LUKE_STUDY_HREF}#scripture`} prefetch={false}>The Good Samaritan <span>Luke 10:25–37</span></Link>
          <Link href={`${PHILEMON_STUDY_HREF}#scripture`} prefetch={false}>Philemon <span>Complete letter</span></Link>
          <Link href={apologyHref} prefetch={false}>Apology <span>Opening defense · Benjamin Jowett</span></Link>
        </nav>
        <p className={styles.sourceNote}>The Scripture studies use the public-domain World English Bible Classic. The Plato reader retains its edition credits and Project Gutenberg rights notice; its public-domain determination applies in the United States. Rights elsewhere have not been assessed.</p>
        <nav className={styles.actions} aria-label="Fellowship resources"><Link href="/circles/norms" prefetch={false}>Read the community norms</Link><Link href="/great-books" prefetch={false}>Browse the free library</Link></nav>
      </section>
    </main>
    <footer className={styles.footer}>Society of Explorers · Faith, friendship and honest inquiry.</footer>
  </div>;
}
