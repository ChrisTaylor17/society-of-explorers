'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { getBook } from '@/lib/books/catalog';
import { renderMarkdown } from '@/lib/renderMarkdown';
import { speakText } from '@/lib/tts';

const gold = '#c9a84c';
const parchment = '#E8DCC8';
const muted = '#9a8f7a';
const bgDeep = '#0A0A0A';

const THINKERS = [
  { id: 'socrates', name: 'Socrates', symbol: 'Σ', color: '#C9A94E' },
  { id: 'plato', name: 'Plato', symbol: 'Π', color: '#7B68EE' },
  { id: 'nietzsche', name: 'Nietzsche', symbol: 'N', color: '#DC143C' },
  { id: 'aurelius', name: 'Aurelius', symbol: 'M', color: '#8B7355' },
  { id: 'einstein', name: 'Einstein', symbol: 'E', color: '#4169E1' },
  { id: 'jobs', name: 'Jobs', symbol: 'J', color: '#A0A0A0' },
];

interface MarginNote {
  id: string;
  passage: string;
  annotation: string;
  thinkerId: string;
  paragraphIndex: number;
}

export default function BookReader() {
  const { bookId } = useParams() as { bookId: string };
  const book = getBook(bookId);
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedText, setSelectedText] = useState('');
  const [selectedParagraph, setSelectedParagraph] = useState(-1);
  const [annotation, setAnnotation] = useState('');
  const [annotating, setAnnotating] = useState(false);
  const [activeThinker, setActiveThinker] = useState(book?.recommended_thinker || 'socrates');
  const [showThinkerPicker, setShowThinkerPicker] = useState(false);
  const [question, setQuestion] = useState('');
  const [marginNotes, setMarginNotes] = useState<MarginNote[]>([]);
  const [readProgress, setReadProgress] = useState(0);
  const readerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bookId) return;
    fetch(`/api/great-books/text/${bookId}`)
      .then(r => r.json())
      .then(d => { setParagraphs(d.text || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [bookId]);

  // Track scroll progress
  useEffect(() => {
    const el = readerRef.current;
    if (!el) return;
    const handler = () => {
      const pct = el.scrollTop / (el.scrollHeight - el.clientHeight);
      setReadProgress(Math.min(1, Math.max(0, pct)));
    };
    el.addEventListener('scroll', handler);
    return () => el.removeEventListener('scroll', handler);
  }, [paragraphs]);

  function handleTextSelect() {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (text && text.length > 10) {
      setSelectedText(text);
      setAnnotation('');
      // Find which paragraph the selection is in
      const anchorNode = sel?.anchorNode;
      if (anchorNode) {
        const pEl = anchorNode.parentElement?.closest('[data-pidx]');
        if (pEl) setSelectedParagraph(Number(pEl.getAttribute('data-pidx')));
      }
    }
  }

  async function requestAnnotation() {
    if (!selectedText) return;
    setAnnotating(true);
    setAnnotation('');
    let fullResponse = '';
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
            if (evt.delta) {
              fullResponse += evt.delta;
              setAnnotation(prev => prev + evt.delta);
            }
          } catch {}
        }
      }
    } catch {
      setAnnotation('Annotation failed. Try again.');
    }
    // Save as margin note
    if (fullResponse) {
      setMarginNotes(prev => [...prev, {
        id: `note-${Date.now()}`,
        passage: selectedText,
        annotation: fullResponse,
        thinkerId: activeThinker,
        paragraphIndex: selectedParagraph,
      }]);
    }
    setAnnotating(false);
    setQuestion('');
  }

  if (!book) return (
    <div style={{ minHeight: '100vh', background: bgDeep, color: gold, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', letterSpacing: '0.2em', fontSize: '14px' }}>
      Book not found
    </div>
  );

  const thinker = THINKERS.find(t => t.id === activeThinker) || THINKERS[0];

  // Progress dots (10 segments)
  const totalDots = 10;

  return (
    <div style={{ minHeight: '100vh', background: bgDeep, color: parchment, fontFamily: 'Cormorant Garamond, serif', position: 'relative' }}>
      {/* Subtle parchment texture overlay */}
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.02\'/%3E%3C/svg%3E")', pointerEvents: 'none', zIndex: 1 }} />

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: '#080808', borderBottom: `1px solid ${gold}15`, padding: '10px 2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1400px', margin: '0 auto' }}>
          <div>
            <a href="/great-books" style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.5 }}>← LIBRARY</a>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '13px', letterSpacing: '0.12em', color: parchment, marginTop: '2px' }}>{book.title}</div>
            <div style={{ fontSize: '11px', color: muted, fontStyle: 'italic' }}>{book.author} · {book.year}</div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', position: 'relative' }}>
            {/* Progress dots */}
            <div style={{ display: 'flex', gap: '4px', marginRight: '12px' }}>
              {Array.from({ length: totalDots }).map((_, i) => (
                <div key={i} style={{
                  width: '8px', height: '8px',
                  clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                  background: i / totalDots < readProgress ? gold : `${gold}20`,
                  transition: 'background 0.5s ease',
                }} />
              ))}
            </div>
            <button onClick={() => setShowThinkerPicker(v => !v)} style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: thinker.color, background: `${thinker.color}11`, border: `1px solid ${thinker.color}44`, padding: '6px 14px', cursor: 'pointer' }}>
              {thinker.symbol} {thinker.name.toUpperCase()}
            </button>
            {showThinkerPicker && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowThinkerPicker(false)} />
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', background: '#111', border: `1px solid ${gold}33`, zIndex: 100, minWidth: '180px' }}>
                  {THINKERS.map(t => (
                    <button key={t.id} onClick={() => { setActiveThinker(t.id); setShowThinkerPicker(false); }} style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 16px', textAlign: 'left', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.1em', color: activeThinker === t.id ? t.color : parchment, background: activeThinker === t.id ? `${t.color}11` : 'none', border: 'none', borderBottom: `1px solid ${gold}11`, cursor: 'pointer' }}>
                      <span style={{ color: t.color, fontSize: '14px' }}>{t.symbol}</span> {t.name.toUpperCase()}
                    </button>
                  ))}
                </div>
              </>
            )}
            <a href={`/great-books/${bookId}/seminar`} style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted, border: `1px solid ${gold}15`, padding: '6px 12px', textDecoration: 'none' }}>SEMINAR</a>
          </div>
        </div>
      </div>

      {/* Reader + Margin layout */}
      <div style={{ display: 'flex', maxWidth: '1400px', margin: '0 auto', position: 'relative', zIndex: 2 }}>

        {/* Left margin — saved notes */}
        <div style={{ width: '200px', flexShrink: 0, padding: '3rem 1rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {marginNotes.map(note => {
            const noteThinker = THINKERS.find(t => t.id === note.thinkerId) || THINKERS[0];
            return (
              <div key={note.id} style={{ opacity: 0.7, transition: 'opacity 0.3s', cursor: 'pointer' }}
                onClick={() => { setSelectedText(note.passage); setAnnotation(note.annotation); }}
              >
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: noteThinker.color, marginBottom: '4px' }}>{noteThinker.symbol}</div>
                <div style={{ fontSize: '11px', color: muted, fontStyle: 'italic', lineHeight: 1.5, borderLeft: `1px solid ${noteThinker.color}44`, paddingLeft: '8px' }}>
                  {note.annotation.slice(0, 80)}...
                </div>
              </div>
            );
          })}
        </div>

        {/* Main text column */}
        <div ref={readerRef} onMouseUp={handleTextSelect} style={{
          flex: 1, maxWidth: '680px', padding: '4rem 2.5rem', overflowY: 'auto',
          fontSize: '18px', lineHeight: 1.8, color: parchment,
          // Subtle gold selection highlight
        }}>
          <style>{`
            ::selection { background: ${gold}33; color: ${parchment}; }
            ::-moz-selection { background: ${gold}33; color: ${parchment}; }
          `}</style>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '4rem' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1.5rem', color: gold, opacity: 0.2, marginBottom: '1rem' }}>⬡</div>
              <div style={{ color: muted, fontStyle: 'italic' }}>Loading text from the archive...</div>
            </div>
          ) : (
            paragraphs.map((p, i) => {
              const hasNote = marginNotes.some(n => n.paragraphIndex === i);
              return (
                <p key={i} data-pidx={i} style={{
                  marginBottom: '1.5rem',
                  textIndent: i > 0 ? '2rem' : 0,
                  borderLeft: hasNote ? `2px solid ${gold}33` : '2px solid transparent',
                  paddingLeft: hasNote ? '12px' : '12px',
                  transition: 'border-color 0.5s ease',
                }}>
                  {p}
                </p>
              );
            })
          )}

          {!loading && paragraphs.length > 0 && (
            <div style={{ textAlign: 'center', padding: '4rem 0', borderTop: `1px solid ${gold}15`, marginTop: '2rem' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.3 }}>END OF TEXT</div>
              <a href="/great-books" style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: muted, textDecoration: 'none', display: 'inline-block', marginTop: '1rem' }}>← RETURN TO LIBRARY</a>
            </div>
          )}
        </div>

        {/* Right margin — active annotation panel */}
        <div style={{ width: '340px', flexShrink: 0, borderLeft: `1px solid ${gold}08`, padding: '4rem 1.5rem', position: 'sticky', top: '60px', height: 'calc(100vh - 60px)', overflowY: 'auto' }}>
          {selectedText ? (
            <div style={{ animation: 'fadeIn 0.4s ease' }}>
              {/* Thinker symbol */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.2rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '20px', color: thinker.color, opacity: 0.8 }}>{thinker.symbol}</div>
                <div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: thinker.color, opacity: 0.7 }}>{thinker.name.toUpperCase()} READS</div>
                </div>
              </div>

              {/* Highlighted passage */}
              <div style={{ fontSize: '13px', color: muted, fontStyle: 'italic', lineHeight: 1.7, marginBottom: '1.5rem', borderLeft: `2px solid ${gold}40`, paddingLeft: '12px', background: `${gold}05`, padding: '10px 12px' }}>
                &ldquo;{selectedText.slice(0, 250)}{selectedText.length > 250 ? '...' : ''}&rdquo;
              </div>

              {/* Ask or auto-annotate */}
              {!annotation && !annotating && (
                <div>
                  <input
                    value={question}
                    onChange={e => setQuestion(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') requestAnnotation(); }}
                    placeholder="Ask about this passage..."
                    style={{ width: '100%', background: '#0d0d0d', border: `1px solid ${gold}20`, padding: '10px 12px', fontFamily: 'Cormorant Garamond, serif', fontSize: '14px', color: parchment, outline: 'none', marginBottom: '10px', boxSizing: 'border-box' }}
                  />
                  <button onClick={requestAnnotation} style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: '#000', background: gold, border: 'none', padding: '10px 16px', cursor: 'pointer', width: '100%' }}>
                    ASK {thinker.name.toUpperCase()}
                  </button>
                </div>
              )}

              {/* Loading */}
              {annotating && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '1rem 0' }}>
                  <div style={{ fontSize: '14px', color: thinker.color, opacity: 0.6 }}>{thinker.symbol}</div>
                  <div style={{ fontSize: '13px', color: muted, fontStyle: 'italic' }}>{thinker.name} is reading the passage...</div>
                </div>
              )}

              {/* Annotation result */}
              {annotation && (
                <div>
                  <div style={{ fontSize: '15px', color: parchment, lineHeight: 1.9 }}>
                    <div dangerouslySetInnerHTML={{ __html: renderMarkdown(annotation) }} />
                  </div>

                  {/* Listen button */}
                  <button
                    onClick={() => speakText(annotation, activeThinker).catch(() => {})}
                    style={{ marginTop: '1rem', fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.2em', color: thinker.color, background: 'none', border: `1px solid ${thinker.color}33`, padding: '6px 14px', cursor: 'pointer', opacity: 0.7 }}
                  >
                    ⬡ LISTEN
                  </button>
                </div>
              )}

              {/* Clear */}
              <button onClick={() => { setSelectedText(''); setAnnotation(''); }} style={{ marginTop: '1.5rem', fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: muted, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.4 }}>
                CLEAR SELECTION
              </button>
            </div>
          ) : (
            <div style={{ textAlign: 'center', paddingTop: '4rem' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '2rem', color: thinker.color, opacity: 0.12, marginBottom: '1.5rem' }}>{thinker.symbol}</div>
              <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '14px', color: muted, fontStyle: 'italic', lineHeight: 1.8 }}>
                Highlight any passage.<br />
                <span style={{ color: thinker.color, opacity: 0.6 }}>{thinker.name}</span> will respond in the margin.
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
