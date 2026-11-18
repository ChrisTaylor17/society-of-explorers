'use client';
import { useState, useEffect } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { getMemberSession } from '@/lib/auth/getSession';
import { createClient } from '@/lib/supabase/client';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

const TRACK_COLORS: Record<string, string> = { singularity: '#4169E1', blockchain: '#c9a84c', consciousness: '#7B68EE' };
const TRACK_LABELS: Record<string, string> = { singularity: 'Singularity & AI', blockchain: 'Blockchain & Data Sovereignty', consciousness: 'The Secret & Consciousness' };
const GUIDE_LEVELS = ['', 'Guide', 'Senior Guide', 'Master Guide'];

export default function SalonPage() {
  const [memberId, setMemberId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [mySalon, setMySalon] = useState<any>(null);
  const [recruiting, setRecruiting] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [guide, setGuide] = useState<any>(null);
  const [myMembership, setMyMembership] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const session = await getMemberSession();
        if (session?.member) setMemberId(session.member.id);
        const supabase = createClient();
        const { data: { session: auth } } = await supabase.auth.getSession();
        if (auth?.access_token) setAuthToken(auth.access_token);
      } catch {}

      const res = await fetch('/api/salons?status=recruiting,active');
      const data = await res.json();
      setRecruiting(data.salons || []);
      setLoading(false);
    }
    load();
  }, []);

  // Check if member is in a salon
  useEffect(() => {
    if (!authToken) return;
    fetch('/api/salons/my-salon', { headers: { 'Authorization': `Bearer ${authToken}` } })
      .then(r => r.json())
      .then(d => {
        if (d.salon) {
          setMySalon(d.salon);
          setMembers(d.members || []);
          setSessions(d.sessions || []);
          setStats(d.stats);
          setGuide(d.guide);
          setMyMembership(d.myMembership);
        }
      }).catch(() => {});
  }, [authToken]);

  async function joinSalon(salonId: string) {
    if (!memberId) { window.location.href = '/login'; return; }
    setJoining(salonId);
    try {
      const res = await fetch(`/api/salons/${salonId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({ action: 'join' }),
      });
      const data = await res.json();
      if (data.success) {
        const detail = await fetch(`/api/salons/${salonId}`, {
          headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {},
        }).then(r => r.json());
        setMySalon(detail.salon);
        setMembers(detail.members || []);
        setSessions(detail.sessions || []);
        setStats(detail.stats);
        setGuide(detail.guide);
        setMyMembership(detail.myMembership);
      }
    } catch {}
    setJoining(null);
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
    const upcomingSessions = sessions.filter(s => s.status === 'scheduled' || s.status === 'live').slice(0, 7);
    const completedSessions = sessions.filter(s => s.status === 'completed');
    const totalSessions = 35;
    const sessionsLed = myMembership?.sessions_led || 0;
    const sessionsAttended = myMembership?.sessions_attended || 0;
    const isGuideCandidate = myMembership?.is_guide_candidate || false;
    const graduationReq = 5; // must lead 5 sessions (one full week)

    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif', animation: 'fadeIn 0.8s ease' }}>
        <PublicNav />

        {/* Header */}
        <section style={{ padding: '8rem 2rem 2rem', textAlign: 'center' }}>
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>YOUR SALON</div>
            <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(24px, 5vw, 36px)', fontWeight: 400, fontStyle: 'italic', color: parchment, marginBottom: '0.75rem' }}>{mySalon.title}</h1>
            {guide && (
              <p style={{ fontSize: '14px', color: muted }}>
                Guide: {guide.display_name}
                {guide.guide_level > 0 && <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', color: gold, marginLeft: '8px' }}>{GUIDE_LEVELS[guide.guide_level]}</span>}
              </p>
            )}

            {/* Week progress */}
            {stats && (
              <div style={{ marginTop: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '0.75rem' }}>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', color: gold, border: `1px solid ${gold}44`, padding: '4px 14px', borderRadius: '10px' }}>WEEK {stats.current_week} OF 7</span>
                  {mySalon.status === 'graduating' && <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', color: '#4CAF50', border: '1px solid rgba(76,175,80,0.4)', padding: '4px 14px', borderRadius: '10px' }}>GRADUATING</span>}
                </div>
                <div style={{ maxWidth: '300px', margin: '0 auto', height: '4px', background: '#1a1a1a', borderRadius: '2px' }}>
                  <div style={{ height: '100%', width: `${(stats.current_week / 7) * 100}%`, background: gold, borderRadius: '2px', transition: 'width 0.5s ease' }} />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Graduation Progress */}
        <section data-fade style={{ padding: '0 2rem 2rem', opacity: 0, transition: 'opacity 0.9s ease' }}>
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ background: '#0d0d0d', border: `1px solid ${gold}15`, padding: '1.5rem' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem' }}>GRADUATION PROGRESS</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '28px', color: sessionsAttended > 0 ? parchment : muted }}>{sessionsAttended}</div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted }}>ATTENDED</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '28px', color: sessionsLed >= graduationReq ? gold : sessionsLed > 0 ? parchment : muted }}>{sessionsLed}/{graduationReq}</div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted }}>SESSIONS LED</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '28px', color: isGuideCandidate ? gold : muted }}>{isGuideCandidate ? '\u2713' : '\u2014'}</div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted }}>GUIDE CANDIDATE</div>
                </div>
              </div>
              {sessionsLed < graduationReq ? (
                <p style={{ fontSize: '13px', color: muted, fontStyle: 'italic', textAlign: 'center' }}>Lead {graduationReq - sessionsLed} more session{graduationReq - sessionsLed !== 1 ? 's' : ''} to qualify for graduation.</p>
              ) : (
                <p style={{ fontSize: '13px', color: gold, fontStyle: 'italic', textAlign: 'center' }}>You&apos;ve met the graduation requirement. Guide status awaits.</p>
              )}
            </div>
          </div>
        </section>

        {/* Sessions */}
        <section data-fade style={{ padding: '0 2rem 3rem', opacity: 0, transition: 'opacity 0.9s ease' }}>
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem' }}>
              {upcomingSessions.length > 0 ? 'UPCOMING SESSIONS' : 'SESSION CALENDAR'}
            </div>
            {upcomingSessions.length === 0 && completedSessions.length === 0 ? (
              <p style={{ fontSize: '14px', color: muted, fontStyle: 'italic' }}>Sessions will appear here once your salon begins.</p>
            ) : (
              <>
                {upcomingSessions.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: `1px solid ${gold}08` }}>
                    <div style={{ width: '80px', flexShrink: 0 }}>
                      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', color: parchment }}>{new Date(s.session_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', color: parchment }}>{s.topic || `Session ${s.session_number}`}</div>
                      {s.led_by_name && <div style={{ fontSize: '12px', color: muted }}>Led by {s.led_by_name}</div>}
                    </div>
                    {s.track && <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: TRACK_COLORS[s.track] || gold, border: `1px solid ${TRACK_COLORS[s.track] || gold}44`, padding: '2px 8px', borderRadius: '10px' }}>{s.track.toUpperCase()}</span>}
                    <span style={{ fontSize: '12px', color: s.status === 'completed' ? '#4CAF50' : s.status === 'live' ? '#FF6B35' : muted }}>
                      {s.status === 'completed' ? '\u2713' : s.status === 'live' ? '\u25cf LIVE' : ''}
                    </span>
                  </div>
                ))}
                {completedSessions.length > 0 && (
                  <div style={{ marginTop: '1rem' }}>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted, marginBottom: '0.5rem' }}>{completedSessions.length} SESSION{completedSessions.length !== 1 ? 'S' : ''} COMPLETED</div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* Members */}
        <section data-fade style={{ padding: '0 2rem 3rem', opacity: 0, transition: 'opacity 0.9s ease' }}>
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem' }}>MEMBERS ({members.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {members.map((m: any) => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: '#0d0d0d', border: `1px solid ${gold}08`, transition: 'border-color 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = `${gold}33`}
                  onMouseLeave={e => e.currentTarget.style.borderColor = `${gold}08`}>
                  <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: m.role === 'guide' ? `${gold}22` : '#1a1a1a', border: `1px solid ${m.role === 'guide' ? gold : `${gold}44`}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '11px', color: m.role === 'guide' ? gold : parchment }}>
                    {(m.members?.display_name || '?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: '15px', color: parchment }}>{m.members?.display_name || 'Explorer'}</span>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', color: m.role === 'guide' ? gold : m.is_guide_candidate ? '#4CAF50' : muted, marginLeft: '8px' }}>
                      {m.role === 'guide' ? 'GUIDE' : m.is_guide_candidate ? 'GRADUATING' : m.role?.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '12px', color: muted }}>
                    <div>{m.sessions_attended || 0} attended</div>
                    <div>{m.sessions_led || 0} led</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <PublicFooter />
        <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
      </div>
    );
  }

  // RECRUITING VIEW (not in a salon)
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif', animation: 'fadeIn 0.8s ease' }}>
      <PublicNav />

      {/* Hero */}
      <section style={{ padding: '8rem 2rem 3rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1.5rem' }}>FIND YOUR SALON</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(24px, 5vw, 36px)', fontWeight: 400, fontStyle: 'italic', color: parchment, marginBottom: '0.75rem' }}>
            Seven people. Seven weeks. One question worth exploring.
          </h1>
          <p style={{ fontSize: '16px', color: ivory85, lineHeight: 1.7, maxWidth: '520px', margin: '0 auto' }}>
            Join a salon. Lead sessions. Graduate as a Guide. Start your own.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section data-fade style={{ padding: '0 2rem 3rem', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto', display: 'flex', gap: '1px', background: `${gold}10` }}>
          {[
            { num: '01', title: 'JOIN', desc: 'Find a salon with open seats. Max 7 per cohort.' },
            { num: '02', title: 'LEAD', desc: 'Every member leads sessions. You learn by doing.' },
            { num: '03', title: 'GRADUATE', desc: 'Complete 7 weeks. Become a Guide. Start your own salon.' },
          ].map(step => (
            <div key={step.num} style={{ flex: 1, background: '#0d0d0d', padding: '1.5rem 1.25rem', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '24px', color: gold, marginBottom: '0.5rem' }}>{step.num}</div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: parchment, marginBottom: '0.5rem' }}>{step.title}</div>
              <p style={{ fontSize: '13px', color: muted, lineHeight: 1.5 }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tracks */}
      <section data-fade style={{ padding: '0 2rem 3rem', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem', textAlign: 'center' }}>THREE TRACKS, ROTATED WEEKLY</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {Object.entries(TRACK_LABELS).map(([key, label]) => (
              <div key={key} style={{ padding: '10px 16px', border: `1px solid ${TRACK_COLORS[key]}33`, background: `${TRACK_COLORS[key]}08` }}>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.1em', color: TRACK_COLORS[key] }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Salon Grid */}
      <section data-fade style={{ padding: '0 2rem 4rem', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem' }}>
            {recruiting.length > 0 ? `${recruiting.length} SALON${recruiting.length !== 1 ? 'S' : ''} RECRUITING` : 'OPEN SALONS'}
          </div>

          {recruiting.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', border: `1px solid ${gold}15`, background: '#0d0d0d' }}>
              <p style={{ fontSize: '18px', color: parchment, fontStyle: 'italic', marginBottom: '0.75rem' }}>No salons recruiting right now.</p>
              <p style={{ fontSize: '14px', color: muted, marginBottom: '1.5rem' }}>Start your daily practice while you wait. The first salon launches when we reach 8 members.</p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <a href="/practice" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, padding: '0 20px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '40px' }}>DAILY PRACTICE</a>
                <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: gold, textDecoration: 'none', border: `1px solid ${gold}44`, padding: '0 20px', display: 'inline-flex', alignItems: 'center', height: '40px' }}>JOIN THE SOCIETY</a>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {recruiting.map(s => (
                <div key={s.id} style={{ background: '#0d0d0d', border: `1px solid rgba(201,168,76,0.15)`, padding: '1.5rem 2rem', transition: 'border-color 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = `${gold}66`}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)'}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div>
                      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: gold, marginBottom: '4px' }}>{s.title}</div>
                      {s.guide_name && <div style={{ fontSize: '13px', color: muted }}>Guide: {s.guide_name}</div>}
                      {s.description && <p style={{ fontSize: '14px', color: ivory85, marginTop: '6px', lineHeight: 1.5 }}>{s.description}</p>}
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                      {(s.topic_rotation || []).map((t: string) => (
                        <span key={t} style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.08em', color: TRACK_COLORS[t] || muted, border: `1px solid ${TRACK_COLORS[t] || muted}44`, padding: '2px 6px', borderRadius: '8px' }}>{t.toUpperCase()}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: '13px', color: muted }}>{s.member_count}/{s.max_members} explorers</span>
                      <div style={{ width: '120px', height: '3px', background: '#1a1a1a', borderRadius: '2px', marginTop: '4px' }}>
                        <div style={{ height: '100%', width: `${(s.member_count / s.max_members) * 100}%`, background: s.member_count >= s.max_members ? '#4CAF50' : gold, borderRadius: '2px', transition: 'width 0.3s ease' }} />
                      </div>
                    </div>
                    <button onClick={() => joinSalon(s.id)} disabled={joining === s.id || s.member_count >= s.max_members}
                      style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, border: 'none', height: '40px', padding: '0 20px', cursor: 'pointer', borderRadius: 0, opacity: (joining === s.id || s.member_count >= s.max_members) ? 0.4 : 1, transition: 'opacity 0.2s' }}>
                      {joining === s.id ? 'JOINING...' : s.member_count >= s.max_members ? 'FULL' : 'JOIN'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Bottom CTA */}
      <section style={{ padding: '2rem 2rem 4rem', textAlign: 'center' }}>
        <div style={{ width: '60px', height: '1px', background: `${gold}4d`, margin: '0 auto 2rem' }} />
        <p style={{ fontSize: '16px', color: muted, fontStyle: 'italic', marginBottom: '0.5rem' }}>Every Guide started as a member.</p>
        <a href="/leaderboard" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: gold, textDecoration: 'none' }}>VIEW THE LEADERBOARD &rarr;</a>
      </section>

      <PublicFooter />
      <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
    </div>
  );
}
