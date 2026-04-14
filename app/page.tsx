'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const DEMO_STORAGE_KEY = 'soe_demo_messages';
const DEMO_LIMIT = 3;

function loadDemoMessages(): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(DEMO_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function saveDemoMessages(msgs: ChatMessage[]) {
  try { localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(msgs)); } catch {}
}

function countUserMessages(msgs: ChatMessage[]): number {
  return msgs.filter(m => m.role === 'user').length;
}

export default function HomePage() {
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
    const stored = loadDemoMessages();
    setMessages(stored);
    if (countUserMessages(stored) >= DEMO_LIMIT) setGated(true);
  }, []);

  useEffect(() => {
    if (streaming || streamText) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamText, streaming]);

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).style.opacity = '1'; });
    }, { threshold: 0.1 });
    document.querySelectorAll('[data-fade]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

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
        setMessages(withErr);
        saveDemoMessages(withErr);
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let fullResponse = '';

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
        setMessages(withResponse);
        saveDemoMessages(withResponse);
        setStreamText('');
        if (userCount >= DEMO_LIMIT) setGated(true);
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        const errMsg = { role: 'assistant' as const, content: 'Something went wrong. Try again.' };
        setMessages(prev => [...prev, errMsg]);
      }
    }
    setStreaming(false);
  }, [input, streaming, gated, messages]);

  const displayMessages = streamText
    ? [...messages, { role: 'assistant' as const, content: streamText }]
    : messages;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {/* ═══ HERO ═══ */}
      <section style={{ padding: '8rem 2rem 4rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1.5rem' }}>STRAVA FOR THINKING</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(28px, 6vw, 46px)', fontWeight: 400, fontStyle: 'italic', lineHeight: 1.3, marginBottom: '1.5rem', color: parchment }}>
            A daily philosophical practice that connects you with real people.
          </h1>
          <p style={{ fontSize: '18px', color: ivory85, lineHeight: 1.8, maxWidth: '540px', margin: '0 auto 2.5rem' }}>
            One question every morning. 280 characters to respond. See what others are thinking. Get matched with a fellow explorer.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/practice" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px' }}>START TODAY&apos;S PRACTICE</a>
            <a href="/council" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: gold, background: 'transparent', border: `1px solid ${gold}`, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px' }}>TRY COUNCIL MODE</a>
          </div>
        </div>
      </section>

      {/* ═══ THE LOOP ═══ */}
      <section data-fade style={{ padding: '3rem 2rem 5rem', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, textAlign: 'center', marginBottom: '2.5rem' }}>HOW IT WORKS</div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1px', background: `${gold}10` }}>
            {[
              { num: '01', title: 'DAILY QUESTION', desc: 'Every morning, one of six AI thinkers poses a philosophical question. Socrates, Plato, Aurelius, Nietzsche, Einstein, or Jobs.', href: '/practice' },
              { num: '02', title: 'RESPOND', desc: 'Write your answer in 280 characters. Build your streak. See what others are thinking in the community feed.', href: '/practice' },
              { num: '03', title: 'GET MATCHED', desc: 'After 7 responses, we pair you with a fellow explorer for a structured philosophical conversation. AI selects for productive tension.', href: '/match' },
              { num: '04', title: 'JOIN A SALON', desc: 'Seven people, seven weeks. Lead sessions. Graduate as a Guide. Start your own. The flywheel turns.', href: '/salon' },
            ].map(step => (
              <a key={step.num} href={step.href} style={{ background: '#0d0d0d', padding: '2rem 1.5rem', textDecoration: 'none', transition: 'background 0.2s', display: 'block' }}
                onMouseEnter={e => e.currentTarget.style.background = '#111'}
                onMouseLeave={e => e.currentTarget.style.background = '#0d0d0d'}>
                <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '28px', color: gold, marginBottom: '0.75rem' }}>{step.num}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.12em', color: parchment, marginBottom: '0.5rem' }}>{step.title}</div>
                <p style={{ fontSize: '14px', color: muted, lineHeight: 1.6, margin: 0 }}>{step.desc}</p>
              </a>
            ))}
          </div>

          {/* Connector line */}
          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: `${gold}66` }}>PRACTICE &rarr; CONNECT &rarr; GATHER &rarr; LEAD</span>
          </div>
        </div>
      </section>

      {/* ═══ SOCRATES DEMO ═══ */}
      <section data-fade style={{ padding: '4rem 2rem 5rem', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '0.75rem' }}>EXPERIENCE IT NOW</div>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 400, color: parchment, marginBottom: '0.5rem' }}>Ask Socrates anything.</h2>
            <p style={{ fontSize: '16px', color: muted, fontStyle: 'italic' }}>Real AI. Real streaming. No sign-up required.</p>
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
                  <p style={{ fontSize: '14px', color: parchment, marginBottom: '1rem', lineHeight: 1.7 }}>
                    Socrates has more to say. Create a free account to continue.
                  </p>
                  <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px' }}>
                    Create Free Account
                  </a>
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
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.12em', color: muted, opacity: 0.4 }}>
              {gated ? '' : `${DEMO_LIMIT - countUserMessages(messages)} FREE EXCHANGE${DEMO_LIMIT - countUserMessages(messages) !== 1 ? 'S' : ''} REMAINING`}
            </span>
          </div>
        </div>
      </section>

      {/* ═══ WHY THIS WORKS ═══ */}
      <section data-fade style={{ padding: '3rem 2rem 4rem', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '2rem' }}>THE SCIENCE</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {[
              { stat: '87.5', unit: 'hours', desc: 'of shared time in a 7-week salon. Research shows genuine friendship needs 80-100 hours. No other app comes close.' },
              { stat: '7', unit: 'people', desc: 'per salon. Robin Dunbar\u2019s optimal task group size. Small enough for intimacy, diverse enough for perspective.' },
              { stat: '90%', unit: 'attendance', desc: 'when commitment devices are in place. Meetup averages 30-60%. We learned from 222\u2019s model.' },
            ].map(item => (
              <div key={item.stat} style={{ padding: '1.5rem', background: '#0d0d0d', border: `1px solid ${gold}10` }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '6px', marginBottom: '0.5rem' }}>
                  <span style={{ fontFamily: 'Playfair Display, serif', fontSize: '36px', color: gold }}>{item.stat}</span>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: muted }}>{item.unit}</span>
                </div>
                <p style={{ fontSize: '14px', color: muted, lineHeight: 1.6, margin: 0 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ THINKERS ═══ */}
      <section data-fade style={{ padding: '3rem 2rem 4rem', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '700px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '2rem' }}>YOUR COUNCIL</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
            {[
              { name: 'Socrates', initials: 'SO', color: '#C9A94E' },
              { name: 'Plato', initials: 'PL', color: '#7B68EE' },
              { name: 'Aurelius', initials: 'MA', color: '#8B7355' },
              { name: 'Nietzsche', initials: 'FN', color: '#DC143C' },
              { name: 'Einstein', initials: 'AE', color: '#4169E1' },
              { name: 'Jobs', initials: 'SJ', color: '#A0A0A0' },
            ].map(t => (
              <div key={t.name} style={{ textAlign: 'center' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: `${t.color}18`, border: `2px solid ${t.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px', fontFamily: 'Cinzel, serif', fontSize: '13px', color: t.color }}>{t.initials}</div>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: muted }}>{t.name.toUpperCase()}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '15px', color: muted, lineHeight: 1.7, marginTop: '1.5rem', maxWidth: '480px', margin: '1.5rem auto 0' }}>
            Six historical minds reimagined as AI advisors. They pose your daily questions, debate in Council Mode, facilitate matched conversations, and remember your intellectual journey.
          </p>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section style={{ padding: '4rem 2rem 6rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          <div style={{ width: '60px', height: '1px', background: `${gold}4d`, margin: '0 auto 2rem' }} />
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 400, fontStyle: 'italic', color: parchment, marginBottom: '0.75rem' }}>Start your practice today.</h2>
          <p style={{ fontSize: '16px', color: muted, lineHeight: 1.7, marginBottom: '2rem' }}>Free to start. Answer one question. See what happens.</p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/practice" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px' }}>TODAY&apos;S QUESTION</a>
            <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: gold, textDecoration: 'none', border: `1px solid ${gold}44`, padding: '0 24px', display: 'inline-flex', alignItems: 'center', height: '48px' }}>VIEW MEMBERSHIP</a>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
