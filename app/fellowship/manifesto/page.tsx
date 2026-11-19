import type { Metadata } from 'next';
import Link from 'next/link';
import { FELLOWSHIP_COVENANT } from '@/lib/fellowship/covenant';
import styles from '../fellowship.module.css';

export const metadata: Metadata = { title: 'Our Christian fellowship covenant', description: 'A Christian commitment to prayer, Scripture, honest inquiry, voluntary fellowship and love of neighbor.' };
export default function FellowshipManifestoPage() {
  return <article className={styles.covenant}>
    <header className={styles.intro}>
      <p className={styles.eyebrow}>Our fellowship covenant · draft for review</p>
      <h1>Conviction, humility and love of neighbor.</h1>
      <p className={styles.lead}>A Christian fellowship within a wider Society. These are the commitments we propose to practice together.</p>
    </header>
    {FELLOWSHIP_COVENANT.map((section, index) => <section key={section.title}>
      <p className={styles.eyebrow}>{String(index + 1).padStart(2, '0')}</p>
      <h2>{section.title}</h2><p>{section.text}</p>
    </section>)}
    <p className={styles.muted}>Prepared with AI assistance for human editorial review. This proposed fellowship covenant sits alongside the Society’s broader founding manifesto.</p>
    <div className={styles.actions}><Link className={styles.button} href="/fellowship/scripture">Begin with a passage</Link><Link href="/manifesto">Read the Society’s founding manifesto</Link></div>
  </article>;
}
