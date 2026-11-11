'use client';
import { useEffect, useRef, useState } from 'react';

export function waddleShareText(transcription: string): string {
  return `"${transcription}"\n\nCreated with Society of Explorers.\nhttps://www.societyofexplorers.com`;
}

/** Copying is a local action. A pending or rejected write is never a success. */
export default function CopyWaddleButton({ transcription }: { transcription: string }) {
  const [status, setStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');
  const alive = useRef(true);
  const working = useRef(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const text = waddleShareText(transcription);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  async function copy() {
    if (working.current) return;
    working.current = true;
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setStatus('copying');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      if (!alive.current) return;
      setStatus('copied');
      resetTimer.current = setTimeout(() => { if (alive.current) setStatus('idle'); }, 2000);
    } catch {
      if (alive.current) setStatus('error');
    } finally {
      working.current = false;
    }
  }

  return <div style={{ maxWidth: '100%', flex: '1 1 180px' }}>
    <button type="button" onClick={copy} disabled={status === 'copying'} style={{
      minHeight: '44px', fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.08em',
      color: '#E8DCC8', background: 'none', border: '1px solid #C5A55A', padding: '8px 16px',
      cursor: status === 'copying' ? 'wait' : 'pointer',
    }}>{status === 'copying' ? 'Copying…' : status === 'copied' ? 'Copied' : 'Copy text'}</button>
    <p role="status" aria-live="polite" style={{ margin: '0.5rem 0 0', color: '#E8DCC8', fontSize: '15px', lineHeight: 1.5 }}>
      {status === 'copied' ? 'Text copied. You choose where to paste it.' : status === 'error' ? 'Automatic copying failed. Select and copy the text below, or try the button again.' : 'Copies text to your clipboard. Nothing is published or sent.'}
    </p>
    {status === 'error' && <label style={{ display: 'block', marginTop: '0.75rem', fontSize: '16px', color: '#E8DCC8' }}>
      Text to copy manually
      <textarea readOnly value={text} rows={5} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '0.4rem', padding: '0.75rem', color: '#E8DCC8', background: '#0a0a0a', border: '1px solid #C5A55A', font: 'inherit', lineHeight: 1.5, resize: 'vertical' }} />
    </label>}
  </div>;
}
