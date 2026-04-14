'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

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

export default function HomePage() {
  const [question, setQuestion] = useState<any>(null);

  // Socrates demo state
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

  useEffect(() => {
    fetch('/api/practice/today').then(r => r.json()).then(d => { if (d.question) setQuestion(d.question); }).catch(() => {});
  }, []);

  useEffect(() => {
    const stored = loadDemoMessages();
    setMessages(stored);
    if (countUserMessages(stored) >= DEMO_LIMIT) setGated(true);
  }, []);

  useEffect(() => {
    if (streaming || streamText) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamText, streaming]);

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

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {/* HERO — today's question as centerpiece */}
      <section style={{ padding: '8rem 2rem 5rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1.5rem' }}>SOCIETY OF EXPLORERS</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(36px, 7vw, 58px)', fontWeight: 400, fontStyle: 'italic', lineHeight: 1.15, marginBottom: '1.25rem', color: parchment }}>
            One question. Every day.
          </h1>
          <p style={{ fontSize: '17px', color: ivory85, lineHeight: 1.7, maxWidth: '520px', margin: '0 auto 3rem' }}>
            Answer a philosophical question in 280 characters. See how others respond. Build your streak.
          </p>

          {/* Today's question card */}
          {question && (
            <div style={{ background: '#0d0d0d', border: `1px solid ${gold}22`, padding: '2rem 1.5rem', marginBottom: '1.5rem', maxWidth: '560px', marginLeft: 'auto', marginRight: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '1rem' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: `${tColor}18`, border: `1.5px solid ${tColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '9px', color: tColor }}>{tAvatar}</div>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: tColor }}>TODAY &middot; {tName.toUpperCase()}</span>
              </div>
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 'clamp(20px, 3.5vw, 26px)', fontWeight: 400, fontStyle: 'italic', lineHeight: 1.5, color: parchment, margin: 0 }}>
                &ldquo;{question.question_text}&rdquo;
              </p>
            </div>
          )}

          <a href="/practice" style={{
            fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.2em',
            color: '#0a0a0a', background: gold, padding: '0 36px',
            textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '54px',
          }}>ANSWER TODAY&apos;S QUESTION &rarr;</a>
          <p style={{ fontSize: '13px', color: muted, marginTop: '1rem' }}>No account needed to read. Free to join.</p>
        </div>
      </section>

      {/* HOW IT WORKS — 3 steps */}
      <section style={{ padding: '2rem 2rem 5rem' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, textAlign: 'center', marginBottom: '2.5rem' }}>HOW IT WORKS</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1px', background: `${gold}10` }}>
            {[
              { num: '1', label: 'RESPOND', desc: 'One question appears every morning. 280 characters. That\u2019s it.' },
              { num: '2', label: 'READ', desc: 'See what other explorers wrote. No likes, no comments. Just honest answers.' },
              { num: '3', label: 'STREAK', desc: 'Come back tomorrow. Build your streak. After 7 days, unlock matched conversations.' },
            ].map(step => (
              <div key={step.num} style={{ background: '#0d0d0d', padding: '2rem 1.5rem' }}>
                <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '32px', color: gold, marginBottom: '0.75rem' }}>{step.num}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: parchment, marginBottom: '0.5rem' }}>{step.label}</div>
                <p style={{ fontSize: '14px', color: muted, lineHeight: 1.6, margin: 0 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SOCRATES DEMO */}
      <section style={{ padding: '2rem 2rem 5rem' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '0.75rem' }}>TRY IT NOW</div>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 400, color: parchment, marginBottom: '0.5rem' }}>Ask Socrates anything.</h2>
            <p style={{ fontSize: '15px', color: muted, fontStyle: 'italic' }}>Real AI. Real streaming. No sign-up required.</p>
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

      {/* CTA */}
      <section style={{ padding: '2rem 2rem 6rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          <div style={{ width: '60px', height: '1px', background: `${gold}4d`, margin: '0 auto 2rem' }} />
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(24px, 4vw, 30px)', fontWeight: 400, fontStyle: 'italic', color: parchment, marginBottom: '0.5rem' }}>Start today.</h2>
          <p style={{ fontSize: '15px', color: muted, marginBottom: '1.75rem' }}>It&apos;s free.</p>
          <a href="/practice" style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.2em', color: '#0a0a0a', background: gold, padding: '0 32px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '52px' }}>ANSWER TODAY&apos;S QUESTION &rarr;</a>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
