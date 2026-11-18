'use client';
import { useState, useEffect } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const gold = '#c9a84c';
const parchment = '#E8DCC8';
const muted = '#9a8f7a';

/* ── mock data ── */
const DESTINATIONS = [
  { city: 'Athens', country: 'Greece', tag: 'philosophy', img: '🏛️', freq: 'Socratic dialogue', desc: 'Walk the Agora. Debate at the Stoa. The birthplace of Western thought awaits explorers who seek origin.' },
  { city: 'Kyoto', country: 'Japan', tag: 'contemplation', img: '⛩️', freq: 'Zen stillness', desc: 'Temple gardens, tea ceremony, and the art of presence. A frequency calibration for the restless mind.' },
  { city: 'Medellín', country: 'Colombia', tag: 'innovation', img: '🌿', freq: 'Creative emergence', desc: 'From transformation to innovation capital. Co-working from botanical gardens and rooftop terraces.' },
  { city: 'Lisbon', country: 'Portugal', tag: 'exploration', img: '🧭', freq: 'Navigator spirit', desc: 'The city that launched a thousand voyages. Fado music, tiled streets, and the Atlantic horizon.' },
  { city: 'Marrakech', country: 'Morocco', tag: 'mystery', img: '🕌', freq: 'Labyrinthine wonder', desc: 'Lose yourself in the medina. Find yourself in the silence of a riad courtyard at dawn.' },
  { city: 'Reykjavík', country: 'Iceland', tag: 'contemplation', img: '🌋', freq: 'Elemental awe', desc: 'Fire and ice. Northern lights and hot springs. Nature as the ultimate philosophical teacher.' },
];

const TAGS = ['all', 'philosophy', 'contemplation', 'innovation', 'exploration', 'mystery'];

const PASSPORT_STAMPS = [
  { city: 'Boston', date: 'Founding', icon: '⬡', color: gold },
  { city: 'Athens', date: 'Spring 2025', icon: '🏛️', color: '#7B68EE' },
  { city: 'Kyoto', date: 'Autumn 2025', icon: '⛩️', color: '#DC143C' },
  { city: 'Lisbon', date: 'Winter 2026', icon: '🧭', color: '#4169E1' },
  { city: 'Marrakech', date: 'Spring 2026', icon: '🕌', color: '#8B7355' },
  { city: 'Reykjavík', date: 'Summer 2026', icon: '🌋', color: '#A0A0A0' },
];

const TIMELINE = [
  { step: 1, title: 'VR Preview', desc: 'Walk through the digital twin of your destination before you leave home. See spaces other explorers have scanned.' },
  { step: 2, title: 'Book with Crypto', desc: 'Use Travala or Dtravel — pay with BTC, ETH, stablecoins, or fiat. No middlemen. No surveillance pricing.' },
  { step: 3, title: 'Arrive', desc: 'Meet local explorer nodes. AI thinkers have prepared reading lists and contemplation prompts for your destination.' },
  { step: 4, title: 'TribeKey Auth', desc: 'Tap your TribeKey to authenticate at the space. Your identity verified on-chain — no passwords, no check-in desks.', note: 'TribeKey authenticates your biometric profile on arrival — no passwords, no check-in desks' },
  { step: 5, title: 'LiDAR Scan', desc: 'Point your iPhone at the space. Capture walls, furniture, light. The scan feeds the digital twin.' },
  { step: 6, title: 'Earn $EXP', desc: 'Quality-graded rewards: 10 $EXP for basic scans, 25 for detailed, 50 for full property. First scans earn 2× bonus.' },
  { step: 7, title: 'Frequency Circle', desc: 'Join a biofeedback circle with local explorers. Muse EEG + Polar HRV. The room breathes together.' },
  { step: 8, title: 'Digital Twin Live', desc: 'Your scan goes live in the world layer. Future explorers can preview the space in VR before booking.' },
  { step: 9, title: 'Passport Stamp', desc: 'Soulbound token minted on-chain. Non-transferable proof of lived experience — not tourism, but transformation.' },
];

const FREQUENCY_CARDS = [
  { title: 'The Dialectic Circuit', freq: 'Athens → Rome → Vienna', icon: '⬡', color: '#C9A94E', desc: 'Follow the thread of Western philosophy from the Agora to the coffeehouses of Vienna.' },
  { title: 'The Stillness Path', freq: 'Kyoto → Bali → Reykjavík', icon: '◇', color: '#7B68EE', desc: 'Contemplative destinations for those seeking inner silence and elemental wonder.' },
  { title: 'The Emergence Route', freq: 'Medellín → Lisbon → Tbilisi', icon: '◈', color: '#DC143C', desc: 'Cities in transformation. Innovation hubs where old meets new in unexpected ways.' },
];

const TRAVELER_PROFILES = [
  { initials: 'EM', name: 'Elena M.', discipline: 'Neuroscience', city: 'Lisbon', eegFocus: 78, hrvCoherence: 84, groupSync: 91 },
  { initials: 'JK', name: 'James K.', discipline: 'Architecture', city: 'Athens', eegFocus: 65, hrvCoherence: 72, groupSync: 88 },
  { initials: 'SA', name: 'Sofia A.', discipline: 'Philosophy', city: 'Kyoto', eegFocus: 92, hrvCoherence: 88, groupSync: 95 },
];

const SCAN_TIERS = [
  { level: 'Basic Scan', exp: 10, desc: 'Quick photo captures of key areas', icon: '📷' },
  { level: 'Detailed Scan', exp: 25, desc: 'Multi-angle photos with depth data', icon: '📸' },
  { level: 'Full Property', exp: 50, desc: 'Complete LiDAR walkthrough, all rooms', icon: '🔬' },
];

const MOCK_PASSPORT_EXP = 1_240;
const MOCK_NEXT_TIER = { name: 'Wayfinder', threshold: 1_500 };

export default function TravelPage() {
  const [activeTag, setActiveTag] = useState('all');
  const [bookingTab, setBookingTab] = useState<'travala' | 'dtravel'>('travala');
  const [searchQuery, setSearchQuery] = useState('');
  const [vrModalOpen, setVrModalOpen] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).style.opacity = '1'; });
    }, { threshold: 0.1 });
    document.querySelectorAll('[data-fade]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const filtered = DESTINATIONS.filter(d => {
    const matchTag = activeTag === 'all' || d.tag === activeTag;
    const matchSearch = !searchQuery || d.city.toLowerCase().includes(searchQuery.toLowerCase()) || d.country.toLowerCase().includes(searchQuery.toLowerCase());
    return matchTag && matchSearch;
  });

  const progressPct = Math.round((MOCK_PASSPORT_EXP / MOCK_NEXT_TIER.threshold) * 100);

  return (
    <div style={{ background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif', minHeight: '100vh' }}>
      <PublicNav />

      {/* CSS for cube animation */}
      <style>{`
        @keyframes spin-cube {
          0% { transform: rotateX(-20deg) rotateY(0deg); }
          100% { transform: rotateX(-20deg) rotateY(360deg); }
        }
        .cube-wrap { width: 80px; height: 80px; perspective: 200px; margin: 0 auto 1.5rem; }
        .cube {
          width: 80px; height: 80px; position: relative;
          transform-style: preserve-3d;
          animation: spin-cube 6s linear infinite;
        }
        .cube-face {
          position: absolute; width: 80px; height: 80px;
          border: 1px solid ${gold}44; background: ${gold}08;
          display: flex; align-items: center; justify-content: center;
          font-family: Cinzel, serif; font-size: 18px; color: ${gold};
          opacity: 0.7;
        }
        .cube-face:nth-child(1) { transform: translateZ(40px); }
        .cube-face:nth-child(2) { transform: rotateY(180deg) translateZ(40px); }
        .cube-face:nth-child(3) { transform: rotateY(90deg) translateZ(40px); }
        .cube-face:nth-child(4) { transform: rotateY(-90deg) translateZ(40px); }
        .cube-face:nth-child(5) { transform: rotateX(90deg) translateZ(40px); }
        .cube-face:nth-child(6) { transform: rotateX(-90deg) translateZ(40px); }
      `}</style>

      {/* ═══ HERO ═══ */}
      <section style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8rem 2rem 6rem', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.04, pointerEvents: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Ccircle cx='40' cy='40' r='30' fill='none' stroke='%23C9A84C' stroke-width='0.3'/%3E%3Cline x1='40' y1='10' x2='40' y2='70' stroke='%23C9A84C' stroke-width='0.2'/%3E%3Cline x1='10' y1='40' x2='70' y2='40' stroke='%23C9A84C' stroke-width='0.2'/%3E%3C/svg%3E")`, backgroundSize: '80px 80px' }} />
        <div style={{ maxWidth: '760px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.5em', color: gold, opacity: 0.6, marginBottom: '1.5rem' }}>EXPLORER COMMONS · SOVEREIGN TRAVEL</div>
          <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2.2rem, 5.5vw, 4rem)', fontWeight: 400, letterSpacing: '0.02em', lineHeight: 1.2, marginBottom: '1.5rem', color: '#f5f0e8' }}>
            Travel the World<br />as an Explorer
          </h1>
          <p style={{ fontSize: '1.2rem', color: muted, lineHeight: 1.8, maxWidth: '560px', margin: '0 auto 2.5rem' }}>
            Sovereign booking. Philosophical itineraries. Soulbound passport stamps. Travel isn't tourism — it's transformation.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="#destinations" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: '#0a0a0a', background: gold, padding: '14px 32px', textDecoration: 'none' }}>Explore Destinations →</a>
            <a href="#how-it-works" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, border: `1px solid ${gold}55`, padding: '14px 32px', textDecoration: 'none' }}>How It Works</a>
          </div>
        </div>
      </section>

      {/* ═══ VR PREVIEW BANNER ═══ */}
      <section data-fade style={{ padding: '3rem 2rem', background: '#0d0d0d', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto', border: `1px solid ${gold}22`, background: `${gold}05`, padding: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, opacity: 0.6, marginBottom: '0.5rem' }}>NEW</div>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '16px', color: '#f5f0e8', marginBottom: '0.35rem' }}>Preview Commons Spaces in VR</div>
            <p style={{ fontSize: '14px', color: muted, lineHeight: 1.6 }}>Walk through scanned spaces before you book. Digital twins built by fellow explorers.</p>
          </div>
          <button onClick={() => setVrModalOpen(true)} style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, border: `1px solid ${gold}44`, background: 'transparent', padding: '12px 24px', cursor: 'pointer', flexShrink: 0 }}>
            LAUNCH PREVIEW →
          </button>
        </div>
      </section>

      {/* VR Modal */}
      {vrModalOpen && (
        <div onClick={e => { if (e.target === e.currentTarget) setVrModalOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div style={{ background: '#0d0d0d', border: `1px solid ${gold}22`, padding: '3rem 2.5rem', maxWidth: '400px', width: '100%', textAlign: 'center', position: 'relative' }}>
            <button onClick={() => setVrModalOpen(false)} style={{ position: 'absolute', top: '1rem', right: '1.2rem', background: 'none', border: 'none', color: muted, fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
            <div className="cube-wrap">
              <div className="cube">
                <div className="cube-face">⬡</div>
                <div className="cube-face">⬡</div>
                <div className="cube-face">⬡</div>
                <div className="cube-face">⬡</div>
                <div className="cube-face">⬡</div>
                <div className="cube-face">⬡</div>
              </div>
            </div>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.1em', color: '#f5f0e8', marginBottom: '0.5rem' }}>Digital Twin Viewer</div>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, opacity: 0.5, marginBottom: '1.5rem' }}>COMING SOON</div>
            <p style={{ fontSize: '14px', color: muted, lineHeight: 1.7 }}>Spatial scans from explorers worldwide will be viewable here. Scan a space to contribute to the world layer.</p>
          </div>
        </div>
      )}

      {/* ═══ SCAN-TO-EARN ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, opacity: 0.5, marginBottom: '0.75rem' }}>SCAN-TO-EARN</div>
            <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f5f0e8', marginBottom: '0.75rem' }}>Scan Spaces. Earn $EXP.</h2>
            <p style={{ fontSize: '1rem', color: muted, lineHeight: 1.8 }}>Every room you scan becomes a permanent part of the world layer. Quality determines reward.</p>
          </div>

          {/* 4-step flow */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1px', background: `${gold}10`, marginBottom: '2.5rem' }}>
            {[
              { step: '01', icon: '🛬', title: 'Arrive', desc: 'Check in at any Commons-listed space' },
              { step: '02', icon: '📱', title: 'Scan with LiDAR', desc: 'iPhone Pro captures depth + geometry' },
              { step: '03', icon: '🔗', title: 'Upload to Node', desc: 'SHA-256 proof hash, stored on-chain' },
              { step: '04', icon: '⬡', title: 'Earn 10-50 $EXP', desc: 'Quality-graded by space host' },
            ].map(s => (
              <div key={s.step} style={{ background: '#0a0a0a', padding: '2rem 1.5rem', textAlign: 'center' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, opacity: 0.3, marginBottom: '0.75rem' }}>{s.step}</div>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>{s.icon}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.08em', color: '#f5f0e8', marginBottom: '0.5rem' }}>{s.title}</div>
                <p style={{ fontSize: '13px', color: muted, lineHeight: 1.6 }}>{s.desc}</p>
              </div>
            ))}
          </div>

          {/* Reward tiers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1px', background: `${gold}10` }}>
            {SCAN_TIERS.map(t => (
              <div key={t.level} style={{ background: '#0d0d0d', padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ fontSize: '1.5rem', flexShrink: 0 }}>{t.icon}</div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.25rem' }}>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: '#f5f0e8' }}>{t.level}</span>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: gold }}>{t.exp} $EXP</span>
                  </div>
                  <p style={{ fontSize: '12px', color: muted, lineHeight: 1.5 }}>{t.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ DESTINATION SEARCH ═══ */}
      <section id="destinations" data-fade style={{ padding: '6rem 2rem', background: '#0d0d0d', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, opacity: 0.5, marginBottom: '0.75rem' }}>FIND YOUR FREQUENCY</div>
            <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f5f0e8', marginBottom: '1.5rem' }}>Destinations for Explorers</h2>
          </div>

          <div style={{ maxWidth: '480px', margin: '0 auto 1.5rem' }}>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search cities or countries..."
              style={{ width: '100%', background: '#111', border: `1px solid ${gold}22`, padding: '12px 16px', fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: parchment, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '2.5rem' }}>
            {TAGS.map(tag => (
              <button key={tag} onClick={() => setActiveTag(tag)} style={{
                padding: '6px 18px', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', cursor: 'pointer',
                background: activeTag === tag ? `${gold}22` : 'transparent',
                border: `1px solid ${activeTag === tag ? gold : `${gold}33`}`,
                color: activeTag === tag ? gold : muted, transition: 'all 0.2s',
              }}>
                {tag.toUpperCase()}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1px', background: `${gold}10` }}>
            {filtered.map(d => (
              <div key={d.city} style={{ background: '#0a0a0a', padding: '2rem', transition: 'background 0.3s' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>{d.img}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, opacity: 0.6, marginBottom: '0.5rem' }}>{d.freq.toUpperCase()}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '18px', color: '#f5f0e8', marginBottom: '0.25rem' }}>{d.city}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.1em', color: muted, marginBottom: '0.75rem' }}>{d.country.toUpperCase()}</div>
                <p style={{ fontSize: '14px', color: muted, lineHeight: 1.8 }}>{d.desc}</p>
              </div>
            ))}
          </div>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: muted, fontStyle: 'italic' }}>No destinations match your search.</div>
          )}
        </div>
      </section>

      {/* ═══ BOOKING HUB ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, opacity: 0.5, marginBottom: '0.75rem' }}>SOVEREIGN BOOKING</div>
            <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f5f0e8', marginBottom: '0.75rem' }}>Book Without Middlemen</h2>
            <p style={{ fontSize: '1rem', color: muted, lineHeight: 1.8 }}>Crypto-native booking platforms. No surveillance pricing. Pay with BTC, ETH, stablecoins, or fiat.</p>
          </div>

          <div style={{ display: 'flex', borderBottom: `1px solid ${gold}22`, marginBottom: '0' }}>
            {(['travala', 'dtravel'] as const).map(tab => (
              <button key={tab} onClick={() => setBookingTab(tab)} style={{
                flex: 1, padding: '14px', fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', cursor: 'pointer',
                background: bookingTab === tab ? `${gold}11` : 'transparent',
                border: 'none', borderBottom: bookingTab === tab ? `2px solid ${gold}` : '2px solid transparent',
                color: bookingTab === tab ? gold : muted, transition: 'all 0.2s',
              }}>
                {tab.toUpperCase()}
              </button>
            ))}
          </div>

          <div style={{ background: '#0d0d0d', border: `1px solid ${gold}15`, borderTop: 'none', padding: '2rem' }}>
            {bookingTab === 'travala' ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>✈️</span>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '18px', color: '#f5f0e8' }}>Travala</span>
                  <span style={{ marginLeft: 'auto', fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.12em', color: gold, border: `1px solid ${gold}33`, padding: '3px 8px', background: `${gold}08` }}>EARN $EXP WHEN YOU SCAN</span>
                </div>
                <p style={{ fontSize: '15px', color: muted, lineHeight: 1.8, marginBottom: '1.5rem' }}>
                  2,200,000+ properties worldwide. Pay with 100+ cryptocurrencies including AVA, BTC, ETH, and USDT. Up to 40% savings on hotels, flights, and activities.
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                  {['Hotels', 'Flights', 'Activities', 'Crypto Pay'].map(f => (
                    <span key={f} style={{ padding: '4px 12px', fontSize: '11px', fontFamily: 'Cinzel, serif', letterSpacing: '0.1em', color: gold, border: `1px solid ${gold}33`, background: `${gold}08` }}>{f}</span>
                  ))}
                </div>
                <button style={{ width: '100%', fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: '#0a0a0a', background: gold, border: 'none', padding: '14px', cursor: 'pointer' }}>BOOK ON TRAVALA →</button>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>🏡</span>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '18px', color: '#f5f0e8' }}>Dtravel</span>
                  <span style={{ marginLeft: 'auto', fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.12em', color: gold, border: `1px solid ${gold}33`, padding: '3px 8px', background: `${gold}08` }}>EARN $EXP WHEN YOU SCAN</span>
                </div>
                <p style={{ fontSize: '15px', color: muted, lineHeight: 1.8, marginBottom: '1.5rem' }}>
                  Decentralized home-sharing on blockchain. Direct host-to-guest bookings with smart contract escrow. No platform lock-in. True peer-to-peer travel.
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                  {['Homes', 'Villas', 'Smart Contracts', 'P2P'].map(f => (
                    <span key={f} style={{ padding: '4px 12px', fontSize: '11px', fontFamily: 'Cinzel, serif', letterSpacing: '0.1em', color: gold, border: `1px solid ${gold}33`, background: `${gold}08` }}>{f}</span>
                  ))}
                </div>
                <button style={{ width: '100%', fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: '#0a0a0a', background: gold, border: 'none', padding: '14px', cursor: 'pointer' }}>BOOK ON DTRAVEL →</button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ═══ BIOFEEDBACK COHERENCE ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0d0d0d', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, opacity: 0.5, marginBottom: '0.75rem' }}>BIOFEEDBACK COHERENCE</div>
            <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f5f0e8', marginBottom: '0.75rem' }}>Frequency Matching</h2>
            <p style={{ fontSize: '1rem', color: muted, lineHeight: 1.8 }}>Find travelers whose brainwave and heart-rate patterns resonate with yours.</p>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: muted, opacity: 0.4, marginTop: '0.75rem' }}>POWERED BY MUSE S ATHENA + POLAR H10</div>
          </div>

          {/* Traveler profile cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1px', background: `${gold}10`, marginBottom: '2rem' }}>
            {TRAVELER_PROFILES.map(p => (
              <div key={p.initials} style={{ background: '#0a0a0a', padding: '2rem' }}>
                {/* Avatar + info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.25rem' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '50%', border: `2px solid ${gold}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '13px', color: gold, flexShrink: 0 }}>{p.initials}</div>
                  <div>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '13px', letterSpacing: '0.06em', color: '#f5f0e8' }}>{p.name}</div>
                    <div style={{ fontSize: '12px', color: muted }}>{p.discipline} · {p.city}</div>
                  </div>
                </div>

                {/* EEG Focus meter */}
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.12em', color: muted }}>EEG FOCUS</span>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: parchment }}>{p.eegFocus}</span>
                  </div>
                  <div style={{ height: '3px', background: `${gold}15`, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${p.eegFocus}%`, background: gold, transition: 'width 0.6s ease' }} />
                  </div>
                </div>

                {/* HRV Coherence meter */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.12em', color: muted }}>HRV COHERENCE</span>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: parchment }}>{p.hrvCoherence}</span>
                  </div>
                  <div style={{ height: '3px', background: `${gold}15`, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${p.hrvCoherence}%`, background: '#7B68EE', transition: 'width 0.6s ease' }} />
                  </div>
                </div>

                {/* Group Synchrony + button */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted, marginBottom: '2px' }}>GROUP SYNCHRONY</div>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '18px', color: gold }}>{p.groupSync}%</div>
                  </div>
                  <button style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: gold, border: `1px solid ${gold}44`, background: `${gold}08`, padding: '8px 14px', cursor: 'pointer' }}>RESONANT MATCH</button>
                </div>
              </div>
            ))}
          </div>

          {/* AI Companion callout */}
          <div style={{ border: `1px solid ${gold}22`, background: `${gold}05`, padding: '2rem', display: 'flex', gap: '1.25rem', alignItems: 'flex-start' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1.25rem', color: gold, opacity: 0.4, flexShrink: 0, marginTop: '2px' }}>Σ</div>
            <div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.1em', color: '#f5f0e8', marginBottom: '0.5rem' }}>AI Companion Matching</div>
              <p style={{ fontSize: '14px', color: muted, lineHeight: 1.8 }}>Your AI companion analyzes brainwave and heart-rate patterns to find travelers whose frequencies resonate with yours. No algorithms — just coherence.</p>
            </div>
          </div>

          {/* Curated routes (kept) */}
          <div style={{ marginTop: '3rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.4, textAlign: 'center', marginBottom: '1.5rem' }}>CURATED JOURNEYS</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1px', background: `${gold}10` }}>
              {FREQUENCY_CARDS.map(card => (
                <div key={card.title} style={{ background: '#0a0a0a', padding: '2.5rem 2rem' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1.5rem', color: card.color, opacity: 0.3, marginBottom: '1rem' }}>{card.icon}</div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '16px', color: '#f5f0e8', marginBottom: '0.5rem' }}>{card.title}</div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, opacity: 0.7, marginBottom: '1rem' }}>{card.freq.toUpperCase()}</div>
                  <p style={{ fontSize: '14px', color: muted, lineHeight: 1.8 }}>{card.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ EXPLORER PASSPORT (expanded) ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, opacity: 0.5, marginBottom: '0.75rem' }}>SOULBOUND · ON-CHAIN</div>
            <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f5f0e8', marginBottom: '0.75rem' }}>Explorer Passport</h2>
            <p style={{ fontSize: '1rem', color: muted, lineHeight: 1.8 }}>Non-transferable stamps minted as soulbound tokens. Proof of experience, not purchase.</p>
          </div>

          {/* Passport card */}
          <div style={{ background: '#0d0d0d', border: `1px solid ${gold}22`, padding: '2rem', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '1rem', right: '1rem', fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.2em', color: gold, opacity: 0.3 }}>SOULBOUND</div>

            {/* Header with EXP counter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: `1px solid ${gold}15` }}>
              <div style={{ width: '48px', height: '48px', background: `${gold}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '18px', color: gold }}>⬡</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '16px', color: '#f5f0e8' }}>Explorer #0042</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted }}>PHILOSOPHER TIER · {PASSPORT_STAMPS.length} STAMPS</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '20px', color: gold }}>{MOCK_PASSPORT_EXP.toLocaleString()}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: muted }}>$EXP EARNED</div>
              </div>
            </div>

            {/* Tier progress bar */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted }}>NEXT: {MOCK_NEXT_TIER.name.toUpperCase()}</span>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: gold }}>{MOCK_PASSPORT_EXP} / {MOCK_NEXT_TIER.threshold.toLocaleString()}</span>
              </div>
              <div style={{ height: '4px', background: `${gold}15`, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progressPct}%`, background: gold, transition: 'width 0.6s ease' }} />
              </div>
            </div>

            {/* Stamps grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '1.5rem' }}>
              {PASSPORT_STAMPS.map(stamp => (
                <div key={stamp.city} style={{ background: `${stamp.color}08`, border: `1px solid ${stamp.color}22`, padding: '1rem 0.5rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.25rem', marginBottom: '0.35rem' }}>{stamp.icon}</div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.08em', color: '#f5f0e8' }}>{stamp.city.toUpperCase()}</div>
                  <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '10px', color: muted, marginTop: '2px' }}>{stamp.date}</div>
                </div>
              ))}
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: muted, opacity: 0.5 }}>VERIFIED ON BASE · NON-TRANSFERABLE · SOULBOUND</div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS (expanded 9-step) ═══ */}
      <section id="how-it-works" data-fade style={{ padding: '6rem 2rem', background: '#0d0d0d', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, opacity: 0.5, marginBottom: '0.75rem' }}>THE JOURNEY</div>
            <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f5f0e8' }}>How It Works</h2>
          </div>

          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: '19px', top: '8px', bottom: '8px', width: '1px', background: `${gold}22` }} />

            {TIMELINE.map((item, i) => (
              <div key={item.step} style={{ display: 'flex', gap: '1.5rem', marginBottom: i < TIMELINE.length - 1 ? '2rem' : '0', position: 'relative' }}>
                <div style={{ width: '40px', height: '40px', flexShrink: 0, background: '#0a0a0a', border: `1px solid ${gold}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '12px', color: gold, position: 'relative', zIndex: 1 }}>
                  {item.step}
                </div>
                <div style={{ paddingTop: '4px' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: '#f5f0e8', marginBottom: '0.35rem' }}>{item.title}</div>
                  <p style={{ fontSize: '13px', color: muted, lineHeight: 1.8 }}>{item.desc}</p>
                  {(item as any).note && (
                    <div style={{ marginTop: '0.5rem', padding: '8px 12px', background: `${gold}08`, border: `1px solid ${gold}18`, fontSize: '12px', color: gold, fontStyle: 'italic', lineHeight: 1.6 }}>
                      {(item as any).note}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', textAlign: 'center', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '500px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f5f0e8', marginBottom: '1rem' }}>Ready to explore the world?</h2>
          <p style={{ fontSize: '1rem', color: muted, lineHeight: 1.8, marginBottom: '2rem' }}>Join the Society. Unlock sovereign travel. Earn your first passport stamp.</p>
          <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: '#0a0a0a', background: gold, padding: '14px 36px', textDecoration: 'none', display: 'inline-block' }}>Join the Society →</a>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
