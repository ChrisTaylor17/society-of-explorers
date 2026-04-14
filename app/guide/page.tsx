'use client';
import { useState, useEffect } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { getMemberSession } from '@/lib/auth/getSession';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

const GUIDE_LEVELS = ['', 'Guide', 'Senior Guide', 'Master Guide'];
const LEVEL_THRESHOLDS = [0, 1, 3, 10]; // salons completed to reach each level
const STATUS_COLORS: Record<string, string> = { recruiting: '#4169E1', active: '#4CAF50', graduating: '#FFA726', completed: muted };

export default function GuidePage() {
  const router = useRouter();
  const [memberId, setMemberId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [guideData, setGuideData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const session = await getMemberSession();
        if (!session?.member) { router.push('/salon'); return; }
        setMemberId(session.member.id);

        const supabase = createClient();
        const { data: { session: authSession } } = await supabase.auth.getSession();
        if (authSession?.access_token) setAuthToken(authSession.access_token);

        const res = await fetch('/api/guide', {
          headers: authSession?.access_token ? { 'Authorization': `Bearer ${authSession.access_token}` } : {},
        });
        if (res.status === 403) { router.push('/salon'); return; }
        const data = await res.json();
        if (data.error) { router.push('/salon'); return; }
        setGuideData(data);
      } catch { router.push('/salon'); }
      setLoading(false);
    }
    load();
  }, [router]);

  async function handleCreateSalon(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const completedSalon = guideData?.salons?.find((s: any) => s.status === 'completed');
      await fetch('/api/guide/create-salon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({ title: newTitle.trim(), description: newDesc.trim(), parent_salon_id: completedSalon?.id }),
      });
      router.push('/salon');
    } catch {}
    setCreating(false);
  }

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).style.opacity = '1'; });
    }, { threshold: 0.1 });
    document.querySelectorAll('[data-fade]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [guideData]);

  if (loading) return <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PublicNav /><span style={{ color: muted, fontFamily: 'Cinzel, serif', fontSize: '11px' }}>LOADING...</span></div>;
  if (!guideData) return null;

  const hasCompleted = guideData.salons?.some((s: any) => s.status === 'completed');
  const currentLevel = guideData.guide_level || 1;
  const nextLevel = Math.min(currentLevel + 1, 3);
  const salonsToNext = LEVEL_THRESHOLDS[nextLevel] - (guideData.salons_led || 0);

  const inputStyle: React.CSSProperties = { width: '100%', background: '#111', border: `1px solid ${gold}22`, padding: '14px 16px', fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: parchment, outline: 'none', boxSizing: 'border-box', transition: 'box-shadow 0.2s' };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif', animation: 'fadeIn 0.8s ease' }}>
      <PublicNav />

      {/* Header + Stats */}
      <section style={{ padding: '8rem 2rem 2rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>GUIDE DASHBOARD</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 400, color: parchment, marginBottom: '0.5rem' }}>
            {GUIDE_LEVELS[currentLevel] || 'Guide'}
          </h1>

          {/* Level progression */}
          {currentLevel < 3 && (
            <div style={{ maxWidth: '200px', margin: '0.5rem auto 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', color: muted }}>{GUIDE_LEVELS[currentLevel]}</span>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', color: muted }}>{GUIDE_LEVELS[nextLevel]}</span>
              </div>
              <div style={{ height: '3px', background: '#1a1a1a', borderRadius: '2px' }}>
                <div style={{ height: '100%', width: `${Math.min(((guideData.salons_led || 0) / LEVEL_THRESHOLDS[nextLevel]) * 100, 100)}%`, background: gold, borderRadius: '2px', transition: 'width 0.5s ease' }} />
              </div>
              {salonsToNext > 0 && <p style={{ fontSize: '11px', color: muted, marginTop: '4px' }}>{salonsToNext} more salon{salonsToNext !== 1 ? 's' : ''} to advance</p>}
            </div>
          )}

          {/* Stats row */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '1.5rem', flexWrap: 'wrap' }}>
            {[
              { label: 'SALONS LED', value: guideData.salons_led || 0 },
              { label: 'GRADUATED', value: guideData.members_graduated || 0 },
              { label: '$EXP EARNED', value: (guideData.guide_earnings_total || 0).toLocaleString() },
              { label: 'LEVEL', value: currentLevel },
            ].map(s => (
              <div key={s.label} style={{ background: `${gold}0a`, border: `1px solid ${gold}15`, padding: '14px 22px', textAlign: 'center', minWidth: '90px' }}>
                <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '26px', color: gold }}>{s.value}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted, marginTop: '2px' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* My Salons */}
      <section data-fade style={{ padding: '2rem', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem' }}>MY SALONS</div>

          {(guideData.salons || []).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', border: `1px solid ${gold}15`, background: '#0d0d0d' }}>
              <p style={{ fontSize: '16px', color: muted, fontStyle: 'italic' }}>No salons yet. Create your first one below.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(guideData.salons || []).map((s: any) => (
                <div key={s.id} style={{ background: '#0d0d0d', border: `1px solid ${gold}12`, padding: '1.5rem', transition: 'border-color 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = `${gold}44`}
                  onMouseLeave={e => e.currentTarget.style.borderColor = `${gold}12`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: parchment }}>{s.title}</span>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: STATUS_COLORS[s.status] || muted }}>{s.status?.toUpperCase()}</span>
                  </div>
                  {s.stats && (
                    <div style={{ fontSize: '13px', color: muted, lineHeight: 1.7 }}>
                      Week {s.stats.current_week}/7 &middot; {s.stats.member_count} members &middot; {s.stats.sessions_completed} sessions &middot; {s.stats.total_exp_awarded} $EXP
                    </div>
                  )}
                  {s.status !== 'completed' && (
                    <a href="/salon" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.12em', color: gold, textDecoration: 'none', display: 'inline-block', marginTop: '0.75rem' }}>VIEW SALON &rarr;</a>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Create new salon */}
          {hasCompleted && (
            <div style={{ marginTop: '2rem', textAlign: 'center' }}>
              {!showCreate ? (
                <button onClick={() => setShowCreate(true)} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, border: 'none', height: '48px', padding: '0 28px', cursor: 'pointer', borderRadius: 0 }}>CREATE NEW SALON</button>
              ) : (
                <form onSubmit={handleCreateSalon} style={{ maxWidth: '400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px', animation: 'fadeIn 0.4s ease' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: gold, marginBottom: '0.25rem' }}>NEW SALON</div>
                  <input
                    value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Salon title"
                    required style={inputStyle}
                    onFocus={e => e.target.style.boxShadow = `0 0 0 1px rgba(201,168,76,0.3)`}
                    onBlur={e => e.target.style.boxShadow = 'none'}
                  />
                  <textarea
                    value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optional)" rows={3}
                    style={{ ...inputStyle, resize: 'none' }}
                    onFocus={e => e.target.style.boxShadow = `0 0 0 1px rgba(201,168,76,0.3)`}
                    onBlur={e => e.target.style.boxShadow = 'none'}
                  />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="submit" disabled={creating} style={{ flex: 1, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, border: 'none', height: '44px', cursor: 'pointer', opacity: creating ? 0.5 : 1 }}>{creating ? 'CREATING...' : 'CREATE SALON'}</button>
                    <button type="button" onClick={() => setShowCreate(false)} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: muted, background: 'none', border: `1px solid ${muted}44`, padding: '0 16px', height: '44px', cursor: 'pointer' }}>CANCEL</button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Leaderboard CTA */}
      <section style={{ padding: '2rem 2rem 4rem', textAlign: 'center' }}>
        <div style={{ width: '60px', height: '1px', background: `${gold}4d`, margin: '0 auto 1.5rem' }} />
        <a href="/leaderboard" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: gold, textDecoration: 'none' }}>VIEW LEADERBOARD &rarr;</a>
      </section>

      <PublicFooter />
      <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
    </div>
  );
}
