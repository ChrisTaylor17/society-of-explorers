'use client';
import { useEffect, useState } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

const THINKER_COLORS: Record<string, string> = {
  socrates: '#C9A94E', plato: '#7B68EE', aurelius: '#8B7355',
  nietzsche: '#DC143C', einstein: '#4169E1', jobs: '#A0A0A0',
};

export default function HomePage() {
  const [daos, setDaos] = useState<any[]>([]);
  const [pulse, setPulse] = useState<any>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  }, []);

  useEffect(() => {
    fetch('/api/communities').then(r => r.json()).then(d => setDaos(d.discover || [])).catch(() => {});
  }, []);

  useEffect(() => {
    function load() {
      fetch('/api/feed/pulse').then(r => r.json()).then(setPulse).catch(() => {});
    }
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).style.opacity = '1'; });
    }, { threshold: 0.1 });
    document.querySelectorAll('[data-fade]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [daos]);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {/* HERO */}
      <section style={{ padding: '8rem 2rem 4rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1.5rem' }}>CONSILIENCE SYSTEMS</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(28px, 6vw, 52px)', fontWeight: 400, lineHeight: 1.2, marginBottom: '1.5rem', color: parchment, letterSpacing: '-0.01em' }}>
            Decentralized citizen-science DAOs<br />with real-world impact.
          </h1>
          <p style={{ fontSize: '18px', color: ivory85, lineHeight: 1.7, maxWidth: '620px', margin: '0 auto 2.5rem' }}>
            Launch your own DePIN network or citizen-science collective. Deploy physical infrastructure, collect open data, reward contributors with soulbound tokens. Non-custodial, open protocol, built on Solana.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/create-community" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 32px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '52px' }}>CREATE YOUR DAO</a>
            <a href="/explore" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: gold, border: `1px solid ${gold}`, padding: '0 32px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '52px' }}>EXPLORE LIVE DAOs</a>
          </div>
        </div>
      </section>

      {/* USER TYPES */}
      <section data-fade style={{ padding: '3rem 2rem 5rem', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, textAlign: 'center', marginBottom: '2.5rem' }}>BUILT FOR</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1px', background: `${gold}10` }}>
            {[
              { label: 'SCIENTISTS', desc: 'Run decentralized field studies at global scale. Recruit citizen contributors, verify data on-chain, publish open datasets.', icon: '\u2234' },
              { label: 'CITIZENS', desc: 'Contribute real-world observations, host sensor nodes, participate in experiments. Earn soulbound reputation for verified contributions.', icon: '\u25CE' },
              { label: 'BUILDERS', desc: 'Ship DePIN networks, open hardware, climate monitoring grids. Use Consilience primitives — tokens, governance, treasury, infrastructure.', icon: '\u25A1' },
            ].map(c => (
              <div key={c.label} style={{ background: '#0d0d0d', padding: '2.5rem 2rem' }}>
                <div style={{ fontSize: '28px', color: gold, marginBottom: '1rem' }}>{c.icon}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.2em', color: parchment, marginBottom: '0.75rem' }}>{c.label}</div>
                <p style={{ fontSize: '14px', color: muted, lineHeight: 1.7, margin: 0 }}>{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HAPPENING NOW — live pulse from SOE (flagship instance) */}
      <section data-fade style={{ padding: '1rem 2rem 4rem', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '1.5rem' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: gold, animation: 'pulse 2s infinite' }} />
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold }}>
              HAPPENING NOW
              {pulse && pulse.stats?.todayCount > 0 && (
                <> &middot; {pulse.stats.todayCount} EXPLORER{pulse.stats.todayCount !== 1 ? 'S' : ''} ANSWERED TODAY</>
              )}
            </span>
          </div>

          {!pulse ? null : pulse.stats?.todayCount === 0 && (pulse.recentResponses || []).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', border: `1px dashed ${gold}22`, background: '#0d0d0d' }}>
              <p style={{ fontSize: '15px', color: parchment, fontStyle: 'italic', margin: 0, marginBottom: '0.5rem' }}>
                Today&apos;s question is waiting. Be the first.
              </p>
              <a href="/practice" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: gold, textDecoration: 'none', border: `1px solid ${gold}44`, padding: '10px 22px', display: 'inline-block', marginTop: '0.5rem' }}>TODAY&apos;S QUESTION</a>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(pulse.recentResponses || []).slice(0, 3).map((r: any) => {
                  const tColor = THINKER_COLORS[r.thinker_id] || gold;
                  return (
                    <div key={r.id} style={{
                      background: '#0d0d0d', borderLeft: `3px solid ${tColor}`,
                      border: `1px solid ${gold}10`, padding: '0.75rem 1rem',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '13px', color: gold }}>{r.display_name}</span>
                        <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: tColor }}>{(r.thinker_id || '').toUpperCase()}</span>
                      </div>
                      <p style={{ fontSize: '14px', color: parchment, lineHeight: 1.5, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {r.response_text}
                      </p>
                    </div>
                  );
                })}
              </div>
              <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                <a href="/feed" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.18em', color: gold, textDecoration: 'none' }}>VIEW FULL FEED &rarr;</a>
              </div>

              {(pulse.streakLeaders || []).length > 0 && (
                <div style={{ marginTop: '2rem', paddingTop: '1.25rem', borderTop: `1px solid ${gold}10` }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.3em', color: muted, textAlign: 'center', marginBottom: '0.75rem' }}>STREAK LEADERS</div>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                    {pulse.streakLeaders.slice(0, 3).map((l: any, i: number) => (
                      <div key={`${l.display_name}-${i}`} style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '18px', color: ['#c9a84c', '#C0C0C0', '#CD7F32'][i] || muted }}>{i + 1}</div>
                        <div style={{ fontSize: '13px', color: parchment }}>{l.display_name}</div>
                        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: muted, marginTop: '2px' }}>{l.current_streak}d STREAK</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* LIVE DAOs */}
      <section data-fade style={{ padding: '2rem 2rem 5rem', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '0.75rem' }}>LIVE INSTANCES</div>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 400, color: parchment, marginBottom: '0.5rem' }}>DAOs running on Consilience</h2>
          </div>

          {/* SOE flagship card */}
          <a href="/soe" style={{ display: 'block', background: '#0d0d0d', border: `1px solid ${gold}33`, padding: '2rem', textDecoration: 'none', marginBottom: '1rem', transition: 'border-color 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = gold}
            onMouseLeave={e => e.currentTarget.style.borderColor = `${gold}33`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ flex: 1, minWidth: '240px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.5rem' }}>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, border: `1px solid ${gold}`, padding: '3px 10px' }}>FLAGSHIP</span>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: '#4CAF50' }}>{'\u25cf'} LIVE</span>
                </div>
                <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '24px', color: parchment, marginBottom: '0.5rem' }}>Society of Explorers</div>
                <p style={{ fontSize: '14px', color: muted, lineHeight: 1.6, margin: 0, marginBottom: '0.75rem' }}>
                  Citizen-science of the mind. Daily philosophical practice + matched conversations + 7-week salons. $EXP soulbound reputation.
                </p>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted, border: `1px solid ${muted}44`, padding: '2px 8px' }}>HABIT LAYER</span>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted, border: `1px solid ${muted}44`, padding: '2px 8px' }}>1:1 MATCHING</span>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted, border: `1px solid ${muted}44`, padding: '2px 8px' }}>COHORTS</span>
                </div>
              </div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: gold }}>ENTER &rarr;</div>
            </div>
          </a>

          {/* Other DAOs (if any) */}
          {daos.length > 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '8px' }}>
              {daos.filter(d => d.slug !== 'society-of-explorers' && d.slug !== 'soe').slice(0, 4).map(d => (
                <a key={d.id} href={`/c/${d.slug}`} style={{ display: 'block', background: '#0d0d0d', border: `1px solid ${gold}12`, padding: '1.25rem', textDecoration: 'none', transition: 'border-color 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = `${gold}44`}
                  onMouseLeave={e => e.currentTarget.style.borderColor = `${gold}12`}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', color: gold, marginBottom: '0.25rem' }}>{d.name}</div>
                  <p style={{ fontSize: '13px', color: muted, lineHeight: 1.5, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{d.description || 'Consilience DAO'}</p>
                </a>
              ))}
            </div>
          )}

          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <a href="/explore" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: muted, textDecoration: 'none' }}>VIEW ALL DAOs &rarr;</a>
          </div>
        </div>
      </section>

      {/* PROTOCOL PRIMITIVES */}
      <section data-fade style={{ padding: '2rem 2rem 5rem', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, textAlign: 'center', marginBottom: '2rem' }}>PROTOCOL PRIMITIVES</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            {[
              { title: 'Soulbound Tokens', desc: 'Non-transferable reputation. Solana Token-2022.' },
              { title: 'On-Chain Governance', desc: 'DAO voting, treasury, spending guardrails.' },
              { title: 'Physical Infrastructure', desc: 'Sensor networks, field stations, open hardware.' },
              { title: 'Verifiable Data', desc: 'Open datasets, cryptographic attestation, IPFS.' },
              { title: 'Non-Custodial Wallets', desc: 'AES-256-GCM encryption. Users hold keys.' },
              { title: 'Micropayments', desc: 'Automatic rewards for verified contributions.' },
            ].map(p => (
              <div key={p.title} style={{ padding: '1.25rem', background: '#0d0d0d', border: `1px solid ${gold}10` }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.12em', color: gold, marginBottom: '0.5rem' }}>{p.title.toUpperCase()}</div>
                <p style={{ fontSize: '13px', color: muted, lineHeight: 1.6, margin: 0 }}>{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '3rem 2rem 6rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '520px', margin: '0 auto' }}>
          <div style={{ width: '60px', height: '1px', background: `${gold}4d`, margin: '0 auto 2rem' }} />
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 400, color: parchment, marginBottom: '0.75rem' }}>Ready to launch?</h2>
          <p style={{ fontSize: '15px', color: muted, lineHeight: 1.7, marginBottom: '2rem' }}>Four steps. Non-custodial. Open protocol. SEC-compliant.</p>
          <a href="/create-community" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 32px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '52px' }}>CREATE YOUR DAO</a>
        </div>
      </section>

      <PublicFooter />

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
    </div>
  );
}
