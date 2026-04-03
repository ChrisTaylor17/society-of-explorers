'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { getBook } from '@/lib/books/catalog';
import { renderMarkdown } from '@/lib/renderMarkdown';

const gold = '#c9a84c';
const dim = '#d4c9a8';
const muted = '#9a8f7a';

const THINKERS = [
  { id: 'socrates', name: 'Socrates', symbol: 'Σ' },
  { id: 'plato', name: 'Plato', symbol: 'Π' },
  { id: 'nietzsche', name: 'Nietzsche', symbol: 'N' },
  { id: 'aurelius', name: 'Aurelius', symbol: 'M' },
  { id: 'einstein', name: 'Einstein', symbol: 'E' },
  { id: 'jobs', name: 'Jobs', symbol: 'J' },
];

export default function BookReader() {
  const { bookId } = useParams() as { bookId: string };
  const book = getBook(bookId);
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedText, setSelectedText] = useState('');
  const [annotation, setAnnotation] = useState('');
  const [annotating, setAnnotating] = useState(false);
  const [activeThinker, setActiveThinker] = useState(book?.thinkerAffinity || 'socrates');
  const [showThinkerPicker, setShowThinkerPicker] = useState(false);
  const [question, setQuestion] = useState('');
  const readerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bookId) return;
    fetch(`/api/great-books/text/${bookId}`)
      .then(r => r.json())
      .then(d => { setParagraphs(d.text || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [bookId]);

  function handleTextSelect() {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (text && text.length > 10) {
      setSelectedText(text);
      setAnnotation('');
    }
  }

  async function requestAnnotation() {
    if (!selectedText) return;
    setAnnotating(true);
    setAnnotation('');
    try {
      const res = await fetch('/api/great-books/annotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, passage: selectedText, thinkerId: activeThinker, question: question || undefined }),
      });
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';
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
            if (evt.delta) setAnnotation(prev => prev + evt.delta);
          } catch {}
        }
      }
    } catch (err) {
      setAnnotation('Annotation failed. Try again.');
    }
    setAnnotating(false);
    setQuestion('');
  }

  if (!book) return <div style={{ minHeight: '100vh', background: '#000', color: gold, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif' }}>Book not found</div>;

  const thinker = THINKERS.find(t => t.id === activeThinker) || THINKERS[0];

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: dim, fontFamily: 'Cormorant Garamond, serif' }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: '#0a0a0a', borderBottom: `1px solid ${gold}22`, padding: '12px 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <a href="/great-books" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: gold, textDecoration: 'none', opacity: 0.6 }}>← LIBRARY</a>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.1em', color: '#f5f0e8', marginTop: '2px' }}>{book.title}</div>
          <div style={{ fontSize: '11px', color: muted, fontStyle: 'italic' }}>{book.author}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', position: 'relative' }}>
          <button onClick={() => setShowThinkerPicker(v => !v)} style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: gold, background: 'rgba(201,168,76,0.08)', border: `1px solid ${gold}33`, padding: '6px 14px', cursor: 'pointer' }}>
            {thinker.symbol} {thinker.name.toUpperCase()}
          </button>
          {showThinkerPicker && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', background: '#111', border: `1px solid ${gold}33`, zIndex: 100 }}>
              {THINKERS.map(t => (
                <button key={t.id} onClick={() => { setActiveThinker(t.id); setShowThinkerPicker(false); }} style={{ display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.1em', color: activeThinker === t.id ? gold : dim, background: 'none', border: 'none', borderBottom: `1px solid ${gold}11`, cursor: 'pointer' }}>
                  {t.symbol} {t.name.toUpperCase()}
                </button>
              ))}
            </div>
          )}
          <a href={`/great-books/${bookId}/seminar`} style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted, border: `1px solid ${gold}22`, padding: '6px 12px', textDecoration: 'none' }}>SEMINAR</a>
        </div>
      </div>

      {/* Reader + Margin */}
      <div style={{ display: 'flex', maxWidth: '1200px', margin: '0 auto' }}>
        {/* Main text */}
        <div ref={readerRef} onMouseUp={handleTextSelect} style={{ flex: 1, padding: '3rem 2rem', maxWidth: '700px', margin: '0 auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '4rem', color: muted, fontStyle: 'italic' }}>Loading text...</div>
          ) : (
            paragraphs.map((p, i) => (
              <p key={i} style={{ fontSize: '17px', lineHeight: 2, color: dim, marginBottom: '1.5rem', textIndent: i > 0 ? '2rem' : 0 }}>
                {p}
              </p>
            ))
          )}
        </div>

        {/* Annotation margin */}
        <div style={{ width: '340px', borderLeft: `1px solid ${gold}11`, padding: '3rem 1.5rem', position: 'sticky', top: '60px', height: 'calc(100vh - 60px)', overflowY: 'auto', flexShrink: 0 }}>
          {selectedText ? (
            <div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, opacity: 0.6, marginBottom: '1rem' }}>
                {thinker.symbol} {thinker.name.toUpperCase()} READS
              </div>
              <div style={{ fontSize: '13px', color: muted, fontStyle: 'italic', lineHeight: 1.6, marginBottom: '1.5rem', borderLeft: `2px solid ${gold}33`, paddingLeft: '12px' }}>
                &ldquo;{selectedText.slice(0, 200)}{selectedText.length > 200 ? '...' : ''}&rdquo;
              </div>

              {!annotation && !annotating && (
                <div>
                  <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask a question about this passage..." style={{ width: '100%', background: '#111', border: `1px solid ${gold}22`, padding: '8px 10px', fontFamily: 'Cormorant Garamond, serif', fontSize: '14px', color: dim, outline: 'none', marginBottom: '8px', boxSizing: 'border-box' }} />
                  <button onClick={requestAnnotation} style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: '#000', background: gold, border: 'none', padding: '8px 16px', cursor: 'pointer', width: '100%' }}>
                    ASK {thinker.name.toUpperCase()}
                  </button>
                </div>
              )}

              {annotating && (
                <div style={{ fontSize: '13px', color: muted, fontStyle: 'italic' }}>
                  {thinker.name} is reading...
                </div>
              )}

              {annotation && (
                <div style={{ fontSize: '14px', color: dim, lineHeight: 1.8 }}>
                  <div dangerouslySetInnerHTML={{ __html: renderMarkdown(annotation) }} />
                </div>
              )}

              <button onClick={() => { setSelectedText(''); setAnnotation(''); }} style={{ marginTop: '1rem', fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: muted, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5 }}>
                ← CLEAR
              </button>
            </div>
          ) : (
            <div style={{ textAlign: 'center', paddingTop: '3rem' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1.5rem', color: gold, opacity: 0.15, marginBottom: '1rem' }}>{thinker.symbol}</div>
              <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '13px', color: muted, fontStyle: 'italic', lineHeight: 1.7 }}>
                Highlight any passage.<br />{thinker.name} will respond in the margin.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
