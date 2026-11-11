import type { Metadata } from 'next';
import Link from 'next/link';
import PublicFooter from '@/components/PublicFooter';

export const metadata: Metadata = {
  title: "EXP & the Commons \u2014 research",
  description: "Internal EXP points, proposed tokens and ideas for shared spaces: what exists in software and what remains under review.",
};

export default function TokenomicsPage() {
  return (
    <div className="soe-tokenomics-concept">
      <style>{`
  .soe-tokenomics-concept { background: #0a0a0a; color: #e8dcc8; min-height: 100vh; font-family: 'Cormorant Garamond', serif; }
  .soe-tokenomics-concept * { box-sizing: border-box; }
  .soe-tokenomics-concept a { color: #d6b860; text-underline-offset: .25em; }
  .soe-tokenomics-concept a:focus-visible, .soe-tokenomics-concept summary:focus-visible { outline: 3px solid #f1d788; outline-offset: 5px; }
  .soe-tokenomics-concept .skip { position: absolute; left: 1rem; top: -8rem; z-index: 300; padding: .8rem; background: #0a0a0a; }
  .soe-tokenomics-concept .skip:focus { top: 1rem; }
  .soe-tokenomics-concept .nav { padding: 1rem clamp(1rem, 4vw, 3rem); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem 2rem; border-bottom: 1px solid #c9a84c38; }
  .soe-tokenomics-concept .nav a { display: inline-flex; align-items: center; min-height: 44px; font-family: 'Cinzel', serif; font-size: .8rem; letter-spacing: .06em; text-decoration: none; }
  .soe-tokenomics-concept .nav a:hover { text-decoration: underline; }
  .soe-tokenomics-concept .nav-links { display: flex; flex-wrap: wrap; gap: .5rem 1.5rem; }
  .soe-tokenomics-concept .hero { padding: clamp(3rem, 8vw, 7rem) 1.25rem; text-align: center; background: radial-gradient(ellipse at center, #211a09 0%, #0a0a0a 72%); }
  .soe-tokenomics-concept .hero-inner { max-width: 780px; margin: 0 auto; }
  .soe-tokenomics-concept .eyebrow { font-family: 'Cinzel', serif; color: #d6b860; font-size: .8rem; letter-spacing: .15em; line-height: 1.8; margin: 0 0 1rem; }
  .soe-tokenomics-concept h1, .soe-tokenomics-concept h2, .soe-tokenomics-concept h3 { font-family: 'Cinzel', serif; font-weight: 400; color: #f5f0e8; text-wrap: balance; }
  .soe-tokenomics-concept h1 { font-size: clamp(2.3rem, 7vw, 4.7rem); line-height: 1.15; letter-spacing: .03em; margin: 0 0 1.5rem; }
  .soe-tokenomics-concept h2 { font-size: clamp(1.65rem, 4vw, 2.5rem); line-height: 1.35; margin: 0 0 1.5rem; }
  .soe-tokenomics-concept h3 { font-size: 1.15rem; line-height: 1.5; margin: 0 0 .75rem; }
  .soe-tokenomics-concept p, .soe-tokenomics-concept li { font-size: 1.2rem; line-height: 1.8; }
  .soe-tokenomics-concept p { margin: 0 0 1.25rem; }
  .soe-tokenomics-concept p:last-child { margin-bottom: 0; }
  .soe-tokenomics-concept .lede { font-size: 1.5rem; color: #e8dcc8; }
  .soe-tokenomics-concept .status { margin: 2rem auto 0; max-width: 680px; padding: 1.5rem; border: 1px solid #c9a84c70; background: #121109; text-align: left; }
  .soe-tokenomics-concept .status strong { color: #f1d788; }
  .soe-tokenomics-concept .section { max-width: 1060px; margin: 0 auto; padding: clamp(2.5rem, 6vw, 5rem) 1.25rem; }
  .soe-tokenomics-concept .narrow { max-width: 800px; }
  .soe-tokenomics-concept .band { background: #101010; border-block: 1px solid #c9a84c20; }
  .soe-tokenomics-concept .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 1rem; margin-top: 2rem; }
  .soe-tokenomics-concept .card { padding: 1.5rem; background: #141310; border: 1px solid #c9a84c38; min-width: 0; }
  .soe-tokenomics-concept .card p { color: #c9c0ac; }
  .soe-tokenomics-concept .steps { list-style: none; padding: 0; margin: 2rem 0 0; counter-reset: steps; }
  .soe-tokenomics-concept .steps li { counter-increment: steps; padding: 1.5rem 0; border-top: 1px solid #c9a84c38; }
  .soe-tokenomics-concept .steps h3::before { content: counter(steps, decimal-leading-zero) ' / '; color: #d6b860; }
  .soe-tokenomics-concept details { border-block-start: 1px solid #c9a84c55; padding: .25rem 0; }
  .soe-tokenomics-concept details:last-child { border-block-end: 1px solid #c9a84c55; }
  .soe-tokenomics-concept summary { cursor: pointer; padding: 1rem .25rem; min-height: 44px; font-family: 'Cinzel', serif; font-size: 1rem; color: #f5f0e8; line-height: 1.65; }
  .soe-tokenomics-concept details p { padding: 0 .25rem 1.25rem; }
  .soe-tokenomics-concept .actions { display: flex; flex-wrap: wrap; gap: 1rem; margin-top: 2rem; }
  .soe-tokenomics-concept .actions a { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: .85rem 1.25rem; border: 1px solid #c9a84c; font-family: 'Cinzel', serif; font-size: .85rem; line-height: 1.6; text-align: center; text-decoration: none; }
  .soe-tokenomics-concept .actions a:first-child { background: #c9a84c; color: #0a0a0a; }
  .soe-tokenomics-concept .actions a:hover { text-decoration: underline; }
  .soe-tokenomics-concept .closing { border-top: 1px solid #c9a84c38; }
  .soe-tokenomics-concept .accent { color: #d6b860; }
  @media (max-width: 420px) { .soe-tokenomics-concept .actions a { width: 100%; } .soe-tokenomics-concept .nav-links { gap: .35rem 1rem; } }
`}</style>
      <a className="skip" href="#tokenomics-content">Skip to content</a>
      <nav className="nav" aria-label="Research navigation">
        <Link href="/" prefetch={false}>Society of Explorers</Link>
        <div className="nav-links">
          <Link href="/great-books" prefetch={false}>Reading</Link>
          <Link href="/fellowship" prefetch={false}>Christian fellowship</Link>
        </div>
      </nav>
      <main id="tokenomics-content" tabIndex={-1}>
        <header className="hero">
          <div className="hero-inner">
            <p className="eyebrow">Explorer Commons · Research</p>
            <h1>Contribution deserves<br /><span className="accent">recognition.</span></h1>
            <p className="lede">An exploration of participation, reputation and places held in common.</p>
            <div className="status">
              <p><strong>Internal points and proposed tokens are separate.</strong></p>
              <p>The app includes internal EXP point accounting. A point balance does not establish a blockchain balance, cash value, ownership or voting rights. The token and Commons ideas below remain proposals.</p>
            </div>
          </div>
        </header>

        <section className="section" aria-labelledby="exp-status">
          <p className="eyebrow">What exists · What is proposed</p>
          <h2 id="exp-status">Three different ideas</h2>
          <div className="grid">
            <article className="card">
              <p className="eyebrow">Existing software</p>
              <h3>EXP points</h3>
              <p>Participation accounting exists in the app&apos;s software, with local verification work. That work does not establish that an earning program is available to members. No reward rate is offered on this page.</p>
            </article>
            <article className="card">
              <p className="eyebrow">Earlier proposals</p>
              <h3>$EXP and $SOE</h3>
              <p>Earlier designs used these names for blockchain assets. They are not interchangeable with internal EXP points. A live mint, transfer rules, redemption terms and launch availability have not been verified for this page.</p>
            </article>
            <article className="card">
              <p className="eyebrow">Future research</p>
              <h3>Commons Shares</h3>
              <p>An earlier idea connected community spaces with funding and participation rights. Its ownership, governance and financial terms remain unresolved. No shares or interests are offered here.</p>
            </article>
          </div>
        </section>

        <div className="band">
          <section className="section" aria-labelledby="contribution">
            <p className="eyebrow">The purpose</p>
            <h2 id="contribution">Recognize what helps people flourish</h2>
            <p>The worthwhile question is how to recognize careful reading, generous hosting and useful work without making every act of fellowship a transaction.</p>
            <div className="grid">
              <article className="card"><h3>Read &amp; discuss</h3><p>Explore ways to acknowledge a thoughtful question, a well-sourced correction or a reading shared with care.</p></article>
              <article className="card"><h3>Host &amp; welcome</h3><p>Consider the work of preparing a salon and helping people take part. Attendance and service need a fair process before any reward scheme.</p></article>
              <article className="card"><h3>Build &amp; contribute</h3><p>Recognize useful tools and creative work with clear credit and contributor terms. These are design possibilities, with no promised payment or allocation.</p></article>
            </div>
          </section>
        </div>

        <section className="section narrow" aria-labelledby="commons">
          <p className="eyebrow">The longer view</p>
          <h2 id="commons">A Commons worth belonging to</h2>
          <p>Shared reading rooms, gathering places and tools remain part of the vision. They need workable ownership, operating costs, access rules and accountable human decisions.</p>
          <p>Earlier plans named Solana Token-2022, Realms and Squads. Those references describe candidate approaches; they do not verify a deployed token, an operating voting system or custody of a treasury.</p>
          <p>A non-token approach remains an option. Any token, ownership or fundraising proposal needs a defined purpose, technical review and qualified legal and tax review before an offer. This page makes no determination about securities status.</p>
        </section>

        <div className="band">
          <section className="section narrow" aria-labelledby="questions">
            <p className="eyebrow">Questions</p>
            <h2 id="questions">Before treating an idea as a promise</h2>
            <details><summary>Can I buy, sell or redeem EXP here?</summary><p>This page provides no purchase, trading, minting or redemption service. Internal point accounting is separate from proposed blockchain assets; no conversion or cash-out promise is made.</p></details>
            <details><summary>What does “soulbound” mean in the earlier plan?</summary><p>The term described an intention to limit transfers. That intention is not proof of the rules of a deployed asset, and it does not settle ownership, financial or legal questions.</p></details>
            <details><summary>Are rewards, booking priority or governance rights available?</summary><p>The earlier reward tables, point multipliers and token-based benefits were proposals. They are not confirmed offers. Any future program would need published terms and verified availability.</p></details>
            <details><summary>Where are the network totals?</summary><p>The previous totals were illustrative figures, not verified activity. They have been removed. This page reports no live token supply, earners, spaces or node counts.</p></details>
          </section>
        </div>

        <section className="section narrow closing" aria-labelledby="start-reading">
          <p className="eyebrow">Begin with an idea</p>
          <h2 id="start-reading">Read something worth discussing.</h2>
          <p>Explore the reading library or the proposed salon format. These links let you explore the work without a token transaction.</p>
          <div className="actions"><Link href="/great-books" prefetch={false}>Explore the readings</Link><Link href="/salons/pilot" prefetch={false}>Read the salon plan</Link></div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
