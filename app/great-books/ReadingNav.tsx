import Link from 'next/link';
import styles from './reading.module.css';

/** Public reading navigation deliberately does not resolve or create a member. */
export default function ReadingNav() {
  return <header style={{ borderBottom: '1px solid #695b36', padding: '1rem 1.25rem' }}>
    <nav aria-label="Reading navigation" className={styles.nav} style={{ maxWidth: '1150px', margin: '0 auto', columnGap: '1.25rem' }}>
      <Link href="/">Society of Explorers</Link><Link href="/great-books">Free library</Link><Link href="/salons/pilot" prefetch={false}>Four-week salon plan</Link><Link href="/circles">Reading Circles</Link><Link href="/login">Sign in</Link><a href="#main">Skip to reading content</a>
    </nav>
  </header>;
}
export function ReadingFooter() {
  return <footer style={{ borderTop: '1px solid #695b36', padding: '1.5rem 1.25rem', maxWidth: '1150px', margin: '0 auto' }}>
    <p className={styles.help}>Complete source texts and reading Circles are free. Optional supporter membership helps maintain the community and does not change your reading or Circle access.</p>
    <nav className={styles.nav} aria-label="Reading footer"><Link href="/circles/norms">Community norms</Link><Link href="/circles">Find a Circle</Link><Link href="/join">Support the free community</Link><Link href="/billing">Billing and subscriptions</Link></nav>
  </footer>;
}
