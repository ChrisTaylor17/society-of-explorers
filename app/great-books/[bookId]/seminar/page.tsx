'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { getBook } from '@/lib/books/catalog';
import { renderMarkdown } from '@/lib/renderMarkdown';

const gold = '#c9a84c';
const dim = '#d4c9a8';
const muted = '#9a8f7a';

const THINKERS = ['socrates', 'plato', 'nietzsche', 'aurelius', 'einstein', 'jobs'];
const THINKER_NAMES: Record<string, string> = { socrates: 'Socrates', plato: 'Plato', nietzsche: 'Nietzsche', aurelius: 'Aurelius', einstein: 'Einstein', jobs: 'Jobs' };

interface Message { id: string; speaker: string; content: string; type: 'member' | 'thinker' }

export default function SeminarPage() {
  const { bookId } = useParams() as { bookId: string };
  const book = getBook(bookId);
  const [passage, setPassage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function sendMessage() {
    if (!input.trim() || !passage.trim()) return;
    const text = input.trim();
    setInput('');
    setMessages(prev => [...prev, { id: `m-${Date.now()}`, speaker: 'You', content: text, type: 'member' }]);

    // Pick a random thinker to respond (or rotate)
    const thinkerId = THINKERS[messages.filter(m => m.type === 'thinker').length % THINKERS.length];
    setLoading(true);

    const discussion = messages.slice(-8).map(m => `${m.speaker}: ${m.content}`).join('\n') + `\nYou: ${text}`;

    try {
      const res = await fetch('/api/great-books/seminar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, passage, thinkerId, discussion }),
      });

      let response = '';
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';
      const streamId = `t-${Date.now()}`;
      setMessages(prev => [...prev, { id: streamId, speaker: THINKER_NAMES[thinkerId], content: '', type: 'thinker' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.delta) {
              response += evt.delta;
              setMessages(prev => prev.map(m => m.id === streamId ? { ...m, content: response } : m));
            }
          } catch {}
        }
      }
    } catch {}
    setLoading(false);
  }

  if (!book) return <div style={{ minHeight: '100vh', background: '#000', color: gold, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif' }}>Book not found</div>;

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: dim, fontFamily: 'Cormorant Garamond, serif', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '1rem 2rem', borderBottom: `1px solid ${gold}22`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <a href={`/great-books/${bookId}`} style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: gold, textDecoration: 'none', opacity: 0.6 }}>← BACK TO READER</a>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.1em', color: '#f5f0e8', marginTop: '2px' }}>SEMINAR: {book.title}</div>
        </div>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: muted }}>GROUP DISCUSSION</div>
      </div>

      {/* Passage input */}
      {!passage && (
        <div style={{ padding: '3rem 2rem', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1.5rem' }}>SET THE PASSAGE</div>
          <textarea placeholder="Paste the passage the group will discuss..." value={passage} onChange={e => setPassage(e.target.value)} rows={6}
            style={{ width: '100%', background: '#111', border: `1px solid ${gold}22`, padding: '1rem', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: dim, outline: 'none', resize: 'vertical', lineHeight: 1.8, boxSizing: 'border-box' }} />
          <button onClick={() => { if (passage.trim()) setPassage(passage.trim()); }} style={{ marginTop: '1rem', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: '#000', background: gold, border: 'none', padding: '10px 24px', cursor: 'pointer' }}>BEGIN SEMINAR</button>
        </div>
      )}

      {passage && (
        <>
          {/* Passage header */}
          <div style={{ padding: '1rem 2rem', borderBottom: `1px solid ${gold}11`, background: '#050505' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, opacity: 0.5, marginBottom: '0.5rem' }}>PASSAGE UNDER DISCUSSION</div>
            <p style={{ fontSize: '14px', color: muted, fontStyle: 'italic', lineHeight: 1.7, maxHeight: '80px', overflow: 'hidden' }}>&ldquo;{passage.slice(0, 300)}{passage.length > 300 ? '...' : ''}&rdquo;</p>
          </div>

          {/* Discussion */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '3rem', color: muted, fontStyle: 'italic' }}>Share your first thought on this passage to begin the seminar.</div>
            )}
            {messages.map(msg => (
              <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.type === 'member' ? 'flex-end' : 'flex-start' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: msg.type === 'thinker' ? gold : muted, marginBottom: '4px' }}>{msg.speaker.toUpperCase()}</div>
                <div style={{ background: msg.type === 'thinker' ? 'rgba(201,168,76,0.06)' : '#111', border: `1px solid ${msg.type === 'thinker' ? `${gold}22` : 'rgba(255,255,255,0.06)'}`, padding: '12px 16px', maxWidth: '80%', borderRadius: '4px' }}>
                  <div style={{ fontSize: '15px', lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div style={{ padding: '1rem 2rem', borderTop: `1px solid ${gold}22`, background: '#050505', display: 'flex', gap: '10px', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }} placeholder="Share your thought on this passage..."
              style={{ flex: 1, background: '#111', border: `1px solid ${gold}22`, padding: '10px 14px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: dim, outline: 'none' }} />
            <button onClick={sendMessage} disabled={loading} style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: '#000', background: gold, border: 'none', padding: '10px 20px', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>SPEAK</button>
          </div>
        </>
      )}
    </div>
  );
}
