import type { Metadata } from 'next';
import Link from 'next/link';
import PublicFooter from '@/components/PublicFooter';

export const metadata: Metadata = {
  title: "Tribekey \u2014 hardware concept",
  description: "The Tribekey vision, its proposed relationship to Crystal Hub, and the distinction between local presentation software and unverified hardware.",
};

export default function TribekeyPage() {
  return (
    <div className="soe-tribekey-concept">
      <style>{`
  .soe-tribekey-concept { background: #0a0a0a; color: #e8dcc8; min-height: 100vh; font-family: 'Cormorant Garamond', serif; }
  .soe-tribekey-concept * { box-sizing: border-box; }
  .soe-tribekey-concept a { color: #d6b860; text-underline-offset: .25em; }
  .soe-tribekey-concept a:focus-visible, .soe-tribekey-concept summary:focus-visible { outline: 3px solid #f1d788; outline-offset: 5px; }
  .soe-tribekey-concept .skip { position: absolute; left: 1rem; top: -8rem; z-index: 300; padding: .8rem; background: #0a0a0a; }
  .soe-tribekey-concept .skip:focus { top: 1rem; }
  .soe-tribekey-concept .nav { padding: 1rem clamp(1rem, 4vw, 3rem); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem 2rem; border-bottom: 1px solid #c9a84c38; }
  .soe-tribekey-concept .nav a { display: inline-flex; align-items: center; min-height: 44px; font-family: 'Cinzel', serif; font-size: .8rem; letter-spacing: .06em; text-decoration: none; }
  .soe-tribekey-concept .nav a:hover { text-decoration: underline; }
  .soe-tribekey-concept .nav-links { display: flex; flex-wrap: wrap; gap: .5rem 1.5rem; }
  .soe-tribekey-concept .hero { padding: clamp(3rem, 8vw, 7rem) 1.25rem; text-align: center; background: radial-gradient(ellipse at center, #211a09 0%, #0a0a0a 72%); }
  .soe-tribekey-concept .hero-inner { max-width: 780px; margin: 0 auto; }
  .soe-tribekey-concept .eyebrow { font-family: 'Cinzel', serif; color: #d6b860; font-size: .8rem; letter-spacing: .15em; line-height: 1.8; margin: 0 0 1rem; }
  .soe-tribekey-concept h1, .soe-tribekey-concept h2, .soe-tribekey-concept h3 { font-family: 'Cinzel', serif; font-weight: 400; color: #f5f0e8; text-wrap: balance; }
  .soe-tribekey-concept h1 { font-size: clamp(2.3rem, 7vw, 4.7rem); line-height: 1.15; letter-spacing: .03em; margin: 0 0 1.5rem; }
  .soe-tribekey-concept h2 { font-size: clamp(1.65rem, 4vw, 2.5rem); line-height: 1.35; margin: 0 0 1.5rem; }
  .soe-tribekey-concept h3 { font-size: 1.15rem; line-height: 1.5; margin: 0 0 .75rem; }
  .soe-tribekey-concept p, .soe-tribekey-concept li { font-size: 1.2rem; line-height: 1.8; }
  .soe-tribekey-concept p { margin: 0 0 1.25rem; }
  .soe-tribekey-concept p:last-child { margin-bottom: 0; }
  .soe-tribekey-concept .lede { font-size: 1.5rem; color: #e8dcc8; }
  .soe-tribekey-concept .status { margin: 2rem auto 0; max-width: 680px; padding: 1.5rem; border: 1px solid #c9a84c70; background: #121109; text-align: left; }
  .soe-tribekey-concept .status strong { color: #f1d788; }
  .soe-tribekey-concept .section { max-width: 1060px; margin: 0 auto; padding: clamp(2.5rem, 6vw, 5rem) 1.25rem; }
  .soe-tribekey-concept .narrow { max-width: 800px; }
  .soe-tribekey-concept .band { background: #101010; border-block: 1px solid #c9a84c20; }
  .soe-tribekey-concept .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 1rem; margin-top: 2rem; }
  .soe-tribekey-concept .card { padding: 1.5rem; background: #141310; border: 1px solid #c9a84c38; min-width: 0; }
  .soe-tribekey-concept .card p { color: #c9c0ac; }
  .soe-tribekey-concept .steps { list-style: none; padding: 0; margin: 2rem 0 0; counter-reset: steps; }
  .soe-tribekey-concept .steps li { counter-increment: steps; padding: 1.5rem 0; border-top: 1px solid #c9a84c38; }
  .soe-tribekey-concept .steps h3::before { content: counter(steps, decimal-leading-zero) ' / '; color: #d6b860; }
  .soe-tribekey-concept details { border-block-start: 1px solid #c9a84c55; padding: .25rem 0; }
  .soe-tribekey-concept details:last-child { border-block-end: 1px solid #c9a84c55; }
  .soe-tribekey-concept summary { cursor: pointer; padding: 1rem .25rem; min-height: 44px; font-family: 'Cinzel', serif; font-size: 1rem; color: #f5f0e8; line-height: 1.65; }
  .soe-tribekey-concept details p { padding: 0 .25rem 1.25rem; }
  .soe-tribekey-concept .actions { display: flex; flex-wrap: wrap; gap: 1rem; margin-top: 2rem; }
  .soe-tribekey-concept .actions a { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: .85rem 1.25rem; border: 1px solid #c9a84c; font-family: 'Cinzel', serif; font-size: .85rem; line-height: 1.6; text-align: center; text-decoration: none; }
  .soe-tribekey-concept .actions a:first-child { background: #c9a84c; color: #0a0a0a; }
  .soe-tribekey-concept .actions a:hover { text-decoration: underline; }
  .soe-tribekey-concept .closing { border-top: 1px solid #c9a84c38; }
  .soe-tribekey-concept .accent { color: #d6b860; }
  @media (max-width: 420px) { .soe-tribekey-concept .actions a { width: 100%; } .soe-tribekey-concept .nav-links { gap: .35rem 1rem; } }
`}</style>
      <a className="skip" href="#tribekey-content">Skip to content</a>
      <nav className="nav" aria-label="Research navigation">
        <Link href="/" prefetch={false}>Society of Explorers</Link>
        <div className="nav-links">
          <Link href="/great-books" prefetch={false}>Reading</Link>
          <Link href="/fellowship" prefetch={false}>Christian fellowship</Link>
        </div>
      </nav>
      <main id="tribekey-content" tabIndex={-1}>
        <header className="hero">
          <div className="hero-inner">
            <p className="eyebrow">The physical artifact · Hardware concept</p>
            <h1>TRIBE<span className="accent">KEY</span></h1>
            <p className="lede">A small object. A deliberate beginning.<br />A more personal relationship with our tools.</p>
            <div className="status">
              <p><strong>A concept in development.</strong></p>
              <p>Tribekey is a proposed physical companion to Society of Explorers. Local Crystal presentation software exists; a working Tribekey device and its security properties have not been verified. No delivery date or hardware order is offered here.</p>
            </div>
          </div>
        </header>

        <section className="section narrow" aria-labelledby="physical-key">
          <p className="eyebrow">I · The intention</p>
          <h2 id="physical-key">Why a physical key?</h2>
          <p>The original idea was a crystal-like object you could carry, hold and deliberately connect before entering a personal workspace. Its appeal is a visible ritual: choosing when to begin, what to share and when to leave.</p>
          <p>That ambition still matters. It needs a practical design for identity, consent, recovery and compatible devices. Carrying a key would not by itself make a shared computer trustworthy.</p>
        </section>

        <div className="band">
          <section className="section" aria-labelledby="crystal">
            <p className="eyebrow">II · Tribekey &amp; Crystal Hub</p>
            <h2 id="crystal">Related ideas, different stages</h2>
            <div className="grid">
              <article className="card">
                <p className="eyebrow">Local software</p>
                <h3>Crystal presentation</h3>
                <p>A local prototype explores thinker portraits, light and session states. Simulated lifecycle checks exercise how that presentation starts and clears. They do not verify physical hardware, a person&apos;s identity or storage of private conversations.</p>
              </article>
              <article className="card">
                <p className="eyebrow">Design requirements</p>
                <h3>A key &amp; a hub</h3>
                <p>The Crystal Hub engineering proposal includes detecting a Tribekey and managing a session. The device relationship, communication protocol and security design still need agreement and hardware testing.</p>
              </article>
              <article className="card">
                <p className="eyebrow">Not established</p>
                <h3>A portable private world</h3>
                <p>Secure identity storage, a portable Explorer OS, archive unlocking and host-data erasure remain unverified capabilities. Clearing a local presentation is not proof that a computer has erased every trace.</p>
              </article>
            </div>
          </section>
        </div>

        <section className="section narrow" aria-labelledby="ritual">
          <p className="eyebrow">III · A possible ritual</p>
          <h2 id="ritual">Make the experience understandable.</h2>
          <p>This is a design direction, not a description of a shipping device.</p>
          <ol className="steps">
            <li><h3>Hold something meaningful</h3><p>Explore an object that feels considered and personal. Materials, form, manufacturing and cost remain open.</p></li>
            <li><h3>Choose to begin</h3><p>A future connection should explain which device and service it opens, what data it needs and what the person is agreeing to.</p></li>
            <li><h3>See what is happening</h3><p>Use clear session and voice indicators, with a deliberate choice before a microphone or AI service is involved. The local presentation work explores these cues.</p></li>
            <li><h3>Leave with confidence</h3><p>Specify and test what disconnecting actually ends, what remains stored and how recovery works. Avoid promising a universal wipe or compatibility with every computer.</p></li>
          </ol>
        </section>

        <div className="band">
          <section className="section narrow" aria-labelledby="availability">
            <p className="eyebrow">IV · What comes before availability</p>
            <h2 id="availability">Evidence before an invitation.</h2>
            <p>The earlier ten-member dinner, engraved first devices, perpetual EXP multiplier and imminent shipping language described aspirations. They are not current reservations, allocations, reward terms or delivery commitments.</p>
            <p>Any future hardware pilot needs a tested prototype, a clear security and recovery model, costs, support arrangements and an approved participant offer. Those steps have no confirmed dates here.</p>
            <details><summary>Does Tribekey establish ownership or governance rights?</summary><p>No ownership, token allocation or governance entitlement is offered on this page. The earlier ideas need defined terms and appropriate review. Internal EXP points are also distinct from proposed blockchain assets.</p></details>
          </section>
        </div>

        <section className="section narrow closing" aria-labelledby="human-purpose">
          <p className="eyebrow">The human purpose</p>
          <h2 id="human-purpose">The gathering gives the object meaning.</h2>
          <p>The wider vision is a place for reading, fellowship and useful work with other people. Explore that purpose while the physical artifact remains in development.</p>
          <div className="actions"><Link href="/salons/pilot" prefetch={false}>Read the salon plan</Link><Link href="/tokenomics" prefetch={false}>Explore the Commons research</Link></div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
