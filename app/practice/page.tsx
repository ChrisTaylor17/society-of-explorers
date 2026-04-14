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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function load() {
      // Auth
      try {
        const session = await getMemberSession();
        if (session?.member) setMemberId(session.member.id);
        const supabase = createClient();
        const { data: { session: auth } } = await supabase.auth.getSession();
        if (auth?.access_token) setAuthToken(auth.access_token);
      } catch {}

      // Today's question
      const qRes = await fetch('/api/practice/today');
      const qData = await qRes.json();
      if (qData.question) setQuestion(qData.question);

      setLoading(false);
    }
    load();
  }, []);

  // Load streak + responses after question is set
  useEffect(() => {
    if (!question?.id) return;

    // Streak
    if (authToken) {
      fetch('/api/practice/streak', { headers: { 'Authorization': `Bearer ${authToken}` } })
        .then(r => r.json()).then(setStreak).catch(() => {});
    }

    // Responses
    function loadResponses() {
      fetch(`/api/practice/responses?questionId=${question.id}`)
        .then(r => r.json()).then(d => {
          setResponses(d.responses || []);
          // Check if I already responded
          if (memberId) {
            const mine = (d.responses || []).find((r: any) => r.member_id === memberId);
            // Can't check member_id since it's not returned — check by matching later
          }
        }).catch(() => {});
    }
    loadResponses();

    // Auto-refresh every 30s
    intervalRef.current = setInterval(loadResponses, 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [question?.id, authToken, memberId]);

  async function handleSubmit() {
    if (!response.trim() || !question?.id) return;
    if (!authToken) { window.location.href = '/login'; return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/practice/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ questionId: question.id, responseText: response.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
        setMyResponse(response.trim());
        setStreak({ current_streak: data.streak, longest_streak: data.longest, total_responses: data.total });
        // Add to feed
        setResponses(prev => [...prev, { id: 'mine', display_name: 'You', response_text: response.trim(), created_at: new Date().toISOString() }]);
      }
    } catch {}
    setSubmitting(false);
  }

  const thinkerName = question ? THINKER_NAMES[question.thinker_id] || question.thinker_id : '';
  const thinkerColor = question ? THINKER_COLORS[question.thinker_id] || gold : gold;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {/* TODAY'S QUESTION */}
      <section style={{ padding: '8rem 2rem 2rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '0.5rem' }}>DAILY PRACTICE</div>

          {loading ? (
            <p style={{ fontSize: '16px', color: muted, fontStyle: 'italic' }}>Loading today's question...</p>
          ) : question ? (
            <>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: thinkerColor, marginBottom: '1.5rem' }}>
                {thinkerName.toUpperCase()} ASKS:
              </div>
              <h1 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 400, fontStyle: 'italic', lineHeight: 1.5, color: parchment, marginBottom: '0.75rem' }}>
                &ldquo;{question.question_text}&rdquo;
              </h1>
              {question.question_context && (
                <p style={{ fontSize: '14px', color: muted, fontStyle: 'italic', marginBottom: '2rem' }}>{question.question_context}</p>
              )}

              {/* Response input */}
              {submitted || myResponse ? (
                <div style={{ background: '#0d0d0d', border: `1px solid ${gold}22`, padding: '16px', textAlign: 'left', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', color: gold }}>YOUR RESPONSE</span>
                    <span style={{ fontSize: '12px', color: '#4CAF50' }}>&check;</span>
                  </div>
                  <p style={{ fontSize: '15px', color: parchment, lineHeight: 1.7, margin: 0 }}>{myResponse || response}</p>
                </div>
              ) : memberId && authToken ? (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ position: 'relative' }}>
                    <textarea
                      value={response} onChange={e => setResponse(e.target.value.slice(0, 280))}
                      placeholder="Your response..."
                      rows={3}
                      style={{ width: '100%', background: '#0d0d0d', border: `1px solid ${gold}22`, padding: '14px 16px', fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: parchment, outline: 'none', resize: 'none', boxSizing: 'border-box' }}
                    />
                    <span style={{ position: 'absolute', bottom: '8px', right: '12px', fontSize: '11px', color: response.length > 260 ? '#DC143C' : muted }}>{response.length} / 280</span>
                  </div>
                  <button onClick={handleSubmit} disabled={submitting || !response.trim()}
                    style={{ marginTop: '8px', fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: gold, background: 'transparent', border: `1px solid ${gold}`, height: '44px', padding: '0 28px', cursor: 'pointer', opacity: submitting || !response.trim() ? 0.4 : 1, borderRadius: 0 }}>
                    {submitting ? 'SUBMITTING...' : 'RESPOND'}
                  </button>
                </div>
              ) : (
                <div style={{ marginBottom: '1rem' }}>
                  <a href="/login" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: gold, border: `1px solid ${gold}`, padding: '12px 24px', textDecoration: 'none' }}>SIGN IN TO RESPOND</a>
                </div>
              )}
            </>
          ) : (
            <p style={{ fontSize: '16px', color: muted }}>No question available today.</p>
          )}
        </div>
      </section>

      {/* STREAK BAR */}
      <section style={{ padding: '0 2rem 2rem' }}>
        <div style={{ maxWidth: '500px', margin: '0 auto', display: 'flex', justifyContent: 'center', gap: '2rem', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '24px', color: streak.current_streak > 0 ? gold : muted }}>{streak.current_streak}</div>
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
      </section>

      {/* COMMUNITY RESPONSES */}
      <section style={{ padding: '2rem' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem' }}>
            WHAT OTHERS ARE THINKING {responses.length > 0 && `(${responses.length})`}
          </div>

          {responses.length === 0 ? (
            <p style={{ fontSize: '16px', color: muted, fontStyle: 'italic', textAlign: 'center', padding: '2rem 0' }}>Be the first to respond today.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {responses.map(r => (
                <div key={r.id} style={{ background: '#0d0d0d', border: `1px solid ${gold}08`, padding: '12px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', color: gold }}>{r.display_name}</span>
                    <span style={{ fontSize: '11px', color: muted }}>{timeAgo(r.created_at)}</span>
                  </div>
                  <p style={{ fontSize: '15px', color: parchment, lineHeight: 1.6, margin: 0 }}>{r.response_text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
