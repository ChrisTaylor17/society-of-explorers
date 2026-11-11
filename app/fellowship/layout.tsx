import Link from 'next/link';
import styles from './fellowship.module.css';

export default function FellowshipLayout({ children }: { children: React.ReactNode }) {
  return <div className={styles.page}>
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link className={styles.brand} href="/">Society of Explorers</Link>
        <nav className={styles.nav} aria-label="Christian fellowship navigation">
          <Link href="/fellowship">Fellowship</Link>
          <Link href="/fellowship#root-kernel">Root Kernel · optional study</Link>
          <Link href="/fellowship/manifesto">Our covenant</Link>
          <Link href="/fellowship/scripture">Scripture in conversation</Link>
          <Link href="/fellowship/research/ancient-jesus-passage">Ancient-text dossier</Link>
          <Link href="/great-books">Free library</Link>
          <a href="#main">Skip to content</a>
        </nav>
      </div>
    </header>
    <main className={styles.main} id="main" tabIndex={-1}>{children}</main>
    <footer className={styles.footer}>
      <p>Christian fellowship within the wider Society of Explorers. Bring conviction, questions and care for your neighbor.</p>
      <nav className={styles.nav} aria-label="Fellowship footer">
        <Link href="/manifesto">The Society’s founding manifesto</Link>
        <Link href="/circles/norms">Community norms</Link>
        <Link href="/salons/pilot">Four-week salon plan</Link>
        <Link href="/privacy">Privacy</Link>
      </nav>
    </footer>
  </div>;
}
