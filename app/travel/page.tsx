'use client';
import { useState, useEffect } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const amber = '#f59e0b';
const amberDim = '#d97706';
const slate950 = '#020617';
const slate900 = '#0f172a';
const slate800 = '#1e293b';
const slate700 = '#334155';
const parchment = '#E8DCC8';
const muted = '#94a3b8';

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
  { city: 'Boston', date: 'Founding', icon: '⬡', color: amber },
  { city: 'Athens', date: 'Spring 2025', icon: '🏛️', color: '#7B68EE' },
  { city: 'Kyoto', date: 'Autumn 2025', icon: '⛩️', color: '#DC143C' },
  { city: 'Lisbon', date: 'Winter 2026', icon: '🧭', color: '#4169E1' },
];

const TIMELINE = [
  { step: 1, title: 'Choose Your Frequency', desc: 'Browse destinations matched to your current philosophical inquiry. Each city resonates with a different mode of thought.' },
  { step: 2, title: 'Book Sovereign', desc: 'Use Travala or Dtravel — pay with crypto or fiat. No middlemen. No surveillance pricing. Your itinerary, your sovereignty.' },
  { step: 3, title: 'Pre-Journey Attunement', desc: 'AI thinkers prepare a reading list and contemplation prompts tailored to your destination and inner questions.' },
  { step: 4, title: 'Travel & Explore', desc: 'Meet local explorer nodes. Attend pop-up salons. Document insights in your explorer journal.' },
  { step: 5, title: 'Earn Passport Stamps', desc: 'Soulbound tokens minted on-chain. Non-transferable proof of lived experience — not tourism, but transformation.' },
  { step: 6, title: 'Return & Integrate', desc: 'Share your journey in the Salon. Your insights become part of the collective explorer intelligence.' },
];

const FREQUENCY_CARDS = [
  { title: 'The Dialectic Circuit', freq: 'Athens → Rome → Vienna', icon: '⬡', color: '#C9A94E', desc: 'Follow the thread of Western philosophy from the Agora to the coffeehouses of Vienna.' },
  { title: 'The Stillness Path', freq: 'Kyoto → Bali → Reykjavík', icon: '◇', color: '#7B68EE', desc: 'Contemplative destinations for those seeking inner silence and elemental wonder.' },
  { title: 'The Emergence Route', freq: 'Medellín → Lisbon → Tbilisi', icon: '◈', color: '#DC143C', desc: 'Cities in transformation. Innovation hubs where old meets new in unexpected ways.' },
];

export default function TravelPage() {
  const [activeTag, setActiveTag] = useState('all');
  const [bookingTab, setBookingTab] = useState<'travala' | 'dtravel'>('travala');
  const [searchQuery, setSearchQuery] = useState('');

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

  return (
    <div style={{ background: slate950, color: parchment, fontFamily: 'Cormorant Garamond, serif', minHeight: '100vh' }}>
      <PublicNav />

      {/* ═══ HERO ═══ */}
      <section style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8rem 2rem 6rem', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.04, pointerEvents: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Ccircle cx='40' cy='40' r='30' fill='none' stroke='%23f59e0b' stroke-width='0.3'/%3E%3Cline x1='40' y1='10' x2='40' y2='70' stroke='%23f59e0b' stroke-width='0.2'/%3E%3Cline x1='10' y1='40' x2='70' y2='40' stroke='%23f59e0b' stroke-width='0.2'/%3E%3C/svg%3E")`, backgroundSize: '80px 80px' }} />
        <div style={{ maxWidth: '760px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.5em', color: amber, opacity: 0.6, marginBottom: '1.5rem' }}>EXPLORER COMMONS · SOVEREIGN TRAVEL</div>
          <h1 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(2.2rem, 5.5vw, 4rem)', fontWeight: 400, letterSpacing: '0.02em', lineHeight: 1.2, marginBottom: '1.5rem', color: '#f8fafc' }}>
            Travel the World<br />as an Explorer
          </h1>
          <p style={{ fontSize: '1.2rem', color: muted, lineHeight: 1.8, maxWidth: '560px', margin: '0 auto 2.5rem' }}>
            Sovereign booking. Philosophical itineraries. Soulbound passport stamps. Travel isn't tourism — it's transformation.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="#destinations" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: slate950, background: amber, padding: '14px 32px', textDecoration: 'none' }}>Explore Destinations →</a>
            <a href="#how-it-works" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: amber, border: `1px solid ${amber}55`, padding: '14px 32px', textDecoration: 'none' }}>How It Works</a>
          </div>
        </div>
      </section>

      {/* ═══ DESTINATION SEARCH ═══ */}
      <section id="destinations" data-fade style={{ padding: '6rem 2rem', background: slate900, opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: amber, opacity: 0.5, marginBottom: '0.75rem' }}>FIND YOUR FREQUENCY</div>
            <h2 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f8fafc', marginBottom: '1.5rem' }}>Destinations for Explorers</h2>
          </div>

          {/* Search */}
          <div style={{ maxWidth: '480px', margin: '0 auto 1.5rem' }}>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search cities or countries..."
              style={{ width: '100%', background: slate800, border: `1px solid ${amber}22`, padding: '12px 16px', fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: parchment, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Filter pills */}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '2.5rem' }}>
            {TAGS.map(tag => (
              <button key={tag} onClick={() => setActiveTag(tag)} style={{
                padding: '6px 18px', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', cursor: 'pointer',
                background: activeTag === tag ? `${amber}22` : 'transparent',
                border: `1px solid ${activeTag === tag ? amber : `${amber}33`}`,
                color: activeTag === tag ? amber : muted, transition: 'all 0.2s',
              }}>
                {tag.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Destination grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1px', background: `${amber}10` }}>
            {filtered.map(d => (
              <div key={d.city} style={{ background: slate950, padding: '2rem', transition: 'background 0.3s' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>{d.img}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: amber, opacity: 0.6, marginBottom: '0.5rem' }}>{d.freq.toUpperCase()}</div>
                <div style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: '18px', color: '#f8fafc', marginBottom: '0.25rem' }}>{d.city}</div>
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
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: amber, opacity: 0.5, marginBottom: '0.75rem' }}>SOVEREIGN BOOKING</div>
            <h2 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f8fafc', marginBottom: '0.75rem' }}>Book Without Middlemen</h2>
            <p style={{ fontSize: '1rem', color: muted, lineHeight: 1.8 }}>Crypto-native booking platforms. No surveillance pricing. Pay with BTC, ETH, stablecoins, or fiat.</p>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${amber}22`, marginBottom: '0' }}>
            {(['travala', 'dtravel'] as const).map(tab => (
              <button key={tab} onClick={() => setBookingTab(tab)} style={{
                flex: 1, padding: '14px', fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', cursor: 'pointer',
                background: bookingTab === tab ? `${amber}11` : 'transparent',
                border: 'none', borderBottom: bookingTab === tab ? `2px solid ${amber}` : '2px solid transparent',
                color: bookingTab === tab ? amber : muted, transition: 'all 0.2s',
              }}>
                {tab.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ background: slate900, border: `1px solid ${amber}15`, borderTop: 'none', padding: '2rem' }}>
            {bookingTab === 'travala' ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>✈️</span>
                  <span style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: '18px', color: '#f8fafc' }}>Travala</span>
                </div>
                <p style={{ fontSize: '15px', color: muted, lineHeight: 1.8, marginBottom: '1.5rem' }}>
                  2,200,000+ properties worldwide. Pay with 100+ cryptocurrencies including AVA, BTC, ETH, and USDT. Up to 40% savings on hotels, flights, and activities.
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                  {['Hotels', 'Flights', 'Activities', 'Crypto Pay'].map(f => (
                    <span key={f} style={{ padding: '4px 12px', fontSize: '11px', fontFamily: 'Cinzel, serif', letterSpacing: '0.1em', color: amber, border: `1px solid ${amber}33`, background: `${amber}08` }}>{f}</span>
                  ))}
                </div>
                <button style={{ width: '100%', fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: slate950, background: amber, border: 'none', padding: '14px', cursor: 'pointer' }}>BOOK ON TRAVALA →</button>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>🏡</span>
                  <span style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: '18px', color: '#f8fafc' }}>Dtravel</span>
                </div>
                <p style={{ fontSize: '15px', color: muted, lineHeight: 1.8, marginBottom: '1.5rem' }}>
                  Decentralized home-sharing on blockchain. Direct host-to-guest bookings with smart contract escrow. No platform lock-in. True peer-to-peer travel.
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                  {['Homes', 'Villas', 'Smart Contracts', 'P2P'].map(f => (
                    <span key={f} style={{ padding: '4px 12px', fontSize: '11px', fontFamily: 'Cinzel, serif', letterSpacing: '0.1em', color: amber, border: `1px solid ${amber}33`, background: `${amber}08` }}>{f}</span>
                  ))}
                </div>
                <button style={{ width: '100%', fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: slate950, background: amber, border: 'none', padding: '14px', cursor: 'pointer' }}>BOOK ON DTRAVEL →</button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ═══ FREQUENCY MATCHING ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: slate900, opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: amber, opacity: 0.5, marginBottom: '0.75rem' }}>CURATED JOURNEYS</div>
            <h2 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f8fafc', marginBottom: '0.75rem' }}>Frequency Matching</h2>
            <p style={{ fontSize: '1rem', color: muted, lineHeight: 1.8 }}>Curated multi-city routes aligned to philosophical frequencies.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1px', background: `${amber}10` }}>
            {FREQUENCY_CARDS.map(card => (
              <div key={card.title} style={{ background: slate950, padding: '2.5rem 2rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1.5rem', color: card.color, opacity: 0.3, marginBottom: '1rem' }}>{card.icon}</div>
                <div style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: '16px', color: '#f8fafc', marginBottom: '0.5rem' }}>{card.title}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: amber, opacity: 0.7, marginBottom: '1rem' }}>{card.freq.toUpperCase()}</div>
                <p style={{ fontSize: '14px', color: muted, lineHeight: 1.8 }}>{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ EXPLORER PASSPORT ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '560px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: amber, opacity: 0.5, marginBottom: '0.75rem' }}>SOULBOUND · ON-CHAIN</div>
            <h2 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f8fafc', marginBottom: '0.75rem' }}>Explorer Passport</h2>
            <p style={{ fontSize: '1rem', color: muted, lineHeight: 1.8 }}>Non-transferable stamps minted as soulbound tokens. Proof of experience, not purchase.</p>
          </div>

          {/* Passport card */}
          <div style={{ background: slate900, border: `1px solid ${amber}22`, padding: '2rem', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '1rem', right: '1rem', fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.2em', color: amber, opacity: 0.3 }}>SOULBOUND</div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: `1px solid ${amber}15` }}>
              <div style={{ width: '48px', height: '48px', background: `${amber}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '18px', color: amber }}>⬡</div>
              <div>
                <div style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: '16px', color: '#f8fafc' }}>Explorer #0042</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted }}>PHILOSOPHER TIER · 4 STAMPS</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {PASSPORT_STAMPS.map(stamp => (
                <div key={stamp.city} style={{ background: `${stamp.color}08`, border: `1px solid ${stamp.color}22`, padding: '1rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{stamp.icon}</div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.1em', color: '#f8fafc' }}>{stamp.city.toUpperCase()}</div>
                  <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '11px', color: muted, marginTop: '2px' }}>{stamp.date}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: muted, opacity: 0.5 }}>VERIFIED ON BASE · NON-TRANSFERABLE</div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section id="how-it-works" data-fade style={{ padding: '6rem 2rem', background: slate900, opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: amber, opacity: 0.5, marginBottom: '0.75rem' }}>THE JOURNEY</div>
            <h2 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f8fafc' }}>How It Works</h2>
          </div>

          <div style={{ position: 'relative' }}>
            {/* Timeline line */}
            <div style={{ position: 'absolute', left: '19px', top: '8px', bottom: '8px', width: '1px', background: `${amber}22` }} />

            {TIMELINE.map((item, i) => (
              <div key={item.step} style={{ display: 'flex', gap: '1.5rem', marginBottom: i < TIMELINE.length - 1 ? '2.5rem' : '0', position: 'relative' }}>
                <div style={{ width: '40px', height: '40px', flexShrink: 0, background: slate950, border: `1px solid ${amber}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '12px', color: amber, position: 'relative', zIndex: 1 }}>
                  {item.step}
                </div>
                <div style={{ paddingTop: '4px' }}>
                  <div style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: '16px', color: '#f8fafc', marginBottom: '0.5rem' }}>{item.title}</div>
                  <p style={{ fontSize: '14px', color: muted, lineHeight: 1.8 }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', textAlign: 'center', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '500px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f8fafc', marginBottom: '1rem' }}>Ready to explore the world?</h2>
          <p style={{ fontSize: '1rem', color: muted, lineHeight: 1.8, marginBottom: '2rem' }}>Join the Society. Unlock sovereign travel. Earn your first passport stamp.</p>
          <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: slate950, background: amber, padding: '14px 36px', textDecoration: 'none', display: 'inline-block' }}>Join the Society →</a>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
