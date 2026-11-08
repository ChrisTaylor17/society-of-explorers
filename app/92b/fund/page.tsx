import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { CAPITAL_CAMPAIGN_GOAL_DOLLARS, CAPITAL_USE_OF_FUNDS } from '@/lib/capital/campaign';
import styles from '@/components/ProjectDirection.module.css';

export default function FundPage() {
  return <div className={styles.page}>
    <a className={styles.skip} href="#funding-main">Skip to the funding proposal</a>
    <PublicNav checkSession={false} />
    <main id="funding-main" className={styles.main} tabIndex={-1}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>Physical-space funding · proposal under review</p>
        <h1>A plan to examine.<br /><em>Pledges are not open.</em></h1>
        <p className={styles.lead}>A lasting community space needs more than a fundraising goal. It needs a clear purpose, a responsible operator and a plan people can trust.</p>
        <p className={styles.note}>The venue campaign is on hold. Verified campaign totals are not available here; this page does not confirm a payment or accept a pledge.</p>
        <div className={styles.actions}><Link className={styles.primary} href="/salons/pilot" prefetch={false}>Read the first salon plan <span aria-hidden="true">↗</span></Link><Link className={styles.secondary} href="/92b" prefetch={false}>Explore the space proposal <span aria-hidden="true">↗</span></Link></div>
      </header>
      <section className={styles.paper} aria-labelledby="budget-title">
        <div><p className={styles.eyebrow}>Earlier planning allocation</p><h2 id="budget-title">${CAPITAL_CAMPAIGN_GOAL_DOLLARS.toLocaleString('en-US')}<br />to reconsider.</h2><p>This is an earlier proposed budget, not money raised, current quotes or an approved commitment.</p></div>
        <div><dl className={styles.facts}>{CAPITAL_USE_OF_FUNDS.map(item => <div key={item.label}><dt>{item.label}</dt><dd>${item.amount.toLocaleString('en-US')}</dd></div>)}</dl></div>
      </section>
      <section className={styles.section} aria-labelledby="funding-review"><p className={styles.eyebrow}>Before a future offer</p><h2 id="funding-review">Make the obligations clear.</h2>
        <ol className={styles.stages}>
          <li><span aria-hidden="true">01</span><div><h3>Who receives and controls the money?</h3><p>Establish the operator, authority, accounts and relationship to any charitable or commercial entity. Tax-deductible giving is not promised by this proposal.</p></div></li>
          <li><span aria-hidden="true">02</span><div><h3>What can actually be delivered?</h3><p>Verify the premises, costs, access and required permissions. Define any benefits, delivery dates and capacity before offering them.</p></div></li>
          <li><span aria-hidden="true">03</span><div><h3>What happens if the plan changes?</h3><p>Set clear cancellation, refund and unused-funds terms. Review any token, membership or charitable elements separately and keep records that distinguish payments from expressions of interest.</p></div></li>
        </ol>
      </section>
      <aside className={styles.callout} aria-labelledby="funding-now"><p className={styles.eyebrow}>The community can begin before a building</p><h2 id="funding-now">Meet first. Learn what lasts.</h2><p>The proposed four-week online pilot can help us learn whether people return and whether hosts want to lead again. A property campaign is a separate decision.</p><Link className={styles.secondary} href="/structure" prefetch={false}>Read the organizational direction <span aria-hidden="true">↗</span></Link></aside>
    </main><PublicFooter />
  </div>;
}
