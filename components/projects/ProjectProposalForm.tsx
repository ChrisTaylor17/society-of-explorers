'use client';

import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from 'react';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const inputStyle: CSSProperties = {
  width: '100%', minWidth: 0, background: '#111', border: '1px solid #c9a84c66', padding: '14px 16px',
  fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: parchment, boxSizing: 'border-box',
};
const actionStyle: CSSProperties = {
  fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.08em', color: '#0a0a0a',
  background: gold, border: 'none', minHeight: '48px', padding: '12px 16px', cursor: 'pointer', borderRadius: 0,
};
const uncertainMessage = 'We couldn’t confirm receipt. Your proposal may have been saved. Your text is still here; check with us before sending again to avoid a duplicate.';
type Status = 'idle' | 'sending' | 'invalid' | 'unconfirmed' | 'confirmed';
type PendingSubmission = { controller: AbortController; timeout: number };

export default function ProjectProposalForm() {
  const id = useId();
  const [title, setTitle] = useState('');
  const [shortDesc, setShortDesc] = useState('');
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState('general');
  const [fundingGoal, setFundingGoal] = useState('10000');
  const [pName, setPName] = useState('');
  const [pEmail, setPEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const pending = useRef<PendingSubmission | null>(null);
  const confirmation = useRef<HTMLDivElement>(null);
  const sending = status === 'sending';
  const hasError = status === 'invalid' || status === 'unconfirmed';

  useEffect(() => () => {
    const request = pending.current;
    pending.current = null;
    if (request) {
      window.clearTimeout(request.timeout);
      request.controller.abort();
    }
  }, []);

  useEffect(() => {
    if (status === 'confirmed') confirmation.current?.focus();
  }, [status]);

  function finish(request: PendingSubmission, next: Status) {
    if (pending.current !== request) return;
    pending.current = null;
    window.clearTimeout(request.timeout);
    setStatus(next);
  }

  function stopWaiting() {
    const request = pending.current;
    if (!request) return;
    // Aborting the browser wait cannot undo or disprove a server-side save.
    finish(request, 'unconfirmed');
    request.controller.abort();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // A ref also guards repeated events before React paints disabled controls.
    if (pending.current || status === 'confirmed') return;
    if (!title.trim() || !desc.trim() || !pName.trim() || !pEmail.trim()) {
      setStatus('invalid');
      return;
    }
    const request: PendingSubmission = { controller: new AbortController(), timeout: 0 };
    pending.current = request;
    setStatus('sending');
    request.timeout = window.setTimeout(() => {
      if (pending.current !== request) return;
      finish(request, 'unconfirmed');
      request.controller.abort();
    }, 20_000);
    try {
      const response = await fetch('/api/projects/submit', {
        method: 'POST', signal: request.controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(), short_description: shortDesc.trim(), description: desc.trim(),
          category, funding_goal: fundingGoal, name: pName.trim(), email: pEmail.trim(),
        }),
      });
      if (!response.ok) {
        finish(request, response.status === 400 ? 'invalid' : 'unconfirmed');
        return;
      }
      const receipt: unknown = await response.json();
      const confirmed = receipt !== null && typeof receipt === 'object' && !Array.isArray(receipt)
        && 'success' in receipt && receipt.success === true;
      finish(request, confirmed ? 'confirmed' : 'unconfirmed');
    } catch {
      finish(request, 'unconfirmed');
    }
  }

  if (status === 'confirmed') {
    return (
      <div ref={confirmation} tabIndex={-1} role="status" aria-live="polite" style={{ padding: '2rem', border: '1px solid #c9a84c66', background: '#c9a84c08', overflowWrap: 'anywhere' }}>
        <h3 style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', letterSpacing: '0.12em', color: gold, marginBottom: '0.75rem' }}>SUBMISSION RECEIVED</h3>
        <p style={{ fontSize: '18px', lineHeight: 1.7 }}>Your proposal “{title.trim()}” was saved for review. This does not mean it has been approved or funded.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} aria-describedby={id + '-help'} style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left', minWidth: 0 }}>
      <style>{'.soe-proposal-field:focus-visible, .soe-proposal-action:focus-visible { outline: 2px solid #c9a84c; outline-offset: 3px; }'}</style>
      <p id={id + '-help'} style={{ fontSize: '17px', lineHeight: 1.6, margin: 0 }}>Submit your idea and contact details for review. Required fields are marked below. Keep this page open until you have a receipt.</p>
      <fieldset disabled={sending} aria-busy={sending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <legend style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clipPath: 'inset(50%)' }}>Project proposal details</legend>
        <div>
          <label htmlFor={id + '-title'}>Project title (required)</label>
          <input id={id + '-title'} name="title" className="soe-proposal-field" value={title} onChange={e => setTitle(e.target.value)} required maxLength={120} style={inputStyle} />
        </div>
        <div>
          <label htmlFor={id + '-summary'}>One-line description (optional)</label>
          <input id={id + '-summary'} name="short_description" className="soe-proposal-field" value={shortDesc} onChange={e => setShortDesc(e.target.value)} maxLength={180} style={inputStyle} />
        </div>
        <div>
          <label htmlFor={id + '-description'}>Full description (required, up to 3,000 characters)</label>
          <textarea id={id + '-description'} name="description" className="soe-proposal-field" value={desc} onChange={e => setDesc(e.target.value)} required maxLength={3000} rows={5} style={{ ...inputStyle, resize: 'vertical' }} />
        </div>
        <div>
          <label htmlFor={id + '-category'}>Category</label>
          <select id={id + '-category'} name="category" className="soe-proposal-field" value={category} onChange={e => setCategory(e.target.value)} style={{ ...inputStyle, appearance: 'auto' }}>
            <option value="general">General</option><option value="physical">Physical Space</option>
            <option value="technology">Technology</option><option value="education">Education</option>
            <option value="art">Art</option><option value="community">Community</option>
          </select>
        </div>
        <div>
          <label htmlFor={id + '-goal'}>Funding goal (USD)</label>
          <input id={id + '-goal'} name="funding_goal" className="soe-proposal-field" value={fundingGoal} onChange={e => setFundingGoal(e.target.value)} type="number" style={inputStyle} />
        </div>
        <div>
          <label htmlFor={id + '-name'}>Your name (required)</label>
          <input id={id + '-name'} name="name" className="soe-proposal-field" value={pName} onChange={e => setPName(e.target.value)} autoComplete="name" required maxLength={120} style={inputStyle} />
        </div>
        <div>
          <label htmlFor={id + '-email'}>Your email (required)</label>
          <input id={id + '-email'} name="email" className="soe-proposal-field" value={pEmail} onChange={e => setPEmail(e.target.value)} type="email" autoComplete="email" required maxLength={254} style={inputStyle} />
        </div>
        <button className="soe-proposal-action" type="submit" disabled={sending} aria-describedby={hasError ? id + '-error' : undefined} style={{ ...actionStyle, opacity: sending ? 0.6 : 1 }}>
          {sending ? 'Submitting…' : status === 'unconfirmed' ? 'Send again (may duplicate)' : 'Submit project proposal'}
        </button>
      </fieldset>
      <p role="status" aria-live="polite" aria-atomic="true" style={{ margin: 0, fontSize: '17px', lineHeight: 1.6 }}>
        {sending ? 'Waiting for a receipt. Your text is kept on this page.' : ''}
      </p>
      {sending ? <button className="soe-proposal-action" type="button" onClick={stopWaiting} style={{ ...actionStyle, background: 'transparent', color: gold, border: '1px solid #c9a84c66' }}>Stop waiting</button> : null}
      {hasError ? (
        <div id={id + '-error'} role="alert" style={{ padding: '16px', border: '1px solid #c9a84c88', fontSize: '18px', lineHeight: 1.6, overflowWrap: 'anywhere' }}>
          <p style={{ margin: 0 }}>{status === 'invalid' ? 'Please check the title, description, name and email, then submit again. Your text is still here.' : uncertainMessage}</p>
          {status === 'unconfirmed' ? <a className="soe-proposal-action" href="mailto:chris@societyofexplorers.com?subject=Project%20submission%20confirmation" style={{ color: gold, display: 'inline-block', paddingTop: '12px', minHeight: '44px' }}>Ask whether my proposal arrived</a> : null}
        </div>
      ) : null}
    </form>
  );
}
