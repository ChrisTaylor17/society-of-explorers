import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import styles from '@/components/ProjectDirection.module.css';

export default function NinetyTwoBPage() {
  return <div className={styles.page}>
    <a className={styles.skip} href="#space-main">Skip to the space proposal</a>
    <PublicNav checkSession={false} />
    <main id="space-main" className={styles.main} tabIndex={-1}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>Boston · a physical-space proposal</p>
        <h1>A room for inquiry.<br /><em>A place for each other.</em></h1>
        <p className={styles.lead}>Imagine a familiar table for Scripture, Great Books, music and honest conversation — a place where an online friendship can become a local one.</p>
        <p className={styles.note}>92B South Street is a location from Society of Explorers’ earlier plans. Its current availability, lease authority, repair needs and suitability have not been verified. No opening date is confirmed.</p>
        <div className={styles.actions}>
          <Link className={styles.primary} href="/salons/pilot" prefetch={false}>Start with the online salon plan <span aria-hidden="true">↗</span></Link>
          <Link className={styles.secondary} href="/92b/fund" prefetch={false}>Review the funding proposal <span aria-hidden="true">↗</span></Link>
        </div>
      </header>
      <section className={styles.paper} aria-labelledby="space-status">
        <div><p className={styles.eyebrow}>Planning status</p><h2 id="space-status">A possible space.<br />A campaign on hold.</h2></div>
        <div><p>Fundraising and city-interest submissions are not open in this pilot. The first step is a small online salon with a real host and a confirmed time.</p><p>A physical home remains part of the vision. A venue decision needs demonstrated use, a responsible operator, realistic costs and the necessary permissions.</p></div>
      </section>
      <section className={styles.section} aria-labelledby="space-ideas">
        <p className={styles.eyebrow}>What a future room could make possible</p><h2 id="space-ideas">Make room for shared life.</h2>
        <div className={styles.cards}>
          <article className={styles.card}><p className={styles.badge}>Fellowship</p><h3>Read and pray together</h3><p>Christian-rooted gatherings with Scripture, optional prayer and room for respectful disagreement.</p></article>
          <article className={styles.card}><p className={styles.badge}>Inquiry</p><h3>A living reading room</h3><p>Great Books, small seminars and historical questions that continue around the table.</p></article>
          <article className={styles.card}><p className={styles.badge}>Culture</p><h3>Listen, make and share</h3><p>Music, creative work and local activities shaped by the people who return.</p></article>
          <article className={styles.card}><p className={styles.badge}>Careful experimentation</p><h3>Tools in service of people</h3><p>Optional AI guides or a shared virtual room, with clear data choices and human hosts.</p></article>
        </div>
      </section>
      <aside className={styles.callout} aria-labelledby="space-next"><p className={styles.eyebrow}>A staged path</p><h2 id="space-next">Let the gathering justify the room.</h2><p>Begin online, learn what members and hosts need, and compare occasional room hire with a permanent space. Any charitable or commercial operation needs its own governance and financial plan.</p><Link className={styles.secondary} href="/salons" prefetch={false}>Explore ways to gather <span aria-hidden="true">↗</span></Link></aside>
    </main><PublicFooter />
  </div>;
}
