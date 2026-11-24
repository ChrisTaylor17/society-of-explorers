import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../fellowship/fellowship.module.css';

export const metadata: Metadata = {
  title: 'Try the fellowship',
  description: 'Read a complete book, compare Scripture in context and explore a practical salon plan. Start free, without an account.',
  alternates: { canonical: '/try' },
};

const feedbackHref = 'mailto:chris@societyofexplorers.com?subject=' + encodeURIComponent('SoE — my first visit') + '&body=' + encodeURIComponent(
  'Page I tried:\n\nOne thing I found useful:\n\nWhere I got stuck or what I would change:\n\nMy device and browser, if relevant:\n',
);

export default function TrySoEPage() {
  return <div className={styles.page}>
    <header className={styles.header}>
      <nav className={`${styles.headerInner} ${styles.nav}`} aria-label="Try SoE navigation">
        <Link href="/" prefetch={false} className={styles.brand}>Society of Explorers</Link>
        <a href="#main">Skip to content</a>
        <Link href="/great-books" prefetch={false}>Free library</Link>
        <Link href="/fellowship" prefetch={false}>Christian fellowship</Link>
      </nav>
    </header>
    <main id="main" tabIndex={-1} className={styles.main}>
      <section className={styles.intro} aria-labelledby="try-title">
        <p className={styles.eyebrow}>Start here · Free to explore</p>
        <h1 id="try-title">Come with a question.</h1>
        <p className={styles.lead}>Read something worthwhile. Consider a different interpretation. Imagine the conversation you would like to have with other people.</p>
        <p>Our fellowship is rooted in Christian faith, with room for honest disagreement. Start with the public readings and guides below. No account, payment or wallet is needed.</p>
        <div className={styles.actions}>
          <Link className={styles.button} href="/great-books/scripture/luke-good-samaritan#scripture" prefetch={false}>Start with the Good Samaritan</Link>
          <a href="#choose">Choose another starting point</a>
        </div>
        <p className={styles.muted}>A short first reading: Luke 10:25–37. Ask, “What do we owe someone outside our own group?”</p>
      </section>

      <section id="choose" className={styles.section} aria-labelledby="choose-title">
        <h2 id="choose-title">Three ways to go further</h2>
        <div className={styles.grid}>
          <article className={styles.card}>
            <p className={styles.eyebrow}>Read a Great Book</p>
            <h3>What would change your mind?</h3>
            <p>Open Plato’s <em>Apology</em> in a complete, credited source edition. Look for one claim you agree with and one you would challenge.</p>
            <Link href="/great-books/apology" prefetch={false}>Read the complete Apology</Link>
          </article>
          <article className={styles.card}>
            <p className={styles.eyebrow}>Explore Scripture</p>
            <h3>What does the passage say?</h3>
            <p>Read Psalm 22 and Isaiah 53 alongside the crucifixion accounts. Compare named Christian and Jewish interpretations, then inspect the sources.</p>
            <Link href="/fellowship/scripture" prefetch={false}>Compare the passages in context</Link>
          </article>
          <article className={styles.card}>
            <p className={styles.eyebrow}>Prepare to gather</p>
            <h3>What makes a good conversation?</h3>
            <p>Explore four weeks of readings, questions and a practical host guide. Prayer is optional, and listening or passing is welcome.</p>
            <Link href="/salons/pilot" prefetch={false}>Explore the four-week salon plan</Link>
          </article>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="expect-title">
        <h2 id="expect-title">What to expect</h2>
        <p>The readings and plans above are public. Private Circle and account features are being prepared for a pilot. The four-week plan is a guide for running your own group; it does not book a meeting. Our next live salon is Plato’s Republic, Book I, on Thursday, December 3, 7 PM Eastern, with 12 seats: <a href="https://www.societyofexplorers.com/salons">reserve a seat</a>.</p>
        <p>Root Kernel remains a distinct study project. Its named faith perspective and AI-assisted analysis can be questioned; the study pages separate source text, interpretations and uncertainties.</p>
        <details>
          <summary>If a page does not work</summary>
          <p>Return to the <Link href="/great-books" prefetch={false}>free library</Link> and open the reading again. You can also read the <Link href="/great-books/scripture/luke-good-samaritan#scripture" prefetch={false}>Good Samaritan passage</Link> directly. Reading links work without an account; interactive tools may need JavaScript.</p>
          <p>If the problem continues, tell us the page, what happened and your device or browser. Please leave out passwords, payment information and private conversation text.</p>
        </details>
      </section>

      <section id="feedback" className={styles.panel} aria-labelledby="feedback-title">
        <h2 id="feedback-title">Help shape the next visit</h2>
        <p>What was useful? Where did you get stuck? What would make you return? A short, specific account of what you tried helps us improve the experience.</p>
        <div className={styles.actions}><a className={styles.button} href={feedbackHref}>Write feedback to Chris</a></div>
        <p className={styles.muted}>This opens a draft in your email app for you to review and send. You can also write to <a href="mailto:chris@societyofexplorers.com">chris@societyofexplorers.com</a>.</p>
      </section>
    </main>
    <footer className={styles.footer}>
      <nav className={styles.nav} aria-label="Try SoE footer"><Link href="/" prefetch={false}>Home</Link><Link href="/circles/norms" prefetch={false}>Community norms</Link><Link href="/privacy" prefetch={false}>Privacy policy</Link></nav>
    </footer>
  </div>;
}
