'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { deletionReceiptProgress, parseDeletionCode, parseDeletionOwner, parseDeletionReceipt, type DeletionOwner, type DeletionReceipt } from '@/lib/account/deletion-contract';
import { currentBrowserAuthIntent } from '@/lib/auth/browserIntent';
import { subscribeAuthProviderChanges } from '@/lib/auth/providerSelection';
import styles from '../profile/profile.module.css';

const endpoint = '/api/account/deletion';
const uncertain = 'The request may have been received. Check with your saved status code or retry the same request.';

type Review = { owner: DeletionOwner; label: string; intent: string; days: number | null; request: DeletionReceipt | null };
type Draft = { review: Review; code: string };
type Reply = { owner?: unknown; label?: unknown; reviewDays?: unknown; request?: unknown; error?: unknown };

function RequestReceipt({ value }: { value: DeletionReceipt }) {
  const progress = deletionReceiptProgress(value);
  return <div className={styles.preview}>
    <strong>{progress === 'processing' ? 'Account deletion processing has started.'
      : progress === 'recorded' ? 'Request received. No processing start is recorded.'
        : 'Request received. Processing status is unavailable.'}</strong>
    <p>{progress === 'unknown' ? 'This older receipt does not show whether processing has started. '
      : progress === 'recorded' ? 'This reflects the latest recorded status; processing may begin after this check. '
        : 'Account access may be restricted while processing continues. '}This receipt does not confirm final deletion.</p>
    <dl>
      <dt>Request reference</dt><dd>{value.id}</dd>
      <dt>Received</dt><dd><time dateTime={value.requestedAt}>{new Date(value.requestedAt).toLocaleString()}</time></dd>
      <dt>Review due by</dt><dd><time dateTime={value.reviewBy}>{new Date(value.reviewBy).toLocaleString()}</time></dd>
      {progress === 'processing' && value.processingStartedAt && <><dt>Processing started</dt><dd><time dateTime={value.processingStartedAt}>{new Date(value.processingStartedAt).toLocaleString()}</time></dd></>}
    </dl>
  </div>;
}

export default function AccountDeletionForm({ intakeEnabled }: { intakeEnabled: boolean }) {
  const live = useRef<{ active: boolean; pending: AbortController | null; review: Review | null; draft: Draft | null }>({
    active: false, pending: null, review: null, draft: null,
  });
  const [review, setReview] = useState<Review | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [statusCode, setStatusCode] = useState('');
  const [checked, setChecked] = useState<DeletionReceipt | null>(null);
  const [submitted, setSubmitted] = useState<DeletionReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const view = live.current;
    const ready = () => { view.active = document.visibilityState === 'visible' && navigator.onLine; };
    function clear() {
      const pending = view.pending;
      view.pending = null;
      pending?.abort();
      view.review = null;
      view.draft = null;
      setReview(null);
      setDraft(null);
      setConfirmation('');
      setStatusCode('');
      setChecked(null);
      setSubmitted(null);
      setNotice('');
      setBusy(false);
    }
    function retire() { view.active = false; clear(); }
    function onVisibility() { if (document.visibilityState === 'visible') ready(); else retire(); }
    const unsubscribe = subscribeAuthProviderChanges(clear);
    window.addEventListener('blur', retire);
    window.addEventListener('focus', ready);
    window.addEventListener('pagehide', retire);
    window.addEventListener('pageshow', ready);
    window.addEventListener('offline', retire);
    window.addEventListener('online', ready);
    document.addEventListener('visibilitychange', onVisibility);
    ready();
    return () => {
      view.active = false;
      view.pending?.abort();
      view.pending = null;
      view.review = null;
      view.draft = null;
      unsubscribe();
      window.removeEventListener('blur', retire);
      window.removeEventListener('focus', ready);
      window.removeEventListener('pagehide', retire);
      window.removeEventListener('pageshow', ready);
      window.removeEventListener('offline', retire);
      window.removeEventListener('online', ready);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  async function request(
    data: Record<string, unknown> | undefined,
    receive: (reply: Reply) => void,
    fallback: string,
    signedIn = false,
  ) {
    const view = live.current;
    if (!view.active || view.pending) return;
    const intent = signedIn ? currentBrowserAuthIntent() : null;
    const controller = new AbortController();
    const current = () => view.pending === controller && view.active;
    const accountChanged = () => signedIn && currentBrowserAuthIntent() !== intent;
    view.pending = controller;
    setBusy(true);
    setNotice('');
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(endpoint, {
        method: data ? 'POST' : 'GET', mode: 'same-origin', redirect: 'error',
        credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        ...(data ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}),
      });
      const reply: Reply | null = await response.json();
      if (!current()) return;
      if (accountChanged()) {
        view.review = null; view.draft = null;
        setReview(null); setDraft(null); setConfirmation(''); setSubmitted(null);
        setNotice('Your sign-in changed. Check the account again.');
        return;
      }
      if (controller.signal.aborted || !reply || typeof reply !== 'object') throw Error('Unavailable response');
      if (response.ok) receive(reply);
      else setNotice(typeof reply.error === 'string' && response.status < 500 ? reply.error : fallback);
    } catch {
      if (current()) setNotice(fallback);
    } finally {
      clearTimeout(timer);
      if (current()) {
        view.pending = null;
        setBusy(false);
      }
    }
  }

  function checkAccount() {
    const view = live.current;
    if (!intakeEnabled || !view.active || view.pending) return;
    view.review = null; view.draft = null;
    setReview(null); setDraft(null); setConfirmation(''); setSubmitted(null);
    const intent = currentBrowserAuthIntent();
    void request(undefined, reply => {
      const owner = parseDeletionOwner(reply.owner);
      const receipt = parseDeletionReceipt(reply.request);
      const days = reply.reviewDays;
      if (!intent || !owner || typeof reply.label !== 'string' || reply.label.length > 254 ||
          (reply.request !== null && !receipt) ||
          (days !== null && (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 30))) {
        throw Error('Unexpected account response');
      }
      const next = { owner, label: reply.label, intent, days, request: receipt };
      view.review = next;
      setReview(next);
    }, 'Your account could not be checked. Try again.', true);
  }

  function prepare() {
    const view = live.current;
    if (!view.active || view.pending || view.draft || !review || view.review !== review || review.days === null || review.request) return;
    if (currentBrowserAuthIntent() !== review.intent) {
      view.review = null; setReview(null); setNotice('Your sign-in changed. Check the account again.');
      return;
    }
    try {
      const secret = Array.from(window.crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
      const code = `${window.crypto.randomUUID()}.${secret}`;
      if (!parseDeletionCode(code)) throw Error('Status code unavailable');
      view.draft = { review, code };
      setDraft(view.draft);
      setNotice('');
    } catch {
      setNotice('Your browser could not prepare a private status code.');
    }
  }

  async function copyCode() {
    const view = live.current;
    const current = () => draft && view.active && view.review === draft.review && currentBrowserAuthIntent() === draft.review.intent;
    if (!draft || !current()) return;
    try {
      await navigator.clipboard.writeText(draft.code);
      if (current()) setNotice('Private status code copied.');
    } catch {
      if (current()) setNotice('Select the displayed code to copy it.');
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const view = live.current;
    if (!draft || view.draft !== draft || view.review !== draft.review || confirmation !== 'DELETE' || submitted) return;
    if (currentBrowserAuthIntent() !== draft.review.intent) {
      view.review = null; view.draft = null; setReview(null); setDraft(null); setConfirmation('');
      setNotice('Your sign-in changed. Check the account again.');
      return;
    }
    void request({ action: 'request', code: draft.code, owner: draft.review.owner, confirmation: 'DELETE' }, reply => {
      const receipt = parseDeletionReceipt(reply.request);
      if (!receipt || receipt.id !== parseDeletionCode(draft.code)?.id) throw Error('Unexpected receipt');
      setSubmitted(receipt);
      view.draft = null;
      setConfirmation('');
    }, uncertain, true);
  }

  function checkStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!live.current.active || live.current.pending) return;
    const code = statusCode.trim();
    const expected = parseDeletionCode(code);
    setChecked(null);
    if (!expected) { setNotice('Enter the complete status code.'); return; }
    void request({ action: 'status', code }, reply => {
      const receipt = parseDeletionReceipt(reply.request);
      if (!receipt || receipt.id !== expected.id) throw Error('Unexpected receipt');
      setStatusCode('');
      setChecked(receipt);
    }, 'The request status is temporarily unavailable. Try again.');
  }

  return <div className={styles.editor}>
    <p className={notice || busy ? styles.status : undefined} role="status" aria-live="polite">{notice || (busy ? 'Checking…' : '')}</p>
    {intakeEnabled && <section aria-labelledby="request-deletion">
      <h2 id="request-deletion">Request deletion</h2>
      <button type="button" disabled={busy} onClick={checkAccount}>Check my account</button>
      {review && <>
        <p>Signed in as <strong><bdi>{review.label}</bdi></strong>.</p>
        {review.request && <RequestReceipt value={review.request}/>}
        {!review.request && review.days === null && <p>New deletion requests are currently unavailable here.</p>}
        {!review.request && review.days !== null && !draft && <p><button type="button" disabled={busy} onClick={prepare}>Prepare deletion request</button></p>}
      </>}
      {draft && <div className={styles.preview}>
        <p>Save this private status code before submitting. You can use it to check your request without signing in. Anyone with the code can see the request status.</p>
        <p><output aria-label="Private status code"><code>{draft.code}</code></output></p>
        <p><button type="button" disabled={busy} onClick={() => void copyCode()}>Copy status code</button></p>
        {submitted ? <RequestReceipt value={submitted}/> : <form className={styles.fields} onSubmit={submit} autoComplete="off">
          <p>We aim to review your request within {draft.review.days} days. Submitting a request does not immediately delete your data. Account access may be restricted once processing begins.</p>
          <div className={styles.field}>
            <label htmlFor="deletion-confirmation">Type DELETE to confirm</label>
            <input id="deletion-confirmation" autoComplete="off" spellCheck={false} maxLength={6}
              value={confirmation} onChange={event => setConfirmation(event.target.value)}/>
          </div>
          <button type="submit" disabled={busy || confirmation !== 'DELETE'}>Submit deletion request</button>
        </form>}
      </div>}
    </section>}
    <section aria-labelledby="check-deletion">
      <h2 id="check-deletion">Check a request</h2>
      <form className={styles.fields} onSubmit={checkStatus} autoComplete="off">
        <div className={styles.field}>
          <label htmlFor="deletion-status-code">Private status code</label>
          <input id="deletion-status-code" type="password" autoComplete="off" spellCheck={false} maxLength={120}
            value={statusCode} onChange={event => setStatusCode(event.target.value)}/>
        </div>
        <button type="submit" disabled={busy || !statusCode.trim()}>Check request status</button>
      </form>
      {checked && <RequestReceipt value={checked}/>}
    </section>
  </div>;
}
