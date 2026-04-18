import type { Metadata } from 'next';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { MANIFESTO_SECTIONS, FOUNDER_SIGNATURE } from '@/lib/manifesto';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

export const metadata: Metadata = {
  title: 'The Manifesto — Society of Explorers',
  description: 'Bitcoin as foundation. Ethereum as proof-of-concept. Society of Explorers as the engine. A manifesto for sovereign minds in a transitional age.',
};

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: 'Cinzel, serif',
  fontSize: 'clamp(15px, 1.8vw, 18px)',
  fontWeight: 500,
  letterSpacing: '0.22em',
  color: gold,
  textAlign: 'center',
  marginBottom: '2rem',
  lineHeight: 1.4,
};

const bodyStyle: React.CSSProperties = {
  fontFamily: 'Cormorant Garamond, serif',
  fontSize: '18px',
  lineHeight: 1.85,
  color: ivory85,
  margin: '0 0 1.25rem',
};

const dividerStyle: React.CSSProperties = {
  width: '60px',
  height: '1px',
  background: `${gold}4d`,
  margin: '5rem auto',
  border: 'none',
};

export default function ManifestoPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <main style={{ maxWidth: '680px', margin: '0 auto', padding: '8rem 2rem 6rem' }}>

        {/* Page header */}
        <header style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <div style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '11px',
            letterSpacing: '0.4em',
            color: gold,
            marginBottom: '1.25rem',
          }}>
            THE MANIFESTO
          </div>
          <p style={{
            fontFamily: 'Cormorant Garamond, serif',
            fontSize: '18px',
            fontStyle: 'italic',
            color: muted,
            margin: 0,
            lineHeight: 1.6,
          }}>
            What we are building, and why it matters now.
          </p>
        </header>

        <hr style={dividerStyle} />

        {/* Seven sections */}
        {MANIFESTO_SECTIONS.map((section, i) => (
          <section key={section.numeral}>
            <h2 style={sectionHeadingStyle}>
              {section.numeral}. {section.title.toUpperCase()}
            </h2>
            {section.paragraphs.map((p, j) => (
              <p key={j} style={bodyStyle}>{p}</p>
            ))}
            {i < MANIFESTO_SECTIONS.length - 1 && <hr style={dividerStyle} />}
          </section>
        ))}

        {/* Founder signature */}
        <p style={{
          fontFamily: 'Cormorant Garamond, serif',
          fontSize: '16px',
          fontStyle: 'italic',
          color: muted,
          textAlign: 'right',
          marginTop: '3rem',
          marginBottom: 0,
        }}>
          {FOUNDER_SIGNATURE}
        </p>

      </main>

      <PublicFooter />
    </div>
  );
}
