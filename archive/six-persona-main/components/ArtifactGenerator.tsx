'use client';
import { useState } from 'react';

interface ArtifactGeneratorProps {
  thinkerId: string;
  memberName: string;
  memberId: string;
  memberProject?: string;
  recentMessages: Array<{ content: string; sender_type: string }>;
  onArtifactCreated?: (artifact: any) => void;
}

const gold = '#c9a84c';

export default function ArtifactGenerator({ thinkerId, memberName, memberId, memberProject, recentMessages, onArtifactCreated }: ArtifactGeneratorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [request, setRequest] = useState('');
  const [status, setStatus] = useState<'idle' | 'generating' | 'done' | 'error'>('idle');
  const [artifact, setArtifact] = useState<any>(null);
  const [error, setError] = useState('');

  const conversationContext = recentMessages.slice(-10).map(m => `${m.sender_type === 'member' ? 'Explorer' : 'Thinker'}: ${m.content}`).join('\n');

  async function generate() {
    if (!request.trim()) return;
    setStatus('generating'); setError('');
    try {
      const res = await fetch('/api/artifacts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thinkerId, conversationContext, memberName, memberProject, specificRequest: request, walletMemberId: memberId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Generation failed');
      setArtifact(data.artifact); setStatus('done');
      onArtifactCreated?.(data.artifact);
    } catch (err) { setStatus('error'); setError(String(err)); }
  }

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} style={{ padding: '10px 20px', background: 'rgba(201,168,76,0.08)', border: `1px solid ${gold}66`, color: gold, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '2px', cursor: 'pointer' }}>
        ⬡ CREATE ARTIFACT
      </button>
    );
  }

  return (
    <div style={{ padding: '24px', background: 'rgba(10,10,10,0.95)', border: `1px solid ${gold}44`, marginTop: '16px' }}>
      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '3px', color: gold, marginBottom: '16px' }}>⬡ CO-CREATE A SACRED ARTIFACT</div>

      {status === 'idle' || status === 'error' ? (
        <>
          <textarea value={request} onChange={e => setRequest(e.target.value)}
            placeholder="Describe what you want to capture... 'Visualize my project as a sacred force', 'Create an image of this breakthrough moment'..."
            style={{ width: '100%', minHeight: '80px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${gold}33`, color: '#E8D5A3', padding: '12px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
          />
          {error && <div style={{ color: '#BF4040', fontSize: '13px', margin: '8px 0' }}>{error}</div>}
          <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
            <button onClick={generate} style={{ padding: '12px 24px', background: `${gold}22`, border: `1px solid ${gold}`, color: gold, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '2px', cursor: 'pointer' }}>GENERATE</button>
            <button onClick={() => setIsOpen(false)} style={{ padding: '12px 24px', background: 'transparent', border: `1px solid ${gold}33`, color: 'rgba(232,213,163,0.5)', fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '2px', cursor: 'pointer' }}>CANCEL</button>
          </div>
        </>
      ) : status === 'generating' ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(232,213,163,0.6)' }}>
          <div style={{ fontSize: '32px', marginBottom: '16px' }}>⬡</div>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '2px' }}>THE THINKER IS DREAMING YOUR ARTIFACT...</div>
        </div>
      ) : (
        <div>
          {artifact?.image_url && <img src={artifact.image_url} alt={artifact.title} style={{ width: '100%', maxHeight: '400px', objectFit: 'cover', marginBottom: '16px' }} />}
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '16px', color: gold, marginBottom: '8px' }}>{artifact?.title}</div>
          <p style={{ fontSize: '14px', color: 'rgba(232,213,163,0.75)', fontStyle: 'italic', lineHeight: 1.6, marginBottom: '8px' }}>{artifact?.vision?.philosophicalNote || artifact?.philosophical_note}</p>
          <div style={{ display: 'flex', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
            <a href="/hall" style={{ padding: '10px 20px', background: `${gold}15`, border: `1px solid ${gold}`, color: gold, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '2px', textDecoration: 'none' }}>VIEW IN HALL</a>
            <button onClick={() => { setStatus('idle'); setArtifact(null); setRequest(''); }} style={{ padding: '10px 20px', background: 'transparent', border: `1px solid ${gold}44`, color: 'rgba(232,213,163,0.6)', fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '2px', cursor: 'pointer' }}>CREATE ANOTHER</button>
          </div>
        </div>
      )}
    </div>
  );
}
