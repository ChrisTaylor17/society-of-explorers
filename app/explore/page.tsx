import type { Metadata } from 'next';
import Link from 'next/link';
import PublicFooter from '@/components/PublicFooter';
import CommunityDirectory from './CommunityDirectory';

export const metadata: Metadata = {
  title: 'Explore communities — reading, friendship & shared inquiry',
  description: 'Browse community records and explore Society of Explorers: Christian-rooted fellowship, reading, salon plans and ideas for building together.',
};

export default function ExplorePage() {
  return (
    <div className="soe-explore">
      <style>{`
  .soe-explore { background: #0a0a0a; color: #e8dcc8; min-height: 100vh; font-family: 'Cormorant Garamond', serif; }
  .soe-explore * { box-sizing: border-box; }
  .soe-explore a { color: #d6b860; text-underline-offset: .25em; }
  .soe-explore a:focus-visible, .soe-explore summary:focus-visible { outline: 3px solid #f1d788; outline-offset: 5px; }
  .soe-explore .skip { position: absolute; left: 1rem; top: -8rem; z-index: 300; padding: .8rem; background: #0a0a0a; }
  .soe-explore .skip:focus { top: 1rem; }
  .soe-explore .nav { padding: 1rem clamp(1rem, 4vw, 3rem); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem 2rem; border-bottom: 1px solid #c9a84c38; }
  .soe-explore .nav a { display: inline-flex; align-items: center; min-height: 44px; font-family: 'Cinzel', serif; font-size: .8rem; letter-spacing: .06em; text-decoration: none; }
  .soe-explore .nav a:hover { text-decoration: underline; }
  .soe-explore .nav-links { display: flex; flex-wrap: wrap; gap: .5rem 1.5rem; }
  .soe-explore .hero { padding: clamp(3rem, 8vw, 7rem) 1.25rem; text-align: center; background: radial-gradient(ellipse at center, #211a09 0%, #0a0a0a 72%); }
  .soe-explore .hero-inner { max-width: 780px; margin: 0 auto; }
  .soe-explore .eyebrow { font-family: 'Cinzel', serif; color: #d6b860; font-size: .8rem; letter-spacing: .15em; line-height: 1.8; margin: 0 0 1rem; }
  .soe-explore h1, .soe-explore h2, .soe-explore h3 { font-family: 'Cinzel', serif; font-weight: 400; color: #f5f0e8; text-wrap: balance; }
  .soe-explore h1 { font-size: clamp(2.3rem, 7vw, 4.7rem); line-height: 1.15; letter-spacing: .03em; margin: 0 0 1.5rem; }
  .soe-explore h2 { font-size: clamp(1.65rem, 4vw, 2.5rem); line-height: 1.35; margin: 0 0 1.5rem; }
  .soe-explore h3 { font-size: 1.15rem; line-height: 1.5; margin: 0 0 .75rem; }
  .soe-explore p, .soe-explore li { font-size: 1.2rem; line-height: 1.8; }
  .soe-explore p { margin: 0 0 1.25rem; }
  .soe-explore p:last-child { margin-bottom: 0; }
  .soe-explore .lede { font-size: 1.5rem; color: #e8dcc8; }
  .soe-explore .status { margin: 2rem auto 0; max-width: 680px; padding: 1.5rem; border: 1px solid #c9a84c70; background: #121109; text-align: left; }
  .soe-explore .status strong { color: #f1d788; }
  .soe-explore .section { max-width: 1060px; margin: 0 auto; padding: clamp(2.5rem, 6vw, 5rem) 1.25rem; }
  .soe-explore .narrow { max-width: 800px; }
  .soe-explore .band { background: #101010; border-block: 1px solid #c9a84c20; }
  .soe-explore .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 1rem; margin-top: 2rem; }
  .soe-explore .card { padding: 1.5rem; background: #141310; border: 1px solid #c9a84c38; min-width: 0; }
  .soe-explore .card p { color: #c9c0ac; }
  .soe-explore .steps { list-style: none; padding: 0; margin: 2rem 0 0; counter-reset: steps; }
  .soe-explore .steps li { counter-increment: steps; padding: 1.5rem 0; border-top: 1px solid #c9a84c38; }
  .soe-explore .steps h3::before { content: counter(steps, decimal-leading-zero) ' / '; color: #d6b860; }
  .soe-explore details { border-block-start: 1px solid #c9a84c55; padding: .25rem 0; }
  .soe-explore details:last-child { border-block-end: 1px solid #c9a84c55; }
  .soe-explore summary { cursor: pointer; padding: 1rem .25rem; min-height: 44px; font-family: 'Cinzel', serif; font-size: 1rem; color: #f5f0e8; line-height: 1.65; }
  .soe-explore details p { padding: 0 .25rem 1.25rem; }
  .soe-explore .actions { display: flex; flex-wrap: wrap; gap: 1rem; margin-top: 2rem; }
  .soe-explore .actions a { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: .85rem 1.25rem; border: 1px solid #c9a84c; font-family: 'Cinzel', serif; font-size: .85rem; line-height: 1.6; text-align: center; text-decoration: none; }
  .soe-explore .actions a:first-child { background: #c9a84c; color: #0a0a0a; }
  .soe-explore .actions a:hover { text-decoration: underline; }
  .soe-explore .closing { border-top: 1px solid #c9a84c38; }
  .soe-explore .accent { color: #d6b860; }
  @media (max-width: 420px) { .soe-explore .actions a { width: 100%; } .soe-explore .nav-links { gap: .35rem 1rem; } }

  .soe-explore section { scroll-margin-top: 1rem; }
  .soe-explore .section-nav { display: flex; flex-wrap: wrap; justify-content: center; gap: .5rem 1.5rem; margin-top: 1.5rem; }
  .soe-explore .section-nav a, .soe-explore .directory-cards a { display: inline-flex; align-items: center; min-height: 44px; line-height: 1.65; }
  .soe-explore .directory-status { margin-top: 1.5rem; padding: 1.5rem; border: 1px solid #c9a84c55; background: #141310; }
  .soe-explore button { min-height: 48px; margin-top: .5rem; padding: .65rem 1.25rem; border: 1px solid #c9a84c; background: #c9a84c; color: #0a0a0a; font-family: 'Cinzel', serif; font-size: .85rem; line-height: 1.65; cursor: pointer; }
  .soe-explore button[aria-disabled='true'] { background: #29261b; color: #c9c0ac; cursor: wait; }
  .soe-explore button:focus-visible { outline: 3px solid #f1d788; outline-offset: 5px; }
  .soe-explore .directory-cards { list-style: none; padding: 0; }
  .soe-explore .directory-cards h3, .soe-explore .record-description { overflow-wrap: anywhere; white-space: pre-line; }
  .soe-explore .directory-cards .eyebrow { font-size: .75rem; color: #d6b860; }
  .soe-explore .introduction { border-left: 3px solid #c9a84c; padding-left: 1.5rem; }
`}</style>
      <a className="skip" href="#explore-content">Skip to content</a>
      <nav className="nav" aria-label="Explore navigation">
        <Link href="/" prefetch={false}>Society of Explorers</Link>
        <div className="nav-links"><Link href="/great-books" prefetch={false}>Reading</Link><Link href="/fellowship" prefetch={false}>Christian fellowship</Link></div>
      </nav>
      <main id="explore-content" tabIndex={-1}>
        <header className="hero">
          <div className="hero-inner">
            <p className="eyebrow">Explorer Commons · Communities</p>
            <h1>Find a question.<br /><span className="accent">Build a connection.</span></h1>
            <p className="lede">Friendship, shared reading and ideas worth exploring together.</p>
            <nav className="section-nav" aria-label="Explore sections"><a href="#communities">Community directory</a><a href="#about-soe">About SoE</a><a href="#begin">Start with a reading</a></nav>
          </div>
        </header>

        <section id="communities" className="section" aria-labelledby="communities-heading">
          <p className="eyebrow">Browse records</p>
          <h2 id="communities-heading">Community directory</h2>
          <p>Explore names and descriptions returned by the directory. A listing does not confirm current activity or an available event.</p>
          <details><summary>What does a community listing tell me?</summary><p>These are community records and their supplied descriptions. A listing does not verify legal status, blockchain deployment, wallet readiness or rewards. Check a community’s current arrangements before relying on an offer. Loading this directory does not join a group or create a community.</p></details>
          <CommunityDirectory />
        </section>

        <div className="band">
          <section id="about-soe" className="section narrow" aria-labelledby="about-heading">
            <p className="eyebrow">An introduction · Independent of directory results</p>
            <div className="introduction">
              <h2 id="about-heading">Society of Explorers</h2>
              <p>A vision for friendship through Christian-rooted fellowship, Scripture, Great Books and honest discussion. Respectful disagreement is welcome; participation in prayer is optional.</p>
              <p>Small salons, shared activities and projects could bring people together online and eventually in physical and virtual spaces. The reading materials and salon plan offer a place to begin; a host, dates and participation arrangements still need to be confirmed.</p>
              <p>The wider incubator idea would help people explore and build ventures with AI tools and optional human collaborators. It remains a proposal, with ownership, responsibilities and costs to be agreed for each project. This page offers no automatic matching, launch service or earnings.</p>
            </div>
          </section>
        </div>

        <section id="begin" className="section" aria-labelledby="begin-heading">
          <p className="eyebrow">Materials to explore</p>
          <h2 id="begin-heading">Start with something worth sharing.</h2>
          <div className="grid">
            <article className="card"><h3>Read together</h3><p>Choose a passage from the Great Books. Consider its context and bring a question of your own.</p><Link href="/great-books" prefetch={false}>Explore the reading library</Link></article>
            <article className="card"><h3>Faith &amp; inquiry</h3><p>Explore Scripture, history and competing interpretations, with room for thoughtful disagreement.</p><Link href="/fellowship" prefetch={false}>Explore Christian fellowship</Link></article>
            <article className="card"><h3>A small salon</h3><p>Read the proposed four-week online format. The plan is not a reservation for a scheduled session.</p><Link href="/salons/pilot" prefetch={false}>Read the salon plan</Link></article>
          </div>
          <div className="actions"><Link href="/experience" prefetch={false}>Explore the wider experience</Link></div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
