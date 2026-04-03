'use client';
import { useState, useCallback } from 'react';
import { parseWatchHistory, type ParsedData } from '@/lib/parseYoutubeTakeout';

const gold = '#C5A55A';
const parchment = '#E8DCC8';
const muted = '#9a8f7a';
const crimson = '#BF4040';

export default function Dashboard() {
  const [data, setData] = useState<ParsedData | null>(null);
  const [parsing, setParsing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [thinkerNote, setThinkerNote] = useState('');
  const [loadingNote, setLoadingNote] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    setParsing(true);
    const content = await file.text();
    const fileType = file.name.endsWith('.json') ? 'json' as const : 'html' as const;
    const parsed = parseWatchHistory(content, fileType);
    setData(parsed);
    setParsing(false);

    // Get thinker commentary
    if (parsed.totalVideos > 0) {
      setLoadingNote(true);
      const shortsPercentage = Math.round((parsed.totalShorts / parsed.totalVideos) * 100);
      const hours = (parsed.estimatedMinutes / 60).toFixed(1);
      try {
        const res = await fetch('/api/taste', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: `I watched ${parsed.totalVideos} YouTube videos including ${parsed.totalShorts} Shorts (${shortsPercentage}% of total) totaling approximately ${hours} hours over the period ${parsed.dateRange.start} to ${parsed.dateRange.end}. What does this say about how I'm spending my attention?`,
          }),
        });
        const d = await res.json();
        setThinkerNote(d.response || d.error || '');
      } catch { setThinkerNote('The thinker is silent. Try again.'); }
      setLoadingNote(false);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // Chart: last 30 days
  const chartData = data ? data.dailyBreakdown.slice(-30) : [];
  const maxDaily = Math.max(1, ...chartData.map(d => d.shorts + d.regular));

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to bottom, #000, transparent)' }}>
        <a href="/salon" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.7 }}>← RETURN TO THE SALON</a>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5 }}>SOCIETY OF EXPLORERS</div>
      </nav>

      <div style={{ textAlign: 'center', padding: '80px 2rem 40px' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.5em', color: gold, opacity: 0.5, marginBottom: '1.5rem' }}>ATTENTION SOVEREIGNTY</div>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 300, letterSpacing: '0.15em', marginBottom: '1rem' }}>
          YOUR ATTENTION LEDGER
        </h1>
        <p style={{ fontSize: '1.1rem', color: muted, fontStyle: 'italic', maxWidth: '500px', margin: '0 auto', lineHeight: 1.8 }}>
          Where does your time go? The thinkers are watching.
        </p>
      </div>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 2rem 4rem' }}>

        {/* Upload area */}
        {!data && !parsing && (
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            style={{
              border: `2px dashed ${dragOver ? gold : `${gold}44`}`,
              background: dragOver ? `${gold}08` : 'transparent',
              padding: '4rem 2rem', textAlign: 'center', cursor: 'pointer',
              transition: 'all 0.3s',
            }}
            onClick={() => document.getElementById('takeout-input')?.click()}
          >
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1.5rem', color: gold, opacity: 0.2, marginBottom: '1rem' }}>⬡</div>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, marginBottom: '1rem' }}>
              DROP YOUR YOUTUBE TAKEOUT FILE HERE
            </div>
            <p style={{ fontSize: '13px', color: muted, lineHeight: 1.7, maxWidth: '400px', margin: '0 auto' }}>
              Upload your <strong style={{ color: parchment }}>watch-history.json</strong> or <strong style={{ color: parchment }}>watch-history.html</strong> from Google Takeout.
              All parsing happens in your browser. No data leaves your device.
            </p>
            <input id="takeout-input" type="file" accept=".json,.html" onChange={onFileSelect} style={{ display: 'none' }} />
            <div style={{ marginTop: '1.5rem', fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: `${gold}60` }}>
              CLICK OR DRAG · JSON OR HTML · PRIVATE BY DEFAULT
            </div>
          </div>
        )}

        {parsing && (
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1.5rem', color: gold, opacity: 0.3, marginBottom: '1rem' }}>⬡</div>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: muted }}>PARSING YOUR WATCH HISTORY...</div>
          </div>
        )}

        {/* Stats */}
        {data && (
          <>
            {/* Stat cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: `${gold}15`, marginBottom: '2rem' }}>
              <div style={{ background: '#0d0d0d', padding: '2rem', textAlign: 'center' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2rem, 5vw, 3rem)', color: gold }}>{data.totalVideos.toLocaleString()}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: muted, marginTop: '0.5rem' }}>VIDEOS WATCHED</div>
              </div>
              <div style={{ background: '#0d0d0d', padding: '2rem', textAlign: 'center' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2rem, 5vw, 3rem)', color: data.totalShorts > data.totalVideos * 0.5 ? crimson : gold }}>
                  {data.totalShorts.toLocaleString()}
                </div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: muted, marginTop: '0.5rem' }}>
                  SHORTS ({Math.round((data.totalShorts / Math.max(data.totalVideos, 1)) * 100)}%)
                </div>
              </div>
              <div style={{ background: '#0d0d0d', padding: '2rem', textAlign: 'center' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2rem, 5vw, 3rem)', color: gold }}>{(data.estimatedMinutes / 60).toFixed(1)}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: muted, marginTop: '0.5rem' }}>ESTIMATED HOURS</div>
              </div>
            </div>

            {/* Date range */}
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted, textAlign: 'center', marginBottom: '2rem' }}>
              {data.dateRange.start} — {data.dateRange.end}
            </div>

            {/* Bar chart — last 30 days */}
            {chartData.length > 0 && (
              <div style={{ marginBottom: '2rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>LAST {chartData.length} DAYS</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '120px', borderBottom: `1px solid ${gold}22`, padding: '0 0 4px' }}>
                  {chartData.map((day, i) => {
                    const total = day.shorts + day.regular;
                    const height = (total / maxDaily) * 100;
                    const shortsHeight = (day.shorts / maxDaily) * 100;
                    const regularHeight = (day.regular / maxDaily) * 100;
                    return (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }} title={`${day.date}: ${day.regular} videos, ${day.shorts} shorts`}>
                        <div style={{ height: `${shortsHeight}%`, background: `${crimson}88`, minHeight: day.shorts > 0 ? '2px' : 0 }} />
                        <div style={{ height: `${regularHeight}%`, background: `${gold}88`, minHeight: day.regular > 0 ? '2px' : 0 }} />
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '8px', height: '8px', background: `${gold}88` }} />
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', color: muted }}>REGULAR</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '8px', height: '8px', background: `${crimson}88` }} />
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', color: muted }}>SHORTS</span>
                  </div>
                </div>
              </div>
            )}

            {/* Thinker note */}
            <div style={{ border: `1px solid ${gold}22`, background: '#0d0d0d', padding: '2rem', marginBottom: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '18px', color: gold, opacity: 0.5 }}>Σ</span>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, opacity: 0.6 }}>SOCRATES OBSERVES</span>
              </div>
              {loadingNote ? (
                <div style={{ fontSize: '14px', color: muted, fontStyle: 'italic' }}>Socrates is examining your attention...</div>
              ) : thinkerNote ? (
                <p style={{ fontSize: '16px', color: parchment, lineHeight: 1.9, fontStyle: 'italic' }}>{thinkerNote}</p>
              ) : null}
            </div>

            {/* CTA */}
            <div style={{ textAlign: 'center' }}>
              <a href="/great-books" style={{
                fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em',
                color: '#000', background: gold, padding: '12px 30px', textDecoration: 'none', display: 'inline-block',
              }}>
                SWAP A SHORT FOR PLATO →
              </a>
              <div style={{ marginTop: '1.5rem' }}>
                <button onClick={() => { setData(null); setThinkerNote(''); }} style={{
                  fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em',
                  color: muted, background: 'none', border: 'none', cursor: 'pointer',
                }}>UPLOAD DIFFERENT FILE</button>
              </div>
            </div>
          </>
        )}

        {/* Privacy note */}
        <div style={{ marginTop: '3rem', textAlign: 'center' }}>
          <p style={{ fontSize: '12px', color: muted, opacity: 0.5, fontStyle: 'italic' }}>
            All parsing happens in your browser. Your watch history never leaves your device unless you explicitly save it.
          </p>
        </div>
      </div>

      <footer style={{ padding: '3rem 2rem', borderTop: `1px solid ${gold}22`, textAlign: 'center' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, opacity: 0.4 }}>SOCIETY OF EXPLORERS · ATTENTION LEDGER</div>
      </footer>
    </div>
  );
}
