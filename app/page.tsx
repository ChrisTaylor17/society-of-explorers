'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const amber = '#f59e0b';
const amberDim = '#d97706';
const slate950 = '#020617';
const slate900 = '#0f172a';
const slate800 = '#1e293b';
const parchment = '#E8DCC8';
const muted = '#94a3b8';
const gold = '#c9a84c';

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
    const stored = loadDemoMessages();
    setMessages(stored);
    if (countUserMessages(stored) >= DEMO_LIMIT) setGated(true);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamText]);

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

    // Check if this puts us at the limit
    const userCount = countUserMessages(updated);

    try {
      abortRef.current = new AbortController();
      const res = await fetch('/api/thinker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          demo: true,
          thinker: 'socrates',
          message: text,
          messages: updated,
        }),
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
          const jsonStr = line.slice(6);
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.delta) {
              fullResponse += parsed.delta;
              setStreamText(fullResponse);
            }
            if (parsed.done && parsed.response) {
              fullResponse = parsed.response;
              setStreamText(fullResponse);
            }
          } catch {}
        }
      }

      if (fullResponse) {
        const withResponse = [...updated, { role: 'assistant' as const, content: fullResponse }];
        setMessages(withResponse);
        saveDemoMessages(withResponse);
        setStreamText('');

        if (userCount >= DEMO_LIMIT) {
          setGated(true);
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        const errMsg = { role: 'assistant' as const, content: 'Something went wrong. Try again.' };
        const withErr = [...updated, errMsg];
        setMessages(withErr);
        saveDemoMessages(withErr);
      }
    }
    setStreaming(false);
  }, [input, streaming, gated, messages]);

  const displayMessages = streamText
    ? [...messages, { role: 'assistant' as const, content: streamText }]
    : messages;

  return (
    <div style={{ minHeight: '100vh', background: slate950, color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {/* ═══ HERO ═══ */}
      <section style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8rem 2rem 6rem', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.03, pointerEvents: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='100' viewBox='0 0 56 100'%3E%3Cpath d='M28 66L0 50L0 16L28 0L56 16L56 50L28 66' fill='none' stroke='%23f59e0b' stroke-width='0.4'/%3E%3C/svg%3E")`, backgroundSize: '56px 100px' }} />
        <div style={{ maxWidth: '720px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.5em', color: amber, opacity: 0.6, marginBottom: '1.5rem' }}>SOCIETY OF EXPLORERS</div>
          <h1 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(2.2rem, 5.5vw, 4rem)', fontWeight: 400, letterSpacing: '0.02em', lineHeight: 1.2, marginBottom: '1.5rem', color: '#f8fafc' }}>
            A Living Philosophical Salon
          </h1>
          <p style={{ fontSize: '1.2rem', color: muted, lineHeight: 1.8, maxWidth: '560px', margin: '0 auto 2.5rem' }}>
            Talk with history&rsquo;s greatest thinkers. Join circles of serious readers. Build something that matters — in Boston and online.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="#demo" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: slate950, background: amber, padding: '14px 32px', textDecoration: 'none' }}>Talk to Socrates — Free →</a>
            <a href="#features" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: amber, border: `1px solid ${amber}55`, padding: '14px 32px', textDecoration: 'none' }}>See What We Do</a>
          </div>
        </div>
      </section>

      {/* ═══ THREE WAYS TO THINK TOGETHER ═══ */}
      <section id="features" data-fade style={{ padding: '6rem 2rem', background: slate900, opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: amber, opacity: 0.5, marginBottom: '0.75rem' }}>THE EXPERIENCE</div>
            <h2 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f8fafc' }}>Three Ways to Think Together</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1px', background: `${amber}10` }}>
            {[
              { icon: 'Σ', title: 'AI Thinkers', desc: 'Sit with Socrates, Nietzsche, or Marcus Aurelius. They remember you. They push back. They help you think — not just search.' },
              { icon: '📖', title: 'Salons & Great Books', desc: 'In-person evenings at our Boston space. 8-week reading cycles through the Great Books. Plato, Homer, Shakespeare — with AI thinkers annotating in the margins.' },
              { icon: '🌿', title: 'TwiddleTwattle', desc: 'Post an idea. Tag a thinker. Watch it branch into threads, remixes, and weaves. A social layer for people who think in paragraphs.' },
            ].map(p => (
              <div key={p.title} style={{ background: slate950, padding: '2.5rem 2rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1.5rem', color: amber, opacity: 0.3, marginBottom: '1rem' }}>{p.icon}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.12em', color: amber, marginBottom: '0.75rem' }}>{p.title.toUpperCase()}</div>
                <p style={{ fontSize: '15px', color: muted, lineHeight: 1.8 }}>{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SOCRATES DEMO ═══ */}
      <section id="demo" data-fade style={{ padding: '6rem 2rem', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '560px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: amber, opacity: 0.5, marginBottom: '0.75rem' }}>TRY IT NOW</div>
            <h2 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f8fafc', marginBottom: '0.5rem' }}>Ask Socrates anything.</h2>
            <p style={{ fontSize: '1rem', color: muted, fontStyle: 'italic' }}>Real AI. Real streaming. No sign-up required.</p>
          </div>

          <div style={{ border: `1px solid ${amber}22`, background: slate900 }}>
            {/* Chat area */}
            <div style={{ maxHeight: '360px', overflowY: 'auto', padding: '1.5rem' }}>
              {displayMessages.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '24px', color: amber, opacity: 0.15, marginBottom: '0.75rem' }}>Σ</div>
                  <p style={{ fontSize: '14px', color: muted, fontStyle: 'italic' }}>What are you really asking?</p>
                </div>
              )}

              {displayMessages.map((msg, i) => (
                <div key={i} style={{ marginBottom: '1.25rem' }}>
                  {msg.role === 'user' ? (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <div style={{ background: `${amber}15`, border: `1px solid ${amber}22`, padding: '10px 14px', maxWidth: '85%' }}>
                        <p style={{ fontSize: '15px', color: parchment, lineHeight: 1.7, margin: 0 }}>{msg.content}</p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                        <span style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: amber, opacity: 0.5 }}>Σ</span>
                        <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.2em', color: amber, opacity: 0.4 }}>SOCRATES</span>
                      </div>
                      <div style={{ padding: '10px 14px', maxWidth: '90%' }}>
                        <p style={{ fontSize: '15px', color: parchment, lineHeight: 1.9, margin: 0 }}>
                          {msg.content}
                          {streaming && i === displayMessages.length - 1 && <span style={{ color: amber }}>▍</span>}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Input area */}
            <div style={{ borderTop: `1px solid ${amber}15`, padding: '1rem 1.5rem' }}>
              {gated ? (
                <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
                  <p style={{ fontSize: '14px', color: parchment, marginBottom: '1rem', lineHeight: 1.7 }}>
                    Socrates has more to say. Create a free Explorer account to keep going.
                  </p>
                  <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: slate950, background: amber, padding: '12px 28px', textDecoration: 'none', display: 'inline-block' }}>
                    Create Free Account →
                  </a>
                  <button
                    onClick={() => {
                      localStorage.removeItem(DEMO_STORAGE_KEY);
                      setMessages([]);
                      setGated(false);
                    }}
                    style={{ display: 'block', margin: '0.75rem auto 0', fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: muted, background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    START OVER
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    disabled={streaming}
                    placeholder="Ask anything..."
                    style={{
                      flex: 1, background: slate800, border: `1px solid ${amber}18`, padding: '11px 14px',
                      fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment,
                      outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={streaming || !input.trim()}
                    style={{
                      fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em',
                      color: slate950, background: amber, border: 'none', padding: '11px 20px',
                      cursor: 'pointer', opacity: streaming || !input.trim() ? 0.4 : 1,
                    }}
                  >
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

      {/* ═══ THE SPACE ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: slate900, opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1px', background: `${amber}10` }}>
            {/* Photo placeholder */}
            <div style={{ background: slate800, minHeight: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '0.75rem', opacity: 0.2 }}>🏛️</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted, opacity: 0.4 }}>92B SOUTH ST · BOSTON</div>
              </div>
            </div>
            {/* Text */}
            <div style={{ background: slate950, padding: '3rem 2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: amber, opacity: 0.5, marginBottom: '1rem' }}>THE SPACE</div>
              <h2 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(1.4rem, 2.5vw, 1.8rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f8fafc', marginBottom: '1rem', lineHeight: 1.3 }}>
                A private library.<br />A conversation circle.
              </h2>
              <p style={{ fontSize: '15px', color: muted, lineHeight: 1.8, marginBottom: '1.5rem' }}>
                92B South Street is the founding home of the Society — a permanent philosophical space in downtown Boston. Monthly salon evenings, Great Books reading groups, and a library that grows with the community.
              </p>
              <a href="/experience" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: amber, textDecoration: 'none' }}>See the Experience →</a>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PRICING PREVIEW ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: amber, opacity: 0.5, marginBottom: '0.75rem' }}>MEMBERSHIP</div>
            <h2 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f8fafc' }}>Choose Your Path</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1px', background: `${amber}10` }}>
            {[
              { name: 'Explorer', price: 'Free', period: '', tier: 'explorer', features: ['3 Socrates exchanges', 'Public Great Books catalog', 'TwiddleTwattle read-only'], popular: false },
              { name: 'Seeker', price: '$19', period: '/mo', tier: 'seeker', features: ['All 6 AI thinkers', 'Great Books reading', 'TwiddleTwattle posting', '$EXP earning'], popular: false },
              { name: 'Scholar', price: '$49', period: '/mo', tier: 'scholar', features: ['Everything in Seeker', 'Salon event access', '8-week reading cohorts', 'Frequency matching'], popular: true },
              { name: 'Philosopher', price: '$99', period: '/mo', tier: 'philosopher', features: ['Everything in Scholar', 'Physical salon access', 'Node hosting rights', 'Commons governance'], popular: false },
            ].map(t => (
              <a key={t.tier} href={`/join#${t.tier}`} style={{ background: t.popular ? `${amber}08` : slate900, padding: '2rem 1.5rem', textDecoration: 'none', display: 'block', position: 'relative' }}>
                {t.popular && (
                  <div style={{ position: 'absolute', top: '0', left: '0', right: '0', height: '2px', background: amber }} />
                )}
                {t.popular && (
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.2em', color: amber, marginBottom: '0.75rem' }}>MOST POPULAR</div>
                )}
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.12em', color: '#f8fafc', marginBottom: '0.5rem' }}>{t.name.toUpperCase()}</div>
                <div style={{ marginBottom: '1rem' }}>
                  <span style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: '28px', color: amber }}>{t.price}</span>
                  {t.period && <span style={{ fontSize: '14px', color: muted }}>{t.period}</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {t.features.map(f => (
                    <div key={f} style={{ fontSize: '13px', color: muted, lineHeight: 1.5, paddingLeft: '12px', position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 0, color: `${amber}66` }}>·</span>
                      {f}
                    </div>
                  ))}
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FINAL CTA ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: slate900, textAlign: 'center', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f8fafc', marginBottom: '1rem', fontStyle: 'italic' }}>
            The examined life needs company.
          </h2>
          <p style={{ fontSize: '1rem', color: muted, lineHeight: 1.8, marginBottom: '2rem' }}>Join explorers who read deeply, think seriously, and build things that matter.</p>
          <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: slate950, background: amber, padding: '14px 36px', textDecoration: 'none', display: 'inline-block' }}>Join the Society →</a>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
