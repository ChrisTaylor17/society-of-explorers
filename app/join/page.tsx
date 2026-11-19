import Link from 'next/link';
import CircleSafetyNav from '../circles/messages/CircleSafetyNav';
import SupporterBilling from '../billing/SupporterBilling';
import { FAQS, TIERS } from '@/lib/join/content';
import { body, button, card, h1, h2, lead, main, page, small } from '@/lib/circles/ui';
import styles from '../billing/supporter.module.css';

export default function JoinPage() {
  const free = TIERS[0];
  return <div style={page}>
    <CircleSafetyNav />
    <main id="main" className={styles.scope} style={{ ...main, paddingTop: '2.5rem' }}>
      <h1 style={h1}>A free community. Optional support.</h1>
      <p style={lead}>Read complete source editions and build real reading friendships. Books and volunteer reading Circles are free, whether or not you support Society of Explorers.</p>
      <p style={body}>Christian faith, conservative thought and the American tradition are part of our roots. Everyone is welcome to read, question and disagree respectfully.</p>
      <section aria-labelledby="free-community-heading" style={card}>
        <h2 id="free-community-heading" style={{ ...h2, marginTop: 0 }}>{free.name}</h2>
        <ul className={styles.list}>{free.features.map(feature => <li key={feature}>{feature}</li>)}</ul>
        <div className={styles.row}><Link href="/great-books" style={button}>Read the free library</Link><Link href="/circles" style={button}>Find a free Circle</Link><Link href="/login?mode=signup&next=%2Fcircles" style={button}>Create a free Circle account</Link></div>
      </section>
      <section id="supporter" aria-labelledby="supporter-heading" style={{ ...card, marginTop: '1.5rem' }}>
        <h2 id="supporter-heading" style={{ ...h2, marginTop: 0 }}>Optional supporter · $10 USD per month</h2>
        <p style={body}>Support contributes toward free books, Circles and community infrastructure. Everyone keeps the same free reading and Circle access. Support does not include a separate AI-service allowance.</p>
        <SupporterBilling mode="join" />
      </section>
      <section aria-labelledby="existing-heading">
        <h2 id="existing-heading" style={h2}>Already subscribed?</h2>
        <p style={body}>Existing subscriptions are separate from new supporter sales. Check your own billing status and management options even when new purchases are closed. Older memberships have not been renamed or migrated by this offer.</p>
        <Link href="/billing" style={button}>Manage an existing subscription</Link>
      </section>
      <section aria-labelledby="support-questions-heading">
        <h2 id="support-questions-heading" style={h2}>Questions about support</h2>
        <div className={styles.stack}>{FAQS.map(faq => <details key={faq.q} style={card}><summary style={{ ...body, minHeight: '44px', cursor: 'pointer', margin: 0 }}>{faq.q}</summary><p style={{ ...body, marginTop: '1rem' }}>{faq.a}</p></details>)}</div>
      </section>
      <p style={{ ...small, marginTop: '1.5rem' }}>Read the <Link href="/circles/norms">community norms</Link>. Hosts are volunteers; Society of Explorers does not run or supervise individual Circles.</p>
    </main>
  </div>;
}
