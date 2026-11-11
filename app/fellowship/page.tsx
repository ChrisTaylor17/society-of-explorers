import type { Metadata } from 'next';
import Link from 'next/link';
import { ONLINE_CIRCLES_HREF } from '@/lib/circles/discovery';
import { FELLOWSHIP_TOPICS, fellowshipDiscoveryHref } from '@/lib/fellowship/topics';
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
        <Link className={styles.button} href="#root-kernel">Explore Root Kernel · optional study</Link>
        <Link className={styles.button} href="/fellowship/manifesto">Read our fellowship covenant</Link>
        <Link className={styles.button} href="#gather-around-a-question">Find your next conversation</Link>
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
    <section className={styles.section} aria-labelledby="gather-around-a-question">
      <p className={styles.eyebrow}>One reading · real company</p>
      <h2 id="gather-around-a-question">Bring a question to the table.</h2>
      <p>Choose a starting point, explore current online Circles, and check the host’s purpose and meeting dates. This choice carries a suggested question; it does not label a Circle as a Christian study or book a place. Join a suitable Circle and RSVP to a real meeting when you are ready.</p>
      <div className={styles.grid}>{FELLOWSHIP_TOPICS.map(topic => <article className={styles.card} key={topic.id}>
        <h3>{topic.title}</h3><p>{topic.question}</p>
        <p className={styles.muted}>{topic.brief}</p>
        <div className={styles.actions}><Link className={styles.button} href={fellowshipDiscoveryHref(topic.id)}>Find a Circle with this question</Link><Link href={topic.href}>Read the sources first</Link></div>
      </article>)}</div>
      <article className={styles.panel}><h3>A place in the room, including Quest</h3>
        <p>Within a Circle, continue in its private discussion or open Quest Browser. The immersive room can hold your study question beside recent contributions, with an editable draft and a review before posting. Where shared salon check-in is enabled, see the current member count and return to the host’s meeting in the browser.</p>
        <p>The host’s live meeting provides the conversation. A spatial voice or avatar service is not yet established. Prayer is optional; listening and respectful disagreement belong at the table.</p>
        <Link className={styles.button} href="/quest">Explore Fellowship on Quest</Link>
      </article>
    </section>
    <section className={styles.section} aria-labelledby="root-kernel">
      <p className={styles.eyebrow}>Optional deeper study · free to read</p>
      <h2 id="root-kernel" tabIndex={-1}>Explore Root Kernel.</h2>
      <p>Root Kernel is an independent, Jesus-rooted study project. These existing studies are offered within SoE with their own attribution and editorial identity. You can read them freely without an account. Participation and agreement are optional; the wider Society welcomes respectful disagreement.</p>
      <p>Begin with the text in context, compare named interpretations, inspect the sources and challenge the reasoning. An accessible source is not proof of the event it describes. Faith, historical evidence and speculation remain distinct.</p>
      <details>
        <summary>Our starting point and how we inquire</summary>
        <p>Root Kernel’s founder describes his faith as Christadelphian. Its Biblical Unitarian reading understands the Father alone as God and Jesus as God’s human Messiah and Son. This is a named faith interpretation, not a belief test for SoE or a claim to speak for every Christadelphian.</p>
        <p>The existing studies preserve the publisher’s Scripture and notes, compare a charitable Nicene Christian reading with Root Kernel’s perspective, and consider relevant Jewish and historical interpretations under their own names. Nicene Christians also distinguish Father and Son as persons; their understanding of divine nature differs.</p>
        <p>Our aim is transparent, rigorous inquiry that can be challenged and corrected, rather than a claim of absolute neutrality or scientific proof of theology. Later or noncanonical writings, other traditions and speculative extraterrestrial explanations may be examined. Including an idea does not give it equal evidence or establish an ancient event.</p>
      </details>
      <div className={styles.grid}>
        <article className={styles.panel}><h3>Psalm 22 and Isaiah 53</h3><p>Compare the passages with the crucifixion accounts, inspect competing readings and prepare a local analysis correction.</p><Link href="/fellowship/scripture">Compare the existing Scripture passages</Link></article>
        <article className={styles.panel}><h3>Philemon</h3><p>Read the complete letter, compare readings of its greeting and ask what it means to receive a beloved brother.</p><Link href="/great-books/scripture/philemon">Open the existing Philemon study</Link></article>
        <article className={styles.panel}><h3>The Good Samaritan</h3><p>Read Luke 10:25–37, consider neighbor love and prepare a practical 45-minute conversation.</p><Link href="/great-books/scripture/luke-good-samaritan">Open the existing Good Samaritan study</Link></article>
      </div>
      <p className={styles.muted}>This is a connection to the existing studies, not a merger or the full Root Kernel commentary collection. The separate Jesus reader remains a design preview; its unverified candidate claims are not added to these studies.</p>
    </section>
    <section className={styles.panel} aria-labelledby="gather">
      <h2 id="gather">A simple way to gather</h2>
      <p>Begin with a welcome and a brief optional prayer. Read a passage aloud in context. Let each person describe a reading fairly before challenging it. End with one thing learned, one open question and a concrete way to care for a neighbor.</p>
      <p>Ask before recording or sharing another person’s words. A person can listen, pass or disagree. The current four-week salon is a plan; its host and dates are not yet confirmed.</p>
      <div className={styles.actions}><Link className={styles.button} href={ONLINE_CIRCLES_HREF}>Explore online Circles</Link><Link href="/fellowship/manifesto">What we commit to each other</Link></div>
    </section>
  </>;
}
