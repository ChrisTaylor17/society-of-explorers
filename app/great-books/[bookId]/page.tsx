'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getBook, GREAT_BOOKS } from '@/lib/books/catalog';
import { renderMarkdown } from '@/lib/renderMarkdown';
import { speakText, stopSpeaking } from '@/lib/tts';

const gold = '#C5A55A';
const parchment = '#E8DCC8';
const muted = '#9a8f7a';

const THINKERS = [
  { id: 'socrates', name: 'Socrates', symbol: 'Σ', color: '#C9A94E' },
  { id: 'plato', name: 'Plato', symbol: 'Π', color: '#7B68EE' },
  { id: 'nietzsche', name: 'Nietzsche', symbol: 'N', color: '#DC143C' },
  { id: 'aurelius', name: 'Aurelius', symbol: 'M', color: '#8B7355' },
  { id: 'einstein', name: 'Einstein', symbol: 'E', color: '#4169E1' },
  { id: 'jobs', name: 'Jobs', symbol: 'J', color: '#A0A0A0' },
];

interface MarginNote { id: string; passage: string; annotation: string; thinkerId: string }

export default function BookReader() {
  const { bookId } = useParams() as { bookId: string };
  const book = getBook(bookId);
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalSections, setTotalSections] = useState(0);
  const [currentSection, setCurrentSection] = useState(1);
  const [activeThinker, setActiveThinker] = useState(book?.recommended_thinker || 'socrates');

  // Read aloud
  const [isReading, setIsReading] = useState(false);
  const [readFromIdx, setReadFromIdx] = useState(0);
  const [readingParagraphIdx, setReadingParagraphIdx] = useState<number | null>(null);
  const readVoice = book?.authorThinkerId || 'socrates';
  const readingLockRef = useRef(0);

  // Selection popup
  const [popup, setPopup] = useState<{ x: number; y: number; text: string } | null>(null);
  const [annotation, setAnnotation] = useState('');
  const [annotating, setAnnotating] = useState(false);
  const [activeNote, setActiveNote] = useState<{ passage: string; text: string } | null>(null);
  const [marginNotes, setMarginNotes] = useState<MarginNote[]>([]);

  // Member ID for progress saving
  const [memberId, setMemberId] = useState<string | null>(null);

  const readerRef = useRef<HTMLDivElement>(null);
  const paragraphRefs = useRef<(HTMLParagraphElement | null)[]>([]);

  const loadSection = useCallback(async (section: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/great-books/text/${bookId}${totalSections > 0 ? `?section=${section}` : ''}`);
      const data = await res.json();
      if (data.text) {
        setParagraphs(Array.isArray(data.text) ? data.text : [data.text]);
      } else if (data.content) {
        setParagraphs(data.content.split('\n\n').filter((p: string) => p.trim()));
      }
      if (data.totalSections) setTotalSections(data.totalSections);
      if (data.totalParagraphs && !totalSections) {
        setTotalSections(Math.ceil(data.totalParagraphs / 50));
      }
    } catch {}
    setLoading(false);
    readerRef.current?.scrollTo(0, 0);
  }, [bookId, totalSections]);

  useEffect(() => { loadSection(currentSection); }, [currentSection, loadSection]);

  // Resolve member + load progress
  useEffect(() => {
    import('@/lib/auth/getSession').then(({ getMemberSession }) => {
      getMemberSession().then(session => {
        if (session?.member?.id) {
          setMemberId(session.member.id);
          // Load saved progress
          fetch(`/api/great-books/progress?memberId=${session.member.id}&bookId=${bookId}`)
            .then(r => r.json())
            .then(d => {
              const p = d.progress?.[0];
              if (p?.section_id) setCurrentSection(Number(p.section_id) || 1);
            })
            .catch(() => {});
        }
      });
    });
  }, [bookId]);

  // Save progress when section changes
  useEffect(() => {
    if (!memberId || !bookId) return;
    fetch('/api/great-books/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, bookId, sectionId: String(currentSection), paragraphIndex: 0 }),
    }).catch(() => {});
  }, [currentSection, memberId, bookId]);

  // Scroll to highlighted paragraph
  useEffect(() => {
    if (readingParagraphIdx !== null && paragraphRefs.current[readingParagraphIdx]) {
      paragraphRefs.current[readingParagraphIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [readingParagraphIdx]);

  // Handle text selection — show gold popup
  function handleMouseUp(e: React.MouseEvent) {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (text && text.length > 15) {
      const range = sel!.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const containerRect = readerRef.current?.getBoundingClientRect();
      if (containerRect) {
        setPopup({
          x: rect.left - containerRect.left + rect.width / 2,
          y: rect.top - containerRect.top - 10,
          text,
        });
      }
    } else {
      setPopup(null);
    }
  }

  // Request annotation from thinker
  async function annotateSelection() {
    if (!popup) return;
    const passage = popup.text;
    setPopup(null);
    setAnnotating(true);
    setAnnotation('');
    setActiveNote({ passage, text: '' });

    let fullResponse = '';
    try {
      const res = await fetch('/api/great-books/annotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, passage, thinkerId: activeThinker }),
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
    } catch { setAnnotation('Failed. Try again.'); }

    if (fullResponse) {
      setMarginNotes(prev => [...prev, {
        id: `n-${Date.now()}`, passage, annotation: fullResponse, thinkerId: activeThinker,
      }]);
    }
    setAnnotating(false);
  }

  async function readAloud(startIdx: number) {
    const thisRead = ++readingLockRef.current;
    stopSpeaking();
    await new Promise(r => setTimeout(r, 150));
    if (readingLockRef.current !== thisRead) return;
    setIsReading(true);
    const BATCH = 3;
    const end = Math.min(startIdx + BATCH, paragraphs.length);
    for (let i = startIdx; i < end; i++) {
      if (readingLockRef.current !== thisRead) break;
      setReadingParagraphIdx(i);
      try {
        await speakText(paragraphs[i], readVoice);
      } catch { break; }
    }
    setReadingParagraphIdx(null);
    setReadFromIdx(end);
    setIsReading(false);
  }

  async function readFromParagraph(idx: number) {
    const thisRead = ++readingLockRef.current;
    stopSpeaking();
    await new Promise(r => setTimeout(r, 150));
    if (readingLockRef.current !== thisRead) return;
    setIsReading(true);
    setReadingParagraphIdx(idx);
    const text = paragraphs.slice(idx, idx + 3).join(' ');
    try {
      await speakText(text, readVoice);
    } catch {}
    setReadingParagraphIdx(null);
    setReadFromIdx(idx + 3);
    setIsReading(false);
  }

  function stopReading() {
    readingLockRef.current++;
    stopSpeaking();
    setIsReading(false);
    setReadingParagraphIdx(null);
  }

  if (!book) return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', color: gold, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', letterSpacing: '0.2em' }}>
      Book not found
    </div>
  );

  const thinker = THINKERS.find(t => t.id === activeThinker) || THINKERS[0];
  const sectionDots = Math.max(totalSections, 1);

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', color: parchment, fontFamily: 'Cormorant Garamond, serif', position: 'relative' }}>
      {/* Parchment texture */}
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.8\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.02\'/%3E%3C/svg%3E")', pointerEvents: 'none', zIndex: 1 }} />

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: '#080808', borderBottom: `1px solid ${gold}15`, padding: '10px 2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1400px', margin: '0 auto' }}>
          <div>
            <a href="/great-books" style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.5 }}>← LIBRARY</a>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '13px', letterSpacing: '0.12em', color: parchment, marginTop: '2px' }}>{book.title}</div>
            <div style={{ fontSize: '11px', color: muted, fontStyle: 'italic' }}>{book.author} · {book.year}</div>
          </div>

          {/* Section hex dots */}
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {Array.from({ length: Math.min(sectionDots, 20) }).map((_, i) => (
              <button key={i} onClick={() => setCurrentSection(i + 1)} style={{
                width: '10px', height: '10px', border: 'none', cursor: 'pointer', padding: 0,
                clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                background: i + 1 === currentSection ? gold : i + 1 < currentSection ? `${gold}60` : `${gold}18`,
                transition: 'background 0.3s',
              }} title={`Section ${i + 1}`} />
            ))}
          </div>

          {/* Read aloud */}
          {isReading ? (
            <button onClick={stopReading} style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: '#c05050', background: 'rgba(192,80,80,0.1)', border: '1px solid rgba(192,80,80,0.4)', padding: '6px 12px', cursor: 'pointer' }}>
              ⬡ STOP
            </button>
          ) : (
            <button onClick={() => readAloud(readFromIdx)} disabled={loading || paragraphs.length === 0} style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: gold, background: `${gold}11`, border: `1px solid ${gold}33`, padding: '6px 12px', cursor: 'pointer', opacity: loading ? 0.3 : 1 }}>
              ⬡ READ
            </button>
          )}
          {!isReading && readFromIdx > 0 && readFromIdx < paragraphs.length && (
            <button onClick={() => readAloud(readFromIdx)} style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: gold, background: 'none', border: `1px solid ${gold}22`, padding: '5px 10px', cursor: 'pointer', opacity: 0.7 }}>
              CONTINUE ⬡
            </button>
          )}

          {/* Thinker selector */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {THINKERS.map(t => (
              <button key={t.id} onClick={() => setActiveThinker(t.id)} style={{
                fontFamily: 'Cinzel, serif', fontSize: '13px', color: activeThinker === t.id ? t.color : `${parchment}30`,
                background: activeThinker === t.id ? `${t.color}15` : 'none',
                border: activeThinker === t.id ? `1px solid ${t.color}44` : '1px solid transparent',
                width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.3s',
              }} title={t.name}>
                {t.symbol}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Reader + Margin */}
      <div style={{ display: 'flex', maxWidth: '1400px', margin: '0 auto', position: 'relative', zIndex: 2 }}>

        {/* Reading pane (70%) */}
        <div ref={readerRef} onMouseUp={handleMouseUp} style={{
          flex: 7, padding: '4rem 3rem', position: 'relative', minHeight: 'calc(100vh - 60px)',
          fontSize: '18px', lineHeight: 1.8, color: parchment,
        }}>
          <style>{`::selection { background: ${gold}33; color: ${parchment}; } ::-moz-selection { background: ${gold}33; }`}</style>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '6rem' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1.5rem', color: gold, opacity: 0.15 }}>⬡</div>
              <div style={{ color: muted, fontStyle: 'italic', marginTop: '1rem' }}>Loading from the archive...</div>
            </div>
          ) : (
            paragraphs.map((p, i) => (
              <p key={i}
                ref={el => { paragraphRefs.current[i] = el; }}
                onClick={() => readFromParagraph(i)}
                style={{
                  marginBottom: '1.5rem', textIndent: i > 0 && readingParagraphIdx !== i ? '2rem' : 0,
                  cursor: 'pointer', paddingLeft: '12px',
                  background: readingParagraphIdx === i ? 'rgba(197,165,90,0.06)' : 'transparent',
                  borderLeft: readingParagraphIdx === i ? `2px solid ${gold}` : '2px solid transparent',
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={e => { if (readingParagraphIdx !== i) (e.target as HTMLElement).style.borderLeftColor = `${gold}40`; }}
                onMouseLeave={e => { if (readingParagraphIdx !== i) (e.target as HTMLElement).style.borderLeftColor = 'transparent'; }}
              >{p}</p>
            ))
          )}

          {/* Section nav at bottom */}
          {!loading && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3rem 0', borderTop: `1px solid ${gold}15`, marginTop: '2rem' }}>
              <button onClick={() => currentSection > 1 && setCurrentSection(currentSection - 1)} disabled={currentSection <= 1}
                style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: currentSection > 1 ? gold : `${gold}30`, background: 'none', border: 'none', cursor: currentSection > 1 ? 'pointer' : 'default' }}>
                ← PREVIOUS SECTION
              </button>
              <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted }}>
                SECTION {currentSection}{totalSections > 1 ? ` OF ${totalSections}` : ''}
              </span>
              <button onClick={() => currentSection < totalSections && setCurrentSection(currentSection + 1)} disabled={currentSection >= totalSections}
                style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: currentSection < totalSections ? gold : `${gold}30`, background: 'none', border: 'none', cursor: currentSection < totalSections ? 'pointer' : 'default' }}>
                NEXT SECTION →
              </button>
            </div>
          )}

          {/* Selection popup */}
          {popup && (
            <button onClick={annotateSelection} style={{
              position: 'absolute',
              left: `${popup.x}px`, top: `${popup.y}px`,
              transform: 'translate(-50%, -100%)',
              fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em',
              color: '#000', background: gold, border: 'none',
              padding: '6px 14px', cursor: 'pointer',
              boxShadow: `0 4px 20px ${gold}44`,
              zIndex: 60,
              whiteSpace: 'nowrap',
            }}>
              {thinker.symbol} ASK {thinker.name.toUpperCase()}
            </button>
          )}
        </div>

        {/* Margin panel (30%) */}
        <div style={{
          flex: 3, borderLeft: `1px solid ${gold}08`, padding: '4rem 1.5rem',
          position: 'sticky', top: '60px', height: 'calc(100vh - 60px)', overflowY: 'auto', flexShrink: 0,
        }}>
          {/* Active annotation (streaming) */}
          {(annotating || activeNote) && (
            <div style={{ marginBottom: '2rem', animation: 'fadeIn 0.4s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '18px', color: thinker.color, opacity: 0.8 }}>{thinker.symbol}</span>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: thinker.color, opacity: 0.7 }}>{thinker.name.toUpperCase()}</span>
              </div>
              <div style={{ fontSize: '14px', color: muted, fontStyle: 'italic', borderLeft: `2px solid ${gold}30`, paddingLeft: '10px', marginBottom: '1rem', lineHeight: 1.7 }}>
                &ldquo;{activeNote?.passage.slice(0, 120)}...&rdquo;
              </div>
              {annotating && !annotation && (
                <div style={{ fontSize: '14px', color: muted, fontStyle: 'italic' }}>{thinker.name} is reading...</div>
              )}
              {annotation && (
                <div>
                  <div style={{ fontSize: '16px', color: parchment, lineHeight: 1.9 }}>
                    <div dangerouslySetInnerHTML={{ __html: renderMarkdown(annotation) }} />
                  </div>
                  <button onClick={() => speakText(annotation, activeThinker).catch(() => {})} style={{
                    marginTop: '0.75rem', fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.2em',
                    color: thinker.color, background: 'none', border: `1px solid ${thinker.color}33`, padding: '5px 12px', cursor: 'pointer',
                  }}>⬡ LISTEN</button>
                </div>
              )}
            </div>
          )}

          {/* Saved margin notes */}
          {marginNotes.map(note => {
            const nt = THINKERS.find(t => t.id === note.thinkerId) || THINKERS[0];
            return (
              <div key={note.id} style={{ marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: `1px solid ${gold}08` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.5rem' }}>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: nt.color, opacity: 0.6 }}>{nt.symbol}</span>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: nt.color, opacity: 0.5 }}>{nt.name.toUpperCase()}</span>
                </div>
                <div style={{ fontSize: '13px', color: muted, fontStyle: 'italic', marginBottom: '0.5rem', lineHeight: 1.6 }}>
                  &ldquo;{note.passage.slice(0, 80)}...&rdquo;
                </div>
                <div style={{ fontSize: '15px', color: `${parchment}cc`, lineHeight: 1.8 }}>
                  <div dangerouslySetInnerHTML={{ __html: renderMarkdown(note.annotation) }} />
                </div>
                <button onClick={() => speakText(note.annotation, note.thinkerId).catch(() => {})} style={{
                  marginTop: '0.5rem', fontFamily: 'Cinzel, serif', fontSize: '6px', letterSpacing: '0.15em',
                  color: nt.color, background: 'none', border: `1px solid ${nt.color}22`, padding: '3px 8px', cursor: 'pointer', opacity: 0.6,
                }}>⬡ LISTEN</button>
              </div>
            );
          })}

          {/* Empty state */}
          {!annotating && !activeNote && marginNotes.length === 0 && (
            <div style={{ textAlign: 'center', paddingTop: '4rem' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '2rem', color: thinker.color, opacity: 0.1, marginBottom: '1.5rem' }}>{thinker.symbol}</div>
              <div style={{ fontSize: '13px', color: muted, fontStyle: 'italic', lineHeight: 1.8 }}>
                Select any passage.<br /><span style={{ color: thinker.color, opacity: 0.6 }}>{thinker.name}</span> will speak in the margin.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '3px', background: `${gold}10`, zIndex: 50 }}>
        <div style={{ height: '100%', background: gold, width: `${(currentSection / Math.max(totalSections, 1)) * 100}%`, transition: 'width 0.5s ease' }} />
      </div>

      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
