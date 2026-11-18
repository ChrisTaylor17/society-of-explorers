'use client';
import { useState, useEffect } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

interface City { name: string; proposalCount: number; supportCount: number; totalSupport: number; }

const FEATURES = [
  { title: 'AI Thinker Stations', body: 'Walk up, sit down, engage Socrates or Nietzsche. Persistent memory. They remember you.' },
  { title: 'Great Books Library', body: 'Curated collection. Weekly reading groups. Annotated editions.' },
  { title: 'Music Therapy Chamber', body: 'Brainwave-tuned soundscapes. Muse S EEG. Sound as philosophy.' },
  { title: 'Council Mode Lounge', body: 'Group debates with multiple thinkers. Projected on screens.' },
];

const TIMELINE = [
  { num: 1, title: 'Propose', desc: 'Submit your city with a compelling case' },
  { num: 2, title: 'Rally', desc: 'Share the link. Get 50 supporters to trigger the planning phase' },
  { num: 3, title: 'Plan', desc: 'SoE team evaluates locations, costs, and local partnerships' },
  { num: 4, title: 'Fund', desc: 'Launch a funding campaign (like 92B Boston)' },
  { num: 5, title: 'Open', desc: 'Grand opening with founding supporters as VIP guests' },
];

export default function SalonsPage() {
  const [cities, setCities] = useState<City[]>([]);
  const [bostonProgress, setBostonProgress] = useState({ totalRaised: 0, backerCount: 0, goal: 120000 });

  // Propose form
  const [pCity, setPCity] = useState('');
  const [pName, setPName] = useState('');
  const [pEmail, setPEmail] = useState('');
  const [pWhy, setPWhy] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [proposedCity, setProposedCity] = useState('');

  // Support form (from URL param)
  const [supportCity, setSupportCity] = useState('');
  const [sName, setSName] = useState('');
  const [sEmail, setSEmail] = useState('');
  const [sSubmitting, setSSubmitting] = useState(false);
  const [sSubmitted, setSSubmitted] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).style.opacity = '1'; });
    }, { threshold: 0.1 });
    document.querySelectorAll('[data-fade]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [cities]);

  useEffect(() => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      document.querySelectorAll<HTMLElement>('[data-parallax]').forEach(el => {
        el.style.backgroundAttachment = 'scroll';
      });
    }
  }, []);

  useEffect(() => {
    fetch('/api/salons/cities').then(r => r.json()).then(d => setCities(d.cities || [])).catch(() => {});
    fetch('/api/92b/progress').then(r => r.json()).then(d => setBostonProgress(d)).catch(() => {});

    // Check for ?support=CityName
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const city = params.get('support');
      if (city) {
        setSupportCity(decodeURIComponent(city));
        setTimeout(() => {
          document.getElementById('support-city')?.scrollIntoView({ behavior: 'smooth' });
        }, 500);
      }
    }
  }, []);

  async function handlePropose(e: React.FormEvent) {
    e.preventDefault();
    if (!pCity.trim() || !pName.trim() || !pEmail.trim()) return;
    setSubmitting(true);
    try {
      await fetch('/api/salons/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: pCity.trim(), name: pName.trim(), email: pEmail.trim(), why: pWhy.trim() }),
      });
      setProposedCity(pCity.trim());
      setSubmitted(true);
    } catch {}
    setSubmitting(false);
  }

  async function handleSupport(e: React.FormEvent) {
    e.preventDefault();
    if (!sName.trim() || !sEmail.trim() || !supportCity) return;
    setSSubmitting(true);
    try {
      await fetch('/api/salons/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: supportCity, name: sName.trim(), email: sEmail.trim() }),
      });
      setSSubmitted(true);
    } catch {}
    setSSubmitting(false);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#111', border: `1px solid ${gold}22`, padding: '14px 16px',
    fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: parchment,
    outline: 'none', boxSizing: 'border-box',
  };

  const maxSupport = cities.length > 0 ? cities[0].totalSupport : 1;
  const bostonPct = bostonProgress.goal > 0 ? Math.min((bostonProgress.totalRaised / bostonProgress.goal) * 100, 100) : 0;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {/* ═══ SUPPORT BANNER ═══ */}
      {supportCity && !sSubmitted && (
        <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, zIndex: 190, padding: '12px 2rem', background: `linear-gradient(90deg, rgba(201,168,76,0.15), rgba(201,168,76,0.08))`, borderBottom: `1px solid ${gold}33`, textAlign: 'center' }}>
          <span style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold }}>
            Support {supportCity} for a Society of Explorers salon!
          </span>
        </div>
      )}

      {/* ═══ HERO ═══ */}
      <section
        data-parallax
        style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: supportCity ? '10rem 2rem 6rem' : '8rem 2rem 6rem', position: 'relative',
          backgroundImage: 'linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url("/images/hero-guild.jpeg")',
          backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed',
        }}
      >
        <div style={{ maxWidth: '720px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1.5rem' }}>GLOBAL SALONS</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(36px, 7vw, 56px)', fontWeight: 400, lineHeight: 1.15, marginBottom: '1.5rem', color: parchment }}>
            The Renaissance spreads.
          </h1>
          <p style={{ fontSize: '20px', color: ivory85, lineHeight: 1.8, maxWidth: '620px', margin: '0 auto 2.5rem' }}>
            92B South St Boston is the first. Your city could be next. Propose a location, rally supporters, and help us bring the salon experience worldwide.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="#propose" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px', borderRadius: 0 }}>PROPOSE YOUR CITY</a>
            <a href="/92b" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: gold, background: 'transparent', border: `1px solid ${gold}`, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px', borderRadius: 0 }}>VIEW BOSTON FLAGSHIP</a>
          </div>
        </div>
      </section>

      {/* ═══ CITY LEADERBOARD ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0a0a0a', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '0.75rem' }}>WHERE SHOULD WE BUILD NEXT?</div>
          </div>

          {cities.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', border: `1px solid ${gold}15` }}>
              <p style={{ fontSize: '18px', color: muted, fontStyle: 'italic' }}>No proposals yet. Be the first.</p>
              <a href="#propose" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: gold, textDecoration: 'none', display: 'inline-block', marginTop: '1rem' }}>PROPOSE A CITY &rarr;</a>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {cities.map((city, i) => {
                const barPct = maxSupport > 0 ? (city.totalSupport / maxSupport) * 100 : 0;
                return (
                  <div key={city.name} style={{ background: '#0d0d0d', padding: '1.5rem 2rem', border: `1px solid rgba(201,168,76,0.15)` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {i === 0 && <span style={{ color: gold, fontSize: '14px' }}>&#9733;</span>}
                        <span style={{ fontFamily: 'Playfair Display, serif', fontSize: '22px', color: parchment }}>{city.name}</span>
                      </div>
                      <span style={{ fontSize: '14px', color: muted }}>{city.totalSupport} supporter{city.totalSupport !== 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ height: '4px', background: '#1a1a1a', borderRadius: '2px', overflow: 'hidden', marginBottom: '0.75rem' }}>
                      <div style={{ height: '100%', width: `${barPct}%`, background: gold, borderRadius: '2px' }} />
                    </div>
                    <button
                      onClick={() => { setSupportCity(city.name); setTimeout(() => document.getElementById('support-city')?.scrollIntoView({ behavior: 'smooth' }), 100); }}
                      style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: gold, background: 'transparent', border: `1px solid ${gold}44`, padding: '6px 16px', cursor: 'pointer', borderRadius: 0 }}
                    >
                      SUPPORT THIS CITY
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <p style={{ fontSize: '14px', color: muted, textAlign: 'center', marginTop: '1.5rem' }}>
            Cities with 50+ supporters move to the planning phase.
          </p>
        </div>
      </section>

      {/* ═══ SUPPORT FORM ═══ */}
      {supportCity && (
        <section id="support-city" data-fade style={{ padding: '4rem 2rem', background: '#0d0d0d', opacity: 0, transition: 'opacity 0.9s ease' }}>
          <div style={{ maxWidth: '420px', margin: '0 auto', textAlign: 'center' }}>
            {sSubmitted ? (
              <div style={{ padding: '2rem', border: `1px solid ${gold}33`, background: `${gold}08` }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold, marginBottom: '0.75rem' }}>SUPPORT RECORDED</div>
                <p style={{ fontSize: '16px', color: ivory85, lineHeight: 1.7 }}>You're supporting {supportCity}! Share the link to rally more supporters.</p>
              </div>
            ) : (
              <>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>SUPPORT {supportCity.toUpperCase()}</div>
                <form onSubmit={handleSupport} style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' }}>
                  <input value={sName} onChange={e => setSName(e.target.value)} placeholder="Your name" required style={inputStyle} />
                  <input value={sEmail} onChange={e => setSEmail(e.target.value)} placeholder="Your email" type="email" required style={inputStyle} />
                  <button type="submit" disabled={sSubmitting} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, border: 'none', height: '48px', cursor: 'pointer', opacity: sSubmitting ? 0.5 : 1, borderRadius: 0 }}>
                    {sSubmitting ? 'SUBMITTING...' : `SUPPORT ${supportCity.toUpperCase()}`}
                  </button>
                </form>
              </>
            )}
          </div>
        </section>
      )}

      {/* ═══ BOSTON FLAGSHIP ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: supportCity ? '#0a0a0a' : '#0d0d0d', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold }}>THE FLAGSHIP</div>
          </div>
          <a href="/92b" style={{ textDecoration: 'none', display: 'block', background: '#0d0d0d', border: `1px solid rgba(201,168,76,0.15)`, padding: '2rem' }}>
            <h3 style={{ fontFamily: 'Playfair Display, serif', fontSize: '24px', fontWeight: 400, color: parchment, marginBottom: '1rem' }}>92B South St, Boston</h3>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: '#4CAF50', border: '1px solid #4CAF5044', padding: '3px 8px', borderRadius: '10px' }}>LEASE: SIGNED</span>
              <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: '#FFA726', border: '1px solid #FFA72644', padding: '3px 8px', borderRadius: '10px' }}>CONSTRUCTION: IN PROGRESS</span>
            </div>
            <div style={{ height: '6px', background: '#1a1a1a', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.5rem' }}>
              <div style={{ height: '100%', width: `${bostonPct}%`, background: gold, borderRadius: '3px' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: muted, marginBottom: '1.25rem' }}>
              <span>${bostonProgress.totalRaised.toLocaleString()} raised</span>
              <span>${bostonProgress.goal.toLocaleString()} goal</span>
            </div>
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: gold }}>VIEW FULL DETAILS &rarr;</span>
          </a>
        </div>
      </section>

      {/* ═══ EVERY SALON FEATURES ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0a0a0a', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold }}>EVERY SALON FEATURES</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1px', background: `${gold}10` }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ background: '#0d0d0d', padding: '2rem', border: `1px solid rgba(201,168,76,0.15)` }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold, marginBottom: '0.75rem' }}>{f.title.toUpperCase()}</div>
                <p style={{ fontSize: '16px', color: muted, lineHeight: 1.7 }}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ PROPOSE YOUR CITY ═══ */}
      <section id="propose" data-fade style={{ padding: '6rem 2rem', background: '#0d0d0d', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>PROPOSE YOUR CITY</div>
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 400, color: parchment, marginBottom: '2rem', lineHeight: 1.3 }}>
            Where should the next salon be?
          </h2>

          {submitted ? (
            <div>
              <div style={{ padding: '2rem', border: `1px solid ${gold}33`, background: `${gold}08`, marginBottom: '1.5rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold, marginBottom: '0.75rem' }}>PROPOSAL RECORDED</div>
                <p style={{ fontSize: '16px', color: ivory85, lineHeight: 1.7, marginBottom: '1rem' }}>
                  Your city has been proposed! Rally supporters to move it up the leaderboard.
                </p>
                <div style={{ fontSize: '14px', color: muted, marginBottom: '0.5rem' }}>Share this link:</div>
                <div
                  onClick={() => { navigator.clipboard.writeText(`https://www.societyofexplorers.com/salons?support=${encodeURIComponent(proposedCity)}`); }}
                  style={{ background: '#111', border: `1px solid ${gold}22`, padding: '10px 14px', cursor: 'pointer', fontSize: '13px', color: gold, wordBreak: 'break-all', fontFamily: 'monospace' }}
                >
                  societyofexplorers.com/salons?support={encodeURIComponent(proposedCity)}
                  <span style={{ fontSize: '11px', color: muted, display: 'block', marginTop: '4px', fontFamily: 'Cormorant Garamond, serif' }}>Click to copy</span>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handlePropose} style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' }}>
              <input value={pCity} onChange={e => setPCity(e.target.value)} placeholder="City" required style={inputStyle} />
              <input value={pName} onChange={e => setPName(e.target.value)} placeholder="Your name" required style={inputStyle} />
              <input value={pEmail} onChange={e => setPEmail(e.target.value)} placeholder="Your email" type="email" required style={inputStyle} />
              <textarea value={pWhy} onChange={e => setPWhy(e.target.value)} placeholder="Why your city? (optional)" rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
              <button type="submit" disabled={submitting} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, border: 'none', height: '48px', cursor: 'pointer', opacity: submitting ? 0.5 : 1, borderRadius: 0 }}>
                {submitting ? 'SUBMITTING...' : 'PROPOSE A SALON'}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0a0a0a', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold }}>FROM PROPOSAL TO OPENING</div>
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: '19px', top: '8px', bottom: '8px', width: '1px', background: `${gold}22` }} />
            {TIMELINE.map((item, i) => (
              <div key={item.num} style={{ display: 'flex', gap: '1.5rem', marginBottom: i < TIMELINE.length - 1 ? '2.5rem' : '0', position: 'relative' }}>
                <div style={{ width: '40px', height: '40px', flexShrink: 0, background: '#0a0a0a', border: `1px solid ${gold}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '12px', color: gold, position: 'relative', zIndex: 1 }}>{item.num}</div>
                <div style={{ paddingTop: '4px' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: parchment, marginBottom: '0.35rem', letterSpacing: '0.08em' }}>{item.title.toUpperCase()}</div>
                  <p style={{ fontSize: '16px', color: muted, lineHeight: 1.8 }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
