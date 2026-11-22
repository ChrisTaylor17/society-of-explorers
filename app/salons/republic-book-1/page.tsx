import type { Metadata } from 'next';
import Link from 'next/link';
import ReadingNav from '../../great-books/ReadingNav';
import { readingReaderHref } from '@/lib/circles/reading-program';
import styles from '../pilot/pilot.module.css';

const description = 'A one-hour reading guide for Plato’s Republic, Book I: what is justice, and is the just life the better life?';
export const metadata: Metadata = {
  title: 'Salon guide: Plato’s Republic, Book I', description,
  alternates: { canonical: '/salons/republic-book-1' },
  openGraph: { title: 'Salon guide: Plato’s Republic, Book I', description, url: '/salons/republic-book-1', type: 'website' },
  twitter: { card: 'summary', title: 'Salon guide: Plato’s Republic, Book I', description },
};

// Block positions belong to the reviewed Jowett edition (Project Gutenberg 1497).
// A replacement edition must be curated again rather than inherit these ranges.
const edition = { bookId: 'republic', editionId: 'pg-1497-c0bf2b223089459d9868aaeb69f295b307734ec9c232a9dabc8c1f9b496dcfb4' };
const href = (from: number, to: number) => readingReaderHref(edition, { from, to });

const parts = [
  { title: 'Cephalus: justice as honesty and paying what you owe', reference: 'The opening at the Piraeus, through Cephalus leaving',
    quote: 'to speak the truth and to pay your debts', detail: 'An old, wealthy man says money matters most because it lets a person die without owing anyone. Socrates asks whether that is all justice is.',
    question: 'Can you think of a time when telling the truth or paying back what you owed would have been the wrong thing to do?', href: href(423, 459) },
  { title: 'Polemarchus: help your friends, harm your enemies', reference: 'Polemarchus takes over the argument',
    quote: 'justice is the art which gives good to friends and evil to enemies', detail: 'His son defends an inherited saying. Socrates presses on two points: we can be wrong about who our friends are, and harming someone makes them worse.',
    question: 'Is it ever just to harm someone? What would make it so?', href: href(460, 600) },
  { title: 'Thrasymachus: justice serves the powerful', reference: 'Thrasymachus breaks in, to the end of Book I',
    quote: 'justice is nothing else than the interest of the stronger', detail: 'The angriest voice in the room says the rules are written by whoever rules, for their own benefit, and the unjust person lives better. Socrates argues back, and admits at the end that he still has not said what justice is.',
    question: 'Where does Thrasymachus have a point about how the world works? Where does his argument fail?', href: href(601, 914) },
] as const;

const agenda = [
  { time: '0–5', title: 'Welcome', detail: 'Names, and one sentence each: what brought you here tonight. Passing is fine.' },
  { time: '5–15', title: 'Read aloud', detail: 'Read the three short lines quoted on this page, and one paragraph of Thrasymachus. Reading aloud is optional.' },
  { time: '15–30', title: 'The argument', detail: 'Lay out the three answers to “what is justice?” in plain words. Which one does each of us actually live by?' },
  { time: '30–45', title: 'The objection', detail: 'Give Thrasymachus his strongest form. Ask someone who disagrees with him to state his view so well he would agree.' },
  { time: '45–55', title: 'An exercise', detail: 'Each person writes two sentences: their own definition of justice, and one case that would break it.' },
  { time: '55–60', title: 'One takeaway each', detail: 'One sentence each, or a pass. Name the next reading. Finish on time.' },
] as const;

export default function RepublicBookOneGuide() {
  return <div className={styles.page}>
    <ReadingNav />
    <main id="main" className={styles.main}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Salon reading guide</p>
          <h1>Plato’s Republic,<br />Book I.</h1>
          <p className={styles.lead}>What is justice? And is the just person actually better off?</p>
          <p>Book I takes about an hour to read. Three people give three answers, and Socrates takes each one apart. It ends without an answer, which is why the rest of the Republic exists.</p>
          <p className={styles.status}><strong>First salon planned:</strong> Thursday, December 3, online. We are not here to recruit anyone to a conclusion.</p>
          <nav className={styles.actions} aria-label="Guide sections">
            <Link className={styles.primary} href="/library/republic-book-1">Read it with Plato in the margin</Link>
            <a href={href(422, 914)}>Read Book I free</a>
            <a href="#three-answers">The three answers</a>
            <a href="#agenda">The hour</a>
            <Link href="/notebook?book=republic">Take notes</Link>
          </nav>
        </div>
      </header>

      <section id="three-answers" aria-labelledby="answers-title">
        <h2 id="answers-title">Three answers</h2>
        {parts.map((part, index) => <article key={part.title}>
          <h3>{index + 1}. {part.title}</h3>
          <p><em>{part.reference}</em></p>
          <blockquote>“{part.quote}”</blockquote>
          <p>{part.detail}</p>
          <p><strong>Question:</strong> {part.question}</p>
          <p><a href={part.href}>Read this part</a></p>
        </article>)}
      </section>

      <section id="agenda" aria-labelledby="agenda-title">
        <h2 id="agenda-title">The hour</h2>
        <ol>
          {agenda.map(item => <li key={item.time}><strong>{item.time} min · {item.title}.</strong> {item.detail}</li>)}
        </ol>
      </section>

      <section aria-labelledby="before-title">
        <h2 id="before-title">Before you come</h2>
        <ul>
          <li>Read Book I, or at least the Thrasymachus section. The reader is free and needs no sign-in.</li>
          <li>Write one line in your <Link href="/notebook?book=republic">notebook</Link>: the sentence that bothered you most.</li>
          <li>Quotations are from Benjamin Jowett’s translation, as published by Project Gutenberg.</li>
        </ul>
      </section>
    </main>
  </div>;
}
