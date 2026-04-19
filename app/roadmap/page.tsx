import type { Metadata } from 'next';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

export const metadata: Metadata = {
  title: 'Roadmap — Society of Explorers',
  description: 'What works today, what we are shipping next, and how you can participate. Honest status for every module.',
};

type Status = 'live' | 'progress' | 'next' | 'vision';

const BADGE: Record<Status, { label: string; color: string }> = {
  live:     { label: '🟢 LIVE',        color: '#4CAF50' },
  progress: { label: '🟡 IN PROGRESS', color: '#F0C050' },
  next:     { label: '🔵 NEXT',        color: '#4169E1' },
  vision:   { label: '⚪ VISION',      color: muted    },
};

function Badge({ status }: { status: Status }) {
  const b = BADGE[status];
  return (
    <span style={{
      fontFamily: 'Cinzel, serif',
      fontSize: '8px',
      letterSpacing: '0.18em',
      border: `1px solid ${b.color}66`,
      padding: '3px 8px',
      color: b.color,
      whiteSpace: 'nowrap',
      display: 'inline-block',
    }}>
      {b.label}
    </span>
  );
}

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: 'Cinzel, serif',
  fontSize: 'clamp(15px, 1.8vw, 18px)',
  fontWeight: 500,
  letterSpacing: '0.22em',
  color: gold,
  textAlign: 'center',
  marginBottom: '0.75rem',
  lineHeight: 1.4,
};

const subheadStyle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: 'clamp(20px, 3.5vw, 26px)',
  fontWeight: 400,
  fontStyle: 'italic',
  color: parchment,
  textAlign: 'center',
  lineHeight: 1.3,
  margin: '0 0 1rem',
};

const dividerStyle: React.CSSProperties = {
  width: '60px',
  height: '1px',
  background: `${gold}4d`,
  margin: '4rem auto',
  border: 'none',
};

const cardStyle: React.CSSProperties = {
  background: '#0d0d0d',
  border: `1px solid ${gold}22`,
  padding: '1.5rem',
};

const moduleCardStyle: React.CSSProperties = {
  ...cardStyle,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.6rem',
};

const moduleNameStyle: React.CSSProperties = {
  fontFamily: 'Cinzel, serif',
  fontSize: '12px',
  letterSpacing: '0.15em',
  color: gold,
};

const moduleBodyStyle: React.CSSProperties = {
  fontFamily: 'Cormorant Garamond, serif',
  fontSize: '16px',
  lineHeight: 1.7,
  color: ivory85,
  margin: 0,
};

const moduleLinkStyle: React.CSSProperties = {
  fontFamily: 'Cinzel, serif',
  fontSize: '9px',
  letterSpacing: '0.2em',
  color: gold,
  textDecoration: 'none',
  opacity: 0.8,
};

const MODULES: Array<{ name: string; status: Status; body: string; href?: string; linkLabel?: string }> = [
  {
    name: 'THE COUNCIL',
    status: 'progress',
    body: 'Six AI thinkers wired for streaming Council mode with 4-layer memory and verdict cards. Known gaps: no error boundaries, no rate-limiting for anonymous users. Working for signed-in members — expect rough edges.',
    href: '/council',
    linkLabel: 'VISIT /COUNCIL →',
  },
  {
    name: 'THE SALON (DIGITAL)',
    status: 'progress',
    body: 'Seven-week digital cohort UI is built — recruiting grid, in-salon graduation tracking, Daily.co video. Awaiting the first real cohort. No active salon running today.',
    href: '/salons',
    linkLabel: 'VISIT /SALONS →',
  },
  {
    name: 'THE GUILD',
    status: 'progress',
    body: 'The Guild dashboard renders your level and contribution stats. Level-progression math and rewards are not fully wired yet, so the numbers are directional, not definitive.',
    href: '/hall',
    linkLabel: 'VISIT /HALL →',
  },
  {
    name: 'DAILY PRACTICE',
    status: 'progress',
    body: 'One question per day, your streak, and a reflection card from the asking thinker. Stabilizing pending a database migration — expect occasional hiccups until it lands.',
    href: '/practice',
    linkLabel: 'VISIT /PRACTICE →',
  },
  {
    name: 'THE PHYSICAL SPACE — 92B SOUTH ST, BOSTON',
    status: 'vision',
    body: 'The storefront exists. Activation as a working salon space is still ahead of us.',
  },
];

const NEXT_ITEMS: Array<{ title: string; body: string }> = [
  { title: 'Daily Practice migration complete.', body: 'Reliable streaks, no response loss, cleaner reflection latency.' },
  { title: 'Matched Conversations.', body: 'AI-paired 1:1 exchanges once you hit a 7-response streak. Built but not yet serving real matches in production.' },
  { title: 'Live Weekly Council Sessions (Wed 8pm ET).', body: 'Real-time video where thinkers comment on the week\u2019s question.' },
  { title: '@AskTheCouncil on X.', body: 'Auto-post verdict cards to a public account so threads become discoverable.' },
  { title: 'Pricing restructure.', body: 'Explorer (free) / Seeker ($19) / Philosopher ($49) / Oracle ($499 lifetime). Updating copy across the site to match real infrastructure cost.' },
  { title: 'Decision-Making Archetype.', body: 'Computed after 5+ Council sessions — gives you a lens on how you actually decide.' },
  { title: 'Council Wrapped.', body: 'Monthly email summary of your conversations, insights, streak, and verdicts.' },
];

const VISION_ITEMS: Array<{ title: string; body: string }> = [
  { title: '92B South St activation.', body: 'Turning the storefront into a working physical salon in downtown Boston.' },
  { title: 'Consilience Protocol.', body: 'Multi-tenant DAO wizard — anyone can launch a citizen-science DAO with custom thinkers, governance, and treasury.' },
  { title: 'On-chain membership.', body: 'Soulbound ERC-721 + ERC-1155 achievements, HATS governance on Base, EAS attestations.' },
  { title: 'Explorer Node + TribeKey.', body: 'Hardware (Raspberry Pi 5 + Alfa mesh + security key) for sovereign identity and mesh participation.' },
  { title: 'SoE World mobile app.', body: 'LiDAR-scanned physical spaces, React Native, field contributions.' },
];

const TIERS: Array<{ id: string; name: string; price: string; period: string; featured: boolean; line: string }> = [
  { id: 'explorer',     name: 'Explorer',     price: 'Free',  period: '',           featured: false, line: 'Daily Practice + browse the Council. No commitment.' },
  { id: 'seeker',       name: 'Seeker',       price: '$19',   period: '/mo',        featured: true,  line: 'Unlimited Council + 7-week digital salon + matched conversations. Covers infrastructure.' },
  { id: 'philosopher',  name: 'Philosopher',  price: '$49',   period: '/mo',        featured: false, line: 'Seeker + Guide candidacy + priority salon placement + advanced memory.' },
  { id: 'oracle',       name: 'Oracle',       price: '$499',  period: ' lifetime',  featured: false, line: 'Founding member. All of the above, forever. Name on the 92B wall when it opens.' },
];

const PARTICIPATION: Array<{ label: string; body: string; cta: string; href: string }> = [
  { label: 'ANSWER THE DAILY QUESTION', body: 'The fastest way to shape the Council. One question a day, 280 characters.', cta: 'GO TO PRACTICE', href: '/practice' },
  { label: 'JOIN A SALON',              body: 'Seven weeks, seven people, three tracks. Graduates become Guides.',         cta: 'BROWSE SALONS',  href: '/salons' },
  { label: 'EMAIL THE FOUNDER',         body: 'Ideas, criticism, partnership, investment. No formality required.',         cta: 'CHRIS@SOCIETYOFEXPLORERS.COM', href: 'mailto:chris@societyofexplorers.com' },
  { label: 'CONTRIBUTE ON GITHUB',      body: 'The codebase is open source. PRs and issues welcome.',                       cta: 'OPEN REPO',      href: 'https://github.com/ChrisTaylor17/society-of-explorers' },
];

export default function RoadmapPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <main style={{ maxWidth: '760px', margin: '0 auto', padding: '8rem 2rem 6rem' }}>

        {/* Hero */}
        <header style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '11px',
            letterSpacing: '0.4em',
            color: gold,
            marginBottom: '1.5rem',
          }}>
            THE HONEST ROADMAP
          </div>
          <h1 style={{
            fontFamily: 'Playfair Display, serif',
            fontSize: 'clamp(28px, 5vw, 40px)',
            fontWeight: 400,
            fontStyle: 'italic',
            lineHeight: 1.2,
            color: parchment,
            margin: '0 0 1.5rem',
          }}>
            What&rsquo;s real. What&rsquo;s next. How you build with us.
          </h1>
          <p style={{
            fontFamily: 'Cormorant Garamond, serif',
            fontSize: '18px',
            color: ivory85,
            lineHeight: 1.7,
            maxWidth: '560px',
            margin: '0 auto 2rem',
          }}>
            We&rsquo;re not pretending. This page shows exactly what works today, what we&rsquo;re shipping next, and how you can participate.
          </p>
          <div style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '9px',
            letterSpacing: '0.3em',
            color: muted,
          }}>
            LAST UPDATED APRIL 19, 2026
          </div>
        </header>

        <hr style={dividerStyle} />

        {/* Section 1 — Live Today */}
        <section>
          <h2 style={sectionHeadingStyle}>1. LIVE TODAY 🟢</h2>
          <p style={{ ...subheadStyle }}>What actually works right now.</p>
          <p style={{
            fontFamily: 'Cormorant Garamond, serif',
            fontSize: '15px',
            fontStyle: 'italic',
            color: muted,
            textAlign: 'center',
            lineHeight: 1.6,
            maxWidth: '520px',
            margin: '0 auto 2.5rem',
          }}>
            Almost nothing is fully &ldquo;live&rdquo; yet. Here is exactly where every pillar stands.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {MODULES.map(m => (
              <div key={m.name} style={moduleCardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span style={moduleNameStyle}>{m.name}</span>
                  <Badge status={m.status} />
                </div>
                <p style={moduleBodyStyle}>{m.body}</p>
                {m.href && m.linkLabel && (
                  <a href={m.href} style={moduleLinkStyle}>{m.linkLabel}</a>
                )}
              </div>
            ))}
          </div>
        </section>

        <hr style={dividerStyle} />

        {/* Section 2 — Shipping Next */}
        <section>
          <h2 style={sectionHeadingStyle}>2. SHIPPING NEXT — 30–60 DAYS 🔵</h2>
          <p style={subheadStyle}>Built or in active development. Not live yet.</p>

          <ol style={{
            listStyle: 'none',
            counterReset: 'roadmap',
            padding: 0,
            margin: '2rem 0 0',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}>
            {NEXT_ITEMS.map((item, i) => (
              <li key={item.title} style={{
                ...cardStyle,
                display: 'grid',
                gridTemplateColumns: '32px 1fr',
                gap: '1rem',
                alignItems: 'start',
              }}>
                <span style={{
                  fontFamily: 'Playfair Display, serif',
                  fontSize: '22px',
                  color: gold,
                  lineHeight: 1,
                  opacity: 0.7,
                }}>{(i + 1).toString().padStart(2, '0')}</span>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.14em', color: parchment }}>
                      {item.title.toUpperCase()}
                    </span>
                    <Badge status="next" />
                  </div>
                  <p style={{ ...moduleBodyStyle, fontSize: '15px' }}>{item.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <hr style={dividerStyle} />

        {/* Section 3 — The Vision */}
        <section>
          <h2 style={sectionHeadingStyle}>3. THE VISION ⚪</h2>
          <p style={subheadStyle}>Not yet built. Direction, not promise.</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}>
            {VISION_ITEMS.map(v => (
              <div key={v.title} style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.14em', color: parchment }}>
                    {v.title.toUpperCase()}
                  </span>
                  <Badge status="vision" />
                </div>
                <p style={{ ...moduleBodyStyle, fontSize: '15px' }}>{v.body}</p>
              </div>
            ))}
          </div>
        </section>

        <hr style={dividerStyle} />

        {/* Section 4 — Four Ways In */}
        <section>
          <h2 style={sectionHeadingStyle}>4. FOUR WAYS IN</h2>
          <p style={subheadStyle}>Honest pricing. No tricks.</p>

          <div style={{
            marginTop: '2rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1px',
            background: `${gold}10`,
          }}>
            {TIERS.map(t => (
              <div key={t.id} style={{
                background: '#0d0d0d',
                padding: '2rem 1.5rem',
                border: t.featured ? `2px solid ${gold}` : `1px solid rgba(201,168,76,0.15)`,
                display: 'flex',
                flexDirection: 'column',
              }}>
                {t.featured && (
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: gold, textAlign: 'center', marginBottom: '0.75rem' }}>
                    MOST POPULAR
                  </div>
                )}
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.12em', color: gold, marginBottom: '0.5rem' }}>
                  {t.name.toUpperCase()}
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <span style={{ fontFamily: 'Playfair Display, serif', fontSize: '36px', color: parchment }}>{t.price}</span>
                  {t.period && <span style={{ fontSize: '14px', color: muted }}>{t.period}</span>}
                </div>
                <p style={{
                  fontFamily: 'Cormorant Garamond, serif',
                  fontSize: '14px',
                  lineHeight: 1.6,
                  color: muted,
                  flex: 1,
                  margin: '0 0 1.5rem',
                }}>{t.line}</p>
                <a href={`/join#${t.id}`} style={{
                  fontFamily: 'Cinzel, serif',
                  fontSize: '10px',
                  letterSpacing: '0.15em',
                  color: '#0a0a0a',
                  background: gold,
                  textDecoration: 'none',
                  textAlign: 'center',
                  display: 'inline-block',
                  padding: '14px 0',
                }}>
                  {t.id === 'explorer' ? 'START FREE' : `CHOOSE ${t.name.toUpperCase()}`}
                </a>
              </div>
            ))}
          </div>
        </section>

        <hr style={dividerStyle} />

        {/* Section 5 — Help Us Build */}
        <section>
          <h2 style={sectionHeadingStyle}>5. HELP US BUILD</h2>
          <p style={subheadStyle}>Four concrete paths. Pick any.</p>

          <div style={{
            marginTop: '2rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '1rem',
          }}>
            {PARTICIPATION.map(p => (
              <div key={p.label} style={{
                ...cardStyle,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: gold }}>
                  {p.label}
                </span>
                <p style={{ ...moduleBodyStyle, fontSize: '15px', flex: 1 }}>{p.body}</p>
                <a
                  href={p.href}
                  target={p.href.startsWith('http') ? '_blank' : undefined}
                  rel={p.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                  style={{
                    fontFamily: 'Cinzel, serif',
                    fontSize: '10px',
                    letterSpacing: '0.15em',
                    color: gold,
                    border: `1px solid ${gold}44`,
                    padding: '10px 18px',
                    textDecoration: 'none',
                    textAlign: 'center',
                    alignSelf: 'flex-start',
                  }}
                >
                  {p.cta}
                </a>
              </div>
            ))}
          </div>
        </section>

        <hr style={dividerStyle} />

        <p style={{
          fontFamily: 'Cormorant Garamond, serif',
          fontSize: '15px',
          fontStyle: 'italic',
          color: muted,
          textAlign: 'center',
          margin: 0,
        }}>
          If something on this page becomes untrue, tell us. chris@societyofexplorers.com
        </p>

      </main>

      <PublicFooter />
    </div>
  );
}
