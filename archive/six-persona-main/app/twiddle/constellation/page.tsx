'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const gold = '#c9a84c';
const parchment = '#E8DCC8';
const muted = '#9a8f7a';

const TYPE_COLORS: Record<string, string> = {
  text: parchment, voice: gold, artifact: '#4a6fa5', question: muted, sketch: '#6a8a5a',
};

const THINKER_META: Record<string, { symbol: string; color: string }> = {
  socrates: { symbol: 'Σ', color: '#C9A94E' },
  plato: { symbol: 'Π', color: '#7B68EE' },
  nietzsche: { symbol: 'N', color: '#DC143C' },
  aurelius: { symbol: 'M', color: '#8B7355' },
  einstein: { symbol: 'E', color: '#4169E1' },
  jobs: { symbol: 'J', color: '#A0A0A0' },
};

type TimeFilter = 'all' | '30d' | '7d';

interface TwiddleNode {
  id: string; content: string; twiddle_type: string; thinker_tags: string[];
  created_at: string; reaction_counts: Record<string, number>;
  x: number; y: number; r: number;
}

export default function ConstellationPage() {
  const router = useRouter();
  const [memberId, setMemberId] = useState<string | null>(null);
  const [memberName, setMemberName] = useState('Explorer');
  const [twiddles, setTwiddles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [hovered, setHovered] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(window.innerWidth < 640);
    import('@/lib/auth/getSession').then(({ getMemberSession }) => {
      getMemberSession().then(s => {
        if (s?.member) {
          setMemberId(s.member.id);
          setMemberName(s.member.display_name && !s.member.display_name.startsWith('0x') ? s.member.display_name : 'Explorer');
        }
        setLoading(false);
      });
    });
  }, []);

  useEffect(() => {
    if (!memberId) return;
    setLoading(true);
    fetch(`/api/twiddle?filter=my&memberId=${memberId}&limit=50`)
      .then(r => r.json())
      .then(d => { setTwiddles(d.twiddles || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [memberId]);

  // Filter by time
  const now = Date.now();
  const filtered = twiddles.filter(tw => {
    if (timeFilter === '7d') return now - new Date(tw.created_at).getTime() < 7 * 86400000;
    if (timeFilter === '30d') return now - new Date(tw.created_at).getTime() < 30 * 86400000;
    return true;
  });

  // Layout nodes radially
  const CX = 300, CY = 300, ORBIT = 200;
  const nodes: TwiddleNode[] = filtered.map((tw, i) => {
    const angle = (2 * Math.PI * i) / Math.max(filtered.length, 1) - Math.PI / 2;
    const jitter = 0.85 + Math.random() * 0.3;
    const rc = tw.reaction_counts || {};
    const reactionTotal = Object.keys(rc).reduce((sum, k) => sum + (Number(rc[k]) || 0), 0);
    const r = Math.min(24, Math.max(8, 8 + reactionTotal * 3));
    return {
      ...tw,
      x: CX + ORBIT * jitter * Math.cos(angle),
      y: CY + ORBIT * jitter * Math.sin(angle),
      r,
    };
  });

  // Edges: connect nodes sharing a thinker_tag
  const edges: { from: TwiddleNode; to: TwiddleNode }[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const shared = (nodes[i].thinker_tags || []).some((t: string) => (nodes[j].thinker_tags || []).includes(t));
      if (shared) edges.push({ from: nodes[i], to: nodes[j] });
    }
  }

  const hoveredNode = nodes.find(n => n.id === hovered);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif', position: 'relative', overflow: 'hidden' }}>
      {/* Starfield */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', background: 'radial-gradient(1px 1px at 10% 20%, rgba(201,168,76,0.15) 0%, transparent 100%), radial-gradient(1px 1px at 30% 60%, rgba(201,168,76,0.1) 0%, transparent 100%), radial-gradient(1px 1px at 50% 10%, rgba(201,168,76,0.12) 0%, transparent 100%), radial-gradient(1px 1px at 70% 80%, rgba(201,168,76,0.08) 0%, transparent 100%), radial-gradient(1px 1px at 90% 40%, rgba(201,168,76,0.1) 0%, transparent 100%), radial-gradient(1px 1px at 15% 85%, rgba(201,168,76,0.12) 0%, transparent 100%), radial-gradient(1px 1px at 60% 35%, rgba(201,168,76,0.1) 0%, transparent 100%), radial-gradient(1px 1px at 80% 15%, rgba(201,168,76,0.08) 0%, transparent 100%), radial-gradient(1px 1px at 40% 95%, rgba(201,168,76,0.12) 0%, transparent 100%), radial-gradient(1px 1px at 25% 45%, rgba(201,168,76,0.1) 0%, transparent 100%)' }} />

      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to bottom, #0a0a0a, transparent)' }}>
        <a href="/twiddle" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.7 }}>← FEED</a>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.4 }}>MY CONSTELLATION</div>
      </nav>

      <div style={{ textAlign: 'center', padding: '80px 2rem 20px', position: 'relative', zIndex: 1 }}>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 300, letterSpacing: '0.12em', marginBottom: '0.5rem' }}>Your Constellation</h1>
        <p style={{ fontSize: '1rem', color: muted, fontStyle: 'italic' }}>The map of your intellectual journey</p>

        {/* Time filter */}
        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', marginTop: '1.5rem' }}>
          {([['all', 'All Time'], ['30d', 'Last 30 Days'], ['7d', 'Last 7 Days']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTimeFilter(key)} style={{
              fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', padding: '5px 14px', cursor: 'pointer',
              color: timeFilter === key ? gold : muted,
              background: timeFilter === key ? `${gold}15` : 'none',
              border: `1px solid ${timeFilter === key ? `${gold}44` : 'transparent'}`,
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '0 1rem 4rem', position: 'relative', zIndex: 1 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: muted, fontStyle: 'italic' }}>Mapping your constellation...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '2rem', color: gold, opacity: 0.15, marginBottom: '1rem' }}>⬡</div>
            <p style={{ fontSize: '15px', color: muted, fontStyle: 'italic', marginBottom: '1.5rem' }}>Your constellation is empty. Drop your first twiddle to begin.</p>
            <a href="/twiddle" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: '#000', background: gold, padding: '10px 24px', textDecoration: 'none' }}>DROP A TWIDDLE</a>
          </div>
        ) : isMobile ? (
          /* Mobile: vertical list */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', position: 'relative' }}>
            <div style={{ position: 'absolute', left: '14px', top: 0, bottom: 0, width: '1px', background: `${gold}22` }} />
            {nodes.map(n => {
              const color = TYPE_COLORS[n.twiddle_type] || parchment;
              return (
                <div key={n.id} onClick={() => router.push(`/twiddle/${n.id}`)} style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', padding: '12px 12px 12px 32px', background: '#0d0d0d', cursor: 'pointer', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '10px', top: '18px', width: '10px', height: '10px', borderRadius: '50%', background: color, border: `1px solid ${gold}33`, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', lineHeight: 1.6, color: parchment, marginBottom: '4px' }}>{(n.content || '').slice(0, 100)}{(n.content || '').length > 100 ? '...' : ''}</div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', color: muted }}>{new Date(n.created_at).toLocaleDateString()}</span>
                      {(n.thinker_tags || []).map((tag: string) => {
                        const tm = THINKER_META[tag];
                        return tm ? <span key={tag} style={{ fontSize: '10px', color: tm.color }}>{tm.symbol}</span> : null;
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Desktop: SVG constellation */
          <div style={{ position: 'relative' }}>
            <svg viewBox="0 0 600 600" style={{ width: '100%', maxHeight: '600px' }}>
              {/* Edges */}
              {edges.map((e, i) => {
                const mx = (e.from.x + e.to.x) / 2 + (Math.random() - 0.5) * 40;
                const my = (e.from.y + e.to.y) / 2 + (Math.random() - 0.5) * 40;
                return <path key={i} d={`M${e.from.x},${e.from.y} Q${mx},${my} ${e.to.x},${e.to.y}`} fill="none" stroke={gold} strokeWidth="0.5" opacity="0.1" />;
              })}

              {/* Center node */}
              <circle cx={CX} cy={CY} r="20" fill={`${gold}15`} stroke={gold} strokeWidth="0.5" opacity="0.6" />
              <text x={CX} y={CY + 1} textAnchor="middle" dominantBaseline="middle" fill={gold} fontSize="7" fontFamily="Cinzel, serif" letterSpacing="1" opacity="0.6">
                {memberName.slice(0, 8).toUpperCase()}
              </text>

              {/* Orbital rings */}
              <circle cx={CX} cy={CY} r={ORBIT * 0.6} fill="none" stroke={gold} strokeWidth="0.3" opacity="0.05" />
              <circle cx={CX} cy={CY} r={ORBIT} fill="none" stroke={gold} strokeWidth="0.3" opacity="0.04" />

              {/* Connector lines from center */}
              {nodes.map(n => (
                <line key={`c-${n.id}`} x1={CX} y1={CY} x2={n.x} y2={n.y} stroke={gold} strokeWidth="0.3" opacity="0.08" />
              ))}

              {/* Nodes */}
              {nodes.map(n => {
                const color = TYPE_COLORS[n.twiddle_type] || parchment;
                const isHovered = hovered === n.id;
                return (
                  <g key={n.id}
                    onMouseEnter={() => setHovered(n.id)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => router.push(`/twiddle/${n.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <circle cx={n.x} cy={n.y} r={isHovered ? n.r + 3 : n.r} fill={`${color}${isHovered ? '44' : '22'}`} stroke={color} strokeWidth={isHovered ? 1.5 : 0.5} style={{ transition: 'all 0.3s' }} />
                    {/* Thinker symbols */}
                    {(n.thinker_tags || []).slice(0, 2).map((tag: string, ti: number) => {
                      const tm = THINKER_META[tag];
                      if (!tm) return null;
                      const ox = n.r + 6 + ti * 10;
                      return <text key={tag} x={n.x + ox} y={n.y + 3} fill={tm.color} fontSize="8" fontFamily="Cinzel, serif" opacity="0.7">{tm.symbol}</text>;
                    })}
                  </g>
                );
              })}
            </svg>

            {/* Tooltip */}
            {hoveredNode && (
              <div style={{
                position: 'absolute', left: '50%', bottom: '0', transform: 'translateX(-50%)',
                background: '#111', border: `1px solid ${gold}33`, padding: '12px 16px', maxWidth: '320px',
                pointerEvents: 'none', zIndex: 10,
              }}>
                <div style={{ fontSize: '13px', lineHeight: 1.6, color: parchment, marginBottom: '6px' }}>
                  {(hoveredNode.content || '').slice(0, 80)}{(hoveredNode.content || '').length > 80 ? '...' : ''}
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', color: muted }}>{new Date(hoveredNode.created_at).toLocaleDateString()}</span>
                  {(hoveredNode.thinker_tags || []).map((tag: string) => {
                    const tm = THINKER_META[tag];
                    return tm ? <span key={tag} style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', color: tm.color }}>{tm.symbol} {tag.toUpperCase()}</span> : null;
                  })}
                  {Object.keys(hoveredNode.reaction_counts || {}).length > 0 && (
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', color: gold }}>
                      {Object.values(hoveredNode.reaction_counts).reduce((a, b) => a + b, 0)} reactions
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Legend */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '1rem', flexWrap: 'wrap' }}>
              {Object.entries(TYPE_COLORS).map(([type, color]) => (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: color }} />
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted }}>{type.toUpperCase()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        {filtered.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginTop: '2rem' }}>
            {[
              { label: 'TWIDDLES', value: filtered.length },
              { label: 'THINKERS TAGGED', value: [...new Set(filtered.flatMap((t: any) => t.thinker_tags || []))].length },
              { label: 'CONNECTIONS', value: edges.length },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1.5rem', color: gold }}>{s.value}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: muted }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <footer style={{ padding: '3rem 2rem', borderTop: `1px solid ${gold}15`, textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, opacity: 0.3 }}>TWIDDLETWATTLE · YOUR CONSTELLATION</div>
      </footer>
    </div>
  );
}
