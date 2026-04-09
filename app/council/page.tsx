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

const EXAMPLE_PILLS = [
  'What should I focus on this quarter?',
  'How do I find my first 10 customers?',
  "What's the most important thing I'm not doing?",
];

interface Message {
  id: string;
  role: 'user' | 'thinker';
  content: string;
  thinkerKey?: string;
  thinkerName?: string;
  thinkerColor?: string;
}

export default function CouncilPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [selectedThinkers, setSelectedThinkers] = useState<Set<string>>(new Set(THINKERS.map(t => t.id)));
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentThinker, setCurrentThinker] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [exchangeCount, setExchangeCount] = useState(0);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [onboarded, setOnboarded] = useState(true); // assume true, check on mount
  const [onboardStep, setOnboardStep] = useState(0);
  const [obBuilding, setObBuilding] = useState('');
  const [obChallenge, setObChallenge] = useState('');
  const [obSuccess, setObSuccess] = useState('');
  const [obBackground, setObBackground] = useState('');

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('soe_onboarded')) {
      setOnboarded(false);
    }
    async function loadAuth() {
      try {
        const session = await getMemberSession();
        if (session?.member) setMemberId(session.member.id);
        const supabase = createClient();
        const { data: { session: authSession } } = await supabase.auth.getSession();
        if (authSession?.access_token) setAuthToken(authSession.access_token);
      } catch {}
    }
    loadAuth();
  }, []);

  useEffect(() => {
    if (isStreaming || messages.length > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStreaming]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  function toggleThinker(id: string) {
    if (isStreaming) return;
    setSelectedThinkers(prev => {
      const next = new Set(prev);
      if (next.has(id)) { if (next.size > 1) next.delete(id); }
      else next.add(id);
      return next;
    });
  }

  const streamThinkerResponse = useCallback(async (
    thinkerId: string,
    userMessage: string,
    councilCtx: { thinker: string; response: string }[],
  ): Promise<string> => {
    const streamId = `thinker-${thinkerId}-${Date.now()}`;
    const thinker = THINKERS.find(t => t.id === thinkerId)!;

    setMessages(prev => [...prev, {
      id: streamId, role: 'thinker', content: '',
      thinkerKey: thinkerId, thinkerName: thinker.name, thinkerColor: thinker.color,
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
              // Strip |||ACTIONS||| from streaming display
              const displayText = responseFullText.split('|||ACTIONS|||')[0].trim();
              setMessages(prev => prev.map(m =>
                m.id === streamId ? { ...m, content: displayText } : m
              ));
            } else if (evt.type === 'actions' && evt.actions?.length > 0) {
              // Show action badges
              for (const action of evt.actions) {
                const labels: Record<string, string> = {
                  create_task: 'Task created', save_note: 'Note saved',
                  update_goal: 'Goal updated', award_exp: 'EXP awarded',
                  check_exp: 'EXP checked',
                };
                setToast(`\u2713 ${labels[action.type] || 'Action taken'}`);
              }
            } else if (evt.action === 'exp_balance') {
              setToast(`Your $EXP: ${evt.value.toLocaleString()}`);
            } else if (evt.action === 'exp_awarded') {
              setToast(`+${evt.amount} $EXP: ${evt.reason}`);
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
    } catch (err) {
      console.error(`[council] ${thinkerId} stream error:`, err);
    }

    return responseFullText;
  }, [authToken, memberId]);

  const send = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || isStreaming) return;

    setInput('');
    setIsStreaming(true);

    setMessages(prev => [...prev, { id: `user-${Date.now()}`, role: 'user', content: text }]);

    const activeThinkers = THINKERS.filter(t => selectedThinkers.has(t.id));
    const councilCtx: { thinker: string; response: string }[] = [];

    for (const thinker of activeThinkers) {
      setCurrentThinker(thinker.id);
      const resp = await streamThinkerResponse(thinker.id, text, councilCtx);
      if (resp) councilCtx.push({ thinker: thinker.name, response: resp });
    }

    setCurrentThinker(null);
    setIsStreaming(false);
    setExchangeCount(prev => prev + 1);
    inputRef.current?.focus();
  }, [input, isStreaming, selectedThinkers, streamThinkerResponse]);

  function completeOnboarding(skip?: boolean) {
    localStorage.setItem('soe_onboarded', 'true');
    setOnboarded(true);
    if (!skip && (obBuilding || obChallenge || obSuccess || obBackground)) {
      const contextMsg = `Here's my context: I'm building ${obBuilding || 'something new'}. My biggest challenge is ${obChallenge || 'figuring out next steps'}. In 90 days, success means ${obSuccess || 'meaningful progress'}. Background: ${obBackground || 'varied experience'}. Given all this — what should I focus on first?`;
      // Save to member profile if logged in
      if (memberId) {
        fetch('/api/members/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memberId, answers: { building: obBuilding, challenge: obChallenge, success: obSuccess, background: obBackground } }),
        }).catch(() => {});
      }
      send(contextMsg);
    }
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    if (memberId) {
      try {
        await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: taskTitle.trim(), description: taskDesc.trim(), priority: 'medium' }),
        });
      } catch {}
    }
    setToast(`Task created: ${taskTitle.trim()}`);
    setTaskTitle('');
    setTaskDesc('');
    setShowTaskForm(false);
  }

  const activeThinkerCount = selectedThinkers.size;
  const showSignInBanner = !memberId && exchangeCount >= 3;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {/* Sign-in banner for anonymous users after 3 exchanges */}
      {showSignInBanner && (
        <div style={{ paddingTop: '56px', flexShrink: 0, padding: '8px 16px', background: `${gold}0a`, borderBottom: `1px solid ${gold}22`, textAlign: 'center' }}>
          <span style={{ fontSize: '14px', color: ivory85 }}>Sign in to let the thinkers remember you across sessions. </span>
          <a href="/login" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.12em', color: gold, textDecoration: 'none' }}>SIGN IN</a>
        </div>
      )}

      {/* Thinker Selector */}
      <div style={{ paddingTop: showSignInBanner ? '0' : '56px', flexShrink: 0 }}>
        <div style={{
          display: 'flex', justifyContent: 'center', gap: '6px', padding: '10px 12px',
          borderBottom: `1px solid ${gold}11`, background: '#0a0a0a', overflowX: 'auto',
        }}>
          {THINKERS.map(t => {
            const active = selectedThinkers.has(t.id);
            const isCurrent = currentThinker === t.id;
            return (
              <button key={t.id} onClick={() => toggleThinker(t.id)} style={{
                background: 'none', border: 'none', cursor: isStreaming ? 'default' : 'pointer',
                opacity: active ? 1 : 0.25, transition: 'opacity 0.2s',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', padding: '4px 6px', flexShrink: 0,
              }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: '50%',
                  background: active ? `${t.color}22` : '#111',
                  border: `2px solid ${active ? t.color : '#333'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Cinzel, serif', fontSize: '11px', color: t.color,
                  boxShadow: isCurrent ? `0 0 14px ${t.color}55` : (active ? `0 0 6px ${t.color}22` : 'none'),
                  position: 'relative',
                }}>
                  {t.avatar}
                  {isCurrent && <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '8px', height: '8px', borderRadius: '50%', background: t.color, animation: 'pulse 1s infinite' }} />}
                </div>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: active ? t.color : '#555' }}>
                  {t.name.toUpperCase()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Chat Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {messages.length === 0 && !onboarded && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', maxWidth: '480px', margin: 'auto' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>COUNCIL MODE</div>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 400, color: parchment, marginBottom: '0.5rem', lineHeight: 1.3 }}>
              Before we begin — tell us about yourself.
            </h2>
            <p style={{ fontSize: '15px', color: muted, lineHeight: 1.7, marginBottom: '2rem' }}>The thinkers will remember everything you share.</p>

            {onboardStep === 0 && (
              <div>
                <p style={{ fontSize: '14px', color: ivory85, marginBottom: '0.75rem' }}>What are you building?</p>
                <input value={obBuilding} onChange={e => setObBuilding(e.target.value)} placeholder="A SaaS product, a community, a book..."
                  style={{ width: '100%', background: '#111', border: `1px solid ${gold}22`, padding: '14px 16px', fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: parchment, outline: 'none', boxSizing: 'border-box', marginBottom: '1rem' }}
                  onKeyDown={e => { if (e.key === 'Enter') setOnboardStep(1); }} />
              </div>
            )}
            {onboardStep === 1 && (
              <div>
                <p style={{ fontSize: '14px', color: ivory85, marginBottom: '0.75rem' }}>What's your biggest challenge right now?</p>
                <input value={obChallenge} onChange={e => setObChallenge(e.target.value)} placeholder="Finding customers, raising capital..."
                  style={{ width: '100%', background: '#111', border: `1px solid ${gold}22`, padding: '14px 16px', fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: parchment, outline: 'none', boxSizing: 'border-box', marginBottom: '1rem' }}
                  onKeyDown={e => { if (e.key === 'Enter') setOnboardStep(2); }} />
              </div>
            )}
            {onboardStep === 2 && (
              <div>
                <p style={{ fontSize: '14px', color: ivory85, marginBottom: '0.75rem' }}>What does success look like in 90 days?</p>
                <input value={obSuccess} onChange={e => setObSuccess(e.target.value)} placeholder="10 paying customers, MVP launched..."
                  style={{ width: '100%', background: '#111', border: `1px solid ${gold}22`, padding: '14px 16px', fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: parchment, outline: 'none', boxSizing: 'border-box', marginBottom: '1rem' }}
                  onKeyDown={e => { if (e.key === 'Enter') setOnboardStep(3); }} />
              </div>
            )}
            {onboardStep === 3 && (
              <div>
                <p style={{ fontSize: '14px', color: ivory85, marginBottom: '0.75rem' }}>What's your background?</p>
                <input value={obBackground} onChange={e => setObBackground(e.target.value)} placeholder="Engineer, designer, MBA dropout..."
                  style={{ width: '100%', background: '#111', border: `1px solid ${gold}22`, padding: '14px 16px', fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: parchment, outline: 'none', boxSizing: 'border-box', marginBottom: '1rem' }}
                  onKeyDown={e => { if (e.key === 'Enter') completeOnboarding(); }} />
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '0.5rem' }}>
              {onboardStep < 3 ? (
                <button onClick={() => setOnboardStep(s => s + 1)} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, border: 'none', padding: '0 24px', height: '44px', cursor: 'pointer', borderRadius: 0 }}>NEXT</button>
              ) : (
                <button onClick={() => completeOnboarding()} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, border: 'none', padding: '0 24px', height: '44px', cursor: 'pointer', borderRadius: 0 }}>START</button>
              )}
              <button onClick={() => completeOnboarding(true)} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.12em', color: muted, background: 'none', border: 'none', cursor: 'pointer' }}>SKIP</button>
            </div>
          </div>
        )}

        {messages.length === 0 && onboarded && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', maxWidth: '520px', margin: 'auto' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>COUNCIL MODE</div>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 400, fontStyle: 'italic', color: parchment, marginBottom: '0.75rem', lineHeight: 1.3 }}>
              Ask a question. {activeThinkerCount} mind{activeThinkerCount !== 1 ? 's' : ''} respond{activeThinkerCount === 1 ? 's' : ''}.
            </h2>
            <p style={{ fontSize: '16px', color: muted, lineHeight: 1.7, marginBottom: '2rem' }}>
              They debate, disagree, and build on each other. Toggle thinkers above.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '360px', margin: '0 auto' }}>
              {EXAMPLE_PILLS.map(pill => (
                <button key={pill} onClick={() => send(pill)} style={{
                  background: 'transparent', border: `1px solid ${gold}33`, borderRadius: '20px',
                  padding: '10px 18px', cursor: 'pointer', textAlign: 'left',
                  fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: ivory85,
                  transition: 'border-color 0.2s, background 0.2s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = `${gold}88`; e.currentTarget.style.background = `${gold}08`; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = `${gold}33`; e.currentTarget.style.background = 'transparent'; }}
                >
                  {pill}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          msg.role === 'user' ? (
            <div key={msg.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ background: 'rgba(201,168,76,0.12)', border: `1px solid ${gold}22`, padding: '12px 16px', maxWidth: '75%', borderRadius: '4px' }}>
                <p style={{ fontSize: '16px', color: parchment, lineHeight: 1.7, margin: 0 }}>{msg.content}</p>
              </div>
            </div>
          ) : (
            <div key={msg.id} style={{ display: 'flex', gap: '10px', maxWidth: '85%' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                background: `${msg.thinkerColor}22`, border: `1px solid ${msg.thinkerColor}44`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Cinzel, serif', fontSize: '9px', color: msg.thinkerColor, marginTop: '2px',
              }}>
                {THINKERS.find(t => t.id === msg.thinkerKey)?.avatar || '?'}
              </div>
              <div style={{ borderLeft: `2px solid ${msg.thinkerColor}33`, paddingLeft: '12px', minWidth: 0 }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.12em', color: msg.thinkerColor, marginBottom: '4px' }}>
                  {msg.thinkerName?.toUpperCase()}
                  {currentThinker === msg.thinkerKey && !msg.content && (
                    <span style={{ marginLeft: '6px', animation: 'pulse 1s infinite' }}>&bull;</span>
                  )}
                </div>
                <p style={{ fontSize: '16px', color: ivory85, lineHeight: 1.8, margin: 0, wordBreak: 'break-word' }}>
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

      {/* Task form inline */}
      {showTaskForm && (
        <div style={{ flexShrink: 0, padding: '12px 16px', background: '#0d0d0d', borderTop: `1px solid ${gold}15` }}>
          <form onSubmit={handleCreateTask} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="Task title..." required
              style={{ flex: 1, background: '#111', border: `1px solid ${gold}22`, padding: '10px 14px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment, outline: 'none' }} />
            <button type="submit" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.12em', color: '#0a0a0a', background: gold, border: 'none', padding: '10px 16px', cursor: 'pointer', borderRadius: 0 }}>CREATE</button>
            <button type="button" onClick={() => setShowTaskForm(false)} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '16px' }}>&times;</button>
          </form>
        </div>
      )}

      {/* Action Bar */}
      {messages.length > 0 && !showTaskForm && (
        <div style={{ flexShrink: 0, padding: '6px 16px', background: '#0a0a0a', borderTop: `1px solid ${gold}08`, display: 'flex', gap: '16px', justifyContent: 'center' }}>
          <button onClick={() => setShowTaskForm(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'Cinzel, serif', letterSpacing: '0.08em' }}
            onMouseEnter={e => e.currentTarget.style.color = gold} onMouseLeave={e => e.currentTarget.style.color = muted}>
            <span>&#128203;</span> CREATE TASK
          </button>
          <span style={{ color: `${muted}44`, fontSize: '12px', cursor: 'default' }} title="Coming soon">
            <span>&#127912;</span> <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.08em' }}>ARTIFACT</span>
          </span>
          <span style={{ color: `${muted}44`, fontSize: '12px', cursor: 'default' }} title="Coming soon">
            <span>&#128231;</span> <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.08em' }}>DRAFT EMAIL</span>
          </span>
        </div>
      )}

      {/* Input Bar */}
      <div style={{
        flexShrink: 0, padding: '12px 16px', borderTop: `1px solid rgba(201,168,76,0.15)`,
        background: '#0d0d0d', display: 'flex', gap: '8px',
      }}>
        <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          disabled={isStreaming} placeholder="Ask the council..."
          style={{
            flex: 1, background: '#111', border: `1px solid ${gold}18`, padding: '14px 16px',
            fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: parchment,
            outline: 'none', boxSizing: 'border-box', borderRadius: 0,
          }}
        />
        <button onClick={() => send()} disabled={isStreaming || !input.trim()} style={{
          fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em',
          color: '#0a0a0a', background: gold, border: 'none', padding: '0 24px',
          height: '48px', cursor: 'pointer', borderRadius: 0,
          opacity: isStreaming || !input.trim() ? 0.4 : 1,
        }}>
          {isStreaming ? '...' : 'ASK'}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)', background: `${gold}22`, border: `1px solid ${gold}44`, padding: '10px 20px', borderRadius: '4px', zIndex: 500 }}>
          <span style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.1em', color: gold }}>{toast}</span>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  );
}
