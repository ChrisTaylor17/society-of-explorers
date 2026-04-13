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
const STATUS_COLORS: Record<string, string> = { recruiting: '#4169E1', active: '#4CAF50', graduating: '#FFA726', completed: muted };

export default function GuidePage() {
  const router = useRouter();
  const [memberId, setMemberId] = useState<string | null>(null);
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
      const supabase = createClient();
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const completedSalon = guideData?.salons?.find((s: any) => s.status === 'completed');
      await fetch('/api/guide/create-salon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authSession?.access_token ? { 'Authorization': `Bearer ${authSession.access_token}` } : {}) },
        body: JSON.stringify({ title: newTitle.trim(), description: newDesc.trim(), parent_salon_id: completedSalon?.id }),
      });
      router.push('/salon');
    } catch {}
    setCreating(false);
  }

  if (loading) return <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PublicNav /><span style={{ color: muted, fontFamily: 'Cinzel, serif', fontSize: '11px' }}>LOADING...</span></div>;
  if (!guideData) return null;

  const hasCompleted = guideData.salons?.some((s: any) => s.status === 'completed');

  const inputStyle: React.CSSProperties = { width: '100%', background: '#111', border: `1px solid ${gold}22`, padding: '14px 16px', fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: parchment, outline: 'none', boxSizing: 'border-box' };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <section style={{ padding: '8rem 2rem 2rem', textAlign: 'center' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>GUIDE DASHBOARD</div>
        <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 400, color: parchment, marginBottom: '0.5rem' }}>
          {GUIDE_LEVELS[guideData.guide_level] || 'Guide'}
        </h1>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '1.5rem', flexWrap: 'wrap' }}>
          {[
            { label: 'SALONS LED', value: guideData.salons_led },
            { label: 'GRADUATED', value: guideData.members_graduated },
            { label: '$EXP EARNED', value: guideData.guide_earnings_total },
            { label: 'LEVEL', value: guideData.guide_level },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.15)', padding: '12px 20px', textAlign: 'center', minWidth: '80px' }}>
              <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '24px', color: gold }}>{s.value || 0}</div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted, marginTop: '2px' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Salons */}
      <section style={{ padding: '2rem' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem' }}>MY SALONS</div>
          {(guideData.salons || []).map((s: any) => (
            <div key={s.id} style={{ background: '#0d0d0d', border: `1px solid rgba(201,168,76,0.12)`, padding: '1.5rem', marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: parchment }}>{s.title}</span>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: STATUS_COLORS[s.status] || muted }}>{s.status?.toUpperCase()}</span>
              </div>
              {s.stats && (
                <div style={{ fontSize: '13px', color: muted }}>
                  Week {s.stats.current_week}/7 &middot; {s.stats.member_count} members &middot; {s.stats.sessions_completed} sessions &middot; {s.stats.total_exp_awarded} $EXP
                </div>
              )}
              {s.status !== 'completed' && (
                <a href="/salon" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.12em', color: gold, textDecoration: 'none', display: 'inline-block', marginTop: '0.75rem' }}>VIEW SALON &rarr;</a>
              )}
            </div>
          ))}

          {hasCompleted && (
            <div style={{ marginTop: '2rem', textAlign: 'center' }}>
              {!showCreate ? (
                <button onClick={() => setShowCreate(true)} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, border: 'none', height: '48px', padding: '0 28px', cursor: 'pointer', borderRadius: 0 }}>CREATE NEW SALON</button>
              ) : (
                <form onSubmit={handleCreateSalon} style={{ maxWidth: '400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Salon title" required style={inputStyle} />
                  <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optional)" rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                  <button type="submit" disabled={creating} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, border: 'none', height: '44px', cursor: 'pointer', opacity: creating ? 0.5 : 1 }}>{creating ? 'CREATING...' : 'CREATE'}</button>
                </form>
              )}
            </div>
          )}
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
