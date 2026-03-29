'use client';
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { getMemberSession, clearWalletCookie } from '@/lib/auth/getSession';
import { useAccount, useWriteContract } from 'wagmi';
import { ritualMarketplaceABI, erc20ABI, RITUAL_MARKETPLACE_ADDRESS, MOCK_SOE_ADDRESS } from '@/lib/contracts';
import { parseUnits } from 'viem';

const THINKERS = [
  { id: 'socrates',  name: 'Socrates',  avatar: 'SO', era: 'Ancient Greece · 470 BC' },
  { id: 'einstein',  name: 'Einstein',  avatar: 'AE', era: 'Modern Physics · 1879' },
  { id: 'jobs',      name: 'Jobs',      avatar: 'SJ', era: 'Silicon Valley · 1955' },
  { id: 'aurelius',  name: 'Aurelius',  avatar: 'MA', era: 'Roman Empire · 121 AD' },
  { id: 'nietzsche', name: 'Nietzsche', avatar: 'FN', era: 'Modern Philosophy · 1844' },
  { id: 'plato',     name: 'Plato',     avatar: 'PL', era: 'Ancient Greece · 428 BC' },
];

const RITUALS = [
  { id: 1, thinker: 'Einstein', name: 'Thought Experiment', price: 5,  tagline: 'Bend reality through imagination.' },
  { id: 2, thinker: 'Jobs',     name: 'Simplicity Ritual',  price: 8,  tagline: 'Strip away the unnecessary.' },
  { id: 3, thinker: 'Socrates', name: 'Question Everything',price: 3,  tagline: 'The unexamined life is not worth living.' },
  { id: 4, thinker: 'Aurelius', name: 'Stoic Reflection',   price: 4,  tagline: 'The obstacle is the way.' },
  { id: 5, thinker: 'Nietzsche',name: 'Will to Power',      price: 7,  tagline: 'Become who you are.' },
  { id: 6, thinker: 'Plato',    name: 'Ideal Form',         price: 6,  tagline: 'Ascend toward the eternal.' },
];

interface Message {
  id?: string;
  created_at: string;
  sender_type: 'member' | 'thinker' | 'system';
  sender_name: string;
  thinker_id?: string;
  content: string;
}

interface Member {
  id: string;
  display_name: string;
  exp_tokens: number;
  member_rank: string;
}

export default function SalonPage() {
  const [messages,        setMessages]        = useState<Message[]>([]);
  const [input,           setInput]           = useState('');
  const [selectedThinker, setSelectedThinker] = useState(THINKERS[0]);
  const [member,          setMember]          = useState<Member | null>(null);
  const [isLoading,       setIsLoading]       = useState(false);
  const [authReady,       setAuthReady]       = useState(false);
  const [showThinkers,    setShowThinkers]    = useState(false);
  const [showMarket,      setShowMarket]      = useState(false);
  const [ritualTx, setRitualTx] = useState<{
    status: 'idle' | 'approving' | 'pending' | 'success' | 'error';
    hash?: string; error?: string; ritualId?: number;
  }>({ status: 'idle' });

  const endRef  = useRef<HTMLDivElement>(null);
  const router  = useRouter();
  const supabase = createClient();
  const { address }      = useAccount();
  const { writeContract } = useWriteContract();

  // ── Auth ──────────────────────────────────────────────────────────
  useEffect(() => {
    getMemberSession().then(session => {
      if (!session) { router.push('/'); return; }
      setMember(session.member);
      setAuthReady(true);
    });
  }, []);

  // ── Load + subscribe ──────────────────────────────────────────────
  async function loadMessages() {
    const { data } = await supabase.from('salon_messages').select('*')
      .order('created_at', { ascending: true }).limit(60);
    if (data) setMessages(data);
  }

  useEffect(() => { loadMessages(); }, []);

  useEffect(() => {
    const ch = supabase.channel('salon')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'salon_messages' },
        p => setMessages(prev => [...prev, p.new as Message]))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── Send ──────────────────────────────────────────────────────────
  async function send() {
    if (!input.trim() || isLoading) return;
    const text = input.trim();
    setInput('');
    setIsLoading(true);

    await supabase.from('salon_messages').insert({
      sender_type: 'member',
      sender_name: member?.display_name || 'You',
      content: text,
    });

    const streamId = `streaming-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: streamId, created_at: new Date().toISOString(),
      sender_type: 'thinker', sender_name: selectedThinker.name,
      thinker_id: selectedThinker.id, content: '',
    }]);

    try {
      const res = await fetch('/api/thinker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thinkerId: selectedThinker.id, message: text,
          history: messages.slice(-12), isReaction: false,
          walletMemberId: member?.id,
        }),
      });
      const reader = res.body!.getReader();
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
              setMessages(prev => prev.map(m =>
                m.id === streamId ? { ...m, content: m.content + evt.delta } : m));
            } else if (evt.done) {
              setMessages(prev => prev.filter(m => m.id !== streamId));
            }
          } catch {}
        }
      }
    } catch {}

    if (member) {
      const { data } = await supabase.from('members')
        .select('exp_tokens,member_rank').eq('id', member.id).single();
      if (data) setMember(p => p ? { ...p, ...data } : p);
    }
    setIsLoading(false);
  }

  // ── Run ritual (ERC-20 approve → accessRitual) ───────────────────
  async function handleRunRitual(ritual: typeof RITUALS[0]) {
    if (!address) { alert('Connect your wallet first'); return; }
    setRitualTx({ status: 'approving', ritualId: ritual.id });
    try {
      // Step 1 — approve $SOE spend
      await writeContract({
        address: MOCK_SOE_ADDRESS,
        abi: erc20ABI,
        functionName: 'approve',
        args: [RITUAL_MARKETPLACE_ADDRESS, parseUnits(ritual.price.toString(), 18)],
      });
      // Step 2 — access the ritual
      setRitualTx({ status: 'pending', ritualId: ritual.id });
      await writeContract({
        address: RITUAL_MARKETPLACE_ADDRESS,
        abi: ritualMarketplaceABI,
        functionName: 'accessRitual',
        args: [BigInt(ritual.id)],
      });
      // Post system message immediately and refresh
      const systemMsg = {
        sender_type: 'system' as const,
        sender_name: 'system',
        content: `🪄 ${ritual.thinker} Ritual activated for ${ritual.price} $SOE`,
        created_at: new Date().toISOString(),
      };
      await supabase.from('salon_messages').insert(systemMsg);
      setMessages(prev => [...prev, { ...systemMsg, id: `ritual-${Date.now()}` }]);
      setRitualTx({ status: 'success', ritualId: ritual.id });
      loadMessages();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction failed or rejected';
      setRitualTx({ status: 'error', error: msg, ritualId: ritual.id });
      alert(msg);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────
  function rank(e: number) {
    if (e >= 2000) return 'Elder';
    if (e >= 1000) return 'Master';
    if (e >= 600)  return 'Fellow';
    if (e >= 300)  return 'Scholar';
    if (e >= 100)  return 'Seeker';
    return 'Initiate';
  }

  async function signOut() {
    await supabase.auth.signOut();
    localStorage.removeItem('soe_wallet');
    localStorage.removeItem('soe_wallet_id');
    clearWalletCookie();
    router.push('/');
  }

  // ── Loading guard ─────────────────────────────────────────────────
  if (!authReady) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-void)' }}>
      <div style={{ fontFamily: 'Cinzel,serif', fontSize: '12px', letterSpacing: '0.3em', color: 'var(--gold-dim)' }}>
        ENTERING THE SALON...
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-void)', overflow: 'hidden' }}>

      {/* ════ TOPBAR ════ */}
      <div style={{
        height: '52px',
        background: 'linear-gradient(180deg,#0a0900,var(--bg-deep))',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', flexShrink: 0, position: 'relative', zIndex: 10,
      }}>
        {/* Gold rule */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg,transparent,var(--gold-dim),var(--gold),var(--gold-dim),transparent)' }} />

        <div style={{ fontFamily: 'Cinzel,serif', fontSize: '13px', letterSpacing: '0.2em', color: 'var(--gold)' }}>
          Society of Explorers
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {([
            { label: 'MINDS',   action: () => setShowThinkers(v => !v), active: showThinkers },
            { label: 'MARKET',  action: () => { setShowMarket(v => !v); setRitualTx({ status: 'idle' }); }, active: showMarket },
            { label: 'MEMBERS', action: () => router.push('/members'), active: false },
            { label: 'BOOK',    action: () => router.push('/book'),    active: false },
            { label: 'LEAVE',   action: signOut,                       active: false },
          ] as const).map(btn => (
            <button key={btn.label} onClick={btn.action} style={{
              background: btn.active ? 'var(--glow)' : 'none',
              border: `1px solid ${btn.active ? 'var(--gold)' : 'var(--border)'}`,
              color: btn.active ? 'var(--gold)' : 'var(--gold-dim)',
              fontSize: '10px', fontFamily: 'Cinzel,serif', letterSpacing: '0.08em',
              padding: '3px 8px', cursor: 'pointer', borderRadius: '2px',
            }}>{btn.label}</button>
          ))}
        </div>
      </div>

      {/* ════ THINKER DROPDOWN ════ */}
      {showThinkers && (
        <div style={{
          position: 'absolute', top: '52px', left: 0, right: 0,
          background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)',
          zIndex: 20, padding: '8px 0',
        }}>
          {THINKERS.map(t => (
            <div key={t.id} onClick={() => { setSelectedThinker(t); setShowThinkers(false); }}
              style={{
                padding: '12px 16px', cursor: 'pointer',
                borderLeft: `2px solid ${selectedThinker.id === t.id ? 'var(--gold)' : 'transparent'}`,
                background: selectedThinker.id === t.id ? 'var(--glow)' : 'transparent',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
              <span style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '16px', color: selectedThinker.id === t.id ? 'var(--gold-light)' : 'var(--ivory)' }}>{t.name}</span>
              <span style={{ fontSize: '10px', color: 'var(--ivory-muted)' }}>{t.era}</span>
            </div>
          ))}
        </div>
      )}

      {/* ════ MARKETPLACE OVERLAY ════ */}
      {showMarket && (
        <div style={{
          position: 'absolute', inset: 0, top: '52px',
          background: 'var(--bg-void)', zIndex: 30,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-deep)', flexShrink: 0 }}>
            <div>
              <div style={{ fontFamily: 'Cinzel,serif', fontSize: '13px', color: 'var(--gold-light)', letterSpacing: '0.12em' }}>Ritual Marketplace</div>
              <div style={{ fontSize: '11px', color: 'var(--ivory-muted)', fontStyle: 'italic', marginTop: '1px', fontFamily: 'Cormorant Garamond,serif' }}>
                Pay $SOE · Unlock wisdom · Own your access forever
              </div>
            </div>
            <button onClick={() => { setShowMarket(false); setRitualTx({ status: 'idle' }); }} style={{
              background: 'none', border: '1px solid var(--border)', color: 'var(--gold-dim)',
              fontSize: '10px', fontFamily: 'Cinzel,serif', letterSpacing: '0.08em',
              padding: '3px 8px', cursor: 'pointer', borderRadius: '2px',
            }}>CLOSE</button>
          </div>

          {/* Ritual list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {RITUALS.map(ritual => {
              const isRunning = ritualTx.ritualId === ritual.id && (ritualTx.status === 'approving' || ritualTx.status === 'pending');
              const isSuccess = ritualTx.ritualId === ritual.id && ritualTx.status === 'success';
              const isError   = ritualTx.ritualId === ritual.id && ritualTx.status === 'error';
              return (
                <div key={ritual.id} style={{
                  background: 'var(--bg-elevated)',
                  border: `1px solid ${isSuccess ? 'var(--gold)' : 'var(--border)'}`,
                  borderRadius: '4px', padding: '16px', transition: 'border-color 0.2s',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'Cinzel,serif', fontSize: '12px', color: 'var(--gold-light)', letterSpacing: '0.08em', marginBottom: '4px' }}>
                        {ritual.name}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--gold-dim)', letterSpacing: '0.1em', fontFamily: 'Cinzel,serif', marginBottom: '6px' }}>
                        with {ritual.thinker}
                      </div>
                      <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '14px', color: 'var(--ivory-muted)', fontStyle: 'italic', lineHeight: 1.5 }}>
                        {ritual.tagline}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: 'Cinzel,serif', fontSize: '14px', color: 'var(--gold)' }}>{ritual.price} $SOE</div>
                    </div>
                  </div>

                  <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                      onClick={() => handleRunRitual(ritual)}
                      disabled={isRunning || isSuccess}
                      style={{
                        background: isSuccess ? 'var(--glow)' : 'linear-gradient(135deg,#1c1500,#2a1e00)',
                        border: `1px solid ${isSuccess ? 'var(--gold)' : 'var(--gold-dim)'}`,
                        color: 'var(--gold)',
                        fontFamily: 'Cinzel,serif', fontSize: '10px', letterSpacing: '0.15em',
                        padding: '6px 14px', cursor: isRunning || isSuccess ? 'not-allowed' : 'pointer',
                        borderRadius: '2px', opacity: isRunning ? 0.6 : 1, transition: 'all 0.2s',
                      }}>
                      {isSuccess ? '⬡ ACCESS GRANTED' : ritualTx.status === 'approving' && ritualTx.ritualId === ritual.id ? 'APPROVING $SOE...' : ritualTx.status === 'pending' && ritualTx.ritualId === ritual.id ? 'CONFIRMING...' : '⬡ RUN RITUAL'}
                    </button>
                  </div>

                  {isError && (
                    <div style={{ marginTop: '8px', fontSize: '11px', color: '#e07070', fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic' }}>
                      {ritualTx.error}
                    </div>
                  )}
                  {isSuccess && ritualTx.hash && (
                    <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--gold-dim)', fontFamily: 'Cinzel,serif', letterSpacing: '0.04em' }}>
                      tx: {ritualTx.hash.slice(0, 10)}…{ritualTx.hash.slice(-6)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Protocol note */}
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-deep)', flexShrink: 0 }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', textAlign: 'center', lineHeight: 1.6 }}>
              All payments settle on-chain. 70% to creators · 2% to the Society. You own your access record forever.
            </div>
          </div>
        </div>
      )}

      {/* ════ CHAT AREA ════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Sub-header */}
        <div style={{
          padding: '10px 16px', borderBottom: '1px solid var(--border)',
          flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'var(--bg-deep)',
        }}>
          <div>
            <div style={{ fontFamily: 'Cinzel,serif', fontSize: '13px', color: 'var(--gold-light)', letterSpacing: '0.1em' }}>
              The Salon of Great Minds
            </div>
            <div style={{ fontSize: '11px', color: 'var(--ivory-muted)', fontStyle: 'italic', marginTop: '1px', fontFamily: 'Cormorant Garamond,serif' }}>
              Addressing {selectedThinker.name}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'Cinzel,serif', fontSize: '18px', color: 'var(--gold-light)' }}>
              {member?.exp_tokens || 0}
            </div>
            <div style={{ fontSize: '9px', color: 'var(--ivory-muted)', letterSpacing: '0.15em' }}>
              EXP · {rank(member?.exp_tokens || 0)}
            </div>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--bg-deep)' }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 16px', fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: '15px', color: 'var(--text-muted)', lineHeight: 1.8 }}>
              Welcome to the Salon.<br />
              <span style={{ fontSize: '13px', color: 'var(--gold-dim)' }}>Tap MINDS to choose a thinker, then speak.</span><br />
              <span style={{ fontSize: '12px', color: 'var(--gold-dim)', display: 'block', marginTop: '8px' }}>Open MARKET to access rituals with $SOE.</span>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={msg.id || i} style={{
              display: 'flex', gap: '10px',
              flexDirection: msg.sender_type === 'member' ? 'row-reverse' : 'row',
              justifyContent: msg.sender_type === 'system' ? 'center' : undefined,
            }}>
              {msg.sender_type === 'system' ? (
                <div
                  style={{
                    fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: '11px',
                    color: 'var(--gold-dim)', padding: '4px 12px',
                    borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                    background: 'var(--glow)', textAlign: 'center',
                  }}
                  dangerouslySetInnerHTML={{ __html: msg.content }}
                />
              ) : (
                <>
                  {/* Avatar */}
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'Cinzel,serif', fontSize: '11px', fontWeight: 600,
                    flexShrink: 0, marginTop: '2px',
                    border: '1px solid var(--border-bright)',
                    background: msg.sender_type === 'member' ? 'var(--sapphire)' : 'var(--bg-elevated)',
                    color: msg.sender_type === 'member' ? '#8ab0d8' : 'var(--gold)',
                  }}>
                    {msg.sender_name.slice(0, 2).toUpperCase()}
                  </div>

                  {/* Bubble */}
                  <div style={{ flex: 1, maxWidth: '80%' }}>
                    <div style={{
                      fontFamily: 'Cinzel,serif', fontSize: '9px', letterSpacing: '0.15em',
                      color: msg.sender_type === 'member' ? 'rgba(100,150,200,0.6)' : 'var(--gold-dim)',
                      marginBottom: '4px', textTransform: 'uppercase',
                    }}>
                      {msg.sender_name}
                    </div>
                    <div style={{
                      background: msg.sender_type === 'member'
                        ? 'linear-gradient(135deg,#1a2030,#12182a)'
                        : 'var(--bg-elevated)',
                      border: `1px solid ${msg.sender_type === 'member' ? 'rgba(80,120,180,0.25)' : 'var(--border)'}`,
                      borderRadius: msg.sender_type === 'member' ? '12px 2px 12px 12px' : '2px 12px 12px 12px',
                      padding: '10px 14px', fontSize: '15px', lineHeight: 1.65,
                      color: msg.sender_type === 'member' ? '#c8d8f0' : 'var(--text-primary)',
                      whiteSpace: 'pre-wrap',
                    }}>
                      {msg.content}
                    </div>

                    {/* "Run Ritual" shortcut on thinker messages */}
                    {msg.sender_type === 'thinker' && msg.content && (
                      <button
                        onClick={() => { setShowMarket(true); setRitualTx({ status: 'idle' }); }}
                        style={{
                          marginTop: '5px', background: 'none', border: 'none',
                          color: 'var(--gold-dim)', fontSize: '10px',
                          fontFamily: 'Cinzel,serif', letterSpacing: '0.1em',
                          cursor: 'pointer', padding: '0', opacity: 0.7,
                        }}>
                        ⬡ Run Ritual with {msg.sender_name}
                      </button>
                    )}

                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}

          {/* Typing indicator */}
          {isLoading && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Cinzel,serif', fontSize: '11px', color: 'var(--gold)', flexShrink: 0,
              }}>
                {selectedThinker.avatar}
              </div>
              <div style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: '2px 12px 12px 12px', padding: '10px 14px',
                display: 'flex', gap: '4px', alignItems: 'center',
              }}>
                {[0, 0.2, 0.4].map((d, idx) => (
                  <div key={idx} style={{
                    width: '5px', height: '5px', borderRadius: '50%',
                    background: 'var(--gold-dim)',
                    animation: `typing 1.2s ${d}s ease-in-out infinite`,
                  }} />
                ))}
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* ════ INPUT ════ */}
        <div style={{
          paddingTop: '12px', paddingLeft: '16px', paddingRight: '16px', paddingBottom: '16px',
          borderTop: '1px solid var(--border)', flexShrink: 0,
          background: 'linear-gradient(0deg,#070600,var(--bg-deep))',
        }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <textarea
              value={input}
              onChange={e => {
                setInput(e.target.value);
                e.currentTarget.style.height = 'auto';
                e.currentTarget.style.height = Math.min(e.currentTarget.scrollHeight, 100) + 'px';
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder={`Speak to ${selectedThinker.name}...`}
              disabled={isLoading}
              rows={1}
              style={{
                flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: '6px', padding: '10px 14px',
                fontFamily: 'EB Garamond,serif', fontSize: '16px', color: 'var(--ivory)',
                resize: 'none', outline: 'none', minHeight: '44px', maxHeight: '100px', lineHeight: 1.5,
              }}
            />
            <button
              onClick={send}
              disabled={isLoading}
              style={{
                padding: '10px 16px', height: '44px',
                background: 'linear-gradient(135deg,#1c1500,#2a1e00)',
                border: '1px solid var(--gold-dim)', borderRadius: '4px',
                color: 'var(--gold)', fontFamily: 'Cinzel,serif', fontSize: '11px',
                letterSpacing: '0.15em', cursor: isLoading ? 'not-allowed' : 'pointer', flexShrink: 0,
              }}>
              SPEAK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
