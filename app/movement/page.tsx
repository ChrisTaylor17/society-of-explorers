import type { Metadata } from 'next';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#888';
const card = '#0d0d0d';
const border = '1px solid rgba(201,168,76,0.15)';

export const metadata: Metadata = {
  title: 'The Explorer Movement - Society of Explorers',
  description:
    'A truth-seeking creator stack that turns daily philosophical practice into a sovereign collective signal.',
};

const pillars = [
  {
    label: 'CONTENT',
    title: 'Videos that begin with a real question.',
    body:
      'Short-form prompts bring new explorers into a daily ritual instead of another feed designed to keep them scrolling.',
  },
  {
    label: 'PRACTICE',
    title: 'One answer, owned by the person who wrote it.',
    body:
      'The daily question remains the front door: 280 characters, private by default, and eventually carried in an encrypted personal pod.',
  },
  {
    label: 'PULSE',
    title: 'A collective signal without exposing the individual.',
    body:
      'Anonymized themes help the community see consensus, divergence, and the next questions worth asking together.',
  },
];

export default function MovementPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        color: parchment,
        fontFamily: 'Cormorant Garamond, serif',
      }}
    >
      <PublicNav />

      <main>
        <section style={{ padding: '8rem 2rem 4rem', textAlign: 'center' }}>
          <div style={{ maxWidth: '760px', margin: '0 auto' }}>
            <div
              style={{
                fontFamily: 'Cinzel, serif',
                fontSize: '10px',
                letterSpacing: '0.3em',
                color: gold,
                marginBottom: '1.5rem',
              }}
            >
              THE EXPLORER MOVEMENT
            </div>
            <h1
              style={{
                fontFamily: 'Playfair Display, serif',
                fontSize: 'clamp(34px, 7vw, 64px)',
                fontWeight: 400,
                fontStyle: 'italic',
                lineHeight: 1.12,
                color: parchment,
                margin: '0 auto 1.5rem',
                maxWidth: '760px',
              }}
            >
              A truth-seeking practice with a global signal.
            </h1>
            <p
              style={{
                fontFamily: 'Cormorant Garamond, serif',
                fontSize: '19px',
                lineHeight: 1.75,
                color: ivory85,
                maxWidth: '610px',
                margin: '0 auto 2.5rem',
              }}
            >
              Society of Explorers begins with a daily question. The Movement is the surrounding
              ecosystem: sovereign data, human practice, creator feedback, and a community learning
              how to think in public without giving itself away.
            </p>
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '0.75rem',
                flexWrap: 'wrap',
              }}
            >
              <a
                href="/practice"
                style={{
                  fontFamily: 'Cinzel, serif',
                  fontSize: '11px',
                  letterSpacing: '0.2em',
                  color: '#0a0a0a',
                  background: gold,
                  padding: '0 28px',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: '52px',
                }}
              >
                TODAY&apos;S QUESTION &rarr;
              </a>
              <a
                href="/movement/pod"
                style={{
                  fontFamily: 'Cinzel, serif',
                  fontSize: '11px',
                  letterSpacing: '0.2em',
                  color: gold,
                  border,
                  padding: '0 24px',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: '52px',
                  background: 'rgba(13,13,13,0.72)',
                }}
              >
                YOUR DATA POD
              </a>
            </div>
          </div>
        </section>

        <section style={{ padding: '1rem 2rem 5rem' }}>
          <div
            style={{
              maxWidth: '980px',
              margin: '0 auto',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
            }}
          >
            {pillars.map((pillar) => (
              <article
                key={pillar.label}
                style={{
                  background: card,
                  border,
                  padding: '1.5rem',
                  minHeight: '230px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '1.25rem',
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: 'Cinzel, serif',
                      fontSize: '9px',
                      letterSpacing: '0.24em',
                      color: gold,
                      marginBottom: '1rem',
                    }}
                  >
                    {pillar.label}
                  </div>
                  <h2
                    style={{
                      fontFamily: 'Playfair Display, serif',
                      fontSize: 'clamp(22px, 3vw, 28px)',
                      fontWeight: 400,
                      lineHeight: 1.2,
                      color: parchment,
                      margin: 0,
                    }}
                  >
                    {pillar.title}
                  </h2>
                </div>
                <p
                  style={{
                    fontFamily: 'Cormorant Garamond, serif',
                    fontSize: '16px',
                    lineHeight: 1.7,
                    color: ivory85,
                    margin: 0,
                  }}
                >
                  {pillar.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section style={{ padding: '0 2rem 6rem' }}>
          <div
            style={{
              maxWidth: '700px',
              margin: '0 auto',
              borderTop: border,
              paddingTop: '3rem',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: 'Cinzel, serif',
                fontSize: '9px',
                letterSpacing: '0.28em',
                color: gold,
                marginBottom: '1rem',
              }}
            >
              THE LOOP
            </div>
            <p
              style={{
                fontFamily: 'Cormorant Garamond, serif',
                fontSize: '18px',
                lineHeight: 1.8,
                color: muted,
                margin: 0,
              }}
            >
              A question becomes a video. A response becomes owned memory. Many responses become
              an anonymized pulse. The pulse shapes the next question, and the community gets
              sharper without surrendering the private lives of its members.
            </p>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
