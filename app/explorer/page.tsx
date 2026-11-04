import type { Metadata } from 'next';
import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { THINKER_GUIDES } from '@/lib/explorer/directory';
import { SHARE_OG_IMAGES, SHARE_TWITTER_IMAGES } from '@/lib/site/shareCard';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

const description =
  'The six AI thinker guides behind the daily question, and how explorer profiles work. AI personas, not real people.';

export const metadata: Metadata = {
  title: 'Explorers & Thinkers',
  description,
  openGraph: {
    title: 'Explorers & Thinkers — Society of Explorers',
    description,
    siteName: 'Society of Explorers',
    type: 'website',
    images: SHARE_OG_IMAGES,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Explorers & Thinkers — Society of Explorers',
    description,
    images: SHARE_TWITTER_IMAGES,
  },
};

const label: React.CSSProperties = {
  fontFamily: 'Cinzel, serif',
  fontSize: '12px',
  letterSpacing: '0.2em',
  color: gold,
  textTransform: 'uppercase',
};

const button: React.CSSProperties = {
  fontFamily: 'Cinzel, serif',
  fontSize: '13px',
  letterSpacing: '0.15em',
  padding: '12px 22px',
  border: `1px solid ${gold}`,
  color: gold,
  textDecoration: 'none',
  display: 'inline-block',
};

export default function ExplorerIndexPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />
      <main id="main" style={{ maxWidth: '760px', margin: '0 auto', padding: '8rem 1.5rem 6rem' }}>
        <p style={label}>Explorers</p>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(28px, 5vw, 40px)', fontWeight: 400, margin: '0.5rem 0 1rem', color: parchment }}>
          Explorers &amp; Thinkers
        </h1>
        <p style={{ fontSize: '19px', lineHeight: 1.6, color: ivory85, margin: '0 0 2.5rem' }}>
          Every day one of six thinker guides asks the community a question on the{' '}
          <Link href="/practice" style={{ color: gold }}>Daily Practice</Link>. Explorers answer it, and their
          reflections appear on the <Link href="/feed" style={{ color: gold }}>Live Feed</Link>.
        </p>

        <section aria-labelledby="thinkers-heading">
          <h2 id="thinkers-heading" style={{ ...label, fontSize: '13px', margin: '0 0 0.75rem' }}>The thinker guides</h2>
          <p
            role="note"
            style={{ fontSize: '16px', lineHeight: 1.55, color: ivory85, border: `1px solid ${gold}4d`, background: '#0d0d0d', padding: '12px 16px', margin: '0 0 1.5rem' }}
          >
            <strong style={{ color: parchment }}>These are AI personas</strong>, inspired by historical figures and
            written by Society of Explorers. They are not the real people, not members, and nothing they say is a
            real quotation unless it is cited.
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {THINKER_GUIDES.map((t) => (
              <li
                key={t.id}
                style={{ background: '#0d0d0d', border: `1px solid ${t.color}40`, padding: '16px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                    border: `1px solid ${t.color}`, color: t.color, background: `${t.color}1a`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'Cinzel, serif', fontSize: '13px', fontWeight: 600,
                  }}
                >
                  {t.initials}
                </span>
                <div>
                  <h3 style={{ fontFamily: 'Cinzel, serif', fontSize: '16px', fontWeight: 400, margin: 0, color: t.color }}>{t.name}</h3>
                  <p style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.1em', color: muted, margin: '2px 0 8px' }}>
                    AI guide · {t.era}
                  </p>
                  <p style={{ fontSize: '17px', lineHeight: 1.45, color: ivory85, margin: 0 }}>{t.lens}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="members-heading" style={{ marginTop: '3rem' }}>
          <h2 id="members-heading" style={{ ...label, fontSize: '13px', margin: '0 0 0.75rem' }}>Explorer profiles</h2>
          <p style={{ fontSize: '18px', lineHeight: 1.6, color: ivory85, margin: '0 0 1rem' }}>
            Each member has a profile page with their practice streak and recent reflections. We don&rsquo;t publish a
            directory of members: a profile is only reached through its own link, which the explorer chooses to share.
          </p>
          <p style={{ fontSize: '18px', lineHeight: 1.6, color: ivory85, margin: '0 0 2rem' }}>
            To see what explorers are thinking right now, read the Live Feed. To get a profile of your own, answer
            today&rsquo;s question.
          </p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Link href="/practice" style={{ ...button, background: gold, color: '#0a0a0a' }}>Answer today&rsquo;s question</Link>
            <Link href="/feed" style={button}>Read the Live Feed</Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
