'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { getMemberSession } from '@/lib/auth/getSession';
import { createClient } from '@/lib/supabase/client';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

const THINKER_NAMES: Record<string, string> = {
  socrates: 'Socrates', plato: 'Plato', aurelius: 'Marcus Aurelius',
  nietzsche: 'Nietzsche', einstein: 'Einstein', jobs: 'Steve Jobs',
};
const THINKER_COLORS: Record<string, string> = {
  socrates: '#C9A94E', plato: '#7B68EE', aurelius: '#8B7355',
  nietzsche: '#DC143C', einstein: '#4169E1', jobs: '#A0A0A0',
};
const THINKER_AVATARS: Record<string, string> = {
  socrates: 'SO', plato: 'PL', aurelius: 'MA',
  nietzsche: 'FN', einstein: 'AE', jobs: 'SJ',
};

interface ChatMessage { role: 'user' | 'assistant'; content: string; }
const DEMO_STORAGE_KEY = 'soe_demo_messages';
const DEMO_LIMIT = 3;
function loadDemoMessages(): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  try { const stored = localStorage.getItem(DEMO_STORAGE_KEY); return stored ? JSON.parse(stored) : []; } catch { return []; }
}
function saveDemoMessages(msgs: ChatMessage[]) {
  try { localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(msgs)); } catch {}
}
function countUserMessages(msgs: ChatMessage[]): number { return msgs.filter(m => m.role === 'user').length; }

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function HomePage() {
  const [question, setQuestion] = useState<any>(null);

  // Auth
  const [memberId, setMemberId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Respond state
  const [response, setResponse] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [myResponse, setMyResponse] = useState<string | null>(null);
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Community responses
  const [responses, setResponses] = useState<any[]>([]);

  // Socrates demo
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [gated, setGated] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  }, []);

  // Auth + question load
  useEffect(() => {
    (async () => {
      try {
        const session = await getMemberSession();
        if (session?.member) setMemberId(session.member.id);
        const supabase = createClient();
        const { data: { session: auth } } = await supabase.auth.getSession();
        if (auth?.access_token) setAuthToken(auth.access_token);
      } catch {}
      setAuthChecked(true);

      try {
        const qRes = await fetch('/api/practice/today');
        const qData = await qRes.json();
        if (qData.question) setQuestion(qData.question);
      } catch {}
    })();
  }, []);

  // Fetch community responses + self-check if already answered
  useEffect(() => {
    if (!question?.id) return;
    fetch(`/api/practice/responses?questionId=${question.id}`)
      .then(r => r.json())
      .then(d => {
        const list = d.responses || [];
        setResponses(list);
        if (memberId) {
          const mine = list.find((r: any) => r.member_id === memberId);
          if (mine) {
            setSubmitted(true);
            setMyResponse(mine.response_text);
          }
        }
      })
      .catch(() => {});
  }, [question?.id, memberId]);

  // Socrates demo init
  useEffect(() => {
    const stored = loadDemoMessages();
    setMessages(stored);
    if (countUserMessages(stored) >= DEMO_LIMIT) setGated(true);
  }, []);

  useEffect(() => {
    if (streaming || streamText) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamText, streaming]);

  async function handleRespond() {
    if (!response.trim() || !question?.id) return;
    if (!memberId) {
      setShowAuthGate(true);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/practice/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({ questionId: question.id, responseText: response.trim(), memberId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setSubmitError(data.error || 'Could not save your response.');
      } else {
        setSubmitted(true);
        setMyResponse(response.trim());
        // Refresh community feed
        fetch(`/api/practice/responses?questionId=${question.id}`).then(r => r.json()).then(d => setResponses(d.responses || [])).catch(() => {});
      }
    } catch (err: any) {
      setSubmitError(err?.message || 'Network error');
    }
    setSubmitting(false);
  }

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming || gated) return;
    const updated = [...messages, { role: 'user' as const, content: text }];
    setMessages(updated);
    saveDemoMessages(updated);
    setInput('');
    setStreaming(true);
    setStreamText('');
    const userCount = countUserMessages(updated);

    try {
      abortRef.current = new AbortController();
      const res = await fetch('/api/thinker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demo: true, thinker: 'socrates', message: text, messages: updated }),
        signal: abortRef.current.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Stream failed' }));
        const errMsg = { role: 'assistant' as const, content: err.error || 'Socrates is silent. Try again.' };
        const withErr = [...updated, errMsg];
        setMessages(withErr); saveDemoMessages(withErr);
        setStreaming(false); return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = ''; let fullResponse = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        const lines = accumulated.split('\n');
        accumulated = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.delta) { fullResponse += parsed.delta; setStreamText(fullResponse); }
            if (parsed.done && parsed.response) { fullResponse = parsed.response; setStreamText(fullResponse); }
          } catch {}
        }
      }
      if (fullResponse) {
        const withResponse = [...updated, { role: 'assistant' as const, content: fullResponse }];
        setMessages(withResponse); saveDemoMessages(withResponse);
        setStreamText('');
        if (userCount >= DEMO_LIMIT) setGated(true);
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Try again.' }]);
      }
    }
    setStreaming(false);
  }, [input, streaming, gated, messages]);

  const displayMessages = streamText ? [...messages, { role: 'assistant' as const, content: streamText }] : messages;

  const tId = question?.thinker_id || '';
  const tName = THINKER_NAMES[tId] || '';
  const tColor = THINKER_COLORS[tId] || gold;
  const tAvatar = THINKER_AVATARS[tId] || '??';

  const communityResponses = (responses || []).filter(r => r.member_id !== memberId).slice(-8).reverse();

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {/* HERO + INLINE ANSWER */}
      <section style={{ padding: '8rem 2rem 3rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1.5rem' }}>SOCIETY OF EXPLORERS</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(36px, 7vw, 58px)', fontWeight: 400, fontStyle: 'italic', lineHeight: 1.15, marginBottom: '1.25rem', color: parchment }}>
            One question. Every day.
          </h1>
          <p style={{ fontSize: '17px', color: ivory85, lineHeight: 1.7, maxWidth: '520px', margin: '0 auto 2.5rem' }}>
            Answer a philosophical question in 280 characters. See how others respond. Build your streak.
          </p>

          {/* Question + answer card */}
          {question && (
            <div style={{ background: '#0d0d0d', border: `1px solid ${gold}22`, padding: '2rem 1.5rem', maxWidth: '560px', marginLeft: 'auto', marginRight: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '1rem' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: `${tColor}18`, border: `1.5px solid ${tColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '9px', color: tColor }}>{tAvatar}</div>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: tColor }}>TODAY &middot; {tName.toUpperCase()}</span>
              </div>
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 'clamp(20px, 3.5vw, 26px)', fontWeight: 400, fontStyle: 'italic', lineHeight: 1.5, color: parchment, margin: 0, marginBottom: '1.75rem' }}>
                &ldquo;{question.question_text}&rdquo;
              </p>

              {/* Already responded: show their answer, else: show textarea */}
              {submitted && myResponse ? (
                <div style={{ background: '#111', border: `1px solid ${gold}33`, padding: '1rem', textAlign: 'left', animation: 'fadeIn 0.4s ease' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold }}>YOUR RESPONSE</span>
                    <span style={{ fontSize: '12px', color: '#4CAF50' }}>{'\u2713'}</span>
                  </div>
                  <p style={{ fontSize: '15px', color: parchment, lineHeight: 1.6, margin: 0 }}>{myResponse}</p>
                </div>
              ) : (
                <>
                  <textarea
                    value={response}
                    onChange={e => setResponse(e.target.value.slice(0, 280))}
                    placeholder="What do you think?"
                    rows={3}
                    onFocus={e => { e.target.style.boxShadow = `0 0 0 1px rgba(201,168,76,0.35)`; e.target.style.borderColor = gold; }}
                    onBlur={e => { e.target.style.boxShadow = 'none'; e.target.style.borderColor = `${gold}33`; }}
                    style={{
                      width: '100%', background: '#0a0a0a', border: `1px solid ${gold}33`,
                      padding: '14px 16px 28px', fontFamily: 'Cormorant Garamond, serif', fontSize: '16px',
                      color: parchment, outline: 'none', resize: 'none', boxSizing: 'border-box',
                      transition: 'box-shadow 0.2s, border-color 0.2s',
                    }}
                  />
                  <div style={{ textAlign: 'right', marginTop: '-22px', marginRight: '12px', marginBottom: '10px', position: 'relative', zIndex: 1 }}>
                    <span style={{ fontSize: '10px', color: response.length > 260 ? '#DC143C' : `${muted}88` }}>{response.length}/280</span>
                  </div>
                  <button
                    onClick={handleRespond}
                    disabled={submitting || !response.trim()}
                    style={{
                      width: '100%', fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.2em',
                      color: '#0a0a0a', background: gold, border: 'none', height: '52px',
                      cursor: submitting || !response.trim() ? 'not-allowed' : 'pointer',
                      opacity: submitting || !response.trim() ? 0.4 : 1,
                    }}
                  >{submitting ? 'SUBMITTING...' : 'RESPOND'}</button>

                  {submitError && (
                    <p style={{ fontSize: '12px', color: '#DC143C', marginTop: '8px', textAlign: 'left' }}>{submitError}</p>
                  )}

                  {/* Inline auth gate */}
                  {showAuthGate && authChecked && !memberId && (
                    <div style={{ marginTop: '12px', padding: '1rem', background: `${gold}08`, border: `1px solid ${gold}33`, textAlign: 'left', animation: 'fadeIn 0.3s ease' }}>
                      <p style={{ fontSize: '14px', color: parchment, margin: 0, marginBottom: '0.75rem', lineHeight: 1.5 }}>
                        Create a free account to save your answer and build your streak.
                      </p>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <a href="/join" style={{ flex: 1, minWidth: '120px', fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, padding: '0 20px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '44px' }}>SIGN UP FREE</a>
                        <a href="/login" style={{ flex: 1, minWidth: '120px', fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: gold, border: `1px solid ${gold}`, padding: '0 20px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '44px' }}>SIGN IN</a>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Single-line how it works */}
          <p style={{ fontSize: '15px', color: muted, fontStyle: 'italic', marginTop: '1.5rem' }}>
            Answer one question a day. Build your streak. Read what others think.
          </p>
        </div>
      </section>

      {/* COMMUNITY RESPONSES (revealed after answer, or always for already-answered state) */}
      {submitted && (
        <section style={{ padding: '2rem 2rem 3rem', animation: 'fadeIn 0.6s ease' }}>
          <div style={{ maxWidth: '560px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
              <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold }}>WHAT OTHERS SAID</span>
              <span style={{ flex: 1, height: '1px', background: `${gold}15` }} />
              <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', color: muted }}>{responses.length} TODAY</span>
            </div>

            {communityResponses.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', border: `1px dashed ${gold}22` }}>
                <p style={{ fontSize: '14px', color: muted, fontStyle: 'italic', margin: 0 }}>You&apos;re the first to answer today. Come back later to see others.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {communityResponses.map((r: any) => (
                  <div key={r.id} style={{ background: '#0d0d0d', border: `1px solid ${gold}10`, borderLeft: `2px solid ${gold}33`, padding: '12px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', color: gold }}>{r.display_name}</span>
                      <span style={{ fontSize: '11px', color: muted }}>{timeAgo(r.created_at)}</span>
                    </div>
                    <p style={{ fontSize: '15px', color: parchment, lineHeight: 1.6, margin: 0, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.response_text}</p>
                  </div>
                ))}
              </div>
            )}

            <p style={{ fontSize: '13px', color: muted, fontStyle: 'italic', textAlign: 'center', marginTop: '1.5rem' }}>
              Come back tomorrow for the next question.
            </p>

            {/* Sign-up nudge for anonymous answers (shouldn't hit this path, but belt-and-suspenders) */}
            {!memberId && (
              <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
                <p style={{ fontSize: '14px', color: ivory85, marginBottom: '0.75rem' }}>
                  Create an account to build your streak and see your Explorer profile.
                </p>
                <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '44px' }}>JOIN FREE</a>
              </div>
            )}
          </div>
        </section>
      )}

      {/* SOCRATES DEMO (below community responses) */}
      <section style={{ padding: '3rem 2rem 5rem' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '0.75rem' }}>TRY IT NOW</div>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 400, color: parchment, marginBottom: '0.5rem' }}>Ask Socrates anything.</h2>
            <p style={{ fontSize: '14px', color: muted, fontStyle: 'italic' }}>Real AI. Real streaming. No sign-up required.</p>
          </div>

          <div style={{ border: `1px solid ${gold}22`, background: '#0d0d0d', boxShadow: '0 0 40px rgba(201,168,76,0.06)' }}>
            <div style={{ maxHeight: '360px', overflowY: 'auto', padding: '1.5rem' }}>
              {displayMessages.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '24px', color: gold, opacity: 0.15, marginBottom: '0.75rem' }}>{'\u03A3'}</div>
                  <p style={{ fontSize: '14px', color: ivory85, fontStyle: 'italic' }}>What are you really asking?</p>
                </div>
              )}
              {displayMessages.map((msg, i) => (
                <div key={i} style={{ marginBottom: '1.25rem' }}>
                  {msg.role === 'user' ? (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <div style={{ background: `${gold}15`, border: `1px solid ${gold}22`, padding: '10px 14px', maxWidth: '85%' }}>
                        <p style={{ fontSize: '15px', color: parchment, lineHeight: 1.7, margin: 0 }}>{msg.content}</p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                        <span style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: gold, opacity: 0.5 }}>{'\u03A3'}</span>
                        <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.2em', color: gold, opacity: 0.4 }}>SOCRATES</span>
                      </div>
                      <div style={{ padding: '10px 14px', maxWidth: '90%' }}>
                        <p style={{ fontSize: '15px', color: parchment, lineHeight: 1.9, margin: 0 }}>
                          {msg.content}
                          {streaming && i === displayMessages.length - 1 && <span style={{ color: gold }}>{'\u2588'}</span>}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div style={{ borderTop: `1px solid ${gold}15`, padding: '1rem 1.5rem' }}>
              {gated ? (
                <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
                  <p style={{ fontSize: '14px', color: parchment, marginBottom: '1rem' }}>Socrates has more to say. Create a free account to continue.</p>
                  <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '44px' }}>Create Free Account</a>
                  <button onClick={() => { localStorage.removeItem(DEMO_STORAGE_KEY); setMessages([]); setGated(false); }}
                    style={{ display: 'block', margin: '0.75rem auto 0', fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: muted, background: 'none', border: 'none', cursor: 'pointer' }}>
                    START OVER
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    value={input} onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    disabled={streaming} placeholder="Ask anything..."
                    style={{ flex: 1, background: '#111', border: `1px solid ${gold}18`, padding: '11px 14px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment, outline: 'none', boxSizing: 'border-box' }}
                  />
                  <button onClick={sendMessage} disabled={streaming || !input.trim()}
                    style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, border: 'none', padding: '11px 20px', cursor: 'pointer', opacity: streaming || !input.trim() ? 0.4 : 1 }}>
                    {streaming ? '...' : 'ASK'}
                  </button>
                </div>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.12em', color: muted, opacity: 0.5 }}>
              {gated ? '' : `${DEMO_LIMIT - countUserMessages(messages)} FREE EXCHANGE${DEMO_LIMIT - countUserMessages(messages) !== 1 ? 'S' : ''} REMAINING`}
            </span>
          </div>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section style={{ padding: '2rem 2rem 6rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '440px', margin: '0 auto' }}>
          <div style={{ width: '60px', height: '1px', background: `${gold}4d`, margin: '0 auto 2rem' }} />
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(24px, 4vw, 28px)', fontWeight: 400, fontStyle: 'italic', color: parchment, marginBottom: '0.5rem' }}>Start your practice.</h2>
          <p style={{ fontSize: '15px', color: muted, marginBottom: '1.75rem' }}>One question. Every morning. Free.</p>
          <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.2em', color: '#0a0a0a', background: gold, padding: '0 32px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '52px' }}>JOIN FREE</a>
        </div>
      </section>

      <PublicFooter />

      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
