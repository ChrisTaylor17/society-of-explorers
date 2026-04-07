'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import PublicNav from '@/components/PublicNav';
import { createClient } from '@/lib/supabase/client';
import { getMemberSession } from '@/lib/auth/getSession';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

const THINKERS = [
  { id: 'socrates',  name: 'Socrates',  avatar: 'SO', color: '#C9A94E' },
  { id: 'plato',     name: 'Plato',     avatar: 'PL', color: '#7B68EE' },
  { id: 'aurelius',  name: 'Aurelius',  avatar: 'MA', color: '#8B7355' },
  { id: 'nietzsche', name: 'Nietzsche', avatar: 'FN', color: '#DC143C' },
  { id: 'einstein',  name: 'Einstein',  avatar: 'AE', color: '#4169E1' },
  { id: 'jobs',      name: 'Jobs',      avatar: 'SJ', color: '#A0A0A0' },
];

interface Message {
  id: string;
  role: 'user' | 'thinker';
  content: string;
  thinkerKey?: string;
  thinkerName?: string;
  thinkerColor?: string;
}

export default function CouncilModePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [selectedThinkers, setSelectedThinkers] = useState<Set<string>>(new Set(THINKERS.map(t => t.id)));
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentThinker, setCurrentThinker] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auth
  useEffect(() => {
    async function loadAuth() {
      try {
        const session = await getMemberSession();
        if (session?.member) {
          setMemberId(session.member.id);
        }
        const supabase = createClient();
        const { data: { session: authSession } } = await supabase.auth.getSession();
        if (authSession?.access_token) setAuthToken(authSession.access_token);
      } catch {}
    }
    loadAuth();
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (isStreaming || messages.length > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStreaming]);

  function toggleThinker(id: string) {
    if (isStreaming) return;
    setSelectedThinkers(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id); // keep at least 1
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const streamThinkerResponse = useCallback(async (
    thinkerId: string,
    thinkerName: string,
    userMessage: string,
    councilCtx: { thinker: string; response: string }[],
  ): Promise<string> => {
    const streamId = `thinker-${thinkerId}-${Date.now()}`;
    const thinker = THINKERS.find(t => t.id === thinkerId)!;

    setMessages(prev => [...prev, {
      id: streamId,
      role: 'thinker',
      content: '',
      thinkerKey: thinkerId,
      thinkerName: thinker.name,
      thinkerColor: thinker.color,
    }]);

    let responseFullText = '';

    try {
      const res = await fetch('/api/thinker', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          thinkerId,
          message: userMessage,
          memberId,
          walletMemberId: memberId,
          salonId: `council-${memberId || 'anon'}`,
          councilContext: councilCtx,
          isCouncilMode: true,
        }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => '');
        console.error(`[council] ${thinkerId} failed: ${res.status}`, errText);
        setMessages(prev => prev.map(m =>
          m.id === streamId ? { ...m, content: 'The thinker is silent. Try again.' } : m
        ));
        return '';
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.delta) {
              responseFullText += evt.delta;
              setMessages(prev => prev.map(m =>
                m.id === streamId ? { ...m, content: responseFullText } : m
              ));
            } else if (evt.done && evt.response) {
              const clean = evt.response.split('|||ACTIONS|||')[0]
                .replace(/^\[[\w-]+\]:\s*/i, '')
                .replace(/^(socrates|plato|nietzsche|aurelius|einstein|jobs|steve-jobs):\s*/i, '')
                .trim();
              responseFullText = clean || responseFullText;
              setMessages(prev => prev.map(m =>
                m.id === streamId ? { ...m, content: responseFullText } : m
              ));
            }
          } catch {}
        }
      }
    } catch {}

    return responseFullText;
  }, [authToken, memberId]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setInput('');
    setIsStreaming(true);

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };
    setMessages(prev => [...prev, userMsg]);

    const activeThinkers = THINKERS.filter(t => selectedThinkers.has(t.id));
    const councilCtx: { thinker: string; response: string }[] = [];

    for (const thinker of activeThinkers) {
      setCurrentThinker(thinker.id);
      const resp = await streamThinkerResponse(thinker.id, thinker.name, text, councilCtx);
      if (resp) {
        councilCtx.push({ thinker: thinker.name, response: resp });
      }
    }

    setCurrentThinker(null);
    setIsStreaming(false);
    inputRef.current?.focus();
  }, [input, isStreaming, selectedThinkers, streamThinkerResponse]);

  const activeThinkerCount = selectedThinkers.size;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {/* ═══ THINKER SELECTOR ═══ */}
      <div style={{ paddingTop: '56px', flexShrink: 0 }}>
        <div style={{
          display: 'flex', justifyContent: 'center', gap: '8px', padding: '12px 16px',
          borderBottom: `1px solid ${gold}11`, background: '#0a0a0a',
        }}>
          {THINKERS.map(t => {
            const active = selectedThinkers.has(t.id);
            const isCurrent = currentThinker === t.id;
            return (
              <button
                key={t.id}
                onClick={() => toggleThinker(t.id)}
                style={{
                  background: 'none', border: 'none', cursor: isStreaming ? 'default' : 'pointer',
                  opacity: active ? 1 : 0.3, transition: 'opacity 0.2s, box-shadow 0.2s',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                  padding: '4px 8px',
                }}
              >
                <div style={{
                  width: '40px', height: '40px', borderRadius: '50%',
                  background: active ? `${t.color}22` : '#111',
                  border: `2px solid ${active ? t.color : '#333'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Cinzel, serif', fontSize: '11px', color: t.color,
                  boxShadow: isCurrent ? `0 0 12px ${t.color}44` : (active ? `0 0 6px ${t.color}22` : 'none'),
                  position: 'relative',
                }}>
                  {t.avatar}
                  {isCurrent && (
                    <div style={{
                      position: 'absolute', bottom: '-2px', right: '-2px',
                      width: '8px', height: '8px', borderRadius: '50%', background: t.color,
                      animation: 'pulse 1s infinite',
                    }} />
                  )}
                </div>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: active ? t.color : '#555' }}>
                  {t.name.toUpperCase()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ CHAT AREA ═══ */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', maxWidth: '480px', margin: '0 auto' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>COUNCIL MODE</div>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 400, color: parchment, marginBottom: '1rem', lineHeight: 1.3 }}>
              {activeThinkerCount} mind{activeThinkerCount !== 1 ? 's' : ''} await your question.
            </h2>
            <p style={{ fontSize: '16px', color: muted, lineHeight: 1.7 }}>
              Each thinker sees what the others said. They debate, disagree, and build on each other. Toggle thinkers on/off above.
            </p>
          </div>
        )}

        {messages.map(msg => (
          msg.role === 'user' ? (
            <div key={msg.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{
                background: 'rgba(201,168,76,0.12)', border: `1px solid ${gold}22`,
                padding: '12px 16px', maxWidth: '70%', borderRadius: '4px',
              }}>
                <p style={{ fontSize: '16px', color: parchment, lineHeight: 1.7, margin: 0 }}>{msg.content}</p>
              </div>
            </div>
          ) : (
            <div key={msg.id} style={{ display: 'flex', gap: '10px', maxWidth: '85%' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                background: `${msg.thinkerColor}22`, border: `1px solid ${msg.thinkerColor}44`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Cinzel, serif', fontSize: '9px', color: msg.thinkerColor,
                marginTop: '2px',
              }}>
                {THINKERS.find(t => t.id === msg.thinkerKey)?.avatar || '?'}
              </div>
              <div style={{ borderLeft: `2px solid ${msg.thinkerColor}33`, paddingLeft: '12px' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.12em', color: msg.thinkerColor, marginBottom: '4px' }}>
                  {msg.thinkerName?.toUpperCase()}
                  {currentThinker === msg.thinkerKey && !msg.content && (
                    <span style={{ marginLeft: '6px', color: msg.thinkerColor, animation: 'pulse 1s infinite' }}>...</span>
                  )}
                </div>
                <p style={{ fontSize: '16px', color: ivory85, lineHeight: 1.8, margin: 0 }}>
                  {msg.content || '...'}
                  {currentThinker === msg.thinkerKey && msg.content && (
                    <span style={{ color: msg.thinkerColor }}>&#9613;</span>
                  )}
                </p>
              </div>
            </div>
          )
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* ═══ INPUT BAR ═══ */}
      <div style={{
        flexShrink: 0, padding: '12px 16px', borderTop: `1px solid ${gold}15`,
        background: '#0a0a0a', display: 'flex', gap: '8px',
      }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          disabled={isStreaming}
          placeholder="Ask the council anything..."
          style={{
            flex: 1, background: '#111', border: `1px solid ${gold}18`, padding: '12px 16px',
            fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: parchment,
            outline: 'none', boxSizing: 'border-box', borderRadius: 0,
          }}
        />
        <button
          onClick={send}
          disabled={isStreaming || !input.trim()}
          style={{
            fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em',
            color: '#0a0a0a', background: gold, border: 'none', padding: '0 24px',
            height: '48px', cursor: 'pointer', borderRadius: 0,
            opacity: isStreaming || !input.trim() ? 0.4 : 1,
          }}
        >
          {isStreaming ? '...' : 'ASK'}
        </button>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
