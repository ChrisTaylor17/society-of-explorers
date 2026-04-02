'use client';
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

const THINKER_NAMES: Record<string, string> = { socrates: 'SOCRATES', plato: 'PLATO', nietzsche: 'NIETZSCHE', aurelius: 'AURELIUS', einstein: 'EINSTEIN', jobs: 'JOBS' };
const THINKER_COLORS: Record<string, string> = { socrates: '#C9A84C', plato: '#7C9EBF', nietzsche: '#BF4040', aurelius: '#8B7355', einstein: '#6B9E6B', jobs: '#C0C0C0' };
const gold = '#c9a84c';

export default function HallOfCreations() {
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedArtifact, setSelectedArtifact] = useState<any>(null);

  useEffect(() => { loadArtifacts(); }, [filter]);

  async function loadArtifacts() {
    setLoading(true);
    let query = supabase.from('artifacts').select('*, members(display_name)').eq('is_public', true).order('created_at', { ascending: false }).limit(48);
    if (filter !== 'all') query = query.eq('thinker_id', filter);
    const { data } = await query;
    setArtifacts(data || []);
    setLoading(false);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#E8D5A3', fontFamily: 'Cormorant Garamond, serif' }}>
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to bottom, #000, transparent)' }}>
        <a href="/salon" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.7 }}>← RETURN TO THE SALON</a>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5 }}>SOCIETY OF EXPLORERS</div>
      </nav>

      <div style={{ textAlign: 'center', padding: '80px 20px 40px', borderBottom: '1px solid rgba(201,168,76,0.2)', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>⬡</div>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 400, letterSpacing: '8px', margin: '0 0 16px', color: gold }}>HALL OF CREATIONS</h1>
        <p style={{ fontSize: '18px', color: 'rgba(232,213,163,0.6)', fontStyle: 'italic', maxWidth: '600px', margin: '0 auto 40px' }}>Sacred co-creations between explorers and the ancient minds</p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {['all', 'socrates', 'plato', 'nietzsche', 'aurelius', 'einstein', 'jobs'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ padding: '8px 20px', background: filter === f ? 'rgba(201,168,76,0.2)' : 'transparent', border: `1px solid ${filter === f ? gold : 'rgba(201,168,76,0.3)'}`, color: filter === f ? gold : 'rgba(232,213,163,0.6)', fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '2px', cursor: 'pointer', textTransform: 'uppercase' as const }}>
              {f === 'all' ? 'ALL MINDS' : THINKER_NAMES[f]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '60px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
        {loading ? Array.from({ length: 12 }).map((_, i) => (
          <div key={i} style={{ aspectRatio: '1', background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.1)' }} />
        )) : artifacts.length === 0 ? (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '80px', fontStyle: 'italic', color: 'rgba(232,213,163,0.4)' }}>
            <div style={{ fontSize: '48px', marginBottom: '1rem' }}>⬡</div>
            The Hall awaits its first creations. Enter the Salon and ask a thinker to create an artifact.
          </div>
        ) : artifacts.map((a) => (
          <div key={a.id} onClick={() => setSelectedArtifact(a)} style={{ cursor: 'pointer', position: 'relative', aspectRatio: '1', overflow: 'hidden', border: '1px solid rgba(201,168,76,0.15)', transition: 'border-color 0.3s' }}>
            {a.image_url ? (
              <img src={a.image_url} alt={a.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', background: `radial-gradient(ellipse, ${THINKER_COLORS[a.thinker_id] || gold}22 0%, #0A0A0A 70%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '48px' }}>⬡</div>
            )}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgba(0,0,0,0.8) 0%, transparent 60%)' }}>
              <div style={{ position: 'absolute', top: '12px', right: '12px', padding: '4px 10px', background: 'rgba(0,0,0,0.8)', border: `1px solid ${THINKER_COLORS[a.thinker_id] || gold}`, color: THINKER_COLORS[a.thinker_id] || gold, fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '2px' }}>{a.thinker_id?.toUpperCase()}</div>
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '20px' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', fontWeight: 600, letterSpacing: '1px', color: '#E8D5A3', marginBottom: '4px' }}>{a.title}</div>
                <div style={{ fontSize: '12px', color: 'rgba(232,213,163,0.5)', fontStyle: 'italic' }}>{a.members?.display_name || 'Anonymous Explorer'}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedArtifact && (
        <div onClick={() => setSelectedArtifact(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', width: '100%', background: '#111', border: `1px solid ${THINKER_COLORS[selectedArtifact.thinker_id] || gold}40`, padding: '40px' }}>
            {selectedArtifact.image_url && <img src={selectedArtifact.image_url} alt={selectedArtifact.title} style={{ width: '100%', maxHeight: '400px', objectFit: 'cover', marginBottom: '24px' }} />}
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '3px', color: THINKER_COLORS[selectedArtifact.thinker_id] || gold, marginBottom: '8px' }}>{selectedArtifact.thinker_id?.toUpperCase()} × {selectedArtifact.members?.display_name}</div>
            <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: '22px', fontWeight: 400, color: '#E8D5A3', margin: '0 0 16px' }}>{selectedArtifact.title}</h2>
            <p style={{ fontSize: '15px', color: 'rgba(232,213,163,0.75)', lineHeight: 1.7, fontStyle: 'italic', marginBottom: '16px' }}>{selectedArtifact.description}</p>
            {selectedArtifact.philosophical_note && (
              <div style={{ padding: '16px', background: 'rgba(201,168,76,0.05)', border: `1px solid ${gold}30`, marginBottom: '16px' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '2px', color: gold, marginBottom: '8px' }}>PHILOSOPHICAL NOTE</div>
                <p style={{ fontSize: '14px', color: 'rgba(232,213,163,0.8)', fontStyle: 'italic', lineHeight: 1.6 }}>&ldquo;{selectedArtifact.philosophical_note}&rdquo;</p>
              </div>
            )}
            <button onClick={() => setSelectedArtifact(null)} style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, background: 'none', border: `1px solid ${gold}44`, padding: '10px 24px', cursor: 'pointer' }}>CLOSE</button>
          </div>
        </div>
      )}

      <footer style={{ padding: '3rem 2rem', borderTop: `1px solid ${gold}22`, textAlign: 'center' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, opacity: 0.4 }}>SOCIETY OF EXPLORERS · 92B SOUTH ST · SOCIETYOFEXPLORERS.COM</div>
      </footer>
    </div>
  );
}
