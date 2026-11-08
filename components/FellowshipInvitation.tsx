import Link from 'next/link';
import styles from '@/app/fellowship/fellowship.module.css';

export default function FellowshipInvitation() {
  return <section style={{ padding: '1rem 1.25rem 4rem' }} aria-labelledby="christian-fellowship">
    <div className={styles.invitation}>
      <span className={styles.eyebrow}>A place within the Society</span>
      <h2 id="christian-fellowship">Christian fellowship &amp; honest inquiry</h2>
      <p>Scripture, prayer and careful research. Explore Root Kernel studies, examine an ancient text about Jesus, and compare interpretations with room for respectful disagreement.</p>
      <nav className={styles.actions} aria-label="Christian fellowship">
        <Link href="/fellowship">Enter the fellowship →</Link>
        <Link href="/fellowship/scripture">Compare Scripture</Link>
        <Link href="/fellowship/manifesto">Read our covenant</Link>
      </nav>
    </div>
  </section>;
}
