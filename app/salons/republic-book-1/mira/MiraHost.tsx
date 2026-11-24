'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './mira.module.css';

type Turn = { role: 'user' | 'assistant'; content: string };

const STORE = 'soe-mira-republic-1';
// The route takes at most 161 turns; past that the oldest pairs are dropped.
const MAX_SEND = 161;

// Chris's notes to Mira. Ones that need more (names, a time) end in a space.
const CUES: { label: string; text: string }[] = [
  { label: 'Start', text: '[room] start. Guests: ' },
  { label: 'Welcome 2', text: '[room] welcome 2' },
  { label: 'Welcome 3', text: '[room] welcome 3' },
  { label: 'Welcome 4', text: '[room] welcome 4' },
  { label: 'Welcome 5', text: '[room] welcome 5' },
  { label: 'Round 1', text: '[room] round 1' },
  { label: 'Turn 1', text: '[room] turn 1' },
  { label: 'Break 1', text: '[room] break 1. Back at 7:35' },
  { label: 'Round 2', text: '[room] round 2' },
  { label: 'Turn 2', text: '[room] turn 2' },
  { label: 'Break 2', text: '[room] break 2. Back at 8:05' },
  { label: 'Round 3', text: '[room] round 3' },
  { label: 'Turn 3', text: '[room] turn 3' },
  { label: 'Next', text: '[room] next: ' },
  { label: 'Voice', text: '[room] voice: ' },
  { label: '3 min', text: '[room] 3 min' },
  { label: 'Wrap', text: '[room] wrap' },
  { label: 'Last word', text: '[room] last word' },
  { label: 'Close 1', text: '[room] close 1' },
  { label: 'Close 2', text: '[room] close 2' },
  { label: 'Close 3', text: '[room] close 3' },
  { label: 'Claims not people', text: '[room] claims not people' },
  { label: 'Joined', text: '[room] joined: ' },
  { label: 'Left', text: '[room] left: ' },
  { label: 'Muted', text: '[room] muted: ' },
  { label: 'Resume', text: '[room] resume. ' },
  { label: 'Check', text: '[room] check' },
];

function readStored(): Turn[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORE) || '[]');
    return Array.isArray(parsed) && parsed.every(t => t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string') ? parsed : [];
  } catch { return []; }
}

export default function MiraHost() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);

  // The evening survives a reload of this tab, and is gone when the tab closes:
  // it holds guests' first names and words.
  useEffect(() => { setTurns(readStored()); setLoaded(true); }, []);
  useEffect(() => {
    if (!loaded) return;
    try { sessionStorage.setItem(STORE, JSON.stringify(turns)); } catch { /* storage off: the evening just won't survive a reload */ }
    end.current?.scrollIntoView({ block: 'end' });
  }, [turns, loaded]);

  const latest = [...turns].reverse().find(t => t.role === 'assistant');

  function addCue(text: string) {
    setDraft(d => (d.trim() ? `${d.replace(/\s+$/, '')}\n${text}` : text));
    input.current?.focus();
  }

  async function send() {
    const text = draft.trim();
    if (!text || pending) return;
    const next: Turn[] = [...turns, { role: 'user', content: text }];
    let outgoing = next;
    while (outgoing.length > MAX_SEND) outgoing = outgoing.slice(2);
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/salons/republic-book-1/mira', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ turns: outgoing }),
      });
      const data = await res.json().catch(() => ({})) as { reply?: string; error?: string };
      if (!res.ok || !data.reply) throw new Error(data.error || `Mira did not answer (error ${res.status}).`);
      setTurns([...next, { role: 'assistant', content: data.reply }]);
      setDraft('');
    } catch (e) {
      setError(`${e instanceof Error ? e.message : 'Mira did not answer.'} Your line is still in the box: press Send to try again.`);
    } finally {
      setPending(false);
      input.current?.focus();
    }
  }

  function clearEvening() {
    if (!confirmClear) { setConfirmClear(true); return; }
    setTurns([]); setDraft(''); setError(null); setConfirmClear(false);
    try { sessionStorage.removeItem(STORE); } catch { /* nothing stored */ }
  }

  return <div className={styles.page}>
    <header className={styles.banner}>
      <p className={styles.ai}><strong>Mira Vale is an AI guide:</strong> software, not a person, and she can be wrong about the book. She cannot hear the call. Chris, who built this room, types a short version of what guests say so she can read it, and those lines go to the AI service that runs her.</p>
      <p className={styles.title}>Plato’s Republic, Book I · Society of Explorers salon</p>
    </header>

    <main className={styles.main}>
      <section className={styles.now} aria-live="polite" aria-label="Mira’s latest reply">
        {latest ? <p className={styles.reply}>{latest.content}</p> : <p className={styles.waiting}>Mira will speak here.</p>}
        {pending && <p className={styles.status}>Waiting for Mira…</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </section>

      <section className={styles.log} aria-label="The evening so far">
        {turns.map((t, i) => t.role === 'assistant'
          ? <p key={i} className={styles.mira}><span>Mira</span>{t.content}</p>
          : <p key={i} className={t.content.startsWith('[room]') ? styles.note : styles.guest}>{t.content}</p>)}
        <div ref={end} />
      </section>
    </main>

    <form className={styles.controls} onSubmit={e => { e.preventDefault(); void send(); }}>
      <div className={styles.cues} aria-label="Notes to Mira">
        {CUES.map(c => <button key={c.label} type="button" onClick={() => addCue(c.text)}>{c.label}</button>)}
      </div>
      <div className={styles.row}>
        <label className={styles.srOnly} htmlFor="mira-line">What guests said, or a note to Mira</label>
        <textarea id="mira-line" ref={input} value={draft} rows={2} placeholder="Dana: he is right, the powerful write the rules"
          onChange={e => { setDraft(e.target.value); setConfirmClear(false); }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} />
        <button className={styles.send} type="submit" disabled={pending || !draft.trim()}>Send</button>
      </div>
      <p className={styles.help}>Enter sends; Shift and Enter starts a new line, for several guests in one message. <button type="button" className={styles.clear} onClick={clearEvening}>{confirmClear ? 'Press again to clear the evening' : 'Clear the evening'}</button></p>
    </form>
  </div>;
}
