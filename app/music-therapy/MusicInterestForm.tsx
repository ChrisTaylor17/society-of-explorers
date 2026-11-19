'use client';

import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import Link from 'next/link';

type Status = 'idle' | 'sending' | 'invalid' | 'unconfirmed' | 'confirmed';
type Pending = { controller: AbortController; timer: number };
const fieldStyle: CSSProperties = { width: '100%', minWidth: 0, boxSizing: 'border-box', background: '#111', color: '#f5f0e8', border: '1px solid #c9a84c66', padding: '12px', fontSize: '16px', fontFamily: 'inherit' };
const actionStyle: CSSProperties = { minHeight: '48px', padding: '12px 16px', border: '1px solid #c9a84c', background: '#c9a84c', color: '#0a0a0a', fontSize: '15px', cursor: 'pointer', fontFamily: 'inherit' };
const hardwareChoices = [
  { value: 'learn', label: 'I want to learn more' },
  { value: 'have_device', label: 'I already have a biofeedback device' },
  { value: 'need_device', label: 'I would need a device' },
  { value: 'other', label: 'Another interest' },
];

export default function MusicInterestForm() {
  const id = useId();
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [hardware, setHardware] = useState('learn');
  const [status, setStatus] = useState<Status>('idle');
  const pending = useRef<Pending | null>(null), confirmation = useRef<HTMLDivElement>(null);
  const sending = status === 'sending', hasError = status === 'invalid' || status === 'unconfirmed';

  useEffect(() => () => {
    const request = pending.current;
    pending.current = null;
    if (request) { window.clearTimeout(request.timer); request.controller.abort(); }
  }, []);
  useEffect(() => { if (status === 'confirmed') confirmation.current?.focus(); }, [status]);

  function finish(request: Pending, next: Status) {
    if (pending.current !== request) return;
    pending.current = null;
    window.clearTimeout(request.timer);
    setStatus(next);
  }
  function stopWaiting() {
    const request = pending.current;
    if (!request) return;
    finish(request, 'unconfirmed');
    // Ending the browser wait cannot undo or disprove a server-side save.
    request.controller.abort();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || status === 'confirmed') return;
    if (!name.trim() || !email.trim()) { setStatus('invalid'); return; }
    const request: Pending = { controller: new AbortController(), timer: 0 };
    pending.current = request;
    setStatus('sending');
    request.timer = window.setTimeout(() => {
      if (pending.current !== request) return;
      finish(request, 'unconfirmed');
      request.controller.abort();
    }, 20_000);
    try {
      const response = await fetch('/api/music-therapy/interest', {
        method: 'POST', signal: request.controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), hardware_status: hardware }),
      });
      if (!response.ok) { finish(request, response.status === 400 ? 'invalid' : 'unconfirmed'); return; }
      const receipt: unknown = await response.json();
      const confirmed = receipt !== null && typeof receipt === 'object' && !Array.isArray(receipt)
        && 'success' in receipt && receipt.success === true && Object.keys(receipt).every(key => key === 'success');
      finish(request, confirmed ? 'confirmed' : 'unconfirmed');
    } catch { finish(request, 'unconfirmed'); }
  }

  if (status === 'confirmed') return <div ref={confirmation} tabIndex={-1} role="status" aria-live="polite" style={{ padding: '1.5rem', border: '1px solid #c9a84c66', textAlign: 'left', overflowWrap: 'anywhere' }}>
    <h3>Interest received</h3>
    <p>Your interest and contact details were saved for review. This is not a reservation or confirmation of a hardware release date.</p>
  </div>;

  return <form onSubmit={submit} aria-describedby={id + '-help'} style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'left', minWidth: 0, fontSize: '17px', lineHeight: 1.6 }}>
    <style>{'.soe-music-interest:focus-visible { outline: 2px solid #f1d788; outline-offset: 3px; }'}</style>
    <p id={id + '-help'} style={{ margin: 0 }}>Share your interest in future audio tools. This sends your name, email and preference for review. Hardware connections are not available in this player.</p>
    <fieldset disabled={sending} aria-busy={sending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <legend style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clipPath: 'inset(50%)' }}>Your contact details and interest</legend>
      <div><label htmlFor={id + '-name'}>Your name (required)</label><input id={id + '-name'} name="name" className="soe-music-interest" value={name} onChange={e => setName(e.target.value)} autoComplete="name" required maxLength={120} style={fieldStyle} /></div>
      <div><label htmlFor={id + '-email'}>Your email (required)</label><input id={id + '-email'} name="email" className="soe-music-interest" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required maxLength={254} style={fieldStyle} /></div>
      <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><legend>Your interest</legend>
        {hardwareChoices.map(choice => <label key={choice.value} style={{ display: 'flex', alignItems: 'center', gap: '10px', minHeight: '44px' }}>
          <input className="soe-music-interest" type="radio" name="hardware" value={choice.value} checked={hardware === choice.value} onChange={() => setHardware(choice.value)} style={{ accentColor: '#c9a84c' }} />{choice.label}
        </label>)}
      </fieldset>
      <button className="soe-music-interest" type="submit" disabled={sending} aria-describedby={hasError ? id + '-error' : undefined} style={actionStyle}>{sending ? 'Sending…' : status === 'unconfirmed' ? 'Send again (may duplicate)' : 'Register interest'}</button>
    </fieldset>
    <p role="status" aria-live="polite" aria-atomic="true" style={{ margin: 0 }}>{sending ? 'Waiting for a receipt. Keep this page open; your details are still here.' : ''}</p>
    {sending && <button className="soe-music-interest" type="button" onClick={stopWaiting} style={{ ...actionStyle, color: '#f1d788', background: 'transparent' }}>Stop waiting</button>}
    {hasError && <div id={id + '-error'} role="alert" style={{ padding: '1rem', border: '1px solid #c9a84c66', overflowWrap: 'anywhere' }}>
      <p style={{ margin: 0 }}>{status === 'invalid' ? 'Please check your name and email, then try again. Your details are still here.' : 'We could not confirm receipt. Your interest may have been saved. Your details are still here; check with us before sending again to avoid a duplicate.'}</p>
      {status === 'unconfirmed' && <a className="soe-music-interest" href="mailto:chris@societyofexplorers.com?subject=Audio%20interest%20confirmation" style={{ color: '#f1d788', display: 'inline-block', minHeight: '44px', paddingTop: '12px' }}>Ask whether my interest arrived</a>}
    </div>}
    <noscript>JavaScript is needed to send this form. You can read the <Link href="/great-books" prefetch={false}>free library</Link> without an account.</noscript>
  </form>;
}
