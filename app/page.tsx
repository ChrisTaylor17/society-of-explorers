'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';

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

// Unused SECTIONS kept for reference but not rendered
const _SECTIONS = [
  {
    id: 'council',
    image: '/images/hero-council-mode.jpeg',
    label: 'COUNCIL MODE',
    heading: 'Multiple minds. One conversation.',
    body: 'Socrates, Nietzsche, and Aurelius debate your questions in real time.',
    cta: 'TRY COUNCIL MODE',
    href: '/council',
  },
  {
    id: 'music',
    image: '/images/hero-music-dark.jpeg',
    label: 'MUSIC THERAPY',
    heading: 'Sound as philosophy',
    body: 'AI-composed soundscapes tuned to your brainwave coherence.',
    cta: null,
    href: null,
  },
  {
    id: 'travel',
    image: '/images/hero-mission.jpeg',
    label: 'SOVEREIGN TRAVEL',
    heading: 'The world is your campus',
    body: 'Book with crypto via Travala + Dtravel. Scan rooms with iPhone LiDAR. Earn $EXP. Your travels build the shared metaverse.',
    cta: 'EXPLORE TRAVEL',
    href: '/travel',
  },
  {
    id: 'vision',
    image: '/images/hero-renaissance.jpeg',
    label: 'THE VISION',
    heading: 'A living philosophical civilization',
    body: 'Physical salons. AI thinkers with memory. Blockchain reputation. Sovereign travel. Music therapy. All connected by $EXP and a shared commitment to human flourishing.',
    cta: 'BECOME AN EXPLORER',
    href: '/join',
  },
];

const sectionStyle = (image: string): React.CSSProperties => ({
  minHeight: '80vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '6rem 2rem',
  position: 'relative',
  backgroundImage: `linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url("${image}")`,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundAttachment: 'fixed',
  opacity: 0,
  transition: 'opacity 0.9s ease',
});

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
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    // Fight browser scroll restoration
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
  }, []);

  useEffect(() => {
    const stored = loadDemoMessages();
    setMessages(stored);
    if (countUserMessages(stored) >= DEMO_LIMIT) setGated(true);
  }, []);

  useEffect(() => {
    if (streaming || streamText) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamText, streaming]);

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).style.opacity = '1'; });
    }, { threshold: 0.1 });
    document.querySelectorAll('[data-fade]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  // Fix parallax on mobile (background-attachment: fixed is broken on iOS)
  useEffect(() => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      document.querySelectorAll<HTMLElement>('[data-parallax]').forEach(el => {
        el.style.backgroundAttachment = 'scroll';
      });
    }
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
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {/* ═══ HERO ═══ */}
      <section style={{ padding: '8rem 2rem 4rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1.5rem' }}>SOCIETY OF EXPLORERS</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(28px, 6vw, 44px)', fontWeight: 400, fontStyle: 'italic', lineHeight: 1.3, marginBottom: '1.5rem', color: parchment }}>
            A daily philosophical practice. Real conversations with real people.
          </h1>
          <p style={{ fontSize: '18px', color: ivory85, lineHeight: 1.8, maxWidth: '560px', margin: '0 auto 2.5rem', fontFamily: 'Cormorant Garamond, serif' }}>
            Six AI thinkers generate your daily question. You respond. You connect with fellow explorers. You grow.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/practice" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px', borderRadius: 0 }}>START PRACTICING</a>
            <a href="/council" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: gold, background: 'transparent', border: `1px solid ${gold}`, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px', borderRadius: 0 }}>TRY COUNCIL MODE</a>
          </div>
        </div>
      </section>

      {/* ═══ SOCRATES DEMO ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0a0a0a', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '0.75rem' }}>TRY IT NOW</div>
            <p style={{ fontSize: '18px', color: ivory85, fontFamily: 'Cormorant Garamond, serif', marginBottom: '0.75rem' }}>Experience it now — no sign-up required.</p>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 400, color: parchment, marginBottom: '0.5rem' }}>Ask Socrates anything.</h2>
            <p style={{ fontSize: '18px', color: ivory85, fontStyle: 'italic', fontFamily: 'Cormorant Garamond, serif' }}>Real AI. Real streaming. No sign-up required.</p>
          </div>

          <div style={{ border: `1px solid ${gold}22`, background: '#0d0d0d', boxShadow: '0 0 40px rgba(201,168,76,0.08)' }}>
            <div style={{ maxHeight: '360px', overflowY: 'auto', padding: '1.5rem' }}>
              {displayMessages.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '24px', color: gold, opacity: 0.15, marginBottom: '0.75rem' }}>&#931;</div>
                  <p style={{ fontSize: '14px', color: ivory85, fontStyle: 'italic', fontFamily: 'Cormorant Garamond, serif' }}>What are you really asking?</p>
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
                        <span style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: gold, opacity: 0.5 }}>&#931;</span>
                        <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.2em', color: gold, opacity: 0.4 }}>SOCRATES</span>
                      </div>
                      <div style={{ padding: '10px 14px', maxWidth: '90%' }}>
                        <p style={{ fontSize: '15px', color: parchment, lineHeight: 1.9, margin: 0 }}>
                          {msg.content}
                          {streaming && i === displayMessages.length - 1 && <span style={{ color: gold }}>&#9613;</span>}
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
                  <p style={{ fontSize: '14px', color: parchment, marginBottom: '1rem', lineHeight: 1.7, fontFamily: 'Cormorant Garamond, serif' }}>
                    Socrates has more to say. Create a free Explorer account to keep going.
                  </p>
                  <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px' }}>
                    Create Free Account
                  </a>
                  <button
                    onClick={() => { localStorage.removeItem(DEMO_STORAGE_KEY); setMessages([]); setGated(false); }}
                    style={{ display: 'block', margin: '0.75rem auto 0', fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: '#9a8f7a', background: 'none', border: 'none', cursor: 'pointer' }}
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
                      flex: 1, background: '#111', border: `1px solid ${gold}18`, padding: '11px 14px',
                      fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment,
                      outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={streaming || !input.trim()}
                    style={{
                      fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em',
                      color: '#0a0a0a', background: gold, border: 'none', padding: '11px 20px',
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
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.12em', color: '#9a8f7a', opacity: 0.4 }}>
              {gated ? '' : `${DEMO_LIMIT - countUserMessages(messages)} FREE EXCHANGE${DEMO_LIMIT - countUserMessages(messages) !== 1 ? 'S' : ''} REMAINING`}
            </span>
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section data-fade style={{ padding: '4rem 2rem 5rem', background: '#0a0a0a', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1px', background: `${gold}10` }}>
            {[
              { label: 'PRACTICE', desc: 'Every morning, a thinker poses a question. You respond in 280 characters. See what others are thinking.' },
              { label: 'CONNECT', desc: 'After 7 days, we match you with a fellow explorer for a structured philosophical conversation.' },
              { label: 'GATHER', desc: 'Weekly salons bring 8-12 members together for AI-facilitated discussions. In Boston and online.' },
            ].map(c => (
              <div key={c.label} style={{ background: '#0d0d0d', padding: '2rem', border: `1px solid rgba(201,168,76,0.12)` }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.15em', color: gold, marginBottom: '0.75rem' }}>{c.label}</div>
                <p style={{ fontSize: '15px', color: '#9a8f7a', lineHeight: 1.7 }}>{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ JOIN CTA ═══ */}
      <section style={{ padding: '4rem 2rem 6rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 400, fontStyle: 'italic', color: parchment, marginBottom: '0.75rem' }}>Ready to explore?</h2>
          <p style={{ fontSize: '16px', color: '#9a8f7a', lineHeight: 1.7, marginBottom: '2rem' }}>Free to start. $19/mo for unlimited access.</p>
          <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px', borderRadius: 0 }}>JOIN THE SOCIETY</a>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
