'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { GREAT_BOOKS } from '@/lib/books/catalog';
import { renderMarkdown } from '@/lib/renderMarkdown';

const gold = '#C5A55A';
const parchment = '#E8DCC8';
const muted = '#9a8f7a';

export default function CohortDetail() {
  const { cohortId } = useParams() as { cohortId: string };
  const [cohort, setCohort] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [memberName, setMemberName] = useState('Explorer');
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    import('@/lib/auth/getSession').then(({ getMemberSession }) => {
      getMemberSession().then(s => {
        if (s?.member) { setMemberId(s.member.id); setMemberName(s.member.display_name || 'Explorer'); }
      });
    });
    loadCohort();
  }, [cohortId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function loadCohort() {
    setLoading(true);
    try {
      const res = await fetch(`/api/book-salons/${cohortId}`);
      const data = await res.json();
      setCohort(data.cohort);
      setMembers(data.members || []);
      setMessages(data.messages || []);
    } catch {}
    setLoading(false);
  }

  async function sendMessage() {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput(''); setSending(true);
    // Optimistic add
    setMessages(prev => [...prev, { id: `opt-${Date.now()}`, member_name: memberName, content: text, member_id: memberId, created_at: new Date().toISOString() }]);
    await fetch(`/api/book-salons/${cohortId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, content: text, memberName }),
    });
    setSending(false);
  }

  const book = cohort ? GREAT_BOOKS.find(b => b.id === cohort.book_id) : null;

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: muted, fontStyle: 'italic' }}>Loading salon...</div>
  );

  if (!cohort) return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: gold, fontFamily: 'Cinzel, serif' }}>Salon not found</div>
  );

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0A0A0A', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      {/* Header */}
      <div style={{ padding: '12px 2rem', borderBottom: `1px solid ${gold}22`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <a href="/book-salons" style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, textDecoration: 'none', opacity: 0.6 }}>← BOOK SALONS</a>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '13px', letterSpacing: '0.1em', color: parchment, marginTop: '2px' }}>{cohort.title}</div>
          <div style={{ fontSize: '11px', color: muted, fontStyle: 'italic' }}>
            {book?.author} · {members.length} members · {cohort.status}
          </div>
        </div>
        {book && (
          <a href={`/great-books/${book.id}`} style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, textDecoration: 'none', border: `1px solid ${gold}33`, padding: '6px 14px' }}>
            READ THE TEXT
          </a>
        )}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Messages */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '3rem', color: muted, fontStyle: 'italic' }}>
                No messages yet. Start the discussion.
              </div>
            )}
            {messages.map(msg => {
              const isMe = msg.member_id === memberId;
              return (
                <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: isMe ? gold : muted, marginBottom: '4px' }}>
                    {msg.member_name || 'Explorer'}
                  </div>
                  <div style={{
                    background: isMe ? `${gold}11` : '#0d0d0d',
                    border: `1px solid ${isMe ? `${gold}22` : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: '4px', padding: '10px 14px', maxWidth: '75%',
                  }}>
                    <div style={{ fontSize: '15px', lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                  </div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', color: muted, marginTop: '3px', opacity: 0.5 }}>
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '1rem 2rem', borderTop: `1px solid ${gold}22`, background: '#050505', display: 'flex', gap: '10px', flexShrink: 0 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
              placeholder="Share your thought on the reading..."
              style={{ flex: 1, background: '#111', border: `1px solid ${gold}22`, padding: '10px 14px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment, outline: 'none' }}
            />
            <button onClick={sendMessage} disabled={sending || !input.trim()} style={{
              fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: '#000',
              background: gold, border: 'none', padding: '10px 20px', cursor: 'pointer', opacity: sending ? 0.5 : 1,
            }}>SPEAK</button>
          </div>
        </div>

        {/* Sidebar — Members */}
        <div style={{ width: '220px', borderLeft: `1px solid ${gold}11`, background: '#050505', padding: '1.5rem', overflowY: 'auto', flexShrink: 0 }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>MEMBERS ({members.length})</div>
          {members.map((m, i) => (
            <div key={i} style={{ padding: '8px 0', borderBottom: `1px solid ${gold}08`, fontSize: '13px', color: parchment }}>
              {m.members?.display_name || 'Explorer'}
            </div>
          ))}
          {cohort.description && (
            <>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, opacity: 0.5, marginTop: '2rem', marginBottom: '0.5rem' }}>ABOUT</div>
              <p style={{ fontSize: '12px', color: muted, lineHeight: 1.6 }}>{cohort.description}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
