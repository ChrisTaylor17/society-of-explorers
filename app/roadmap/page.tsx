import type { Metadata } from 'next';
import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import styles from '@/components/ProjectDirection.module.css';

export const metadata: Metadata = {
  title: 'Roadmap — Society of Explorers',
  description: 'The first salon pilot, what is being tested, and the wider Society of Explorers vision.',
};

const building = [
  { name: 'Fellowship & shared reading', status: 'Tested locally', detail: 'Christian fellowship, Great Books, source readers and discussion paths are connected in the web project. The first real group still needs a host, dates and account checks.', href: '/fellowship', action: 'Explore fellowship' },
  { name: 'Clips & the Archivist', status: 'Drafts & prototypes', detail: 'Short commentary and source-linked clips can open a worthwhile question. Original drafts and documented reuse rights come before a reviewed final edit or public release.', href: '/clips', action: 'Explore the clip library' },
  { name: 'Historical AI guides', status: 'Prototype', detail: 'A guide can offer questions and interpretations alongside the sources. Historical personas are simulations; their answers need checking and cannot replace a human host.', href: '/council', action: 'Explore the Council' },
  { name: 'Phone & Quest experiences', status: 'Device testing ahead', detail: 'An Android test build and a Quest browser preview exist. An accepted iOS build, real phone and headset checks, and immersive group voice remain ahead.', href: '/quest', action: 'Explore the Quest preview' },
] as const;

export default function RoadmapPage() {
  return (
    <div className={styles.page}>
      <a className={styles.skip} href="#roadmap-main">Skip to the roadmap</a>
      <PublicNav checkSession={false} />
      <main className={styles.main} id="roadmap-main" tabIndex={-1}>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>The roadmap · reviewed November 8, 2026</p>
          <h1>One circle first.<br /><em>A wider world ahead.</em></h1>
          <p className={styles.lead}>Build a society people return to: for Christian-rooted fellowship, great reading, honest disagreement and things worth doing together.</p>
          <p className={styles.note}>This is a development plan. Local tests and previews are distinguished from a service ready for members.</p>
          <div className={styles.actions}>
            <Link className={styles.primary} href="/salons/pilot" prefetch={false}>Read the four-week salon plan <span aria-hidden="true">↗</span></Link>
            <Link className={styles.secondary} href="#stages" prefetch={false}>Follow the stages <span aria-hidden="true">↓</span></Link>
          </div>
        </header>

        <section className={styles.paper} aria-labelledby="first-title">
          <div><p className={styles.eyebrow}>First release in preparation</p><h2 id="first-title">Four weeks.<br />A familiar table.</h2></div>
          <div>
            <p>One proposed online salon of 6–8 adults, meeting for 60–75 minutes each week. Read a short passage, hear each other, and carry one question into the week.</p>
            <p>Christian faith is part of the invitation. Respectful disagreement is welcome; prayer is optional. A human host leads, with someone prepared to step in if needed.</p>
            <dl className={styles.facts}>
              <div><dt>Host &amp; dates</dt><dd>To be confirmed</dd></div>
              <div><dt>Before invitations</dt><dd>Recovery, privacy and real account checks</dd></div>
              <div><dt>What we want to learn</dt><dd>Who returns, why, and whether a host leads again</dd></div>
            </dl>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="building-title">
          <p className={styles.eyebrow}>The work already under way</p>
          <h2 id="building-title">Explore what is taking shape.</h2>
          <p className={styles.intro}>These are different stages of development. A local build or browser preview does not establish real account, hosted privacy or physical-device acceptance.</p>
          <div className={styles.cards}>
            {building.map(item => <article className={styles.card} key={item.name}>
              <p className={styles.badge}>{item.status}</p><h3>{item.name}</h3><p>{item.detail}</p>
              <Link className={styles.textLink} href={item.href} prefetch={false}>{item.action} <span aria-hidden="true">↗</span></Link>
            </article>)}
          </div>
        </section>

        <section id="stages" className={styles.section} aria-labelledby="stages-title">
          <p className={styles.eyebrow}>Grow through evidence</p><h2 id="stages-title">Each stage earns the next.</h2>
          <ol className={styles.stages}>
            <li><span aria-hidden="true">01</span><div><p className={styles.badge}>Preparing the pilot</p><h3>A dependable place to meet</h3><p>Prove that a backup can be restored, check access between accounts, and test real sign-in and recovery. Confirm the host, meeting time, conduct expectations and backup host before inviting the first circle.</p></div></li>
            <li><span aria-hidden="true">02</span><div><p className={styles.badge}>Proposed validation</p><h3>Make returning worthwhile</h3><p>Run the four-week cycle. Count actual attendance and week-two return; ask what helped and what did not. Record host preparation time. A small group can reveal friction, but cannot establish broad demand.</p><p>A paid second cycle would be a separate, clearly priced offer after the pilot. Actual paid sign-ups and attendance would test it.</p></div></li>
            <li><span aria-hidden="true">03</span><div><p className={styles.badge}>Develop &amp; test</p><h3>Bring the conversation with you</h3><p>Carry the same readings and relationships into Android, iOS and Quest. Test on real devices. Compare an immersive gathering with an ordinary online meeting, including comfort, access and whether people actually return.</p><p>Test one reviewed Reel, a Root Kernel study connection and an optional historical guide against the human-led salon experience.</p></div></li>
            <li><span aria-hidden="true">04</span><div><p className={styles.badge}>Longer-term options</p><h3>Let relationships become shared work</h3><p>Local friendship, activities, shared spaces and member ventures remain part of the ambition. A potential incubator, charitable arm, Consilience services and TribeKey each need their own ownership, costs, governance and validation.</p></div></li>
          </ol>
        </section>

        <aside className={styles.callout} aria-labelledby="direction-title">
          <p className={styles.eyebrow}>The larger idea stays in view</p><h2 id="direction-title">Start small without thinking small.</h2>
          <p>The pilot helps us choose what deserves to grow. It does not settle the future legal structure, promise a venue, or make tokens a condition of belonging.</p>
          <Link className={styles.secondary} href="/structure" prefetch={false}>Read the principles &amp; structure <span aria-hidden="true">↗</span></Link>
        </aside>
      </main>
      <PublicFooter />
    </div>
  );
}
