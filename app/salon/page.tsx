'use client';
import { useState, useEffect } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { getMemberSession } from '@/lib/auth/getSession';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

const TRACK_COLORS: Record<string, string> = { singularity: '#4169E1', blockchain: '#c9a84c', consciousness: '#7B68EE' };
const GUIDE_LEVELS = ['', 'Guide', 'Senior Guide', 'Master Guide'];

export default function SalonPage() {
  const [memberId, setMemberId] = useState<string | null>(null);
  const [mySalon, setMySalon] = useState<any>(null);
  const [recruiting, setRecruiting] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [guide, setGuide] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const session = await getMemberSession();
        if (session?.member) {
          setMemberId(session.member.id);
          // Check if member is in a salon (try each recruiting/active salon)
          // For now, fetch all and check membership on backend
        }
      } catch {}

      // Fetch recruiting salons
      const res = await fetch('/api/salons?status=recruiting,active');
      const data = await res.json();
      setRecruiting(data.salons || []);
      setLoading(false);
    }
    load();
  }, []);

  async function joinSalon(salonId: string) {
    if (!memberId) { window.location.href = '/login'; return; }
    setJoining(salonId);
    try {
      const res = await fetch(`/api/salons/${salonId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join' }),
      });
      const data = await res.json();
      if (data.success) {
        // Reload to show salon view
        const detail = await fetch(`/api/salons/${salonId}`).then(r => r.json());
        setMySalon(detail.salon);
        setMembers(detail.members || []);
        setSessions(detail.sessions || []);
        setStats(detail.stats);
        setGuide(detail.guide);
      }
    } catch {}
    setJoining(null);
  }

  async function loadSalonDetail(salonId: string) {
    const detail = await fetch(`/api/salons/${salonId}`).then(r => r.json());
    setMySalon(detail.salon);
    setMembers(detail.members || []);
    setSessions(detail.sessions || []);
    setStats(detail.stats);
    setGuide(detail.guide);
  }

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).style.opacity = '1'; });
    }, { threshold: 0.1 });
    document.querySelectorAll('[data-fade]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [mySalon, recruiting]);

  if (loading) return <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PublicNav /><span style={{ color: muted, fontFamily: 'Cinzel, serif', fontSize: '11px' }}>LOADING...</span></div>;

  // IN A SALON VIEW
  if (mySalon) {
    const upcomingSessions = sessions.filter(s => s.status === 'scheduled').slice(0, 7);
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
        <PublicNav />
        <section style={{ padding: '8rem 2rem 2rem', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>YOUR SALON</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(24px, 5vw, 36px)', fontWeight: 400, fontStyle: 'italic', color: parchment, marginBottom: '0.75rem' }}>{mySalon.title}</h1>
          {guide && <p style={{ fontSize: '14px', color: muted }}>Guide: {guide.display_name} <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', color: gold, marginLeft: '6px' }}>{GUIDE_LEVELS[guide.guide_level] || ''}</span></p>}
          {stats && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '1rem' }}>
              <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', color: gold, border: `1px solid ${gold}44`, padding: '4px 12px', borderRadius: '10px' }}>WEEK {stats.current_week} OF 7</span>
            </div>
          )}
          {stats && <div style={{ maxWidth: '300px', margin: '0.75rem auto 0', height: '4px', background: '#1a1a1a', borderRadius: '2px' }}><div style={{ height: '100%', width: `${(stats.current_week / 7) * 100}%`, background: gold, borderRadius: '2px' }} /></div>}
        </section>

        {/* Sessions */}
        <section data-fade style={{ padding: '0 2rem 3rem', opacity: 0, transition: 'opacity 0.9s ease' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem' }}>UPCOMING SESSIONS</div>
            {upcomingSessions.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: `1px solid ${gold}08` }}>
                <div style={{ width: '70px', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', color: parchment }}>{new Date(s.session_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '15px', color: parchment }}>{s.topic || `Session ${s.session_number}`}</div>
                </div>
                {s.track && <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: TRACK_COLORS[s.track] || gold, border: `1px solid ${TRACK_COLORS[s.track] || gold}44`, padding: '2px 8px', borderRadius: '10px' }}>{s.track.toUpperCase()}</span>}
                <span style={{ fontSize: '12px', color: s.status === 'completed' ? '#4CAF50' : muted }}>{s.status === 'completed' ? '\u2713' : s.status === 'live' ? '\u25cf LIVE' : ''}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Members */}
        <section data-fade style={{ padding: '0 2rem 3rem', opacity: 0, transition: 'opacity 0.9s ease' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem' }}>MEMBERS</div>
            {members.map((m: any) => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: `1px solid ${gold}08` }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: `${gold}22`, border: `1px solid ${gold}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '10px', color: gold }}>{(m.members?.display_name || '?')[0].toUpperCase()}</div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '15px', color: parchment }}>{m.members?.display_name || 'Explorer'}</span>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', color: m.role === 'guide' ? gold : muted, marginLeft: '8px' }}>{m.role.toUpperCase()}</span>
                </div>
                <span style={{ fontSize: '12px', color: muted }}>{m.sessions_attended || 0} sessions</span>
              </div>
            ))}
          </div>
        </section>

        <PublicFooter />
      </div>
    );
  }

  // RECRUITING VIEW
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />
      <section style={{ padding: '8rem 2rem 3rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1.5rem' }}>FIND YOUR SALON</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(24px, 5vw, 36px)', fontWeight: 400, fontStyle: 'italic', color: parchment, marginBottom: '0.75rem' }}>
            Seven people. Seven weeks. One question worth exploring.
          </h1>
          <p style={{ fontSize: '16px', color: muted, lineHeight: 1.7 }}>Join a salon. Lead sessions. Graduate as a Guide. Start your own.</p>
        </div>
      </section>

      <section data-fade style={{ padding: '0 2rem 4rem', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {recruiting.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', border: `1px solid ${gold}15` }}>
              <p style={{ fontSize: '18px', color: muted, fontStyle: 'italic', marginBottom: '0.75rem' }}>No salons recruiting right now.</p>
              <p style={{ fontSize: '14px', color: muted, marginBottom: '1.5rem' }}>Start your daily practice while you wait. The first salon launches when we reach 8 members.</p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <a href="/practice" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, padding: '0 20px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '40px' }}>DAILY PRACTICE</a>
                <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: gold, textDecoration: 'none', border: `1px solid ${gold}44`, padding: '0 20px', display: 'inline-flex', alignItems: 'center', height: '40px' }}>JOIN</a>
              </div>
            </div>
          )}
          {recruiting.map(s => (
            <div key={s.id} style={{ background: '#0d0d0d', border: `1px solid rgba(201,168,76,0.15)`, padding: '1.5rem 2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: gold, marginBottom: '4px' }}>{s.title}</div>
                  {s.guide_name && <div style={{ fontSize: '13px', color: muted }}>Guide: {s.guide_name}</div>}
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {(s.topic_rotation || []).map((t: string) => (
                    <span key={t} style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.08em', color: TRACK_COLORS[t] || muted, border: `1px solid ${TRACK_COLORS[t] || muted}44`, padding: '2px 6px', borderRadius: '8px' }}>{t.toUpperCase()}</span>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '13px', color: muted }}>{s.member_count}/{s.max_members} explorers</span>
                  <div style={{ width: '100px', height: '3px', background: '#1a1a1a', borderRadius: '2px', marginTop: '4px' }}><div style={{ height: '100%', width: `${(s.member_count / s.max_members) * 100}%`, background: gold, borderRadius: '2px' }} /></div>
                </div>
                <button onClick={() => joinSalon(s.id)} disabled={joining === s.id}
                  style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, border: 'none', height: '40px', padding: '0 20px', cursor: 'pointer', borderRadius: 0, opacity: joining === s.id ? 0.5 : 1 }}>
                  {joining === s.id ? '...' : 'JOIN'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
