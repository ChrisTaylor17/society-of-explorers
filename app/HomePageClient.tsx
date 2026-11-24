'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import FellowshipInvitation from '@/components/FellowshipInvitation';
import { track } from '@/lib/analytics/client';
import { ONLINE_CIRCLES_HREF } from '@/lib/circles/discovery';
import { fetchPulse, type PulseQuestion } from '@/lib/feed/pulseClient';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

const THINKER_NAMES: Record<string, string> = {
  socrates: 'Socrates', plato: 'Plato', aurelius: 'Marcus Aurelius',
  nietzsche: 'Nietzsche', einstein: 'Einstein', jobs: 'Steve Jobs',
};
const THINKER_COLORS: Record<string, string> = {
  socrates: '#C9A94E', plato: '#7B68EE', aurelius: '#8B7355',
  nietzsche: '#DC143C', einstein: '#4169E1', jobs: '#A0A0A0',
};
const THINKER_AVATARS: Record<string, string> = {
  socrates: 'SO', plato: 'PL', aurelius: 'MA',
  nietzsche: 'FN', einstein: 'AE', jobs: 'SJ',
};

const PROMPT_ATLAS_URL = 'https://prompts-mvp.vercel.app';

export default function HomePage() {
  const [question, setQuestion] = useState<PulseQuestion | null>(null);

  useEffect(() => {
    if (!window.location.hash) window.scrollTo(0, 0);
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  }, []);

  // Preview the latest published question without creating a new one.
  useEffect(() => {
    let current = true;
    void fetchPulse().then(result => { if (current && result.ok) setQuestion(result.data.todayQuestion); });
    return () => { current = false; };
  }, []);

  const tId = question?.thinker_id || '';
  const tName = THINKER_NAMES[tId] || '';
  const tColor = THINKER_COLORS[tId] || gold;
  const tAvatar = THINKER_AVATARS[tId] || '??';

  return <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
    <a href="#main" className="soe-skip-link">Skip to content</a>
    <PublicNav />

    <main id="main" tabIndex={-1}>
      {/* HERO */}
      <section style={{ minHeight: 'calc(100vh - 56px)', padding: '8rem 2rem 4rem', textAlign: 'center', display: 'flex', alignItems: 'center' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1.5rem' }}>
            SOCIETY OF EXPLORERS
          </div>
          <h1 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 'clamp(40px, 7vw, 72px)', fontWeight: 400, fontStyle: 'italic', lineHeight: 1.05, marginBottom: '1.5rem', color: parchment }}>
            Read together. Meet online.
          </h1>
          <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '20px', color: ivory85, lineHeight: 1.7, maxWidth: '640px', margin: '0 auto 2.5rem' }}>
            Monthly online salons on the great books, open to any belief or none. We read one book, put its hardest question to an AI Socrates, with Mira Vale, our AI tutor, asking the questions, then argue it out ourselves. December 3, 7 PM Eastern, 12 seats, three 20-minute rounds. Members also meet twice a month.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <a href="https://www.societyofexplorers.com/salons" style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.2em', color: '#0a0a0a', background: gold, padding: '0 24px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '52px' }}>
              NEXT: PLATO&rsquo;S REPUBLIC, DEC 3
            </a>
            <Link href="/great-books/republic/seminar" prefetch={false} style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.2em', color: gold, border: `1px solid ${gold}66`, padding: '0 24px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '52px' }}>
              ASK THE AI SOCRATES · FREE
            </Link>
          </div>
          <p style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: muted, lineHeight: 1.8, margin: '1.25rem auto 0', maxWidth: '620px' }}>
            Start with free readings and a salon plan. No account or payment is needed to explore them. A separate Christian fellowship meets here too, for those who want it.
          </p>
        </div>
      </section>

      <FellowshipInvitation />

      {/* LATEST PUBLISHED QUESTION */}
      {question && (
        <section style={{ padding: '2rem 2rem 3rem' }}>
          <div style={{ maxWidth: '560px', margin: '0 auto', background: '#0d0d0d', border: `1px solid ${gold}22`, padding: '2rem 1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '1rem' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: `${tColor}18`, border: `1.5px solid ${tColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '9px', color: tColor }}>
                {tAvatar}
              </div>
              <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: tColor }}>
                {tName ? `A QUESTION FROM ${tName.toUpperCase()}` : 'LATEST PUBLISHED QUESTION'}
              </span>
            </div>
            <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 'clamp(20px, 3.5vw, 26px)', fontWeight: 400, fontStyle: 'italic', lineHeight: 1.5, color: parchment, textAlign: 'center', margin: 0, marginBottom: '1.75rem' }}>
              &ldquo;{question.question_text}&rdquo;
            </p>
            <div style={{ textAlign: 'center' }}>
              <a href="/practice" onClick={() => track('cta_click', { cta: 'daily_question_respond' })} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, border: `1px solid ${gold}66`, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '44px' }}>
                OPEN THE DAILY PRACTICE &rarr;
              </a>
            </div>
          </div>
        </section>
      )}

      <section aria-labelledby="apology-guide" style={{ padding: '3rem 2rem 5rem' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto', textAlign: 'center' }}>
          <p style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: gold, marginBottom: '0.75rem' }}>A QUESTION FOR YOUR SALON</p>
          <h2 id="apology-guide" style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 400, color: parchment, marginBottom: '0.75rem' }}>
            What does it mean to examine your life?
          </h2>
          <p style={{ fontSize: '18px', color: ivory85, lineHeight: 1.7, marginBottom: '1.25rem' }}>
            In Plato’s <em>Apology</em>, Socrates defends the habit of questioning what we think we know.
            What would that habit look like in your own life?
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px' }}>
            <Link href="/circles/path/2" prefetch={false} style={{ color: gold, display: 'inline-flex', alignItems: 'center', minHeight: '44px' }}>
              Open the Apology discussion guide
            </Link>
            <Link href={ONLINE_CIRCLES_HREF} prefetch={false} style={{ color: gold, display: 'inline-flex', alignItems: 'center', minHeight: '44px' }}>
              Find a salon online
            </Link>
          </div>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section style={{ padding: '2rem 2rem 6rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '440px', margin: '0 auto' }}>
          <div style={{ width: '60px', height: '1px', background: `${gold}4d`, margin: '0 auto 2rem' }} />
          <h2 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 'clamp(24px, 4vw, 28px)', fontWeight: 400, fontStyle: 'italic', color: parchment, marginBottom: '0.5rem' }}>Start your practice.</h2>
          <p style={{ fontSize: '15px', color: muted, marginBottom: '1.75rem' }}>Free. One question. Every morning.</p>
          <a href="/practice" onClick={() => track('cta_click', { cta: 'footer_todays_question' })} style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.2em', color: '#0a0a0a', background: gold, padding: '0 32px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '52px' }}>TODAY&apos;S QUESTION &rarr;</a>
          <p style={{ fontSize: '15px', color: muted, marginTop: '1.75rem' }}>Explore the separate <a href={PROMPT_ATLAS_URL} style={{ color: gold }} onClick={() => track('cta_click', { cta: 'footer_prompt_atlas' })}>Prompt Atlas workspace</a> or <a href={`${PROMPT_ATLAS_URL}/p/create-a-one-page-business`} style={{ color: gold }} onClick={() => track('cta_click', { cta: 'footer_public_prompt' })}>view a public prompt</a>.</p>
        </div>
      </section>

    </main>
    <PublicFooter />
  </div>;
}
