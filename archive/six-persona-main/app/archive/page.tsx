'use client';

import Link from 'next/link';

export default function ArchivePage() {
  return (
    <main className="archive-page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Cinzel:wght@400;600&family=EB+Garamond:ital,wght@0,400;1,400&display=swap');

        .archive-page {
          min-height: 100vh;
          background-color: #0a0907;
          background-image:
            radial-gradient(ellipse at 20% 20%, rgba(180, 140, 60, 0.04) 0%, transparent 60%),
            radial-gradient(ellipse at 80% 80%, rgba(120, 90, 40, 0.05) 0%, transparent 60%);
          color: #c8b890;
          font-family: 'EB Garamond', 'Cormorant Garamond', Georgia, serif;
          overflow-x: hidden;
        }

        .archive-nav {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 50;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.25rem 3rem;
          border-bottom: 1px solid rgba(180, 140, 60, 0.12);
          background: rgba(10, 9, 7, 0.85);
          backdrop-filter: blur(12px);
        }

        .archive-nav-logo {
          font-family: 'Cinzel', serif;
          font-size: 0.75rem;
          letter-spacing: 0.2em;
          color: #b8955a;
          text-decoration: none;
          text-transform: uppercase;
        }

        .archive-nav-links {
          display: flex;
          gap: 2.5rem;
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .archive-nav-links a {
          font-family: 'Cinzel', serif;
          font-size: 0.65rem;
          letter-spacing: 0.18em;
          color: #7a6a4a;
          text-decoration: none;
          text-transform: uppercase;
          transition: color 0.3s ease;
        }

        .archive-nav-links a:hover {
          color: #b8955a;
        }

        /* HERO */
        .archive-hero {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 8rem 2rem 4rem;
          text-align: center;
          position: relative;
        }

        .archive-hero::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at center 40%, rgba(180, 140, 60, 0.06) 0%, transparent 70%);
          pointer-events: none;
        }

        .archive-eyebrow {
          font-family: 'Cinzel', serif;
          font-size: 0.65rem;
          letter-spacing: 0.3em;
          color: #7a6a4a;
          text-transform: uppercase;
          margin-bottom: 2rem;
        }

        .archive-title {
          font-family: 'Cinzel', serif;
          font-size: clamp(2.5rem, 6vw, 5rem);
          font-weight: 400;
          letter-spacing: 0.12em;
          color: #d4b87a;
          margin: 0 0 0.5rem;
          line-height: 1.1;
        }

        .archive-title-sub {
          font-family: 'Cinzel', serif;
          font-size: clamp(1rem, 2vw, 1.4rem);
          font-weight: 400;
          letter-spacing: 0.2em;
          color: #7a6a4a;
          margin: 0 0 2.5rem;
          text-transform: uppercase;
        }

        .archive-divider {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin: 2rem auto;
          width: 320px;
        }

        .archive-divider::before,
        .archive-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: linear-gradient(to right, transparent, rgba(180, 140, 60, 0.4), transparent);
        }

        .archive-divider-glyph {
          font-size: 1rem;
          color: #7a6a4a;
        }

        .archive-tagline {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(1.1rem, 2.5vw, 1.5rem);
          font-weight: 300;
          font-style: italic;
          color: #9a8a6a;
          max-width: 560px;
          line-height: 1.7;
          margin: 0 auto 3rem;
        }

        .archive-cta {
          display: inline-block;
          font-family: 'Cinzel', serif;
          font-size: 0.65rem;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: #0a0907;
          background: #b8955a;
          padding: 1rem 2.5rem;
          text-decoration: none;
          transition: background 0.3s ease, letter-spacing 0.3s ease;
        }

        .archive-cta:hover {
          background: #d4b87a;
          letter-spacing: 0.3em;
        }

        .archive-cta-ghost {
          display: inline-block;
          font-family: 'Cinzel', serif;
          font-size: 0.65rem;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: #7a6a4a;
          border: 1px solid rgba(180, 140, 60, 0.25);
          padding: 1rem 2.5rem;
          text-decoration: none;
          margin-left: 1.5rem;
          transition: color 0.3s ease, border-color 0.3s ease;
        }

        .archive-cta-ghost:hover {
          color: #b8955a;
          border-color: rgba(180, 140, 60, 0.5);
        }

        /* SCROLL INDICATOR */
        .scroll-indicator {
          position: absolute;
          bottom: 3rem;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          animation: fadeInUp 2s ease 1s both;
        }

        .scroll-indicator span {
          font-family: 'Cinzel', serif;
          font-size: 0.55rem;
          letter-spacing: 0.25em;
          color: #4a3a2a;
          text-transform: uppercase;
        }

        .scroll-line {
          width: 1px;
          height: 40px;
          background: linear-gradient(to bottom, rgba(180, 140, 60, 0.4), transparent);
          animation: scrollPulse 2s ease infinite;
        }

        @keyframes scrollPulse {
          0%, 100% { opacity: 0.4; transform: scaleY(1); }
          50% { opacity: 1; transform: scaleY(1.1); }
        }

        @keyframes fadeInUp {
          from { opacity: 0; transform: translate(-50%, 20px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }

        /* MANIFESTO SECTION */
        .archive-section {
          max-width: 900px;
          margin: 0 auto;
          padding: 6rem 2rem;
        }

        .archive-section-wide {
          max-width: 1100px;
          margin: 0 auto;
          padding: 6rem 2rem;
        }

        .section-label {
          font-family: 'Cinzel', serif;
          font-size: 0.6rem;
          letter-spacing: 0.3em;
          color: #5a4a2a;
          text-transform: uppercase;
          margin-bottom: 3rem;
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }

        .section-label::after {
          content: '';
          flex: 1;
          height: 1px;
          background: rgba(180, 140, 60, 0.15);
        }

        .manifesto-text {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(1.2rem, 2.5vw, 1.6rem);
          font-weight: 300;
          line-height: 1.9;
          color: #9a8a6a;
        }

        .manifesto-text strong {
          color: #c8b890;
          font-weight: 400;
        }

        /* PILLARS GRID */
        .pillars-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1px;
          background: rgba(180, 140, 60, 0.1);
          border: 1px solid rgba(180, 140, 60, 0.1);
        }

        .pillar-card {
          background: #0a0907;
          padding: 3rem 2.5rem;
          transition: background 0.4s ease;
          position: relative;
        }

        .pillar-card:hover {
          background: rgba(180, 140, 60, 0.03);
        }

        .pillar-number {
          font-family: 'Cinzel', serif;
          font-size: 0.55rem;
          letter-spacing: 0.3em;
          color: #4a3a2a;
          margin-bottom: 1.5rem;
          text-transform: uppercase;
        }

        .pillar-title {
          font-family: 'Cinzel', serif;
          font-size: 1rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          color: #b8955a;
          margin-bottom: 1.25rem;
          line-height: 1.4;
        }

        .pillar-body {
          font-family: 'EB Garamond', serif;
          font-size: 1rem;
          line-height: 1.8;
          color: #7a6a4a;
        }

        /* TRIBEKEY SECTION */
        .tribekey-section {
          border-top: 1px solid rgba(180, 140, 60, 0.1);
          border-bottom: 1px solid rgba(180, 140, 60, 0.1);
          background: rgba(180, 140, 60, 0.02);
          padding: 6rem 2rem;
          text-align: center;
        }

        .tribekey-title {
          font-family: 'Cinzel', serif;
          font-size: clamp(1.5rem, 3vw, 2.5rem);
          font-weight: 400;
          letter-spacing: 0.15em;
          color: #d4b87a;
          margin-bottom: 1.5rem;
        }

        .tribekey-body {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(1rem, 2vw, 1.3rem);
          font-weight: 300;
          font-style: italic;
          color: #7a6a4a;
          max-width: 600px;
          margin: 0 auto 3rem;
          line-height: 1.9;
        }

        .tribekey-specs {
          display: flex;
          justify-content: center;
          gap: 4rem;
          flex-wrap: wrap;
          margin-top: 3rem;
        }

        .spec-item {
          text-align: center;
        }

        .spec-value {
          font-family: 'Cinzel', serif;
          font-size: 1.5rem;
          color: #b8955a;
          display: block;
          margin-bottom: 0.5rem;
        }

        .spec-label {
          font-family: 'Cinzel', serif;
          font-size: 0.6rem;
          letter-spacing: 0.2em;
          color: #4a3a2a;
          text-transform: uppercase;
        }

        /* PHASES */
        .phases-list {
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        .phase-item {
          display: grid;
          grid-template-columns: 80px 1fr;
          gap: 2rem;
          padding: 3rem 0;
          border-bottom: 1px solid rgba(180, 140, 60, 0.08);
          align-items: start;
        }

        .phase-item:last-child {
          border-bottom: none;
        }

        .phase-num {
          font-family: 'Cinzel', serif;
          font-size: 2.5rem;
          color: rgba(180, 140, 60, 0.15);
          font-weight: 600;
          line-height: 1;
          padding-top: 0.25rem;
        }

        .phase-content {}

        .phase-title {
          font-family: 'Cinzel', serif;
          font-size: 1rem;
          letter-spacing: 0.1em;
          color: #b8955a;
          margin-bottom: 0.75rem;
        }

        .phase-body {
          font-family: 'EB Garamond', serif;
          font-size: 1rem;
          color: #7a6a4a;
          line-height: 1.8;
          margin-bottom: 0.75rem;
        }

        .phase-tag {
          display: inline-block;
          font-family: 'Cinzel', serif;
          font-size: 0.55rem;
          letter-spacing: 0.2em;
          color: #4a3a2a;
          border: 1px solid rgba(180, 140, 60, 0.15);
          padding: 0.3rem 0.75rem;
          text-transform: uppercase;
        }

        /* FINAL CTA */
        .archive-final {
          text-align: center;
          padding: 8rem 2rem;
          position: relative;
        }

        .archive-final::before {
          content: '';
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 1px;
          height: 80px;
          background: linear-gradient(to bottom, rgba(180, 140, 60, 0.3), transparent);
        }

        .archive-final-title {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(1.5rem, 4vw, 3rem);
          font-weight: 300;
          font-style: italic;
          color: #9a8a6a;
          margin-bottom: 2.5rem;
          line-height: 1.5;
        }

        .archive-final-title em {
          color: #c8b890;
          font-style: normal;
        }

        /* FOOTER */
        .archive-footer {
          border-top: 1px solid rgba(180, 140, 60, 0.1);
          padding: 2rem 3rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .footer-text {
          font-family: 'Cinzel', serif;
          font-size: 0.6rem;
          letter-spacing: 0.15em;
          color: #3a2a1a;
          text-transform: uppercase;
        }

        .footer-links {
          display: flex;
          gap: 2rem;
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .footer-links a {
          font-family: 'Cinzel', serif;
          font-size: 0.6rem;
          letter-spacing: 0.15em;
          color: #3a2a1a;
          text-decoration: none;
          text-transform: uppercase;
          transition: color 0.3s;
        }

        .footer-links a:hover {
          color: #7a6a4a;
        }
      `}</style>

      {/* NAV */}
      <nav className="archive-nav">
        <Link href="/" className="archive-nav-logo">Society of Explorers</Link>
        <ul className="archive-nav-links">
          <li><Link href="/">The Salon</Link></li>
          <li><Link href="/archive">The Archive</Link></li>
          <li><Link href="/join">Join</Link></li>
        </ul>
      </nav>

      {/* HERO */}
      <section className="archive-hero">
        <p className="archive-eyebrow">Est. 2025 · Boston</p>
        <h1 className="archive-title">The Living Archive</h1>
        <p className="archive-title-sub">A Sovereign Intelligence Network</p>

        <div className="archive-divider">
          <span className="archive-divider-glyph">✦</span>
        </div>

        <p className="archive-tagline">
          Your data. Your real estate. Your rules. A private network where what you know,
          feel, and discover works only for you — never against you.
        </p>

        <div>
          <Link href="/join" className="archive-cta">Join the Archive</Link>
          <Link href="/" className="archive-cta-ghost">Enter the Salon</Link>
        </div>

        <div className="scroll-indicator">
          <span>Explore</span>
          <div className="scroll-line" />
        </div>
      </section>

      {/* MANIFESTO */}
      <section style={{ borderTop: '1px solid rgba(180, 140, 60, 0.1)' }}>
        <div className="archive-section">
          <p className="section-label">The Premise</p>
          <p className="manifesto-text">
            Every conversation you have, every ritual you perform, every insight you mint —
            lives first on your <strong>Tribekey</strong>. A small device. Truly yours.{' '}
            <strong>Nothing leaves your hands unless you choose it.</strong>
          </p>
          <br />
          <p className="manifesto-text">
            Our Great Thinkers — Socrates, Einstein, Jobs, Aurelius — guide you in the salon.
            But they never see your private data. They learn only from{' '}
            <strong>the collective wisdom that emerges when thousands of Explorers choose to share.</strong>
          </p>
        </div>
      </section>

      {/* PILLARS */}
      <section style={{ borderTop: '1px solid rgba(180, 140, 60, 0.1)' }}>
        <div className="archive-section-wide">
          <p className="section-label">The Principles</p>
          <div className="pillars-grid">
            <div className="pillar-card">
              <p className="pillar-number">I</p>
              <h3 className="pillar-title">Sovereignty First</h3>
              <p className="pillar-body">
                Your data lives on hardware you hold. The Tribekey is your sovereign territory —
                a bootable device that carries your Explorer OS, your local AI, and your complete
                intellectual history.
              </p>
            </div>
            <div className="pillar-card">
              <p className="pillar-number">II</p>
              <h3 className="pillar-title">Blockchain as Honest Ledger</h3>
              <p className="pillar-body">
                Smart contracts are the transparent business logic layer. Every ritual performed,
                every prompt requested, every micro-payment — all on-chain, all visible, all fair.
                No middlemen. No surveillance.
              </p>
            </div>
            <div className="pillar-card">
              <p className="pillar-number">III</p>
              <h3 className="pillar-title">Value Flows Directly</h3>
              <p className="pillar-body">
                Members earn $EXP tokens for contributing real human insight and values. Buy access
                to powerful prompts and rituals with micro-payments. A true robot-led free market
                where value flows between Explorers.
              </p>
            </div>
            <div className="pillar-card">
              <p className="pillar-number">IV</p>
              <h3 className="pillar-title">Collective Wisdom</h3>
              <p className="pillar-body">
                What you choose to share enriches everyone. The Archive learns from the emergent
                intelligence of thousands of Explorers — never from surveillance, always from
                voluntary contribution.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* TRIBEKEY */}
      <section className="tribekey-section">
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <p className="section-label" style={{ justifyContent: 'center' }}>The Device</p>
          <h2 className="tribekey-title">The Tribekey</h2>
          <p className="tribekey-body">
            A small USB device that is genuinely yours. Bootable. Encrypted. Carrying Explorer OS,
            a local AI model, and your complete intellectual archive — wherever you go.
          </p>

          <div className="tribekey-specs">
            <div className="spec-item">
              <span className="spec-value">Q3 2026</span>
              <span className="spec-label">Phase 1 Target</span>
            </div>
            <div className="spec-item">
              <span className="spec-value">Local AI</span>
              <span className="spec-label">On-Device</span>
            </div>
            <div className="spec-item">
              <span className="spec-value">Explorer OS</span>
              <span className="spec-label">Bootable</span>
            </div>
            <div className="spec-item">
              <span className="spec-value">Zero Cloud</span>
              <span className="spec-label">By Default</span>
            </div>
          </div>
        </div>
      </section>

      {/* PHASES */}
      <section style={{ borderTop: '1px solid rgba(180, 140, 60, 0.1)' }}>
        <div className="archive-section">
          <p className="section-label">The Roadmap</p>
          <div className="phases-list">
            <div className="phase-item">
              <div className="phase-num">01</div>
              <div className="phase-content">
                <h3 className="phase-title">Tribekey USB</h3>
                <p className="phase-body">
                  A bootable USB device carrying Explorer OS, a local AI model, and your
                  encrypted personal archive. The seed of your sovereign intelligence.
                </p>
                <span className="phase-tag">Q3 2026</span>
              </div>
            </div>
            <div className="phase-item">
              <div className="phase-num">02</div>
              <div className="phase-content">
                <h3 className="phase-title">Home Node</h3>
                <p className="phase-body">
                  A Raspberry Pi-based home node that keeps your Archive always-on,
                  always-available, and always private — in your own home.
                </p>
                <span className="phase-tag">2027</span>
              </div>
            </div>
            <div className="phase-item">
              <div className="phase-num">03</div>
              <div className="phase-content">
                <h3 className="phase-title">Crystal Hub</h3>
                <p className="phase-body">
                  A dedicated hardware hub — designed with Bill at WBM Tek — that becomes
                  the center of your sovereign intelligence network at home.
                </p>
                <span className="phase-tag">Future</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="archive-final">
        <h2 className="archive-final-title">
          The Archive remembers<br />
          <em>what the world would rather forget.</em>
        </h2>
        <Link href="/join" className="archive-cta">
          Start with the Digital Tier
        </Link>
        <p style={{ marginTop: '1.5rem', fontFamily: 'Cinzel, serif', fontSize: '0.6rem', letterSpacing: '0.2em', color: '#3a2a1a', textTransform: 'uppercase' }}>
          Instant access · Your first EXP tokens waiting
        </p>
      </section>

      {/* FOOTER */}
      <footer className="archive-footer">
        <span className="footer-text">92B South St · Downtown Boston · Consilience LLC · Society of Explorers DAO</span>
        <ul className="footer-links">
          <li><Link href="/join">Membership</Link></li>
          <li><Link href="/">The Salon</Link></li>
        </ul>
      </footer>
    </main>
  );
}
