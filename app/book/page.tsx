import type { Metadata } from 'next';
import Link from 'next/link';
import PublicFooter from '@/components/PublicFooter';

export const metadata: Metadata = {
  title: "The book as living artifact \u2014 concept",
  description: "A concept for connecting physical books, readings and conversations. NFC, token payments and membership minting remain unverified proposals.",
};

export default function BookPage() {
  return (
    <div className="soe-book-concept">
      <style>{`
  .soe-book-concept { background: #0a0a0a; color: #e8dcc8; min-height: 100vh; font-family: 'Cormorant Garamond', serif; }
  .soe-book-concept * { box-sizing: border-box; }
  .soe-book-concept a { color: #d6b860; text-underline-offset: .25em; }
  .soe-book-concept a:focus-visible, .soe-book-concept summary:focus-visible { outline: 3px solid #f1d788; outline-offset: 5px; }
  .soe-book-concept .skip { position: absolute; left: 1rem; top: -8rem; z-index: 300; padding: .8rem; background: #0a0a0a; }
  .soe-book-concept .skip:focus { top: 1rem; }
  .soe-book-concept .nav { padding: 1rem clamp(1rem, 4vw, 3rem); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem 2rem; border-bottom: 1px solid #c9a84c38; }
  .soe-book-concept .nav a { display: inline-flex; align-items: center; min-height: 44px; font-family: 'Cinzel', serif; font-size: .8rem; letter-spacing: .06em; text-decoration: none; }
  .soe-book-concept .nav a:hover { text-decoration: underline; }
  .soe-book-concept .nav-links { display: flex; flex-wrap: wrap; gap: .5rem 1.5rem; }
  .soe-book-concept .hero { padding: clamp(3rem, 8vw, 7rem) 1.25rem; text-align: center; background: radial-gradient(ellipse at center, #211a09 0%, #0a0a0a 72%); }
  .soe-book-concept .hero-inner { max-width: 780px; margin: 0 auto; }
  .soe-book-concept .eyebrow { font-family: 'Cinzel', serif; color: #d6b860; font-size: .8rem; letter-spacing: .15em; line-height: 1.8; margin: 0 0 1rem; }
  .soe-book-concept h1, .soe-book-concept h2, .soe-book-concept h3 { font-family: 'Cinzel', serif; font-weight: 400; color: #f5f0e8; text-wrap: balance; }
  .soe-book-concept h1 { font-size: clamp(2.3rem, 7vw, 4.7rem); line-height: 1.15; letter-spacing: .03em; margin: 0 0 1.5rem; }
  .soe-book-concept h2 { font-size: clamp(1.65rem, 4vw, 2.5rem); line-height: 1.35; margin: 0 0 1.5rem; }
  .soe-book-concept h3 { font-size: 1.15rem; line-height: 1.5; margin: 0 0 .75rem; }
  .soe-book-concept p, .soe-book-concept li { font-size: 1.2rem; line-height: 1.8; }
  .soe-book-concept p { margin: 0 0 1.25rem; }
  .soe-book-concept p:last-child { margin-bottom: 0; }
  .soe-book-concept .lede { font-size: 1.5rem; color: #e8dcc8; }
  .soe-book-concept .status { margin: 2rem auto 0; max-width: 680px; padding: 1.5rem; border: 1px solid #c9a84c70; background: #121109; text-align: left; }
  .soe-book-concept .status strong { color: #f1d788; }
  .soe-book-concept .section { max-width: 1060px; margin: 0 auto; padding: clamp(2.5rem, 6vw, 5rem) 1.25rem; }
  .soe-book-concept .narrow { max-width: 800px; }
  .soe-book-concept .band { background: #101010; border-block: 1px solid #c9a84c20; }
  .soe-book-concept .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 1rem; margin-top: 2rem; }
  .soe-book-concept .card { padding: 1.5rem; background: #141310; border: 1px solid #c9a84c38; min-width: 0; }
  .soe-book-concept .card p { color: #c9c0ac; }
  .soe-book-concept .steps { list-style: none; padding: 0; margin: 2rem 0 0; counter-reset: steps; }
  .soe-book-concept .steps li { counter-increment: steps; padding: 1.5rem 0; border-top: 1px solid #c9a84c38; }
  .soe-book-concept .steps h3::before { content: counter(steps, decimal-leading-zero) ' / '; color: #d6b860; }
  .soe-book-concept details { border-block-start: 1px solid #c9a84c55; padding: .25rem 0; }
  .soe-book-concept details:last-child { border-block-end: 1px solid #c9a84c55; }
  .soe-book-concept summary { cursor: pointer; padding: 1rem .25rem; min-height: 44px; font-family: 'Cinzel', serif; font-size: 1rem; color: #f5f0e8; line-height: 1.65; }
  .soe-book-concept details p { padding: 0 .25rem 1.25rem; }
  .soe-book-concept .actions { display: flex; flex-wrap: wrap; gap: 1rem; margin-top: 2rem; }
  .soe-book-concept .actions a { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: .85rem 1.25rem; border: 1px solid #c9a84c; font-family: 'Cinzel', serif; font-size: .85rem; line-height: 1.6; text-align: center; text-decoration: none; }
  .soe-book-concept .actions a:first-child { background: #c9a84c; color: #0a0a0a; }
  .soe-book-concept .actions a:hover { text-decoration: underline; }
  .soe-book-concept .closing { border-top: 1px solid #c9a84c38; }
  .soe-book-concept .accent { color: #d6b860; }
  @media (max-width: 420px) { .soe-book-concept .actions a { width: 100%; } .soe-book-concept .nav-links { gap: .35rem 1rem; } }
`}</style>
      <a className="skip" href="#book-content">Skip to content</a>
      <nav className="nav" aria-label="Research navigation">
        <Link href="/" prefetch={false}>Society of Explorers</Link>
        <div className="nav-links">
          <Link href="/great-books" prefetch={false}>Reading</Link>
          <Link href="/fellowship" prefetch={false}>Christian fellowship</Link>
        </div>
      </nav>
      <main id="book-content" tabIndex={-1}>
        <header className="hero">
          <div className="hero-inner">
            <p className="eyebrow">The Society artifact · Concept</p>
            <h1>The book<br /><span className="accent">as living artifact</span></h1>
            <p className="lede">A book passed from one person to another can become the beginning of a conversation.</p>
            <div className="status">
              <p><strong>A reading and sharing concept.</strong></p>
              <p>Physical Society books, NFC membership minting and automatic $SOE payments have not been verified as available products or services. This page offers no book order, membership token or income opportunity.</p>
            </div>
          </div>
        </header>

        <section className="section narrow" aria-labelledby="book-vision">
          <p className="eyebrow">The vision</p>
          <h2 id="book-vision">Let the ideas travel.</h2>
          <p>A shared book carries an invitation: read this, consider it and tell me what you think. The Society Artifact idea asks how a physical book might connect readers with context, thoughtful questions and a salon.</p>
          <p>The existing reading library is a place to explore that purpose. A specially manufactured book, a chip or a blockchain transaction is not required to read or start a discussion.</p>
        </section>

        <div className="band">
          <section className="section narrow" aria-labelledby="book-pilot">
            <p className="eyebrow">A possible first experiment</p>
            <h2 id="book-pilot">Start with the reading.</h2>
            <p>This is a proposed sequence for testing the idea, not an active artifact program.</p>
            <ol className="steps">
              <li><h3>Choose a text</h3><p>Start with an existing reading and check the rights for the exact edition and any material to be reproduced.</p></li>
              <li><h3>Make the invitation clear</h3><p>A printed link or optional QR label could lead to context and discussion questions. A link alone would not enroll a member, verify identity or mint a token.</p></li>
              <li><h3>Share a question</h3><p>Invite readers to consider the text together. Any later feedback or journey-tracking feature would need a clear purpose and a choice about what people share.</p></li>
              <li><h3>Learn from the conversation</h3><p>Evaluate whether the material helps people understand one another and return to a discussion. No payment or increase in a book&apos;s financial value is promised.</p></li>
            </ol>
          </section>
        </div>

        <section className="section" aria-labelledby="book-research">
          <p className="eyebrow">Earlier ideas · Unresolved choices</p>
          <h2 id="book-research">What still needs to be worked out</h2>
          <div className="grid">
            <article className="card"><h3>NFC &amp; identity</h3><p>Earlier designs proposed a tap that opened a reader experience or minted membership on Base. No working physical-book or minting flow has been verified. A simple web link remains an alternative.</p></article>
            <article className="card"><h3>Payments &amp; rights</h3><p>Automatic recurring $SOE payments were a proposal, without verified funding, distribution rights or operating terms. Sharing a book creates no earnings commitment here.</p></article>
            <article className="card"><h3>Privacy &amp; AI</h3><p>A public record of every reader or handoff could reveal personal information. Tracking, AI personalization and any use of reader data require separate design, consent and review.</p></article>
          </div>
        </section>

        <div className="band">
          <section className="section narrow" aria-labelledby="beyond-book">
            <p className="eyebrow">The deeper vision</p>
            <h2 id="beyond-book">Knowledge shared with care.</h2>
            <p>The lasting value is the encounter with an idea and another person. Technology should make the source easier to find, the invitation clearer and the discussion more thoughtful.</p>
            <details><summary>Where could the artifact idea lead?</summary><p>Books, art and tools might connect physical places with a wider community. Whether that requires NFC, a shared catalog or a blockchain is an open question. Any future ownership, payment or token model would need defined rights, workable costs and qualified review.</p></details>
          </section>
        </div>

        <section className="section narrow closing" aria-labelledby="book-reading">
          <p className="eyebrow">Begin with a page</p>
          <h2 id="book-reading">Find a reading.<br />Bring a question.</h2>
          <p>Explore the library and the proposed salon format. The artifact can remain a question while the ideas give us something worth discussing.</p>
          <div className="actions"><Link href="/great-books" prefetch={false}>Explore the readings</Link><Link href="/salons/pilot" prefetch={false}>Read the salon plan</Link></div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
