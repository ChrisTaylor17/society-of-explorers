import type { Metadata } from 'next';
import Link from 'next/link';
import { ONLINE_CIRCLES_HREF } from '@/lib/circles/discovery';
import styles from './fellowship.module.css';

export const metadata: Metadata = {
  title: 'Christian fellowship and honest inquiry',
  description: 'Scripture, prayer, friendship and careful research within Society of Explorers. Respectful disagreement is welcome.',
};

export default function FellowshipPage() {
  return <>
    <header className={styles.intro}>
      <svg className={styles.seal} viewBox="0 0 64 44" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4 6C24 6 40 38 60 38M4 38C24 38 40 6 60 6M46 8v29M40 14h12" />
      </svg>
      <p className={styles.eyebrow}>Christian fellowship · within Society of Explorers</p>
      <h1>Faith that makes room for honest questions.</h1>
      <p className={styles.lead}>Read Scripture. Pray freely. Seek truth together. A home for Christians to grow in fellowship and for respectful neighbors to enter the conversation.</p>
      <p>We take Jesus Christ seriously, and we take the work of understanding seriously. Belief, doubt and disagreement can be spoken without turning a person into an opponent.</p>
      <div className={styles.actions}>
        <Link className={styles.button} href="/fellowship/scripture">Open the Scripture study</Link>
        <Link className={styles.button} href="/fellowship/manifesto">Read our fellowship covenant</Link>
      </div>
    </header>
    <div className={styles.grid}>
      <article className={styles.card}>
        <p className={styles.eyebrow}>Read in context</p>
        <h2>Scripture in conversation</h2>
        <p>Psalm 22 and Isaiah 53 beside the passion accounts. Inspect quotations, allusions, textual differences and competing interpretations.</p>
        <Link href="/fellowship/scripture">Compare the passages →</Link>
      </article>
      <article className={styles.card}>
        <p className={styles.eyebrow}>Examine the evidence</p>
        <h2>An ancient passage about Jesus</h2>
        <p>What a verified 2026 preprint actually argues about Josephus, how the text was transmitted, and why scholars disagree.</p>
        <Link href="/fellowship/research/ancient-jesus-passage">Open the research dossier →</Link>
      </article>
      <article className={styles.card}>
        <p className={styles.eyebrow}>Return to the table</p>
        <h2>From reading to fellowship</h2>
        <p>A small weekly salon: a shared reading, optional prayer, room to pass and one question worth returning to.</p>
        <Link href="/salons/pilot">Explore the four-week plan →</Link>
      </article>
    </div>
    <section className={styles.section} aria-labelledby="root-kernel">
      <p className={styles.eyebrow}>Root Kernel · a reading companion</p>
      <h2 id="root-kernel">Keep the text and the interpretation distinct.</h2>
      <p>The existing Root Kernel studies preserve the publisher’s Scripture and notes while comparing named readings. Its comparative approach gives a charitable Nicene Christian reading before its Biblical Unitarian perspective. Textual questions and historical confidence have their own place.</p>
      <p>That editorial perspective is visible here. It is an invitation to examine reasons, not an allegedly unbiased AI verdict. Jewish and other relevant interpretations are represented under their own names.</p>
      <div className={styles.twoColumns}>
        <article className={styles.panel}><h3>Philemon</h3><p>Read the complete letter, compare readings of its greeting and ask what it means to receive a beloved brother.</p><Link href="/great-books/scripture/philemon">Open the existing Philemon study</Link></article>
        <article className={styles.panel}><h3>The Good Samaritan</h3><p>Read Luke 10:25–37, consider neighbor love and prepare a practical 45-minute conversation.</p><Link href="/great-books/scripture/luke-good-samaritan">Open the existing Good Samaritan study</Link></article>
      </div>
      <p className={styles.muted}>These are the Root Kernel studies currently available in SoE. This section does not claim that a separate app or the full original commentary collection has been integrated.</p>
    </section>
    <section className={styles.panel} aria-labelledby="gather">
      <h2 id="gather">A simple way to gather</h2>
      <p>Begin with a welcome and a brief optional prayer. Read a passage aloud in context. Let each person describe a reading fairly before challenging it. End with one thing learned, one open question and a concrete way to care for a neighbor.</p>
      <p>Ask before recording or sharing another person’s words. A person can listen, pass or disagree. The current four-week salon is a plan; its host and dates are not yet confirmed.</p>
      <div className={styles.actions}><Link className={styles.button} href={ONLINE_CIRCLES_HREF}>Explore online Circles</Link><Link href="/fellowship/manifesto">What we commit to each other</Link></div>
    </section>
  </>;
}
