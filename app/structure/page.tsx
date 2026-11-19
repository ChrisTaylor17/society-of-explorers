import type { Metadata } from 'next';
import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import styles from '@/components/ProjectDirection.module.css';

export const metadata: Metadata = {
  title: 'Principles & Structure — Society of Explorers',
  description: 'Christian-rooted fellowship, member agency, and the developing relationship between Society of Explorers, Root Kernel and Consilience.',
};

const principles = [
  { number: '01', name: 'Seek truth in good company', detail: 'Begin with Scripture, great books and a willingness to listen. Christian belief, the words of a text and a researcher’s inference deserve clear distinctions. A source should be inspectable, an interpretation open to correction, and a disagreement welcome when offered with care.', present: 'The fellowship section brings this approach into shared reading. Prayer is optional; an AI guide is a fallible aid, never a final authority.', href: '/fellowship', action: 'Enter Christian fellowship' },
  { number: '02', name: 'Give members meaningful agency', detail: 'People should understand what is shared, who can see it, and when an outside AI service receives it. Private fellowship depends on understandable choices, responsible hosts and access controls that have actually been checked.', present: 'Local-first storage and portable identity are directions we are exploring. The whole service is not yet verified as device-only, end-to-end encrypted or member-owned on a blockchain.', href: '/privacy', action: 'Read the privacy notice' },
  { number: '03', name: 'Let connection become presence', detail: 'A small online salon can connect people before there is a local critical mass. A useful phone experience, an inviting virtual room and eventually a shared physical place should strengthen the same relationships.', present: 'The first pilot is online. Immersive Quest meetings and physical gathering places remain important plans; a preview does not establish a working group venue.', href: '/salons/pilot', action: 'Read the first salon plan' },
] as const;

const parts = [
  { name: 'Society of Explorers', status: 'Community & product direction', detail: 'The public-facing home for fellowship, reading, salons, events and member projects. It may also become an incubator for products that grow from the community.' },
  { name: 'Root Kernel', status: 'Distinct project · connection in development', detail: 'A source for Bible study and careful inquiry, retaining its own established principles. Connections should show passages in context, competing interpretations and the basis of AI-assisted analysis.' },
  { name: 'Consilience', status: 'Organizational option under review', detail: 'A possible holding company and provider of business-building, DAO and decentralized-corporation services. Current ownership, authority and relationships must be established from actual agreements.' },
  { name: 'A charitable arm & shared spaces', status: 'Model under review', detail: 'A potential way to support charitable programs and community places alongside commercial activity. Governance, asset ownership, conflicts of interest and any transactions with related businesses need separate review.' },
] as const;

export default function StructurePage() {
  return (
    <div className={styles.page}>
      <a className={styles.skip} href="#structure-main">Skip to the principles</a>
      <PublicNav checkSession={false} />
      <main className={styles.main} id="structure-main" tabIndex={-1}>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>Principles &amp; structure · a direction in development</p>
          <h1>Explorers build worlds.<br /><em>Begin with each other.</em></h1>
          <p className={styles.lead}>A question can lead from a text, to a conversation, to a friendship — and eventually to something people build together.</p>
          <p className={styles.note}>Society of Explorers is rooted in Christian fellowship and honest inquiry. Respectful disagreement belongs here. You can participate without joining in prayer.</p>
          <div className={styles.actions}>
            <Link className={styles.primary} href="#principles" prefetch={false}>Explore the principles <span aria-hidden="true">↓</span></Link>
            <Link className={styles.secondary} href="/roadmap" prefetch={false}>See the roadmap <span aria-hidden="true">↗</span></Link>
          </div>
        </header>

        <section id="principles" className={styles.section} aria-labelledby="principles-title">
          <p className={styles.eyebrow}>What should guide the work</p><h2 id="principles-title">Three commitments to build toward.</h2>
          <div className={styles.principles}>
            {principles.map(item => <article key={item.number}>
              <span className={styles.number} aria-hidden="true">{item.number}</span><div><h3>{item.name}</h3><p>{item.detail}</p><p className={styles.present}>{item.present}</p>
                <Link className={styles.textLink} href={item.href} prefetch={false}>{item.action} <span aria-hidden="true">↗</span></Link>
              </div>
            </article>)}
          </div>
        </section>

        <section id="relationships" className={styles.section} aria-labelledby="relationships-title">
          <p className={styles.eyebrow}>The parts and their possible relationships</p><h2 id="relationships-title">One vision, distinct responsibilities.</h2>
          <p className={styles.intro}>These describe product directions and possible roles. They do not announce a completed legal structure or establish ownership of an existing entity.</p>
          <div className={styles.cards}>
            {parts.map(part => <article className={styles.card} key={part.name}><p className={styles.badge}>{part.status}</p><h3>{part.name}</h3><p>{part.detail}</p></article>)}
          </div>
          <p className={styles.note}>A state nonprofit record, an old draft agreement or an EIN does not by itself establish current authority or federal tax exemption. Tax-deductible giving is not being promised here. <a className={styles.inlineLink} href="https://www.irs.gov/charities-non-profits/frequently-asked-questions-about-applying-for-tax-exemption">IRS guidance on exemption</a>.</p>
        </section>

        <section className={styles.paper} aria-labelledby="design-title">
          <div><p className={styles.eyebrow}>A design principle, not a delivery claim</p><h2 id="design-title">Keep people in control.</h2></div>
          <div><p>Local-first research explores how collaboration can coexist with offline use and lasting access to one’s work. Solid explores separating personal data from the applications using it. These are useful precedents to learn from.</p>
            <p>For SoE, those ideas need concrete choices about storage, consent, export, recovery and cost. A token or device is not a substitute for making those choices work.</p>
            <div className={styles.actions}><a className={styles.paperLink} href="https://www.inkandswitch.com/essay/local-first/">Read the local-first research <span aria-hidden="true">↗</span></a><a className={styles.paperLink} href="https://solidproject.org/about">Explore Solid’s approach <span aria-hidden="true">↗</span></a></div>
          </div>
        </section>

        <aside className={styles.callout} aria-labelledby="open-title">
          <p className={styles.eyebrow}>Questions still to settle</p><h2 id="open-title">Make responsibilities as clear as the invitation.</h2>
          <p>Who operates the service and owns its work? Who governs a charitable program? Who owns or leases a shared space? How are related businesses kept accountable?</p>
          <p>Crypto assets, custody, investment activity and liabilities need their own review. TribeKey and on-chain identity remain research directions, with no token reward or financial return promised by this page.</p>
          <Link className={styles.secondary} href="/soe" prefetch={false}>Return to the society overview <span aria-hidden="true">↗</span></Link>
        </aside>
      </main>
      <PublicFooter />
    </div>
  );
}
