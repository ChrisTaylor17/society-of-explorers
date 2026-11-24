import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReadingNav, { ReadingFooter } from '../../great-books/ReadingNav';
import { COMPANIONS, LIBRARY_SESSIONS, getLibrarySession } from '@/lib/library/sessions';
import { loadSessionBlocks } from '@/lib/library/text-server';
import MarginReader from '../MarginReader';
import SalonGuide, { type GuidePart } from '../SalonGuide';
import ReturnNote from '../ReturnNote';
import styles from '../library.module.css';

type Props = { params: Promise<{ session: string }> };
export const dynamicParams = false;
export function generateStaticParams() { return LIBRARY_SESSIONS.map(session => ({ session: session.slug })); }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const session = getLibrarySession((await params).session);
  if (!session) return { title: 'Reading not found' };
  const title = `${session.author}, ${session.work}: read with ${COMPANIONS[session.companion].name}`;
  const description = `${session.question} Read ${session.work} free, with an AI thinker in the margin and a salon guide.`;
  return { title, description, alternates: { canonical: `/library/${session.slug}` }, openGraph: { title, description, url: `/library/${session.slug}`, type: 'article' }, twitter: { card: 'summary', title, description } };
}

export default async function LibrarySessionPage({ params }: Props) {
  const session = getLibrarySession((await params).session);
  if (!session) notFound();
  const blocks = await loadSessionBlocks(session);
  const companion = COMPANIONS[session.companion].name;
  const nOf = (index: number) => blocks.find(block => block.index === index)?.n ?? 1;
  const parts: GuidePart[] = session.parts.map(part => ({ title: part.title, quote: part.quote, detail: part.detail, question: part.question, startN: nOf(part.from), endN: nOf(part.to) }));

  return <div className={styles.page}>
    <ReadingNav />
    <main id="main" className={styles.main}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>{session.path} · The Library</p>
        <h1 className={styles.title}>{session.title}</h1>
        <p className={styles.lead}>{session.question}</p>
        <p className={styles.meta}><span>{session.author}, <em>{session.work}</em></span><span>{session.translator} translation, public domain</span><span>{session.readingTime}</span></p>
        <p style={{ maxWidth: '40rem', margin: 0 }}>{session.summary}</p>
        {session.salon && <p className={styles.salonNote}><strong>Salon: {session.salon.label}.</strong> {session.salon.detail}{session.salon.href && <> <a href={session.salon.href}>Reserve a seat</a>.</>}</p>}
        <nav className={styles.actions} aria-label="On this page">
          <a className={styles.primary} href="#read">Read with {companion}</a>
          <a className={styles.secondary} href="#salon-guide">Salon guide</a>
          <a className={styles.secondary} href="#return">Write back</a>
        </nav>
      </header>

      <section id="read" aria-labelledby="read-title">
        <h2 id="read-title" className={styles.h2}>Read</h2>
        <p className={styles.muted} style={{ margin: '0 0 1.75rem', maxWidth: '42rem' }}>Tap any paragraph to ask {companion} about it in the margin. Select a few words first to ask about just those. Reading is free; asking needs a free account.</p>
        <div className={styles.layout}>
          <article id="reading-text" className={styles.text} lang="en">
            {session.ranges.map(range => <div key={range.from}>
              {session.ranges.length > 1 || range.label ? <h3 className={styles.rangeLabel}>{range.label}</h3> : null}
              {blocks.filter(block => block.index >= range.from && block.index <= range.to).map(block =>
                <p key={block.index} id={`p-${block.n}`} className={styles.para} data-n={block.n} tabIndex={0} aria-label={`Paragraph ${block.n}. Press Enter to ask about it.`}>
                  <span className={styles.num} aria-hidden="true">{block.n}</span><span data-body>{block.text}</span>
                </p>)}
            </div>)}
            <p className={styles.muted} style={{ fontSize: '.95rem', marginTop: '2rem' }}>Text: {session.author}, {session.work}, translated by {session.translator}, from the Project Gutenberg edition in our <Link href={`/great-books/${session.bookId}`}>free library</Link>.</p>
          </article>
          <MarginReader slug={session.slug} bookId={session.bookId} companion={session.companion} work={`${session.author}, ${session.work}`} />
        </div>
      </section>

      <section id="salon-guide" className={styles.section} aria-labelledby="guide-title">
        <p className={styles.eyebrow}>Salon guide</p>
        <h2 id="guide-title" className={styles.h2}>Questions for the salon</h2>
        <p className={styles.muted} style={{ margin: 0, maxWidth: '42rem' }}>Answer each question in a sentence or two before the salon. {companion} will press on your reasoning with one follow-up, never on whether you’re right.</p>
        <SalonGuide slug={session.slug} bookId={session.bookId} work={`${session.author}, ${session.work}`} companion={session.companion} parts={parts} />
        <h3 className={styles.h3} style={{ marginTop: '2.5rem' }}>The hour, for whoever hosts</h3>
        <ol className={styles.agenda}>
          {session.agenda.map(item => <li key={item.time}><span className={styles.time}>{item.time} min</span><span><strong>{item.title}.</strong> {item.detail}</span></li>)}
        </ol>
      </section>

      <section id="return" className={styles.section} aria-labelledby="return-title">
        <p className={styles.eyebrow}>Return</p>
        <h2 id="return-title" className={styles.h2}>Write something back</h2>
        <p className={styles.muted} style={{ margin: '0 0 .5rem', maxWidth: '42rem' }}>After you read, or after the salon, put your own answer in a few sentences. It stays in your private notebook on this device.</p>
        <ReturnNote bookId={session.bookId} work={`${session.author}, ${session.work}`} question={session.question} />
        <p style={{ marginTop: '2rem' }}><Link href="/library">← All readings in the Library</Link></p>
      </section>
    </main>
    <ReadingFooter />
  </div>;
}
