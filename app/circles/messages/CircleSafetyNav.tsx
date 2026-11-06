import Link from 'next/link';
import styles from './safety.module.css';

/** Navigation is public and performs no member lookup or member creation. */
export default function CircleSafetyNav({ signInHref = '/login' }: { signInHref?: string }) {
  return <header className={styles.scope} style={{ borderBottom: '1px solid #695b36', padding: '1rem 1.25rem' }}>
    <nav aria-label="Circle safety navigation" className={styles.nav} style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <a href="#main">Skip to content</a>
      <Link href="/">Society of Explorers</Link><Link href="/circles">Circles</Link><Link href="/circles/mine">My Circles</Link><Link href="/circles/contributions">My posted messages</Link><Link href="/clips">Clips</Link><Link href="/quest">Quest Browser</Link><Link href="/circles/norms">Community norms</Link><Link href="/dashboard">Account</Link><Link href="/account/profile">Profile settings</Link><Link href={signInHref}>Sign in</Link>
    </nav>
  </header>;
}
