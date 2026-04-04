'use client';
import { useState, useEffect, useRef } from 'react';
import { startRecording, stopRecording, isRecordingNow } from '@/lib/voiceRecorder';
import { speakText } from '@/lib/tts';

const gold = '#c9a84c';
const parchment = '#E8DCC8';
const muted = '#9a8f7a';

const THINKERS = [
  { id: 'socrates', symbol: 'Σ', name: 'Socrates', color: '#C9A94E' },
  { id: 'plato', symbol: 'Π', name: 'Plato', color: '#7B68EE' },
  { id: 'nietzsche', symbol: 'N', name: 'Nietzsche', color: '#DC143C' },
  { id: 'aurelius', symbol: 'M', name: 'Aurelius', color: '#8B7355' },
  { id: 'einstein', symbol: 'E', name: 'Einstein', color: '#4169E1' },
  { id: 'jobs', symbol: 'J', name: 'Jobs', color: '#A0A0A0' },
];

const REACTIONS = [
  { type: 'illuminate', icon: '✦', label: 'Illuminate' },
  { type: 'challenge', icon: '⚔', label: 'Challenge' },
  { type: 'extend', icon: '→', label: 'Extend' },
  { type: 'question', icon: '?', label: 'Question' },
  { type: 'mint_worthy', icon: '◆', label: 'Mint-worthy' },
];

const TABS = ['trending', 'thinker_picks', 'my', 'archive'] as const;
const TAB_LABELS: Record<string, string> = { trending: 'Trending', thinker_picks: "Thinker's Picks", my: 'My Constellation', archive: 'Archive' };

export default function TwiddlePage() {
  const [memberId, setMemberId] = useState<string | null>(null);
  const [memberName, setMemberName] = useState('Explorer');

  // Compose
  const [content, setContent] = useState('');
  const [threadType, setThreadType] = useState<'solo' | 'open' | 'collaborative'>('open');
  const [selectedThinkers, setSelectedThinkers] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);

  // Voice
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  // Feed
  const [tab, setTab] = useState<typeof TABS[number]>('trending');
  const [twiddles, setTwiddles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Thread expand
  const [expandedThread, setExpandedThread] = useState<string | null>(null);
  const [threadData, setThreadData] = useState<any[]>([]);

  // Thinker respond
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [respondThinker, setRespondThinker] = useState('socrates');

  useEffect(() => {
    import('@/lib/auth/getSession').then(({ getMemberSession }) => {
      getMemberSession().then(s => {
        if (s?.member) { setMemberId(s.member.id); setMemberName(s.member.display_name || 'Explorer'); }
      });
    });
    loadFeed();
  }, []);

  useEffect(() => { loadFeed(); }, [tab]);

  async function loadFeed() {
    setLoading(true);
    try {
      const res = await fetch(`/api/twiddle?filter=${tab}&limit=20${memberId ? `&memberId=${memberId}` : ''}`);
      const data = await res.json();
      setTwiddles(Array.isArray(data.twiddles) ? data.twiddles : []);
    } catch (err) {
      console.error('Feed load error:', err);
      setTwiddles([]);
    }
    setLoading(false);
  }

  async function postTwiddle() {
    if (!content.trim() || !memberId || posting) return;
    setPosting(true);
    await fetch('/api/twiddle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, twiddle_type: 'text', thread_type: threadType, thinker_tags: selectedThinkers, memberId }),
    });
    setContent(''); setSelectedThinkers([]); setPosting(false);
    loadFeed();
  }

  async function handleVoice() {
    if (isRecordingNow()) {
      setRecording(false); setTranscribing(true);
      try {
        const text = await stopRecording();
        if (text.trim()) setContent(prev => prev ? `${prev} ${text}` : text);
      } catch {}
      setTranscribing(false);
    } else {
      try { await startRecording(); setRecording(true); } catch { alert('Mic access denied.'); }
    }
  }

  async function toggleReaction(twiddleId: string, reactionType: string) {
    if (!memberId) return;
    await fetch(`/api/twiddle/${twiddleId}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reaction_type: reactionType, memberId }),
    });
    loadFeed();
  }

  async function askThinker(twiddleId: string) {
    if (!memberId) return;
    setRespondingTo(twiddleId);
    const res = await fetch(`/api/twiddle/${twiddleId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thinker_key: respondThinker, memberId }),
    });
    setRespondingTo(null);
    loadFeed();
  }

  async function loadThread(twiddleId: string) {
    if (expandedThread === twiddleId) { setExpandedThread(null); return; }
    setExpandedThread(twiddleId);
    const res = await fetch(`/api/twiddle/${twiddleId}`);
    const data = await res.json();
    setThreadData(data.thread || []);
  }

  function toggleThinker(id: string) {
    setSelectedThinkers(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  }

  function timeAgo(ts: string): string {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to bottom, #000, transparent)' }}>
        <a href="/salon" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.7 }}>← SALON</a>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.25em', color: gold }}>TWIDDLETWATTLE</div>
        <div style={{ width: '60px' }} />
      </nav>

      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '70px 1rem 4rem' }}>

        {/* ═══ COMPOSE ═══ */}
        {memberId && (
          <div style={{ border: `1px solid ${gold}22`, background: '#0d0d0d', padding: '1.5rem', marginBottom: '1.5rem' }}>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value.slice(0, 500))}
              onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) postTwiddle(); }}
              placeholder="Drop a twiddle..."
              rows={3}
              style={{ width: '100%', background: 'transparent', border: 'none', color: parchment, fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', lineHeight: 1.7, outline: 'none', resize: 'none', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', color: muted, marginRight: '4px' }}>{content.length}/500</span>
                {/* Voice */}
                <button onClick={handleVoice} style={{ background: recording ? 'rgba(191,64,64,0.2)' : 'none', border: `1px solid ${recording ? '#BF4040' : `${gold}33`}`, color: recording ? '#BF4040' : muted, padding: '4px 8px', cursor: 'pointer', fontFamily: 'Cinzel, serif', fontSize: '8px' }}>
                  {transcribing ? '...' : recording ? '⬡ REC' : '⬡ MIC'}
                </button>
              </div>
              {/* Thread type */}
              <div style={{ display: 'flex', gap: '2px' }}>
                {(['solo', 'open', 'collaborative'] as const).map(t => (
                  <button key={t} onClick={() => setThreadType(t)} style={{
                    fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', padding: '3px 8px', cursor: 'pointer',
                    color: threadType === t ? gold : muted,
                    background: threadType === t ? `${gold}15` : 'none',
                    border: `1px solid ${threadType === t ? `${gold}44` : 'transparent'}`,
                  }}>{t.toUpperCase()}</button>
                ))}
              </div>
            </div>

            {/* Thinker tags */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '0.75rem', overflowX: 'auto' }}>
              {THINKERS.map(t => (
                <button key={t.id} onClick={() => toggleThinker(t.id)} style={{
                  width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
                  background: selectedThinkers.includes(t.id) ? `${t.color}22` : 'none',
                  border: `2px solid ${selectedThinkers.includes(t.id) ? t.color : `${gold}22`}`,
                  color: selectedThinkers.includes(t.id) ? t.color : muted,
                  fontFamily: 'Cinzel, serif', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s',
                }}>{t.symbol}</button>
              ))}
            </div>

            {/* Post */}
            <button onClick={postTwiddle} disabled={posting || !content.trim()} style={{
              marginTop: '1rem', width: '100%', fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em',
              color: '#000', background: gold, border: 'none', padding: '10px', cursor: 'pointer',
              opacity: posting || !content.trim() ? 0.4 : 1,
            }}>
              {posting ? 'POSTING...' : 'TWIDDLE'}
            </button>
          </div>
        )}

        {/* ═══ TABS ═══ */}
        <div style={{ display: 'flex', gap: '0', borderBottom: `1px solid ${gold}15`, marginBottom: '1.5rem' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '10px 0', fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em',
              color: tab === t ? gold : muted, background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: tab === t ? `2px solid ${gold}` : '2px solid transparent',
              transition: 'all 0.2s',
            }}>{TAB_LABELS[t]}</button>
          ))}
        </div>

        {/* ═══ FEED ═══ */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: muted, fontStyle: 'italic' }}>Loading...</div>
        ) : twiddles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1.5rem', color: gold, opacity: 0.15, marginBottom: '1rem' }}>⬡</div>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: muted, fontStyle: 'italic' }}>The clearing is quiet. Drop the first twiddle.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: `${gold}08` }}>
            {twiddles.map(tw => {
              const thinkerResponses = expandedThread === tw.id ? threadData.filter((t: any) => t.is_thinker_response) : [];
              const threadCount = tw.reaction_counts ? Object.values(tw.reaction_counts as Record<string, number>).reduce((a: number, b: number) => a + b, 0) : 0;

              return (
                <div key={tw.id} style={{ background: '#0d0d0d', padding: '1.25rem 1.5rem' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: `${gold}22`, border: `1px solid ${gold}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '10px', color: gold }}>
                        {tw.is_thinker_response ? (THINKERS.find(t => t.id === tw.thinker_key)?.symbol || '⬡') : '⬡'}
                      </div>
                      <div>
                        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.1em', color: tw.is_thinker_response ? (THINKERS.find(t => t.id === tw.thinker_key)?.color || gold) : parchment }}>
                          {tw.is_thinker_response ? (tw.thinker_key?.toUpperCase() || 'THINKER') : 'EXPLORER'}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', color: muted }}>{timeAgo(tw.created_at)}</div>
                  </div>

                  {/* Content */}
                  <div style={{ fontSize: '16px', lineHeight: 1.8, marginBottom: '0.75rem', color: tw.is_thinker_response ? `${parchment}cc` : parchment, fontStyle: tw.is_thinker_response ? 'italic' : 'normal' }}>
                    {tw.content}
                  </div>

                  {/* Voice playback */}
                  {tw.voice_url && (
                    <audio controls src={tw.voice_url} style={{ width: '100%', height: '28px', marginBottom: '0.5rem', filter: 'invert(0.8) sepia(0.5) hue-rotate(10deg)' }} />
                  )}

                  {/* Thinker tags */}
                  {tw.thinker_tags?.length > 0 && (
                    <div style={{ display: 'flex', gap: '4px', marginBottom: '0.75rem' }}>
                      {tw.thinker_tags.map((tag: string) => {
                        const t = THINKERS.find(x => x.id === tag);
                        return t ? <span key={tag} style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: t.color, border: `1px solid ${t.color}33`, padding: '2px 6px' }}>{t.symbol} {t.name.toUpperCase()}</span> : null;
                      })}
                    </div>
                  )}

                  {/* Reactions */}
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginBottom: '0.5rem' }}>
                    {REACTIONS.map(r => {
                      const count = tw.reaction_counts?.[r.type] || 0;
                      return (
                        <button key={r.type} onClick={() => toggleReaction(tw.id, r.type)} title={r.label} style={{
                          display: 'flex', alignItems: 'center', gap: '3px', padding: '3px 7px', cursor: 'pointer',
                          background: count > 0 ? `${gold}11` : 'none', border: `1px solid ${count > 0 ? `${gold}33` : `${gold}11`}`,
                          color: count > 0 ? gold : muted, fontFamily: 'Cinzel, serif', fontSize: '10px', transition: 'all 0.2s',
                        }}>
                          {r.icon}{count > 0 && <span style={{ fontSize: '8px' }}>{count}</span>}
                        </button>
                      );
                    })}

                    {/* Ask thinker */}
                    {!tw.is_thinker_response && memberId && (
                      <button onClick={() => askThinker(tw.id)} disabled={respondingTo === tw.id} style={{
                        marginLeft: 'auto', fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em',
                        color: gold, background: 'none', border: `1px solid ${gold}22`, padding: '3px 8px', cursor: 'pointer',
                        opacity: respondingTo === tw.id ? 0.4 : 0.7,
                      }}>
                        {respondingTo === tw.id ? '...' : '⬡ ASK THINKER'}
                      </button>
                    )}
                  </div>

                  {/* Thread expand */}
                  <button onClick={() => loadThread(tw.id)} style={{
                    fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em',
                    color: muted, background: 'none', border: 'none', cursor: 'pointer', padding: 0, opacity: 0.6,
                  }}>
                    {expandedThread === tw.id ? '▼ COLLAPSE THREAD' : '▶ VIEW THREAD'}
                  </button>

                  {/* Expanded thread */}
                  {expandedThread === tw.id && threadData.length > 1 && (
                    <div style={{ marginTop: '0.75rem', borderLeft: `1px solid ${gold}22`, paddingLeft: '1rem' }}>
                      {threadData.filter((t: any) => t.id !== tw.id).map((reply: any) => {
                        const rt = reply.is_thinker_response ? THINKERS.find(x => x.id === reply.thinker_key) : null;
                        return (
                          <div key={reply.id} style={{ marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: `1px solid ${gold}08` }}>
                            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', color: rt ? rt.color : muted, marginBottom: '0.25rem' }}>
                              {rt ? `${rt.symbol} ${rt.name.toUpperCase()}` : 'EXPLORER'} · {timeAgo(reply.created_at)}
                            </div>
                            <div style={{ fontSize: '14px', lineHeight: 1.7, color: `${parchment}cc`, fontStyle: reply.is_thinker_response ? 'italic' : 'normal' }}>
                              {reply.content}
                            </div>
                            {reply.voice_url && reply.is_thinker_response && (
                              <button onClick={() => speakText(reply.content, reply.thinker_key || 'socrates').catch(() => {})} style={{
                                marginTop: '0.25rem', fontFamily: 'Cinzel, serif', fontSize: '7px', color: rt?.color || gold,
                                background: 'none', border: `1px solid ${(rt?.color || gold)}22`, padding: '2px 6px', cursor: 'pointer',
                              }}>⬡ LISTEN</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <footer style={{ padding: '3rem 2rem', borderTop: `1px solid ${gold}22`, textAlign: 'center' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, opacity: 0.4 }}>SOCIETY OF EXPLORERS · TWIDDLETWATTLE</div>
      </footer>
    </div>
  );
}
