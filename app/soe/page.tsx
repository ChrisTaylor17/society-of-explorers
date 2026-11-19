import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { ONLINE_CIRCLES_HREF } from '@/lib/circles/discovery';
import styles from './soe-overview.module.css';

const paths = [
  { number: '01', name: 'Christian fellowship', detail: 'Scripture, prayer and honest inquiry. Read in context and give a different interpretation a fair hearing.', href: '/fellowship', action: 'Enter fellowship' },
  { number: '02', name: 'The reading room', detail: 'Explore the Great Books and selected passages. Bring a question worth discussing, rather than a conclusion to defend.', href: '/great-books', action: 'Choose a reading' },
  { number: '03', name: 'A circle of people', detail: 'Browse online circles and reading salons. Each group needs a real host, a clear invitation and a confirmed meeting time.', href: ONLINE_CIRCLES_HREF, action: 'Browse online circles' },
  { number: '04', name: 'Something to talk about', detail: 'Explore clips as starting points for inquiry. Carry a worthwhile question from the screen into a conversation.', href: '/clips', action: 'Explore clips' },
] as const;

const later = [
  { name: 'Gather in more ways', detail: 'Browser gatherings first, with phone and Quest experiences developing alongside them. Immersive meetings and shared physical spaces remain part of the vision.' },
  { name: 'Research with care', detail: 'Historical AI guides and Root Kernel connections can deepen study. Root Kernel keeps its distinct principles; sources, interpretations and belief should remain distinguishable.' },
  { name: 'Build something together', detail: 'Member projects and an eventual incubator could grow from trusted relationships. Consilience’s proposed company-building and governance services are a separate part of that work.' },
  { name: 'Support a lasting community', detail: 'A charitable arm, commercial products and community spaces are being considered. Their governance, ownership and relationship require separate review.' },
] as const;

export default function SOEPage() {
  return (
    <div className={styles.page}>
      <a href="#soe-main" className={styles.skip}>Skip to the overview</a>
      <PublicNav checkSession={false} />
      <main id="soe-main" className={styles.main} tabIndex={-1}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Society of Explorers</p>
            <h1>Come for a question.<br /><em>Return for the people.</em></h1>
            <p className={styles.lead}>A place for shared reading, Christian-rooted fellowship and friendships that grow through honest conversation.</p>
            <p className={styles.welcome}>Respectful disagreement is welcome. Prayer is optional. You can listen, ask, read aloud or pass.</p>
            <div className={styles.actions}>
              <Link className={styles.primary} href="/salons/pilot" prefetch={false}>Read the first salon plan <span aria-hidden="true">↗</span></Link>
              <Link className={styles.secondary} href="#explore" prefetch={false}>Explore the society <span aria-hidden="true">↓</span></Link>
            </div>
          </div>
          <aside className={styles.pilot} aria-labelledby="pilot-title">
            <p className={styles.eyebrow}>First release in preparation</p>
            <div className={styles.four} aria-hidden="true">04</div>
            <h2 id="pilot-title">Four weeks.<br />One small circle.</h2>
            <p>A proposed online pilot for 6–8 adults, with a human host and a shared reading each week.</p>
            <dl>
              <div><dt>Meeting</dt><dd>60–75 minutes</dd></div>
              <div><dt>Format</dt><dd>Online, with optional prayer</dd></div>
              <div><dt>Host &amp; dates</dt><dd>To be confirmed</dd></div>
            </dl>
            <p className={styles.small}>This overview is an invitation to explore the plan. It does not book a session or enroll you in a paid program.</p>
          </aside>
        </header>

        <section id="explore" className={styles.section} aria-labelledby="explore-title">
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>One community, several ways in</p>
            <h2 id="explore-title">Begin with what draws you.</h2>
            <p>A text, a question or a shared interest can become the beginning of a real relationship.</p>
          </div>
          <div className={styles.paths}>
            {paths.map(path => (
              <article className={styles.path} key={path.number}>
                <span className={styles.number} aria-hidden="true">{path.number}</span>
                <h3>{path.name}</h3><p>{path.detail}</p>
                <Link href={path.href} prefetch={false}>{path.action} <span aria-hidden="true">↗</span></Link>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.table} aria-labelledby="gather-title">
          <div><p className={styles.eyebrow}>A conversation worth returning to</p>
            <h2 id="gather-title">Read. Meet. Reflect.<br /><em>Make room for each other.</em></h2></div>
          <div>
            <p>Start with one short reading. Meet the same people, hear more than one view, and leave with a question to carry into the week.</p>
            <p>The first pilot will help us learn whether people return and whether hosts want to lead another cycle. Views and sign-ups alone cannot answer that.</p>
            <div className={styles.actions}>
              <Link className={styles.secondary} href="/book-salons" prefetch={false}>Explore book salons</Link>
              <Link className={styles.secondary} href="/members" prefetch={false}>Find people</Link>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="future-title">
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>The longer view · plans under review</p>
            <h2 id="future-title">Let the society grow from real connection.</h2>
            <p>The wider ambition remains. These are directions to develop and validate, not services or legal arrangements announced by this page.</p>
          </div>
          <div className={styles.future}>{later.map(idea => <article key={idea.name}><h3>{idea.name}</h3><p>{idea.detail}</p></article>)}</div>
          <p className={styles.futureNote}>No token reward, investment offer, tax-deductible donation, physical venue or fixed live schedule is promised here.</p>
          <Link className={styles.secondary} href="/quest" prefetch={false}>Explore the Quest preview <span aria-hidden="true">↗</span></Link>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
