import type { Metadata } from 'next';
import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import styles from '@/components/ProjectDirection.module.css';

export const metadata: Metadata = {
  title: 'The Three Pillars',
  description: 'Community, venture building and charitable purpose: proposed roles for Society of Explorers and Consilience, with ownership and governance still under review.',
};

const roles = [
  {
    name: 'Society of Explorers',
    status: 'Community & product direction',
    purpose: 'The public-facing home for Christian-rooted fellowship, Scripture, Great Books, salons, friendship and shared projects. Respectful disagreement belongs here, and prayer is optional.',
    direction: 'People may eventually meet online, in an immersive room or in a shared physical place. Useful ideas can grow into member projects and products. Each experience needs real hosts, clear expectations and evidence that it works.',
  },
  {
    name: 'Consilience',
    status: 'Venture-builder model under review',
    purpose: 'A proposed way for a founder to use AI tools to research opportunities, test demand, build useful products and support customers, with people responsible for decisions and commitments.',
    direction: 'A holding company, business-building services and future DAO or decentralized-corporation services are options to investigate. Existing ownership, IP rights and agreements must be established before assigning assets or declaring a parent–subsidiary relationship.',
  },
  {
    name: 'Charitable work & shared spaces',
    status: 'Purpose and governance under review',
    purpose: 'Explore how education, access to fellowship and shared community places could serve a charitable purpose alongside commercial ventures. The existing nonprofit records need review before choosing a foundation, another structure or a partner.',
    direction: 'A charitable program would need its own beneficiaries, responsible governance, budget and asset records. Its resources must serve its charitable purpose; relationships with affiliated businesses need separate review.',
  },
] as const;

const questions = [
  {
    number: '01', title: 'Who operates and owns the work?',
    detail: 'Confirm the current agreements, ownership and IP rights for each project. Founder ownership is a goal for future ventures; it does not settle the rights in an existing entity or someone else’s work.',
  },
  {
    number: '02', title: 'What is each contribution for?',
    detail: 'Keep a product purchase, membership payment, charitable gift and investment distinct. Each needs a named recipient, a clear purpose and appropriate terms before it is offered.',
  },
  {
    number: '03', title: 'How would the parts work together?',
    detail: 'Any shared staff, services, licensing or property arrangement needs documented responsibilities and review of conflicts, costs and control. A charitable organization is not a founder-owned source of business capital.',
  },
] as const;

const papers = [
  { title: 'White paper', name: 'The Convergence Thesis', url: 'https://woqvlkeluxkxplpgzdgv.supabase.co/storage/v1/object/public/papers/white-paper.pdf' },
  { title: 'Business plan', name: 'Consilience Systems', url: 'https://woqvlkeluxkxplpgzdgv.supabase.co/storage/v1/object/public/papers/business-plan.pdf' },
  { title: 'Green paper', name: 'The Educational Framework', url: 'https://woqvlkeluxkxplpgzdgv.supabase.co/storage/v1/object/public/papers/green-paper.pdf' },
  { title: 'Black paper', name: 'The Technical Architecture', url: 'https://woqvlkeluxkxplpgzdgv.supabase.co/storage/v1/object/public/papers/black-paper.pdf' },
] as const;

export default function ThreePillars() {
  return (
    <div className={styles.page}>
      <a className={styles.skip} href="#pillars-main">Skip to the three pillars</a>
      <PublicNav checkSession={false} />
      <main className={styles.main} id="pillars-main" tabIndex={-1}>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>Community, ventures &amp; shared purpose</p>
          <h1>The three pillars.<br /><em>Different roles. A shared horizon.</em></h1>
          <p className={styles.lead}>Bring people together, help useful ideas become real, and make room for work that serves a wider community.</p>
          <p className={styles.note}>These are proposed roles, not an announcement of a completed legal structure. Current ownership, IP, operating authority and charitable status remain under review.</p>
          <div className={styles.actions}>
            <Link className={styles.primary} href="#roles" prefetch={false}>Explore the three roles <span aria-hidden="true">↓</span></Link>
            <Link className={styles.secondary} href="/structure" prefetch={false}>Read the guiding principles <span aria-hidden="true">↗</span></Link>
          </div>
        </header>

        <section className={styles.section} id="roles" aria-labelledby="roles-title">
          <p className={styles.eyebrow}>A direction to develop</p>
          <h2 id="roles-title">Community, enterprise and charitable purpose.</h2>
          <p className={styles.intro}>The ambition is broader than a single app. The next steps should establish which experiences people value and what responsibilities each organization can actually take on.</p>
          <div className={styles.cards}>
            {roles.map(role => <article className={styles.card} key={role.name}>
              <p className={styles.badge}>{role.status}</p><h3>{role.name}</h3>
              <p>{role.purpose}</p><p>{role.direction}</p>
            </article>)}
          </div>
        </section>

        <section className={styles.paper} aria-labelledby="inquiry-title">
          <div><p className={styles.eyebrow}>Connected work, distinct principles</p><h2 id="inquiry-title">A place for careful inquiry.</h2></div>
          <div>
            <p>Root Kernel remains a distinct Bible-study project with its own established principles. Its connection to SoE should keep source passages, interpretations and AI-assisted analysis inspectable and open to correction.</p>
            <p>Scripture, Great Books and historical questions can give people something worthwhile to discuss. Fellowship is a substantial part of the Society; venture building is another direction to explore.</p>
            <Link className={styles.paperLink} href="/fellowship" prefetch={false}>Enter Christian fellowship <span aria-hidden="true">↗</span></Link>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="responsibilities-title">
          <p className={styles.eyebrow}>Relationships to establish</p>
          <h2 id="responsibilities-title">Make the responsibilities clear.</h2>
          <div className={styles.principles}>
            {questions.map(question => <article key={question.number}>
              <span className={styles.number} aria-hidden="true">{question.number}</span>
              <div><h3>{question.title}</h3><p>{question.detail}</p></div>
            </article>)}
          </div>
          <p className={styles.note}>State nonprofit formation does not by itself establish federal tax exemption. This page does not promise tax-deductible donations. Current status and any proposed arrangement need qualified legal and tax review. <a className={styles.inlineLink} href="https://www.irs.gov/charities-non-profits/frequently-asked-questions-about-applying-for-tax-exemption">IRS guidance on exemption</a> · <a className={styles.inlineLink} href="https://www.irs.gov/charities-non-profits/charitable-organizations/inurement-private-benefit-charitable-organizations">IRS guidance on private benefit</a>.</p>
        </section>

        <section className={styles.section} aria-labelledby="papers-title">
          <p className={styles.eyebrow}>Historical proposals</p>
          <h2 id="papers-title">Earlier ideas, kept in view.</h2>
          <p className={styles.intro}>These existing document links preserve earlier proposals. Read them alongside the current direction above; they do not establish present ownership, tax status, investment terms or delivered products.</p>
          <div className={styles.cards}>
            {papers.map(paper => <article className={styles.card} key={paper.title}>
              <p className={styles.badge}>{paper.title} · historical proposal</p><h3>{paper.name}</h3>
              <a className={styles.textLink} href={paper.url} target="_blank" rel="noopener noreferrer">Open historical PDF <span aria-hidden="true">↗</span></a>
            </article>)}
          </div>
        </section>

        <aside className={styles.callout} aria-labelledby="begin-title">
          <p className={styles.eyebrow}>The next human step</p>
          <h2 id="begin-title">Start with something worth sharing.</h2>
          <p>Read a source, bring an honest question and return to a conversation. Useful products and lasting places should grow from needs we can understand and relationships people choose to keep.</p>
          <div className={styles.actions}>
            <Link className={styles.primary} href="/salons/pilot" prefetch={false}>Read the first salon plan <span aria-hidden="true">↗</span></Link>
            <Link className={styles.secondary} href="/roadmap" prefetch={false}>Explore the wider roadmap <span aria-hidden="true">↗</span></Link>
          </div>
        </aside>
      </main>
      <PublicFooter />
    </div>
  );
}
