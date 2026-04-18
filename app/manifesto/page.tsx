'use client';
import { useEffect } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

const sectionTitleStyle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: 'clamp(28px, 4vw, 38px)',
  fontWeight: 400,
  fontStyle: 'italic',
  color: parchment,
  textAlign: 'center',
  marginBottom: '1.75rem',
  lineHeight: 1.25,
  letterSpacing: '-0.005em',
};

const bodyStyle: React.CSSProperties = {
  fontFamily: 'Cormorant Garamond, serif',
  fontSize: '18px',
  lineHeight: 1.8,
  color: ivory85,
  marginBottom: '1.25rem',
};

const pullStyle: React.CSSProperties = {
  fontFamily: 'Cormorant Garamond, serif',
  fontSize: '19px',
  lineHeight: 1.6,
  color: parchment,
  marginBottom: '1.25rem',
};

const dividerStyle: React.CSSProperties = {
  width: '60px',
  height: '1px',
  background: `${gold}4d`,
  margin: '4rem auto',
  border: 'none',
};

const sectionStyle: React.CSSProperties = {
  opacity: 0,
  transition: 'opacity 0.6s ease',
};

export default function ManifestoPage() {
  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).style.opacity = '1'; });
    }, { threshold: 0.08 });
    document.querySelectorAll('[data-fade]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <main style={{ maxWidth: '680px', margin: '0 auto', padding: '8rem 2rem 6rem' }}>

        {/* Section 1 — Hero */}
        <section style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '2rem' }}>
            A MANIFESTO
          </div>
          <h1 style={{
            fontFamily: 'Playfair Display, serif',
            fontSize: 'clamp(42px, 8vw, 72px)',
            fontWeight: 400, fontStyle: 'italic',
            lineHeight: 1.08, color: parchment,
            margin: '0 0 2rem',
            letterSpacing: '-0.01em',
          }}>
            We are building the wisdom layer.
          </h1>
          <p style={{
            fontFamily: 'Cormorant Garamond, serif',
            fontSize: '18px', lineHeight: 1.75, color: ivory85,
            maxWidth: '520px', margin: '0 auto',
          }}>
            Society of Explorers is the front door to a new economic system &mdash; one where ancient practice and emerging technology meet. The daily question is where it begins. It is not where it ends.
          </p>
          <div style={{ marginTop: '3rem' }}>
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '20px', color: gold, opacity: 0.4 }}>&darr;</span>
          </div>
        </section>

        <hr style={dividerStyle} />

        {/* Section 2 — The Lineage */}
        <section data-fade style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Where this comes from</h2>

          <p style={bodyStyle}>
            For more than a decade, a small group of researchers, cryptographers, and philosophers has been asking the same question from different directions: what would it look like to build technology that serves human flourishing instead of extracting from it?
          </p>

          <p style={bodyStyle}>
            The answer, slowly, has taken shape across several worlds. Out of MIT&rsquo;s work on personal data sovereignty came the idea that a person&rsquo;s information is not a corporate asset to be harvested, but a private infrastructure to be owned. Out of the early cryptocurrency movement came the machinery to make that ownership real &mdash; keys, signatures, programmable trust, money without middlemen.
          </p>

          <p style={pullStyle}>
            Bitcoin proved the foundation could hold. Ethereum proved the foundation could build. What was missing was the part that made it matter to a human life: a reason to participate that had nothing to do with speculation and everything to do with becoming.
          </p>

          <p style={bodyStyle}>
            Society of Explorers is what sits on top of that foundation. It is the wisdom layer. It is the part that knows why.
          </p>
        </section>

        <hr style={dividerStyle} />

        {/* Section 3 — The Practice */}
        <section data-fade style={sectionStyle}>
          <h2 style={sectionTitleStyle}>The daily question is a doorway</h2>

          <p style={bodyStyle}>
            Every morning, one question. You answer in 280 characters. You see how others answered. You build a streak.
          </p>

          <p style={pullStyle}>
            This sounds small. It is not.
          </p>

          <p style={bodyStyle}>
            The practice is the thing that grounds the system &mdash; the daily, honest, unhurried act of examining your own thinking. It is what separates this from every other crypto project that began with a token and never found a soul. The token comes later. The soul comes first.
          </p>

          <p style={bodyStyle}>
            A year of answering is a year of self-knowledge. Ten thousand people answering for a year is something no institution has ever possessed: a living record of how humans are actually thinking, not how they are performing on a feed.
          </p>
        </section>

        <hr style={dividerStyle} />

        {/* Section 4 — The Data Layer */}
        <section data-fade style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Your life is not their product</h2>

          <p style={bodyStyle}>
            The internet you grew up with was built on a simple trade: your attention and your data, in exchange for free tools. You were never the customer. You were the inventory.
          </p>

          <p style={bodyStyle}>
            We believe a different trade is possible. One where your data lives in a vault you control. Where you choose what to share, with whom, and for what. Where the value of your lived experience flows back to you &mdash; not as surveillance, but as sovereignty.
          </p>

          <p style={bodyStyle}>
            The tools to build this have existed for years. The cryptography is solved. The storage is solved. What has been missing is the connective tissue &mdash; the interface, the habit, the reason to show up.
          </p>

          <p style={pullStyle}>
            That is what the daily practice creates. Not a crypto product. A culture.
          </p>
        </section>

        <hr style={dividerStyle} />

        {/* Section 5 — The Economy */}
        <section data-fade style={sectionStyle}>
          <h2 style={sectionTitleStyle}>A voluntary marketplace of insight</h2>

          <p style={bodyStyle}>
            Inside Society of Explorers, over time, three things emerge together:
          </p>

          <ul style={{ listStyle: 'none', padding: 0, margin: '1.5rem 0' }}>
            {[
              {
                label: 'A PERSONAL DATA VAULT',
                body: 'Encrypted, portable, yours. Nothing leaves without your signature.',
              },
              {
                label: 'A VOLUNTARY MARKETPLACE',
                body: 'Researchers, institutions, and communities can request access to patterns across the network. You choose what to contribute, and you are compensated directly in $EXP for contributions you accept.',
              },
              {
                label: 'AN AI WISDOM LAYER',
                body: 'Your own AI companion that remembers your journey, learns how you think, and helps you act on what you learn in the real world.',
              },
            ].map(item => (
              <li key={item.label} style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, marginBottom: '0.5rem' }}>
                  {item.label}
                </div>
                <p style={{ ...bodyStyle, margin: 0 }}>{item.body}</p>
              </li>
            ))}
          </ul>

          <p style={pullStyle}>
            No pop-ups. No cookie banners. No dark patterns. Every exchange is explicit, reversible, and in your favor.
          </p>
        </section>

        <hr style={dividerStyle} />

        {/* Section 6 — The Token */}
        <section data-fade style={sectionStyle}>
          <h2 style={sectionTitleStyle}>$EXP is not a coin. It is a credit for showing up.</h2>

          <p style={bodyStyle}>
            $EXP is a utility token on Solana. It is not a speculative asset, and we will not pretend otherwise. Its value is practical: it records your participation, unlocks deeper experiences inside the Society, and compensates you when you contribute to the commons.
          </p>

          <p style={bodyStyle}>
            You earn $EXP by answering questions, joining salons, contributing insight, and choosing to share anonymized patterns with the research network. You spend it on gatherings, tools, matched conversations, and access to the wisdom layer at higher tiers.
          </p>

          <p style={pullStyle}>
            It is a circulatory system for attention and care. Nothing more, nothing less.
          </p>
        </section>

        <hr style={dividerStyle} />

        {/* Section 7 — The Invitation */}
        <section data-fade style={{ ...sectionStyle, textAlign: 'center' }}>
          <h2 style={sectionTitleStyle}>Begin where it begins</h2>

          <p style={bodyStyle}>
            Every large system starts with one honest act. For us, it is a question, answered truthfully, once a day.
          </p>

          <p style={{ ...pullStyle, marginBottom: '2.5rem' }}>
            If you can do that, you are already part of this.
          </p>

          <a
            href="/practice"
            style={{
              fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.2em',
              color: '#0a0a0a', background: gold, padding: '0 32px',
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
              height: '52px',
            }}
          >
            BEGIN THE DAILY PRACTICE &rarr;
          </a>

          <p style={{
            fontFamily: 'Cormorant Garamond, serif', fontSize: '14px',
            color: muted, fontStyle: 'italic', marginTop: '1rem', margin: '1rem 0 0',
          }}>
            One question. Every morning. Free. Forever.
          </p>
        </section>

      </main>

      <PublicFooter />
    </div>
  );
}
