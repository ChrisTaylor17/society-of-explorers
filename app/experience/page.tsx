import type { Metadata } from 'next';
import Link from 'next/link';
import PublicFooter from '@/components/PublicFooter';

export const metadata: Metadata = {
  title: 'Shared experiences — reading, fellowship & future ideas',
  description: 'Explore readings and a proposed salon format, alongside ideas for music, travel, virtual spaces and thoughtful use of technology. Events and integrations remain subject to review.',
};

const THINKERS = [
  { name: 'Socrates', question: 'What do we mean by the words we use?' },
  { name: 'Plato', question: 'What ideal are we trying to live up to?' },
  { name: 'Nietzsche', question: 'Which assumptions deserve a harder look?' },
  { name: 'Marcus Aurelius', question: 'What is within our responsibility?' },
  { name: 'Einstein', question: 'What might a thought experiment reveal?' },
  { name: 'Steve Jobs', question: 'What would make this simpler and more useful?' },
];

function ConceptPlaceholder({ symbol, label }: { symbol: string; label: string }) {
  return <figure className="concept"><span className="concept-symbol" aria-hidden="true">{symbol}</span><figcaption>Concept placeholder · {label}<br />An idea for exploration, not an event photograph or working integration.</figcaption></figure>;
}

export default function ExperiencePage() {
  return (
    <div className="soe-experience">
      <style>{`
  .soe-experience { background: #0a0a0a; color: #e8dcc8; min-height: 100vh; font-family: 'Cormorant Garamond', serif; }
  .soe-experience * { box-sizing: border-box; }
  .soe-experience a { color: #d6b860; text-underline-offset: .25em; }
  .soe-experience a:focus-visible, .soe-experience summary:focus-visible { outline: 3px solid #f1d788; outline-offset: 5px; }
  .soe-experience .skip { position: absolute; left: 1rem; top: -8rem; z-index: 300; padding: .8rem; background: #0a0a0a; }
  .soe-experience .skip:focus { top: 1rem; }
  .soe-experience .nav { padding: 1rem clamp(1rem, 4vw, 3rem); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem 2rem; border-bottom: 1px solid #c9a84c38; }
  .soe-experience .nav a { display: inline-flex; align-items: center; min-height: 44px; font-family: 'Cinzel', serif; font-size: .8rem; letter-spacing: .06em; text-decoration: none; }
  .soe-experience .nav a:hover { text-decoration: underline; }
  .soe-experience .nav-links { display: flex; flex-wrap: wrap; gap: .5rem 1.5rem; }
  .soe-experience .hero { padding: clamp(3rem, 8vw, 7rem) 1.25rem; text-align: center; background: radial-gradient(ellipse at center, #211a09 0%, #0a0a0a 72%); }
  .soe-experience .hero-inner { max-width: 780px; margin: 0 auto; }
  .soe-experience .eyebrow { font-family: 'Cinzel', serif; color: #d6b860; font-size: .8rem; letter-spacing: .15em; line-height: 1.8; margin: 0 0 1rem; }
  .soe-experience h1, .soe-experience h2, .soe-experience h3 { font-family: 'Cinzel', serif; font-weight: 400; color: #f5f0e8; text-wrap: balance; }
  .soe-experience h1 { font-size: clamp(2.3rem, 7vw, 4.7rem); line-height: 1.15; letter-spacing: .03em; margin: 0 0 1.5rem; }
  .soe-experience h2 { font-size: clamp(1.65rem, 4vw, 2.5rem); line-height: 1.35; margin: 0 0 1.5rem; }
  .soe-experience h3 { font-size: 1.15rem; line-height: 1.5; margin: 0 0 .75rem; }
  .soe-experience p, .soe-experience li { font-size: 1.2rem; line-height: 1.8; }
  .soe-experience p { margin: 0 0 1.25rem; }
  .soe-experience p:last-child { margin-bottom: 0; }
  .soe-experience .lede { font-size: 1.5rem; color: #e8dcc8; }
  .soe-experience .status { margin: 2rem auto 0; max-width: 680px; padding: 1.5rem; border: 1px solid #c9a84c70; background: #121109; text-align: left; }
  .soe-experience .status strong { color: #f1d788; }
  .soe-experience .section { max-width: 1060px; margin: 0 auto; padding: clamp(2.5rem, 6vw, 5rem) 1.25rem; }
  .soe-experience .narrow { max-width: 800px; }
  .soe-experience .band { background: #101010; border-block: 1px solid #c9a84c20; }
  .soe-experience .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 1rem; margin-top: 2rem; }
  .soe-experience .card { padding: 1.5rem; background: #141310; border: 1px solid #c9a84c38; min-width: 0; }
  .soe-experience .card p { color: #c9c0ac; }
  .soe-experience .steps { list-style: none; padding: 0; margin: 2rem 0 0; counter-reset: steps; }
  .soe-experience .steps li { counter-increment: steps; padding: 1.5rem 0; border-top: 1px solid #c9a84c38; }
  .soe-experience .steps h3::before { content: counter(steps, decimal-leading-zero) ' / '; color: #d6b860; }
  .soe-experience details { border-block-start: 1px solid #c9a84c55; padding: .25rem 0; }
  .soe-experience details:last-child { border-block-end: 1px solid #c9a84c55; }
  .soe-experience summary { cursor: pointer; padding: 1rem .25rem; min-height: 44px; font-family: 'Cinzel', serif; font-size: 1rem; color: #f5f0e8; line-height: 1.65; }
  .soe-experience details p { padding: 0 .25rem 1.25rem; }
  .soe-experience .actions { display: flex; flex-wrap: wrap; gap: 1rem; margin-top: 2rem; }
  .soe-experience .actions a { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: .85rem 1.25rem; border: 1px solid #c9a84c; font-family: 'Cinzel', serif; font-size: .85rem; line-height: 1.6; text-align: center; text-decoration: none; }
  .soe-experience .actions a:first-child { background: #c9a84c; color: #0a0a0a; }
  .soe-experience .actions a:hover { text-decoration: underline; }
  .soe-experience .closing { border-top: 1px solid #c9a84c38; }
  .soe-experience .accent { color: #d6b860; }
  @media (max-width: 420px) { .soe-experience .actions a { width: 100%; } .soe-experience .nav-links { gap: .35rem 1rem; } }

  .soe-experience .section-nav { display: flex; flex-wrap: wrap; justify-content: center; gap: .5rem 1.5rem; margin-top: 2rem; }
  .soe-experience .section-nav a { display: inline-flex; align-items: center; min-height: 44px; font-size: 1.05rem; }
  .soe-experience .split { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 2rem; align-items: center; }
  .soe-experience .concept { margin: 0; padding: 2rem 1.5rem; min-height: 220px; display: flex; flex-direction: column; justify-content: center; text-align: center; border: 1px solid #c9a84c55; background: radial-gradient(ellipse at center, #211a09, #101010); }
  .soe-experience .concept-symbol { display: block; font-family: 'Cinzel', serif; font-size: 3rem; color: #d6b860; margin-bottom: 1rem; }
  .soe-experience figcaption { color: #c9c0ac; font-size: 1rem; line-height: 1.7; }
  .soe-experience section { scroll-margin-top: 1rem; }
`}</style>
      <a className="skip" href="#experience-content">Skip to content</a>
      <nav className="nav" aria-label="Experience navigation">
        <Link href="/" prefetch={false}>Society of Explorers</Link>
        <div className="nav-links"><Link href="/great-books" prefetch={false}>Reading</Link><Link href="/fellowship" prefetch={false}>Christian fellowship</Link></div>
      </nav>
      <main id="experience-content" tabIndex={-1}>
        <header className="hero">
          <div className="hero-inner">
            <p className="eyebrow">Explorer Commons · Shared experience</p>
            <h1>Ideas are better<br /><span className="accent">with people.</span></h1>
            <p className="lede">Read, question, make music and imagine new places to meet. Friendship is the reason to begin.</p>
            <div className="status">
              <p><strong>Start with the reading. Explore what could come next.</strong></p>
              <p>Reading materials and a proposed salon format are here to explore. Events, trips and equipment-based experiences below remain proposals. No gathering, treatment, reward or partner service is booked or provided through this page.</p>
            </div>
            <nav className="section-nav" aria-label="Experience sections"><a href="#begin">Begin here</a><a href="#guides">AI guides</a><a href="#world">Shared spaces</a><a href="#reflection">Reflection</a><a href="#music">Music</a><a href="#travel">Travel</a></nav>
          </div>
        </header>

        <section id="begin" className="section" aria-labelledby="begin-heading">
          <p className="eyebrow">Materials to explore</p>
          <h2 id="begin-heading">A reading. A question. A conversation.</h2>
          <div className="grid">
            <article className="card"><h3>Scripture &amp; Great Books</h3><p>Find a text, consider its context and bring a question. Shared inquiry can begin with a single passage.</p><Link href="/great-books" prefetch={false}>Explore the reading library</Link></article>
            <article className="card"><h3>Christian fellowship</h3><p>Explore faith, history and honest disagreement. The invitation is rooted in Christianity; respectful disagreement is welcome and participation in prayer is optional.</p><Link href="/fellowship" prefetch={false}>Explore fellowship and inquiry</Link></article>
            <article className="card"><h3>A four-week salon plan</h3><p>Read the proposed format for a small online group. A host and dates still need to be confirmed; the plan is not a session reservation.</p><Link href="/salons/pilot" prefetch={false}>Read the salon plan</Link></article>
          </div>
        </section>

        <div className="band">
          <section id="guides" className="section" aria-labelledby="guides-heading">
            <p className="eyebrow">AI guide concepts</p>
            <h2 id="guides-heading">Different ways to ask a better question.</h2>
            <p>The thinker-persona work explores perspectives inspired by historical figures. These are AI interpretations, not the people themselves. The prompts below are original invitations to inquiry, not quotations.</p>
            <div className="grid">{THINKERS.map(thinker => <article key={thinker.name} className="card"><h3>{thinker.name}</h3><p>{thinker.question}</p></article>)}</div>
            <p style={{ marginTop: '2rem' }}>A useful guide should show sources, acknowledge uncertainty and make room for correction. Voice, saved memory and automated actions need their own availability checks, consent and approval. This page promises no always-on service, automatic memory or reward.</p>
          </section>
        </div>

        <section className="section" aria-labelledby="gathering-heading">
          <div className="split">
            <ConceptPlaceholder symbol="◯" label="A place to gather" />
            <div><p className="eyebrow">Proposed gatherings</p><h2 id="gathering-heading">Make room for real friendship.</h2><p>Reading circles, conversations, music evenings and shared meals remain part of the vision, online and eventually in physical places.</p><p>Each gathering would need a named human host, confirmed time and place, clear costs, accessibility and safety arrangements. No venue, membership-tier event schedule or attendance reward is confirmed here.</p><p>People should be free to listen, disagree, pass on an activity and leave. Recording or sharing a conversation would need a separate, informed choice.</p></div>
          </div>
        </section>

        <div className="band">
          <section className="section narrow" aria-labelledby="ideas-heading">
            <p className="eyebrow">TwiddleTwattle · Research concept</p>
            <h2 id="ideas-heading">Ideas that grow between meetings.</h2>
            <p>The earlier prototype explores questions branching into replies, remixes and weaves. Its Constellation idea maps connections over time. Those concepts remain worth exploring; the legacy routes are paused for the first release.</p>
            <p>Any future shared map needs clear authorship, moderation and choices about what stays private. The current reading and salon materials offer a simpler place to begin.</p>
          </section>
        </div>

        <section id="world" className="section" aria-labelledby="world-heading">
          <div className="split">
            <div><p className="eyebrow">SoE World · Spatial research</p><h2 id="world-heading">Imagine another place to meet.</h2><p>Virtual salons, maps of shared places and optional AR annotations remain distinct research ideas. Room scans, LiDAR tools and the White Knight Pen concept are not verified device integrations or an operating scan-to-earn service.</p><p>A future spatial pilot would need permission from people and property owners, careful treatment of location and images, accessible participation and tested equipment. No scan, upload, VR booking or token award is enabled here.</p><Link href="/tribekey" prefetch={false}>Read the physical-artifact concept</Link></div>
            <ConceptPlaceholder symbol="◇" label="A shared virtual room" />
          </div>
        </section>

        <div className="band">
          <section id="reflection" className="section narrow" aria-labelledby="reflection-heading">
            <p className="eyebrow">Optional reflection · Separate sensor research</p>
            <h2 id="reflection-heading">Time to listen, without a score.</h2>
            <p>A host could offer quiet reflection, listening or optional prayer as part of a proposed gathering. No equipment or physiological measurement is needed for that invitation.</p>
            <p>The earlier biofeedback-circle idea considered EEG and heart-rate variability devices. Device compatibility, interpretation and AI-adapted sessions have not been validated for a SoE service. No sensor measurement is presented here as proof of spiritual unity, group understanding or a therapeutic benefit.</p>
            <details><summary>What would sensor research need before involving people?</summary><p>A defined research purpose and qualified review of measurement validity and safety; explicit, voluntary consent; a clear choice to decline or withdraw; and reviewed rules for access, retention, sharing and deletion of sensitive data. These are unresolved prerequisites, not a claim that a safe or approved program exists. No health-data collection or sensor session is available through this page.</p></details>
          </section>
        </div>

        <section id="music" className="section" aria-labelledby="music-heading">
          <div className="split">
            <ConceptPlaceholder symbol="♫" label="Making music together" />
            <div><p className="eyebrow">Proposed music-making</p><h2 id="music-heading">Bring a rhythm. Or simply listen.</h2><p>A shared music session could welcome beginners, experienced musicians and people who prefer to listen. Its purpose would be creative participation and company. This is an activity idea, not an established treatment or a promise of a health outcome.</p><p>AI-assisted composition remains an optional tool concept, with no provider integration or partnership confirmed here. Recording, AI processing or publication would need participant permission, verified reuse rights and agreed credit and contributor terms.</p><p>No NFT minting, automatic royalties, earnings or EXP award is offered. A human facilitator would remain responsible for the gathering.</p></div>
          </div>
        </section>

        <div className="band">
          <section id="travel" className="section" aria-labelledby="travel-heading">
            <div className="split">
              <div><p className="eyebrow">Future travel &amp; hospitality</p><h2 id="travel-heading">Explore beyond the screen.</h2><p>Walks, museum visits, trips and hospitality could help friendships grow around shared interests. A future matching approach would need transparent choices people make themselves, without claims of physiological or “frequency” compatibility.</p><p>Travel-provider arrangements, stays, passport-style mementos and any payment integrations remain unverified concepts. No partner booking, reward or trip is offered through this page.</p><p>A concrete offer would need an accountable host, itinerary, clear costs and cancellation terms, privacy choices, accessibility and appropriate safety review.</p></div>
              <ConceptPlaceholder symbol="✧" label="Exploring a place together" />
            </div>
          </section>
        </div>

        <section className="section narrow closing" aria-labelledby="next-heading">
          <p className="eyebrow">A useful beginning</p>
          <h2 id="next-heading">Find something worth sharing.</h2>
          <p>Start with a reading or explore the proposed salon format. The wider ideas can develop through careful experiments, clear consent and the experience of real people.</p>
          <div className="actions"><Link href="/great-books" prefetch={false}>Explore the readings</Link><Link href="/salons/pilot" prefetch={false}>Read the salon plan</Link></div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
