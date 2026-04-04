'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { speakText } from '@/lib/tts';
import { renderMarkdown } from '@/lib/renderMarkdown';

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

interface Twiddle {
  id: string; content: string; twiddle_type: string; thread_type: string;
  thinker_tags: string[]; voice_url?: string; artifact_url?: string;
  is_thinker_response: boolean; thinker_key?: string; author_id?: string;
  parent_id?: string; root_id?: string; is_woven: boolean; minted: boolean;
  created_at: string; reaction_counts: Record<string, number>;
}

export default function ThreadPage() {
  const { id } = useParams() as { id: string };
  const [root, setRoot] = useState<Twiddle | null>(null);
  const [thread, setThread] = useState<Twiddle[]>([]);
  const [loading, setLoading] = useState(true);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replyParent, setReplyParent] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [selectedThinkers, setSelectedThinkers] = useState<string[]>([]);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [respondThinker, setRespondThinker] = useState('socrates');
  const [weaveMode, setWeaveMode] = useState(false);
  const [weaveSelected, setWeaveSelected] = useState<Set<string>>(new Set());
  const [weaving, setWeaving] = useState(false);

  useEffect(() => {
    import('@/lib/auth/getSession').then(({ getMemberSession }) => {
      getMemberSession().then(s => { if (s?.member) setMemberId(s.member.id); });
    });
    loadThread();
  }, [id]);

  async function loadThread() {
    setLoading(true);
    try {
      const res = await fetch(`/api/twiddle/${id}`);
      const data = await res.json();
      setRoot(data.twiddle);
      setThread(data.thread || []);
    } catch {}
    setLoading(false);
  }

  async function postReply() {
    if (!replyContent.trim() || !memberId || posting) return;
    setPosting(true);
    await fetch('/api/twiddle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: replyContent, twiddle_type: 'text', thread_type: root?.thread_type || 'open',
        thinker_tags: selectedThinkers, memberId,
        parent_id: replyParent || id, root_id: root?.root_id || id,
      }),
    });
    setReplyContent(''); setReplyParent(null); setSelectedThinkers([]); setPosting(false);
    loadThread();
  }

  async function toggleReaction(twiddleId: string, reactionType: string) {
    if (!memberId) return;
    await fetch(`/api/twiddle/${twiddleId}/react`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reaction_type: reactionType, memberId }),
    });
    loadThread();
  }

  async function askThinker(twiddleId: string) {
    if (!memberId) return;
    setRespondingTo(twiddleId);
    await fetch(`/api/twiddle/${twiddleId}/respond`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thinker_key: respondThinker, memberId }),
    });
    setRespondingTo(null);
    loadThread();
  }

  async function weaveSelected_() {
    if (weaveSelected.size < 2 || !memberId) return;
    setWeaving(true);
    const contents = thread.filter(t => weaveSelected.has(t.id)).map(t => t.content).join('\n\n---\n\n');
    await fetch('/api/twiddle', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: contents, twiddle_type: 'text', thread_type: 'solo',
        thinker_tags: root?.thinker_tags || [], memberId,
        parent_id: id, root_id: root?.root_id || id,
      }),
    });
    // Mark the new twiddle as woven (would need the id back, simplify for now)
    setWeaveMode(false); setWeaveSelected(new Set()); setWeaving(false);
    loadThread();
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

  // Build tree structure
  function buildTree(items: Twiddle[], parentId: string | null): Twiddle[] {
    return items.filter(t => t.parent_id === parentId || (!parentId && t.id === id));
  }

  function renderTwiddle(tw: Twiddle, depth: number) {
    const t = tw.is_thinker_response ? THINKERS.find(x => x.id === tw.thinker_key) : null;
    const children = thread.filter(c => c.parent_id === tw.id && c.id !== tw.id);
    const visualDepth = Math.min(depth, 3);

    return (
      <div key={tw.id} style={{ marginLeft: `${visualDepth * 20}px` }}>
        <div style={{
          background: tw.is_thinker_response ? `${(t?.color || gold)}08` : '#0d0d0d',
          border: tw.is_thinker_response ? `1px solid ${(t?.color || gold)}22` : `1px solid ${gold}08`,
          padding: '1.25rem', marginBottom: '2px',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: `${(t?.color || gold)}22`, border: `1px solid ${(t?.color || gold)}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '9px', color: t?.color || gold }}>
                {t ? t.symbol : '⬡'}
              </div>
              <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: t ? t.color : muted }}>
                {t ? t.name.toUpperCase() : 'EXPLORER'}
              </span>
              {depth > 3 && tw.parent_id && tw.parent_id !== id && (
                <span style={{ fontSize: '7px', color: muted, fontStyle: 'italic' }}>↳ reply</span>
              )}
            </div>
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', color: muted }}>{timeAgo(tw.created_at)}</span>
          </div>

          {/* Content */}
          <div style={{ fontSize: '15px', lineHeight: 1.8, color: tw.is_thinker_response ? `${parchment}cc` : parchment, fontStyle: tw.is_thinker_response ? 'italic' : 'normal', marginBottom: '0.5rem' }}>
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(tw.content || '') }} />
          </div>

          {/* Voice */}
          {tw.voice_url && (
            <div style={{ marginBottom: '0.5rem' }}>
              {tw.is_thinker_response ? (
                <button onClick={() => speakText(tw.content, tw.thinker_key || 'socrates').catch(() => {})} style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', color: t?.color || gold, background: 'none', border: `1px solid ${(t?.color || gold)}22`, padding: '3px 8px', cursor: 'pointer' }}>⬡ LISTEN</button>
              ) : (
                <audio controls src={tw.voice_url} style={{ width: '100%', height: '28px', filter: 'invert(0.8) sepia(0.5) hue-rotate(10deg)' }} />
              )}
            </div>
          )}

          {/* Artifact */}
          {tw.artifact_url && <img src={tw.artifact_url} alt="" style={{ width: '100%', maxHeight: '300px', objectFit: 'cover', marginBottom: '0.5rem', border: `1px solid ${gold}11` }} />}

          {/* Reactions */}
          <div style={{ display: 'flex', gap: '3px', alignItems: 'center', flexWrap: 'wrap' }}>
            {REACTIONS.map(r => {
              const count = tw.reaction_counts?.[r.type] || 0;
              return (
                <button key={r.type} onClick={() => toggleReaction(tw.id, r.type)} title={r.label} style={{
                  display: 'flex', alignItems: 'center', gap: '2px', padding: '2px 6px', cursor: 'pointer',
                  background: count > 0 ? `${gold}11` : 'none', border: `1px solid ${count > 0 ? `${gold}33` : `${gold}08`}`,
                  color: count > 0 ? gold : `${muted}88`, fontSize: '9px', transition: 'all 0.2s',
                }}>{r.icon}{count > 0 && <span style={{ fontSize: '7px' }}>{count}</span>}</button>
              );
            })}

            {!tw.is_thinker_response && memberId && (
              <>
                <button onClick={() => setReplyParent(tw.id)} style={{ marginLeft: 'auto', fontFamily: 'Cinzel, serif', fontSize: '7px', color: muted, background: 'none', border: `1px solid ${gold}11`, padding: '2px 8px', cursor: 'pointer' }}>REPLY</button>
                <button onClick={() => askThinker(tw.id)} disabled={respondingTo === tw.id} style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', color: gold, background: 'none', border: `1px solid ${gold}22`, padding: '2px 8px', cursor: 'pointer', opacity: respondingTo === tw.id ? 0.4 : 0.7 }}>
                  {respondingTo === tw.id ? '...' : '⬡ ASK'}
                </button>
              </>
            )}

            {weaveMode && (
              <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontFamily: 'Cinzel, serif', fontSize: '7px', color: gold }}>
                <input type="checkbox" checked={weaveSelected.has(tw.id)} onChange={() => setWeaveSelected(prev => { const n = new Set(prev); n.has(tw.id) ? n.delete(tw.id) : n.add(tw.id); return n; })} />
                WEAVE
              </label>
            )}
          </div>
        </div>

        {/* Children */}
        {children.map(child => renderTwiddle(child, depth + 1))}
      </div>
    );
  }

  if (loading) return <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: muted }}>Loading thread...</div>;
  if (!root) return <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: gold, fontFamily: 'Cinzel, serif' }}>Twiddle not found</div>;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to bottom, #000, transparent)' }}>
        <a href="/twiddle" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.7 }}>← FEED</a>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {root.thread_type === 'collaborative' && memberId && (
            <button onClick={() => setWeaveMode(v => !v)} style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: weaveMode ? '#000' : gold, background: weaveMode ? gold : 'none', border: `1px solid ${gold}44`, padding: '5px 12px', cursor: 'pointer' }}>
              {weaveMode ? 'EXIT WEAVE' : '⬡ WEAVE'}
            </button>
          )}
          {!root.minted && memberId && (
            <button style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: '#000', background: gold, border: 'none', padding: '5px 12px', cursor: 'pointer' }}>⬡ MINT</button>
          )}
        </div>
      </nav>

      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '70px 1rem 2rem' }}>
        {/* Thread type badge */}
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.2em', color: muted, marginBottom: '1rem' }}>
          {root.thread_type.toUpperCase()} THREAD · {thread.length} {thread.length === 1 ? 'POST' : 'POSTS'}
        </div>

        {/* Thread tree */}
        {renderTwiddle(root, 0)}
        {thread.filter(t => t.parent_id === id && t.id !== id).map(child => renderTwiddle(child, 1))}

        {/* Weave action bar */}
        {weaveMode && weaveSelected.size >= 2 && (
          <div style={{ position: 'sticky', bottom: '1rem', background: '#111', border: `1px solid ${gold}44`, padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', color: gold }}>{weaveSelected.size} branches selected</span>
            <button onClick={weaveSelected_} disabled={weaving} style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: '#000', background: gold, border: 'none', padding: '8px 20px', cursor: 'pointer', opacity: weaving ? 0.5 : 1 }}>
              {weaving ? 'WEAVING...' : '⬡ WEAVE INTO ARTIFACT'}
            </button>
          </div>
        )}

        {/* Reply composer */}
        {memberId && (
          <div style={{ border: `1px solid ${gold}22`, background: '#0d0d0d', padding: '1.25rem', marginTop: '1rem' }}>
            {replyParent && replyParent !== id && (
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', color: gold, opacity: 0.6, marginBottom: '0.5rem' }}>
                Replying to branch · <button onClick={() => setReplyParent(null)} style={{ color: muted, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>cancel</button>
              </div>
            )}
            <textarea
              value={replyContent} onChange={e => setReplyContent(e.target.value.slice(0, 500))}
              onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) postReply(); }}
              placeholder={root.thread_type === 'collaborative' ? 'Contribute a branch...' : 'Respond...'}
              rows={2}
              style={{ width: '100%', background: 'transparent', border: 'none', color: parchment, fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', lineHeight: 1.7, outline: 'none', resize: 'none', boxSizing: 'border-box' }}
            />
            {/* Thinker tags */}
            <div style={{ display: 'flex', gap: '6px', margin: '0.5rem 0' }}>
              {THINKERS.map(t => (
                <button key={t.id} onClick={() => setSelectedThinkers(prev => prev.includes(t.id) ? prev.filter(x => x !== t.id) : [...prev, t.id])} style={{
                  width: '24px', height: '24px', borderRadius: '50%', cursor: 'pointer', fontSize: '10px',
                  color: selectedThinkers.includes(t.id) ? t.color : `${muted}55`,
                  background: selectedThinkers.includes(t.id) ? `${t.color}22` : 'none',
                  border: `1px solid ${selectedThinkers.includes(t.id) ? t.color : `${gold}15`}`,
                  fontFamily: 'Cinzel, serif', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{t.symbol}</button>
              ))}
            </div>
            {/* Thinker to invoke */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', color: muted }}>ASK:</span>
              <select value={respondThinker} onChange={e => setRespondThinker(e.target.value)} style={{ background: '#111', border: `1px solid ${gold}22`, color: gold, padding: '3px 8px', fontFamily: 'Cinzel, serif', fontSize: '8px', outline: 'none' }}>
                {THINKERS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <button onClick={postReply} disabled={posting || !replyContent.trim()} style={{
              width: '100%', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em',
              color: '#000', background: gold, border: 'none', padding: '10px', cursor: 'pointer',
              opacity: posting || !replyContent.trim() ? 0.4 : 1,
            }}>
              {posting ? 'POSTING...' : root.thread_type === 'collaborative' ? 'BRANCH' : 'RESPOND'}
            </button>
          </div>
        )}
      </div>

      <footer style={{ padding: '3rem 2rem', borderTop: `1px solid ${gold}15`, textAlign: 'center' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, opacity: 0.3 }}>TWIDDLETWATTLE</div>
      </footer>
    </div>
  );
}
