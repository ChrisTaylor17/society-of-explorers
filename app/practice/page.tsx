'use client';
import { useState, useEffect, useRef } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { getMemberSession } from '@/lib/auth/getSession';
import { createClient } from '@/lib/supabase/client';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

const THINKER_NAMES: Record<string, string> = { socrates: 'Socrates', plato: 'Plato', aurelius: 'Marcus Aurelius', nietzsche: 'Nietzsche', einstein: 'Einstein', jobs: 'Steve Jobs' };
const THINKER_COLORS: Record<string, string> = { socrates: '#C9A94E', plato: '#7B68EE', aurelius: '#8B7355', nietzsche: '#DC143C', einstein: '#4169E1', jobs: '#A0A0A0' };
const THINKER_AVATARS: Record<string, string> = { socrates: 'SO', plato: 'PL', aurelius: 'MA', nietzsche: 'FN', einstein: 'AE', jobs: 'SJ' };

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function streakMessage(s: number): string {
  if (s === 0) return 'Start your streak today';
  if (s <= 2) return 'Building momentum...';
  if (s <= 6) return 'You\u2019re on fire \ud83d\udd25';
  return 'Philosopher-level dedication';
}

export default function PracticePage() {
  const [question, setQuestion] = useState<any>(null);
  const [response, setResponse] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [streak, setStreak] = useState({ current_streak: 0, longest_streak: 0, total_responses: 0 });
  const [responses, setResponses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [myResponse, setMyResponse] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const session = await getMemberSession();
        if (session?.member) setMemberId(session.member.id);
        const supabase = createClient();
        const { data: { session: auth } } = await supabase.auth.getSession();
        if (auth?.access_token) setAuthToken(auth.access_token);
      } catch {}

      const qRes = await fetch('/api/practice/today');
      const qData = await qRes.json();
      if (qData.question) setQuestion(qData.question);
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (!question?.id) return;

    if (memberId) {
      fetch('/api/practice/streak', { headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {} })
        .then(r => r.json()).then(setStreak).catch(() => {});
    }

    function loadResponses() {
      fetch(`/api/practice/responses?questionId=${question.id}`)
        .then(r => r.json()).then(d => setResponses(d.responses || [])).catch(() => {});
    }
    loadResponses();
    intervalRef.current = setInterval(loadResponses, 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [question?.id, authToken, memberId]);

  async function handleSubmit() {
    if (!response.trim() || !question?.id) return;
    if (!memberId) { window.location.href = '/login'; return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/practice/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({ questionId: question.id, responseText: response.trim(), memberId }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
        setMyResponse(response.trim());
        setStreak({ current_streak: data.streak, longest_streak: data.longest, total_responses: data.total });
        setResponses(prev => [...prev, { id: 'mine', display_name: 'You', response_text: response.trim(), created_at: new Date().toISOString() }]);
      }
    } catch {}
    setSubmitting(false);
  }

  function buildShareText() {
    return `\u201c${question.question_text}\u201d \u2014 ${thinkerName}\n\nMy answer: ${myResponse}\n\nhttps://societyofexplorers.com/practice`;
  }

  function handleShare() {
    navigator.clipboard.writeText(buildShareText()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  function handleNativeShare() {
    if (navigator.share) {
      navigator.share({ title: `${thinkerName} asks...`, text: buildShareText() }).catch(() => {});
    } else {
      handleShare();
    }
  }

  function handleInvite() {
    const inviteText = `I\u2019ve been doing this daily philosophical practice \u2014 one question every morning from AI thinkers like Socrates and Nietzsche. Try today\u2019s question:\n\nhttps://societyofexplorers.com/practice`;
    navigator.clipboard.writeText(inviteText).then(() => {
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    }).catch(() => {});
  }

  const thinkerName = question ? THINKER_NAMES[question.thinker_id] || question.thinker_id : '';
  const thinkerColor = question ? THINKER_COLORS[question.thinker_id] || gold : gold;
  const thinkerAvatar = question ? THINKER_AVATARS[question.thinker_id] || '??' : '??';

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif', animation: 'fadeIn 0.8s ease' }}>
      <PublicNav />

      {/* TODAY'S QUESTION */}
      <section style={{ padding: '8rem 2rem 3rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '1.5rem' }}>DAILY PRACTICE</div>

          {loading ? (
            <p style={{ fontSize: '16px', color: muted, fontStyle: 'italic' }}>Loading today&apos;s question...</p>
          ) : question ? (
            <>
              {/* Thinker avatar */}
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: `${thinkerColor}18`, border: `2px solid ${thinkerColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontFamily: 'Cinzel, serif', fontSize: '11px', color: thinkerColor }}>{thinkerAvatar}</div>

              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: thinkerColor, marginBottom: '1.5rem' }}>
                {thinkerName.toUpperCase()} ASKS:
              </div>
              <h1 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 'clamp(24px, 5vw, 34px)', fontWeight: 400, fontStyle: 'italic', lineHeight: 1.5, color: parchment, marginBottom: '0.75rem' }}>
                &ldquo;{question.question_text}&rdquo;
              </h1>
              {question.question_context && (
                <p style={{ fontSize: '14px', color: muted, fontStyle: 'italic', marginBottom: '1.5rem' }}>{question.question_context}</p>
              )}

              {/* Gold divider */}
              <div style={{ width: '60px', height: '1px', background: `${gold}4d`, margin: '0 auto 2rem' }} />

              {/* Response area */}
              {submitted || myResponse ? (
                <div style={{ animation: 'fadeIn 0.5s ease' }}>
                  {/* Your response card */}
                  <div style={{ background: '#0d0d0d', border: `1px solid ${gold}22`, padding: '16px', textAlign: 'left', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: gold }}>YOUR RESPONSE</span>
                      <span style={{ fontSize: '12px', color: '#4CAF50' }}>{'\u2713'}</span>
                    </div>
                    <p style={{ fontSize: '15px', color: parchment, lineHeight: 1.7, margin: 0 }}>{myResponse || response}</p>
                  </div>

                  {/* Share + Invite row */}
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                    <button onClick={() => setShowShareCard(!showShareCard)} style={{
                      fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.12em', color: gold,
                      background: 'transparent', border: `1px solid ${gold}44`, padding: '8px 20px', cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.background = `${gold}0a`; e.currentTarget.style.borderColor = gold; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = `${gold}44`; }}
                    >SHARE YOUR ANSWER</button>
                    <button onClick={handleInvite} style={{
                      fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.12em', color: muted,
                      background: 'transparent', border: `1px solid ${muted}33`, padding: '8px 20px', cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.color = gold; e.currentTarget.style.borderColor = `${gold}44`; }}
                      onMouseLeave={e => { e.currentTarget.style.color = muted; e.currentTarget.style.borderColor = `${muted}33`; }}
                    >{inviteCopied ? 'LINK COPIED!' : 'INVITE A FRIEND'}</button>
                  </div>

                  {/* Expandable share card */}
                  {showShareCard && (
                    <div style={{ animation: 'fadeIn 0.3s ease', marginBottom: '1rem' }}>
                      <div style={{
                        background: '#0d0d0d', border: `1px solid ${gold}33`, padding: '1.5rem',
                        maxWidth: '440px', margin: '0.75rem auto 0', textAlign: 'left',
                        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
                      }}>
                        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.2em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>SOCIETY OF EXPLORERS</div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: `${thinkerColor}18`, border: `1.5px solid ${thinkerColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '8px', color: thinkerColor }}>{thinkerAvatar}</div>
                          <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', color: thinkerColor }}>{thinkerName.toUpperCase()}</span>
                        </div>
                        <p style={{ fontSize: '16px', color: parchment, fontStyle: 'italic', lineHeight: 1.6, marginBottom: '1rem' }}>&ldquo;{question.question_text}&rdquo;</p>
                        <div style={{ borderTop: `1px solid ${gold}15`, paddingTop: '0.75rem' }}>
                          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted, marginBottom: '4px' }}>MY ANSWER</div>
                          <p style={{ fontSize: '14px', color: ivory85, lineHeight: 1.6, margin: 0 }}>{myResponse || response}</p>
                        </div>
                        <div style={{ borderTop: `1px solid ${gold}08`, marginTop: '1rem', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: `${gold}66` }}>societyofexplorers.com/practice</span>
                          <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', color: `${muted}88` }}>Daily Practice</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '0.75rem' }}>
                        <button onClick={handleShare} style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: gold, background: `${gold}0a`, border: `1px solid ${gold}44`, padding: '6px 16px', cursor: 'pointer' }}>
                          {copied ? 'COPIED!' : 'COPY TEXT'}
                        </button>
                        <button onClick={handleNativeShare} style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: gold, background: `${gold}0a`, border: `1px solid ${gold}44`, padding: '6px 16px', cursor: 'pointer' }}>
                          SHARE...
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : memberId ? (
                <div style={{ marginBottom: '1rem' }}>
                  <textarea
                    value={response} onChange={e => setResponse(e.target.value.slice(0, 280))}
                    placeholder="Your response..."
                    rows={3}
                    style={{ width: '100%', background: '#0d0d0d', border: `1px solid ${gold}22`, padding: '14px 16px 28px', fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: parchment, outline: 'none', resize: 'none', boxSizing: 'border-box', transition: 'box-shadow 0.2s' }}
                    onFocus={e => e.target.style.boxShadow = `0 0 0 1px rgba(201,168,76,0.3)`}
                    onBlur={e => e.target.style.boxShadow = 'none'}
                  />
                  <div style={{ textAlign: 'right', marginTop: '-22px', marginRight: '12px', marginBottom: '12px', position: 'relative', zIndex: 1 }}>
                    <span style={{ fontSize: '10px', color: response.length > 260 ? '#DC143C' : `${muted}88` }}>{response.length}/280</span>
                  </div>
                  <button onClick={handleSubmit} disabled={submitting || !response.trim()}
                    style={{ width: '100%', fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: gold, background: 'transparent', border: `1px solid ${gold}`, height: '48px', cursor: 'pointer', opacity: submitting || !response.trim() ? 0.4 : 1, borderRadius: 0, transition: 'background 0.2s' }}
                    onMouseEnter={e => { if (!submitting && response.trim()) e.currentTarget.style.background = 'rgba(201,168,76,0.08)'; }}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    {submitting ? 'SUBMITTING...' : 'RESPOND'}
                  </button>
                </div>
              ) : (
                <div style={{ marginBottom: '1rem' }}>
                  <a href="/login" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: gold, border: `1px solid ${gold}`, padding: '14px 28px', textDecoration: 'none', display: 'inline-block' }}>SIGN IN TO RESPOND</a>
                </div>
              )}
            </>
          ) : (
            <p style={{ fontSize: '16px', color: muted }}>No question available today.</p>
          )}
        </div>
      </section>

      {/* MATCH UNLOCK BANNER */}
      {memberId && streak.total_responses >= 7 && (
        <section style={{ padding: '0 2rem 1.5rem' }}>
          <div style={{ maxWidth: '500px', margin: '0 auto' }}>
            <a href="/match" style={{ display: 'block', background: `${gold}0a`, border: `1px solid ${gold}22`, padding: '16px 20px', textDecoration: 'none', textAlign: 'center', transition: 'border-color 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = `${gold}66`}
              onMouseLeave={e => e.currentTarget.style.borderColor = `${gold}22`}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, marginBottom: '6px' }}>UNLOCKED</div>
              <div style={{ fontSize: '16px', color: parchment, marginBottom: '4px' }}>You&apos;ve earned a Matched Conversation</div>
              <div style={{ fontSize: '13px', color: muted }}>We&apos;ll pair you with a fellow explorer for a structured philosophical exchange.</div>
            </a>
          </div>
        </section>
      )}

      {/* STREAK */}
      <section style={{ padding: '0 2rem 3rem' }}>
        <div style={{ maxWidth: '500px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '2.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Playfair Display, serif', fontSize: streak.current_streak > 0 ? '32px' : '24px', color: streak.current_streak >= 3 ? gold : streak.current_streak > 0 ? parchment : muted, transition: 'all 0.3s' }}>{streak.current_streak}</div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted }}>DAY STREAK</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '24px', color: muted }}>{streak.total_responses}</div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted }}>TOTAL</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '24px', color: muted }}>{streak.longest_streak}</div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted }}>LONGEST</div>
            </div>
          </div>
          <p style={{ fontSize: '13px', color: muted, fontStyle: 'italic' }}>{streakMessage(streak.current_streak)}</p>
          {streak.total_responses > 0 && streak.total_responses < 7 && (
            <div style={{ marginTop: '0.75rem' }}>
              <div style={{ width: '200px', height: '4px', background: '#1a1a1a', borderRadius: '2px', margin: '0 auto' }}>
                <div style={{ height: '100%', width: `${Math.min((streak.total_responses / 7) * 100, 100)}%`, background: gold, borderRadius: '2px', transition: 'width 0.5s ease' }} />
              </div>
              <p style={{ fontSize: '11px', color: `${muted}88`, marginTop: '4px' }}>{streak.total_responses}/7 to unlock Matched Conversations</p>
            </div>
          )}
        </div>
      </section>

      {/* COMMUNITY RESPONSES */}
      <section style={{ padding: '3rem 2rem' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem' }}>
            {responses.length > 0
              ? `${responses.length} EXPLORER${responses.length !== 1 ? 'S' : ''} ANSWERED TODAY`
              : 'WHAT OTHERS ARE THINKING'}
          </div>

          {responses.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <p style={{ fontSize: '16px', color: muted, fontStyle: 'italic', marginBottom: '0.5rem' }}>Be the first to respond today.</p>
              <p style={{ fontSize: '13px', color: `${muted}88` }}>Your response will appear here for others to see.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {responses.map(r => (
                <div key={r.id} style={{ background: '#0d0d0d', border: `1px solid ${gold}08`, padding: '12px 16px', borderLeft: '2px solid transparent', transition: 'border-color 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.borderLeftColor = `${gold}66`}
                  onMouseLeave={e => e.currentTarget.style.borderLeftColor = 'transparent'}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', color: gold }}>{r.display_name}</span>
                    <span style={{ fontSize: '11px', color: muted }}>{timeAgo(r.created_at)}</span>
                  </div>
                  <p style={{ fontSize: '15px', color: parchment, lineHeight: 1.6, margin: 0, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.response_text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <PublicFooter />

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}
