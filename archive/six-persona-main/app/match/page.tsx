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

const THINKER_NAMES: Record<string, string> = { socrates: 'Socrates', plato: 'Plato', aurelius: 'Marcus Aurelius', nietzsche: 'Nietzsche', einstein: 'Einstein', jobs: 'Steve Jobs' };

export default function MatchPage() {
  const [memberId, setMemberId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [activeMatch, setActiveMatch] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [totalResponses, setTotalResponses] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const session = await getMemberSession();
        if (session?.member) {
          setMemberId(session.member.id);
          setTotalResponses((session.member as any).total_responses || 0);
        }
        const supabase = createClient();
        const { data: { session: auth } } = await supabase.auth.getSession();
        if (auth?.access_token) setAuthToken(auth.access_token);
      } catch {}
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (!authToken) return;
    fetch('/api/match/history', { headers: { 'Authorization': `Bearer ${authToken}` } })
      .then(r => r.json()).then(d => {
        const all = d.matches || [];
        setMatches(all.filter((m: any) => m.status === 'completed' || m.status === 'declined'));
        const active = all.find((m: any) => m.status === 'pending' || m.status === 'accepted');
        if (active) setActiveMatch(active);
      }).catch(() => {});
  }, [authToken]);

  async function generateMatch() {
    if (!authToken) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/match/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: '{}',
      });
      const data = await res.json();
      if (data.match) setActiveMatch(data.match);
    } catch {}
    setGenerating(false);
  }

  async function respondToMatch(action: string) {
    if (!activeMatch?.id || !authToken) return;
    await fetch('/api/match/respond', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({ matchId: activeMatch.id, action, rating: action === 'complete' ? rating : undefined }),
    });
    if (action === 'decline') setActiveMatch(null);
    if (action === 'accept') setActiveMatch({ ...activeMatch, status: 'accepted' });
    if (action === 'complete') { setActiveMatch(null); setShowRating(false); }
  }

  const eligible = totalResponses >= 7;

  if (loading) return <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PublicNav /><span style={{ color: muted, fontFamily: 'Cinzel, serif', fontSize: '11px' }}>LOADING...</span></div>;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <section style={{ padding: '8rem 2rem 2rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>MATCHED CONVERSATIONS</div>

          {!memberId ? (
            <div>
              <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '28px', fontWeight: 400, fontStyle: 'italic', color: parchment, marginBottom: '1rem' }}>Philosophical conversations with fellow explorers</h1>
              <a href="/login" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: gold, border: `1px solid ${gold}44`, padding: '12px 24px', textDecoration: 'none' }}>SIGN IN TO START</a>
            </div>
          ) : activeMatch ? (
            <div style={{ background: '#0d0d0d', border: `1px solid ${gold}22`, padding: '2rem', textAlign: 'left' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: gold, marginBottom: '1rem' }}>
                {activeMatch.status === 'pending' ? 'NEW MATCH' : 'CONVERSATION IN PROGRESS'}
              </div>
              <div style={{ fontSize: '18px', color: parchment, marginBottom: '0.5rem' }}>Matched with <strong>{activeMatch.partner_name || activeMatch.partner_display_name || 'Explorer'}</strong></div>
              <div style={{ fontSize: '14px', color: muted, marginBottom: '0.5rem' }}>Facilitated by {THINKER_NAMES[activeMatch.thinker_id] || activeMatch.thinker_id}</div>
              {activeMatch.match_reason && <p style={{ fontSize: '14px', color: ivory85, fontStyle: 'italic', marginBottom: '1.5rem' }}>{activeMatch.match_reason}</p>}

              {/* Prompts */}
              {activeMatch.prompts && Array.isArray(activeMatch.prompts) && activeMatch.prompts.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.12em', color: gold, marginBottom: '0.5rem' }}>DISCUSSION PROMPTS</div>
                  {activeMatch.prompts.map((p: any, i: number) => (
                    <div key={i} style={{ padding: '10px 12px', borderLeft: `2px solid ${i === 0 ? gold : `${gold}44`}`, marginBottom: '6px', background: i === 0 ? `${gold}08` : 'transparent' }}>
                      <span style={{ fontSize: '14px', color: parchment }}>{p.prompt}</span>
                    </div>
                  ))}
                </div>
              )}

              {activeMatch.status === 'pending' && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => respondToMatch('accept')} style={{ flex: 1, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, border: 'none', height: '44px', cursor: 'pointer' }}>ACCEPT</button>
                  <button onClick={() => respondToMatch('decline')} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: muted, background: 'none', border: `1px solid ${muted}44`, padding: '0 20px', height: '44px', cursor: 'pointer' }}>DECLINE</button>
                </div>
              )}

              {activeMatch.status === 'accepted' && !showRating && (
                <button onClick={() => setShowRating(true)} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: gold, background: 'none', border: `1px solid ${gold}`, height: '44px', padding: '0 24px', cursor: 'pointer' }}>MARK COMPLETE</button>
              )}

              {showRating && (
                <div style={{ marginTop: '1rem' }}>
                  <div style={{ fontSize: '14px', color: muted, marginBottom: '0.5rem' }}>Rate this conversation:</div>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => setRating(n)} style={{ width: '36px', height: '36px', background: n <= rating ? gold : '#111', border: `1px solid ${gold}44`, color: n <= rating ? '#0a0a0a' : muted, fontFamily: 'Cinzel, serif', cursor: 'pointer' }}>{n}</button>
                    ))}
                  </div>
                  <button onClick={() => respondToMatch('complete')} disabled={!rating} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: '#0a0a0a', background: gold, border: 'none', height: '44px', padding: '0 24px', cursor: 'pointer', opacity: rating ? 1 : 0.4 }}>SUBMIT RATING</button>
                </div>
              )}
            </div>
          ) : (
            <div>
              <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '28px', fontWeight: 400, fontStyle: 'italic', color: parchment, marginBottom: '1rem' }}>Ready for a philosophical conversation?</h1>
              {!eligible ? (
                <div>
                  <p style={{ fontSize: '16px', color: muted, marginBottom: '1rem' }}>Answer 7 daily questions to unlock matching.</p>
                  <div style={{ width: '200px', height: '6px', background: '#1a1a1a', borderRadius: '3px', margin: '0 auto 1rem' }}>
                    <div style={{ height: '100%', width: `${Math.min((totalResponses / 7) * 100, 100)}%`, background: gold, borderRadius: '3px' }} />
                  </div>
                  <span style={{ fontSize: '14px', color: muted }}>{totalResponses}/7 responses</span>
                  <div style={{ marginTop: '1.5rem' }}>
                    <a href="/practice" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: gold, border: `1px solid ${gold}`, padding: '10px 24px', textDecoration: 'none' }}>GO TO DAILY PRACTICE</a>
                  </div>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: '16px', color: muted, marginBottom: '1.5rem' }}>We'll match you with someone who shares your philosophical interests.</p>
                  <button onClick={generateMatch} disabled={generating} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, border: 'none', height: '48px', padding: '0 28px', cursor: 'pointer', opacity: generating ? 0.5 : 1 }}>
                    {generating ? 'FINDING YOUR MATCH...' : 'FIND MY MATCH'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Match history */}
      {matches.length > 0 && (
        <section style={{ padding: '2rem' }}>
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem' }}>PAST CONVERSATIONS</div>
            {matches.map(m => (
              <div key={m.id} style={{ padding: '10px 0', borderBottom: `1px solid ${gold}08`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '15px', color: parchment }}>{m.partner_name}</span>
                  <span style={{ fontSize: '12px', color: muted, marginLeft: '8px' }}>{THINKER_NAMES[m.thinker_id] || ''}</span>
                </div>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', color: m.status === 'completed' ? '#4CAF50' : muted }}>{m.status.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <PublicFooter />
    </div>
  );
}
