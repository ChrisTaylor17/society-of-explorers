import type { Metadata } from 'next';
import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { ONLINE_CIRCLES_HREF } from '@/lib/circles/discovery';
import styles from '@/components/ProjectDirection.module.css';

export const metadata: Metadata = {
  title: 'Ways to Gather — Society of Explorers',
  description: 'Explore the proposed online salon pilot, reading circles and future local gathering places.',
};

export default function SalonsPage() {
  return <div className={styles.page}>
    <a className={styles.skip} href="#salons-main">Skip to ways to gather</a>
    <PublicNav checkSession={false} />
    <main id="salons-main" className={styles.main} tabIndex={-1}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>Salons · online, local and eventually immersive</p>
        <h1>The same people.<br /><em>A conversation that continues.</em></h1>
        <p className={styles.lead}>A salon begins with a host, a shared question and room to listen. People can meet from anywhere before a local community has a place of its own.</p>
        <p className={styles.note}>Our proposed first pilot is four weekly online meetings for 6–8 adults. Host and dates are still to be confirmed. Christian fellowship is part of the invitation; prayer is optional and respectful disagreement is welcome.</p>
        <div className={styles.actions}><Link className={styles.primary} href="/salons/pilot" prefetch={false}>Read the four-week plan <span aria-hidden="true">↗</span></Link><Link className={styles.secondary} href={ONLINE_CIRCLES_HREF} prefetch={false}>Browse online circles <span aria-hidden="true">↗</span></Link></div>
      </header>
      <section className={styles.section} aria-labelledby="gather-paths"><p className={styles.eyebrow}>Find your way into the conversation</p><h2 id="gather-paths">Begin with a reading or a question.</h2>
        <div className={styles.cards}>
          <article className={styles.card}><p className={styles.badge}>Fellowship &amp; inquiry</p><h3>Scripture in context</h3><p>Study a passage, examine the sources and hear another interpretation with care.</p><Link className={styles.textLink} href="/fellowship" prefetch={false}>Enter Christian fellowship <span aria-hidden="true">↗</span></Link></article>
          <article className={styles.card}><p className={styles.badge}>Shared reading</p><h3>A book worth discussing</h3><p>Explore reading salons and the Great Books. An invitation should make the host, format and meeting time clear.</p><Link className={styles.textLink} href="/book-salons" prefetch={false}>Explore book salons <span aria-hidden="true">↗</span></Link></article>
          <article className={styles.card}><p className={styles.badge}>Browser preview</p><h3>A virtual room</h3><p>Quest is part of the longer-term gathering plan. Real-headset comfort, group voice and meeting reliability still need testing.</p><Link className={styles.textLink} href="/quest" prefetch={false}>Explore the Quest preview <span aria-hidden="true">↗</span></Link></article>
          <article className={styles.card}><p className={styles.badge}>Physical-space proposal</p><h3>From friendship to a place</h3><p>The earlier Boston concept remains under review. A lease, buildout and opening are not confirmed by this page.</p><Link className={styles.textLink} href="/92b" prefetch={false}>Explore the Boston proposal <span aria-hidden="true">↗</span></Link></article>
        </div>
      </section>
      <aside className={styles.callout} aria-labelledby="city-status"><p className={styles.eyebrow}>Local gathering plans</p><h2 id="city-status">City-interest registration is on hold.</h2><p>New city proposals and support registrations are not being accepted in this pilot. A supporter count alone would not establish a viable venue.</p><p>Local friendship, shared activities and physical spaces remain part of the society’s future. The first circle will help us learn what to develop next.</p><Link className={styles.secondary} href="/roadmap" prefetch={false}>See the wider roadmap <span aria-hidden="true">↗</span></Link></aside>
    </main><PublicFooter />
  </div>;
}
