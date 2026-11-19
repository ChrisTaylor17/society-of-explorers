'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { MemoryCommand, MemoryView } from '@/lib/memory/reviewedMemory';
import { AUTH_INTENT_HEADER, EXPECTED_MEMBER_HEADER, currentBrowserAuthIntent, isCurrentBrowserAuthIntent, parseBrowserIntent } from '@/lib/auth/browserIntent';
import { subscribeAuthProviderChanges } from '@/lib/auth/providerSelection';

type ViewIdentity = { intent: string; memberId: string };
const authorityHeaders = (identity: ViewIdentity, json = false) => ({ [AUTH_INTENT_HEADER]: identity.intent, [EXPECTED_MEMBER_HEADER]: identity.memberId, ...(json ? { 'Content-Type': 'application/json' } : {}) });

type Action = MemoryCommand extends infer C ? C extends MemoryCommand ? Omit<C, 'requestId' | 'expectedRevision'> : never : never;
const receiptText: Record<string, string> = {
  prepared: 'Suggestions are ready for review. None have been saved as memory.',
  saved: 'The reviewed memory was saved. Its use still follows the memory setting below.',
  rejected: 'Suggestion rejected. It was not added to saved memory.',
  cancelled: 'Review cancelled. Pending suggestions will not be used.',
  enabled: 'Only your reviewed memories may now be used in your private guide conversations.',
  disabled: 'Memory is off. Future guide replies will not use these notes. Pending suggestions were cancelled.',
  forgotten: 'Memory removed from future guide recall. This does not delete the original conversation or any provider-held copy.',
  preparing: 'A suggestion request was already submitted. Refresh to check its result.',
  'preparation-failed': 'The earlier suggestion request failed. No memory was added.',
  'preparation-discarded': 'The earlier suggestions were discarded. Prepare a new review if needed.',
  'preparation-expired': 'The earlier suggestion request expired. No memory was added.',
};
const section: CSSProperties = { border: '1px solid rgba(201,168,76,.35)', background: '#111', color: '#f5f0e8', padding: '1.25rem', marginBottom: '1.5rem', overflowWrap: 'anywhere' };
const button: CSSProperties = { minHeight: 44, padding: '10px 16px', background: '#c9a84c', color: '#111', border: '1px solid #c9a84c', borderRadius: 4, cursor: 'pointer', font: 'inherit' };
const secondary: CSSProperties = { ...button, background: 'transparent', color: '#f5f0e8' };
const field: CSSProperties = { width: '100%', boxSizing: 'border-box', padding: 10, background: '#1b1b1b', color: '#f5f0e8', border: '1px solid #999', borderRadius: 4, font: 'inherit', minHeight: 44 };

export default function ReviewedMemoryPanel() {
  const prefix = useId();
  const [view, setView] = useState<MemoryView | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [message, setMessage] = useState('Loading memory controls…');
  const [sourceId, setSourceId] = useState('');
  const [consent, setConsent] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [requestingSuggestions, setRequestingSuggestions] = useState(false);
  const requestGeneration = useRef(0);
  const identity = useRef<ViewIdentity | null>(null);
  const invalidateRequests = useCallback(() => {
    ++requestGeneration.current; identity.current = null;
  }, []);
  const retire = useCallback(() => {
    invalidateRequests();
    setView(null); setConsent(false); setEdits({}); setSourceId(''); setUnavailable(false);
    setBusy(false); setRequestingSuggestions(false); setRefreshRequired(true);
    setMessage('Your sign-in changed. Refresh memory status before reviewing or saving anything.');
  }, [invalidateRequests]);
  const update = useCallback((next: MemoryView, bound: ViewIdentity) => {
    // A refreshed source/provider and a different account require a new decision.
    setConsent(false); identity.current = bound;
    setView(next); setUnavailable(false); setRefreshRequired(false);
    setSourceId(current => next.sources.some(source => source.id === current) ? current : (next.sources[0]?.id ?? ''));
    setEdits(Object.fromEntries(next.candidates.map(candidate => [candidate.id, candidate.text])));
  }, []);
  const load = useCallback(async () => {
    const intent = currentBrowserAuthIntent();
    if (!intent) { retire(); return; }
    const generation = ++requestGeneration.current;
    identity.current = null; setView(null); setConsent(false); setEdits({}); setSourceId('');
    setBusy(true);
    try {
      // The session endpoint alone may discover a member under captured intent.
      // Every subsequent private read/write must also carry that expected member.
      const sessionResponse = await fetch('/api/auth/member', { cache: 'no-store', credentials: 'same-origin', redirect: 'error', headers: { [AUTH_INTENT_HEADER]: intent } });
      const session = await sessionResponse.json();
      if (generation !== requestGeneration.current) return;
      if (!isCurrentBrowserAuthIntent(intent) || !sessionResponse.ok || !parseBrowserIntent(session.member?.id)) { retire(); return; }
      const bound = { intent, memberId: session.member.id as string };
      const result = await fetch('/api/thinker/memory/review', { cache: 'no-store', credentials: 'same-origin', redirect: 'error', headers: authorityHeaders(bound) });
      const data = await result.json();
      if (generation !== requestGeneration.current) return;
      if (!isCurrentBrowserAuthIntent(intent)) { retire(); return; }
      if (!result.ok || data.available !== true) {
        setUnavailable(data.available === false); setMessage(data.error || 'Memory controls could not be loaded.'); return;
      }
      if (data.memberId !== bound.memberId) { retire(); return; }
      update(data, bound); setMessage('Memory controls refreshed. Review suggestions individually before saving.');
    } catch {
      if (generation === requestGeneration.current) { setRefreshRequired(true); setMessage('Memory controls could not be loaded. Refresh before continuing.'); }
    } finally { if (generation === requestGeneration.current) setBusy(false); }
  }, [retire, update]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const unsubscribe = subscribeAuthProviderChanges(retire);
    return () => { unsubscribe(); invalidateRequests(); };
  }, [invalidateRequests, retire]);

  async function act(action: Action) {
    if (!view || busy || refreshRequired) return;
    const bound = identity.current;
    if (!bound || !isCurrentBrowserAuthIntent(bound.intent) || view.memberId !== bound.memberId) { retire(); return; }
    const generation = ++requestGeneration.current;
    setRequestingSuggestions(action.action === 'prepare');
    setBusy(true); setMessage('Confirming your change…');
    try {
      const result = await fetch('/api/thinker/memory/review', { method: 'POST', cache: 'no-store', credentials: 'same-origin', redirect: 'error',
        headers: authorityHeaders(bound, true), body: JSON.stringify({ ...action, requestId: crypto.randomUUID(), expectedRevision: view.revision }) });
      const data = await result.json();
      if (requestGeneration.current !== generation) return;
      if (!isCurrentBrowserAuthIntent(bound.intent) || identity.current !== bound) { retire(); return; }
      if (!result.ok) { setRefreshRequired(data.refreshRequired === true); setMessage(data.error || 'The change could not be confirmed.'); return; }
      if (data.view?.memberId !== bound.memberId) { retire(); return; }
      update(data.view, bound); setMessage(receiptText[data.outcome] || 'Change confirmed.');
    } catch {
      if (requestGeneration.current === generation) { setRefreshRequired(true); setMessage('The change could not be confirmed. It may have completed. Refresh before taking another action.'); }
    } finally {
      if (requestGeneration.current === generation) { setBusy(false); setRequestingSuggestions(false); }
    }
  }

  async function cancelInFlight() {
    const bound = identity.current;
    if (!bound || !isCurrentBrowserAuthIntent(bound.intent)) { retire(); return; }
    const generation = ++requestGeneration.current;
    setRequestingSuggestions(false); setBusy(true); setMessage('Cancelling the pending review…');
    try {
      const current = await fetch('/api/thinker/memory/review', { cache: 'no-store', credentials: 'same-origin', redirect: 'error', headers: authorityHeaders(bound) });
      const latest = await current.json();
      if (generation !== requestGeneration.current) return;
      if (!isCurrentBrowserAuthIntent(bound.intent) || identity.current !== bound) { retire(); return; }
      if (!current.ok || latest.available !== true) throw new Error('Could not confirm current review');
      if (latest.memberId !== bound.memberId) { retire(); return; }
      const result = await fetch('/api/thinker/memory/review', { method: 'POST', cache: 'no-store', credentials: 'same-origin', redirect: 'error',
        headers: authorityHeaders(bound, true), body: JSON.stringify({ action: 'cancel', requestId: crypto.randomUUID(), expectedRevision: latest.revision }) });
      const data = await result.json();
      if (generation !== requestGeneration.current) return;
      if (!isCurrentBrowserAuthIntent(bound.intent) || identity.current !== bound) { retire(); return; }
      if (!result.ok) throw new Error('Could not confirm cancellation');
      if (data.view?.memberId !== bound.memberId) { retire(); return; }
      update(data.view, bound); setMessage('Review cancelled. Any late suggestions will be discarded. A request already sent to the provider cannot be recalled.');
    } catch {
      if (generation === requestGeneration.current) { setRefreshRequired(true); setMessage('Cancellation could not be confirmed. Refresh before continuing.'); }
    } finally { if (generation === requestGeneration.current) setBusy(false); }
  }

  const disabled = busy || refreshRequired;
  const selected = view?.sources.find(source => source.id === sourceId);
  return (
    <section style={section} aria-labelledby={`${prefix}-heading`} aria-busy={busy}>
      <h2 id={`${prefix}-heading`} style={{ marginTop: 0 }}>Your guide memory</h2>
      <p><strong>{view ? (view.enabled ? 'Memory is on for reviewed notes.' : 'Memory is off.') : unavailable ? 'Memory is off.' : 'Memory status is not yet confirmed.'}</strong> Your guide saves no new personal memory automatically. Review each proposed note before saving it.</p>
      <p>Conversation history is separate. Turning memory off or removing a note does not erase your conversations or information already sent to a provider. Legacy profiles and inferred emotions are not enrolled in this workflow.</p>
      <p role="status" aria-live="polite">{message}</p>
      <button style={secondary} disabled={busy} onClick={() => void load()}>Refresh memory status</button>
      {requestingSuggestions && <button style={{ ...secondary, marginLeft: 10 }} onClick={() => void cancelInFlight()}>Cancel suggestion request</button>}
      {unavailable && <p>These controls will become available after private storage and the processing connection are reviewed. Nothing is activated by opening this page.</p>}
      {view && <>
        <div style={{ margin: '1.25rem 0' }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'start' }}>
            <input type="checkbox" checked={view.enabled} disabled={disabled} onChange={event => void act({ action: 'set-enabled', enabled: event.target.checked })} style={{ marginTop: 5 }} />
            Use my reviewed notes in private guide conversations. Shared salons and Council replies do not use them.
          </label>
        </div>
        <div style={{ borderTop: '1px solid #555', paddingTop: '1rem' }}>
          <h3>Prepare suggestions</h3>
          <label htmlFor={`${prefix}-source`}>Private conversation</label>
          <select id={`${prefix}-source`} value={sourceId} style={field} disabled={disabled || view.preparing} onChange={event => { setSourceId(event.target.value); setConsent(false); }}>
            {!view.sources.length && <option value="">No eligible private conversation</option>}
            {view.sources.map(source => <option value={source.id} key={source.id}>{source.label}</option>)}
          </select>
          <p>Only your own messages from this conversation will be used. {view.processing.providerName} will prepare suggestions at {view.processing.destination}. This permits one request; failures are not retried automatically. Suggestions expire for review after 30 minutes and are never included in guide recall before you save them.</p>
          <label style={{ display: 'flex', gap: 10, alignItems: 'start', marginBottom: 12 }}>
            <input type="checkbox" checked={consent} disabled={disabled || view.preparing} onChange={event => setConsent(event.target.checked)} style={{ marginTop: 5 }} />
            I want suggestions from these messages using the processing described above. I will review each note before saving.
          </label>
          <button style={button} disabled={disabled || !selected || !consent || view.preparing} onClick={() => selected && void act({ action: 'prepare', sourceId: selected.id, sourceRevision: selected.revision,
            consent: { version: view.processing.version, purpose: view.processing.purpose, providerId: view.processing.providerId,
              providerName: view.processing.providerName, destination: view.processing.destination, allowOneRequest: true } })}>
            {view.preparing ? 'Suggestions requested' : 'Prepare memory suggestions'}
          </button>
        </div>
        {(view.candidates.length > 0 || view.preparing) && <div style={{ borderTop: '1px solid #555', marginTop: 20, paddingTop: 16 }}>
          <h3>Review before saving</h3>
          {view.candidates.map(candidate => <article key={candidate.id} style={{ border: '1px solid #777', padding: 14, marginBottom: 14 }}>
            <label htmlFor={`${prefix}-${candidate.id}`}>{candidate.category.charAt(0).toUpperCase() + candidate.category.slice(1)}</label>
            <textarea id={`${prefix}-${candidate.id}`} value={edits[candidate.id] ?? candidate.text} maxLength={400} rows={3} style={field} disabled={disabled}
              onChange={event => setEdits(current => ({ ...current, [candidate.id]: event.target.value }))} />
            <p>From {view.sources.find(source => source.id === candidate.sourceId)?.label || 'your private conversation'}. Edit any inaccurate wording before saving.</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button style={button} disabled={disabled || !(edits[candidate.id] ?? candidate.text).trim()} onClick={() => void act({ action: 'accept', candidateId: candidate.id, text: edits[candidate.id] ?? candidate.text })}>Save this reviewed memory</button>
              <button style={secondary} disabled={disabled} onClick={() => void act({ action: 'reject', candidateId: candidate.id })}>Reject suggestion</button>
            </div>
          </article>)}
          <button style={secondary} disabled={disabled} onClick={() => void act({ action: 'cancel' })}>Cancel remaining review</button>
        </div>}
        <div style={{ borderTop: '1px solid #555', marginTop: 20, paddingTop: 16 }}>
          <h3>Saved, reviewed notes</h3>
          {!view.memories.length && <p>No reviewed memories saved.</p>}
          {view.memories.map(memory => <article key={memory.id} style={{ border: '1px solid #777', padding: 14, marginBottom: 14 }}>
            <p>{memory.text}</p>
            <p>Reviewed {new Date(memory.approvedAt).toLocaleString()}{memory.edited ? ' · edited before saving' : ''}. Used only for this private guide when memory is on and its source remains eligible.</p>
            <button style={secondary} disabled={disabled} onClick={() => void act({ action: 'forget', memoryId: memory.id })}>Remove from guide memory</button>
          </article>)}
        </div>
      </>}
    </section>
  );
}
