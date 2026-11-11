import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../fellowship/fellowship.module.css';

export const metadata: Metadata = {
  title: 'Travel and reading — Society of Explorers',
  description: 'Bring a reading and a good question to your next journey. Explore original reflection prompts and the longer-term vision for shared places.',
};

const journeys = [
  { place: 'Athens', theme: 'Inquiring in public', question: 'Which belief would I be willing to defend—and what evidence could change it?', reading: 'Plato’s Apology', href: '/great-books/apology' },
  { place: 'Kyoto', theme: 'Attention and quiet', question: 'What do I notice when I stop trying to fill every moment?', reading: 'Meditations', href: '/great-books/meditations' },
  { place: 'Medellín', theme: 'Change and responsibility', question: 'Who benefits when a community changes, and who gets to decide?', reading: 'Plato’s Republic', href: '/great-books/republic' },
  { place: 'Lisbon', theme: 'Leaving and returning', question: 'What makes somewhere home: familiarity, obligation or the people there?', reading: 'The Odyssey', href: '/great-books/odyssey' },
  { place: 'Marrakech', theme: 'Hospitality and strangers', question: 'When I am a stranger, what do I hope others will offer me?', reading: 'The Good Samaritan', href: '/great-books/scripture/luke-good-samaritan#scripture' },
  { place: 'Reykjavík', theme: 'Perspective', question: 'What deserves my attention when I remember how little I control?', reading: 'Meditations', href: '/great-books/meditations' },
] as const;

export default function TravelPage() {
  return <div className={styles.page}>
    <header className={styles.header}>
      <nav className={`${styles.headerInner} ${styles.nav}`} aria-label="Travel and reading navigation">
        <Link href="/" prefetch={false} className={styles.brand}>Society of Explorers</Link>
        <a href="#main">Skip to content</a>
        <Link href="/try" prefetch={false}>Start exploring</Link>
        <Link href="/great-books" prefetch={false}>Free library</Link>
      </nav>
    </header>
    <main id="main" tabIndex={-1} className={styles.main}>
      <section className={styles.intro} aria-labelledby="travel-title">
        <p className={styles.eyebrow}>Travel · Reading · Conversation</p>
        <h1 id="travel-title">Take a question with you.</h1>
        <p className={styles.lead}>A journey can begin with a book. Choose a question, read before you go and notice what an unfamiliar place changes in your thinking.</p>
        <p>Use these reading prompts on a trip, a local walk or an afternoon at home. They are original reflection ideas, free to read without an account.</p>
        <div className={styles.actions}><a className={styles.button} href="#reading-journeys">Choose a reading journey</a><a href="#conversation">Turn it into a conversation</a></div>
      </section>

      <section id="reading-journeys" className={styles.section} aria-labelledby="journeys-title">
        <h2 id="journeys-title">A place, a reading, a question</h2>
        <p>These places come from SoE’s earlier travel vision. The pairings below are thematic reading ideas, not researched travel itineraries or claims about a local culture.</p>
        <div className={styles.grid}>{journeys.map(journey => <article className={styles.card} key={journey.place}>
          <p className={styles.eyebrow}>{journey.place}</p>
          <h3>{journey.theme}</h3>
          <p>{journey.question}</p>
          <Link href={journey.href} prefetch={false}>Read {journey.reading}</Link>
        </article>)}</div>
      </section>

      <section className={styles.panel} aria-labelledby="practice-title">
        <h2 id="practice-title">A small practice for any journey</h2>
        <ol>
          <li><strong>Before:</strong> read a passage and write down one question. Keep your own notes wherever you prefer.</li>
          <li><strong>During:</strong> notice one detail that challenges an assumption. Distinguish what you observe from what you infer.</li>
          <li><strong>After:</strong> return to the passage. Describe one thing you would now read differently and one question still open.</li>
        </ol>
        <details>
          <summary>Three prompts to bring along</summary>
          <p>What am I assuming about the people I meet? What might they notice that I miss? What would respectful curiosity look like here?</p>
          <p>Ask permission before recording or sharing another person’s words, image or private space.</p>
        </details>
      </section>

      <section id="conversation" className={styles.panel} aria-labelledby="conversation-title">
        <h2 id="conversation-title">Bring the reading back to other people</h2>
        <p>Begin with the passage, then share an observation and a question. Invite a different interpretation. A person can listen, disagree or pass.</p>
        <div className={styles.actions}><Link className={styles.button} href="/salons/pilot" prefetch={false}>Use the four-week salon plan</Link><Link href="/fellowship" prefetch={false}>Explore Christian fellowship</Link></div>
        <p className={styles.muted}>The salon page provides a proposed format and host guide. Its host and dates are unconfirmed; it does not book a meeting.</p>
      </section>

      <section className={styles.panel} aria-labelledby="vision-title">
        <h2 id="vision-title">The wider travel vision</h2>
        <p>Shared physical spaces, travel meetups and VR visits remain future directions for Society of Explorers. Hosting, booking, consent for spatial scans and device support need to be established before these can be offered.</p>
        <p>This page provides readings and discussion prompts. There are no travel bookings, live traveler profiles, earned rewards or verified passport records here.</p>
        <Link href="/try#feedback" prefetch={false}>Tell us which part would be useful to you</Link>
      </section>
    </main>
    <footer className={styles.footer}>
      <nav className={styles.nav} aria-label="Travel and reading footer"><Link href="/try" prefetch={false}>Try SoE</Link><Link href="/circles/norms" prefetch={false}>Community norms</Link><Link href="/privacy" prefetch={false}>Privacy policy</Link></nav>
    </footer>
  </div>;
}
