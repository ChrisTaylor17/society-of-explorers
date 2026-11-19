'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useReviewAccess } from '@/lib/circles/useReviewAccess';
import { parseSupporterOffer, parseSupporterReceipt, parseSupporterReturn, parseSupporterStatus, supporterDestination, SUPPORTER_OFFER_ID, SUPPORTER_TERMS_VERSION, type SupporterMode, type SupporterOffer, type SupporterOperation, type SupporterReceipt, type SupporterStatus } from '@/lib/supporter/contracts';
import { checkoutErrorMessage, SUPPORTER_SIGNIN_PATH, SUPPORTER_SIGNUP_PATH } from '@/lib/join/content';
import { body, button, card, h2, primary, small } from '@/lib/circles/ui';
import styles from './supporter.module.css';

type RequestCapture = { operation: SupporterOperation; mode: SupporterMode | null; recovery?: boolean; body: { requestId: string; expectedRevision: number; expectedMode: SupporterMode; reviewToken: string; offerId?: string; termsVersion?: string } };
type Review = SupporterOperation | 'recovery';
type Destination = { receipt: SupporterReceipt; mode: SupporterMode | null };
type PublicOffer = { status: 'loading' | 'error' } | { status: 'ok'; offer: SupporterOffer };
const statusCopy: Record<SupporterStatus['status'], string> = {
  none: 'No current subscription was found in this billing check.',
  pending: 'A billing attempt is still pending. Do not start another subscription while its outcome is unresolved.',
  active: 'Your supporter subscription is currently active.',
  ending: 'Your supporter subscription is set to end after the current billing period.',
  attention: 'Your billing needs attention. Review your own billing management options before making another purchase.',
  review: 'Your billing needs individual review. A new subscription is not being offered from this state.',
  unavailable: 'Current billing could not be confirmed. An empty subscription history is not being assumed.',
};

export default function SupporterBilling({ mode, attemptId = null }: { mode: 'join' | 'billing' | 'return'; attemptId?: string | null }) {
  const [publicOffer, setPublicOffer] = useState<PublicOffer>({ status: 'loading' });
  const [offerAttempt, setOfferAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<SupporterStatus | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<RequestCapture | null>(null);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [notice, setNotice] = useState(mode === 'return' ? 'No payment or subscription change is assumed. Check this return attempt explicitly.' : 'Your private billing status has not been loaded. Check it explicitly before continuing.');
  const sending = useRef(false);
  const retire = useCallback(() => {
    setSnapshot(null); setReview(null); setConfirmed(false); setPending(null); setDestination(null); sending.current = false;
    setNotice('Private billing details, confirmation and local retry request cleared. Load current billing status to continue. A request already sent may still have completed.');
  }, []);
  const { active, busy, perform } = useReviewAccess(retire);
  const disabled = !active || busy;
  const offer = publicOffer.status === 'ok' ? publicOffer.offer : null;
  const focusReview = useCallback((element: HTMLHeadingElement | null) => element?.focus({ preventScroll: true }), []);

  useEffect(() => {
    if (mode !== 'join') return;
    let current = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      setPublicOffer({ status: 'loading' });
      try {
        const value = await Promise.race([
          fetch('/api/supporter/offer', { method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal }).then(async response => { if (!response.ok) throw new Error('Offer unavailable'); return response.json(); }),
          new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Offer deadline')); }, 15_000); }),
        ]);
        if (!current) return;
        const checked = parseSupporterOffer(value);
        if (!checked) throw new Error('Offer changed');
        setPublicOffer({ status: 'ok', offer: checked });
      } catch { if (current) setPublicOffer({ status: 'error' }); }
      finally { if (timer) clearTimeout(timer); }
    }
    void load();
    return () => { current = false; controller.abort(); if (timer) clearTimeout(timer); };
  }, [mode, offerAttempt]);

  function unavailable(status?: number) {
    setSnapshot(null); setReview(null); setConfirmed(false); setDestination(null);
    if (status === 401 || status === 403) setPending(null);
    setNotice(checkoutErrorMessage(status || 503));
  }
  function read(operation: Review | null = null) {
    if (disabled || sending.current) return;
    setSnapshot(null); setReview(null); setConfirmed(false); setDestination(null);
    setNotice('Checking your current billing state…');
    void perform('/api/supporter/status', { method: 'GET' }, ({ status, body: value }) => {
      const current = status === 200 ? parseSupporterStatus(value) : null;
      if (!current) return unavailable(status);
      setSnapshot(current);
      const resolved = pending && (pending.operation === 'checkout'
        ? current.pendingAttempt === null && (['active', 'ending'].includes(current.status) || pending.recovery && current.status === 'none')
        : current.canManage && (current.pendingAttempt === null || current.pendingAttempt.operation === 'portal' && current.pendingAttempt.requestId === pending.body.requestId));
      if (resolved) setPending(null);
      if (operation) {
        const allowed = operation === 'recovery' ? current.pendingAttempt?.operation === 'checkout' && current.mode !== null : operation === 'checkout' ? mode === 'join' && offer?.salesOpen && current.canCheckout && !current.legacy && !current.pendingAttempt && current.mode !== null && current.mode === offer.mode : current.canManage && current.mode !== null;
        if (!allowed || pending && !resolved) { setNotice('These billing options changed or an earlier request is unresolved. Review current status before continuing.'); return; }
        setReview(operation); setNotice(operation === 'recovery' ? 'Current billing checked. Review recovery of the same earlier checkout request.' : operation === 'checkout' ? 'Current billing checked. Review the monthly support terms before preparing checkout.' : 'Current billing checked. Review what opening billing management will do.');
      } else setNotice('Current billing status loaded. Review it before choosing your next action.');
    }, () => unavailable());
  }
  function checkReturn() {
    if (disabled || sending.current || !attemptId) return;
    setSnapshot(null); setReview(null); setConfirmed(false); setDestination(null);
    setNotice('Checking this attempt against your own current billing state…');
    void perform(`/api/supporter/return?attempt=${encodeURIComponent(attemptId)}`, { method: 'GET' }, ({ status, body: value }) => {
      const current = status === 200 ? parseSupporterReturn(value) : null;
      if (!current) return unavailable(status);
      setSnapshot(current);
      setNotice(current.returnState === 'confirmed' ? 'This return attempt was verified against your own current billing state. Your subscription status is shown below.' : current.returnState === 'pending' ? 'This attempt is still pending. A payment or subscription change has not been confirmed. Check again manually later.' : 'This attempt could not be confirmed and needs review. A payment or subscription change is not being assumed.');
    }, () => unavailable());
  }
  function send(request: RequestCapture) {
    if (disabled || sending.current) return;
    sending.current = true; setReview(null); setConfirmed(false); setSnapshot(null); setDestination(null); setPending(null);
    setNotice(request.operation === 'checkout' ? 'Preparing your checkout session…' : 'Preparing your own billing portal session…');
    const uncertain = () => { setPending(request); setNotice('The billing reply could not be confirmed. The request may have completed. Retry this exact request manually or load current billing status before doing anything else.'); };
    void perform(`/api/supporter/${request.operation}`, { method: 'POST', body: JSON.stringify(request.body) }, ({ status, body: value }) => {
      sending.current = false;
      const receipt = status === 200 || status === 201 ? parseSupporterReceipt(value, { requestId: request.body.requestId, operation: request.operation }) : null;
      if (receipt && receipt.revision >= request.body.expectedRevision && receipt.mode === request.body.expectedMode && receipt.reviewToken === request.body.reviewToken) {
        if (receipt.outcome === 'ready' && supporterDestination(receipt.url, request.operation)) {
          setDestination({ receipt, mode: request.mode });
          setNotice(request.operation === 'checkout' ? 'Your checkout session is ready. A subscription or payment has not been confirmed. Continue to Stripe only when you are ready.' : 'Your billing portal session is ready. Open it explicitly to review your own subscription and available management options.');
        } else { setPending(request); setNotice('Session preparation is pending. Retry this exact request manually or load current billing status. No payment or subscription change is being assumed.'); }
      } else if ([400, 401, 403, 409, 413, 429].includes(status)) unavailable(status);
      else uncertain();
    }, () => { sending.current = false; uncertain(); });
  }
  function confirmRequest() {
    if (!review || !confirmed || !snapshot || pending || disabled) return;
    if (review === 'checkout' && (!offer?.salesOpen || !snapshot.canCheckout || snapshot.legacy || snapshot.mode === null || snapshot.mode !== offer.mode)) return;
    if (review === 'portal' && (!snapshot.canManage || snapshot.mode === null)) return;
    if (review === 'recovery' && snapshot.pendingAttempt?.operation !== 'checkout') return;
    if (snapshot.mode === null) return;
    const recovery = review === 'recovery', operation = review === 'portal' ? 'portal' : 'checkout';
    send({ operation, recovery, mode: snapshot.mode, body: { requestId: recovery ? snapshot.pendingAttempt!.requestId : crypto.randomUUID(), expectedRevision: snapshot.revision, expectedMode: snapshot.mode, reviewToken: snapshot.reviewToken, ...(operation === 'checkout' ? { offerId: SUPPORTER_OFFER_ID, termsVersion: SUPPORTER_TERMS_VERSION } : {}) } });
  }
  const returnPath = mode === 'join' ? '/join?intent=supporter' : mode === 'return' && attemptId ? `/billing/return?attempt=${encodeURIComponent(attemptId)}` : '/billing';
  const signin = mode === 'join' ? SUPPORTER_SIGNIN_PATH : `/login?next=${encodeURIComponent(returnPath)}`;
  const signup = mode === 'join' ? SUPPORTER_SIGNUP_PATH : `/login?mode=signup&next=${encodeURIComponent(returnPath)}`;
  return <div className={`${styles.scope} ${styles.stack}`}>
    {mode === 'join' && <div aria-label="Public supporter availability">
      <p role="status" style={body}>{publicOffer.status === 'loading' ? 'Checking public supporter availability…' : publicOffer.status === 'error' ? 'Supporter availability could not be checked. New checkout requests are blocked until it can be checked.' : offer?.salesOpen ? 'This server currently permits new supporter requests. Final availability and terms are checked again before checkout.' : 'New supporter purchases are currently closed. Existing subscription management is checked separately.'}</p>
      {offer?.mode === 'test' && <p style={body}>Test environment. Any available checkout here is a test flow.</p>}
      {publicOffer.status !== 'loading' && <button type="button" style={button} onClick={() => { setReview(null); setConfirmed(false); setSnapshot(null); setDestination(null); setOfferAttempt(value => value + 1); }}>{publicOffer.status === 'error' ? 'Retry public availability' : 'Refresh public availability'}</button>}
    </div>}
    <p role="status" aria-live="polite" style={body}>{notice}</p>
    <div className={styles.row}><Link href={signin}>Sign in</Link><Link href={signup}>Create a free account</Link>{mode === 'join' && <Link href="/billing">Manage an existing subscription</Link>}</div>
    <div className={styles.row}>
      <button type="button" style={button} disabled={disabled} onClick={() => read()}>{mode === 'join' ? 'Check supporter options' : 'Load current billing status'}</button>
      {mode === 'return' && <button type="button" style={button} disabled={disabled || !attemptId} onClick={checkReturn}>Check this return attempt</button>}
      {pending && <button type="button" style={button} disabled={disabled} onClick={() => send(pending)}>Retry exact billing request</button>}
    </div>
    {mode === 'return' && !attemptId && <p style={body}>A valid return attempt was not supplied. Load your current billing status instead; no result can be inferred from this URL.</p>}
    {snapshot && <section aria-label="Your current billing status" className={styles.stack} style={card}>
      <h2 style={{ ...h2, marginTop: 0 }}>Current billing status</h2>
      {snapshot.legacy && <p style={body}>An older membership is linked to this account. It has not been renamed or migrated to the supporter plan.</p>}
      <p style={body}>{snapshot.legacy ? 'This check does not report the payment status of your older membership. Use your verified billing management options.' : statusCopy[snapshot.status]}</p>
      {snapshot.mode === 'test' && <p style={body}>This is test billing status, not evidence of a live payment.</p>}
      {snapshot.currentPeriodEnd && <p style={small}>Current period ends: <time dateTime={snapshot.currentPeriodEnd}>{new Date(snapshot.currentPeriodEnd).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}</time>.</p>}
      {snapshot.cancelAtPeriodEnd && <p style={small}>Cancellation at the end of the current period is recorded.</p>}
      {snapshot.pendingAttempt && <div><p style={body}>A prior {snapshot.pendingAttempt.operation === 'checkout' ? 'checkout' : 'billing portal'} attempt is unresolved or still open. Its existence does not confirm a payment. Check its return using your own account, or retry only an exact request retained in this page.</p><Link href={`/billing/return?attempt=${encodeURIComponent(snapshot.pendingAttempt.attemptId)}`}>Check the prior billing attempt</Link></div>}
      <div className={styles.row}>
        {snapshot.pendingAttempt?.operation === 'checkout' && <button type="button" style={button} disabled={disabled || !!pending || snapshot.mode === null} onClick={() => read('recovery')}>Review pending checkout recovery</button>}
        {mode === 'join' && <button type="button" style={primary} disabled={disabled || !!pending || !offer?.salesOpen || !snapshot.canCheckout || snapshot.legacy || snapshot.mode === null || snapshot.mode !== offer.mode} onClick={() => read('checkout')}>Review supporter subscription</button>}
        <button type="button" style={button} disabled={disabled || !!pending || !snapshot.canManage || snapshot.mode === null} onClick={() => read('portal')}>Review billing management</button>
      </div>
      {!snapshot.canManage && <p style={small}>A billing management session is not currently available from this check. This does not establish that you have no older subscription.</p>}
    </section>}
    {review && snapshot && <section aria-label="Review billing request" className={styles.stack} style={card}>
      <h2 ref={focusReview} tabIndex={-1} style={{ ...h2, marginTop: 0 }}>{review === 'recovery' ? 'Review the pending checkout attempt' : review === 'checkout' ? 'Review optional monthly support' : 'Review billing management'}</h2>
      <p style={body}>{review === 'recovery' ? 'This checks or continues the same earlier $10 USD monthly supporter request using its existing request ID. When new sales are closed, recovery can only check or resolve a session that already exists. It does not confirm a payment. Review any available Stripe terms before subscribing.' : review === 'checkout' ? 'You are proposing a $10 USD monthly supporter subscription. It contributes toward free books, Circles and community infrastructure; everyone keeps the same free access. Confirming prepares a Stripe checkout session. Stripe shows the final terms before you subscribe.' : 'Confirming prepares your own Stripe billing portal session. You will choose separately whether to open it. Review any cancellation, payment-method or subscription change inside Stripe before confirming it there.'}</p>
      {snapshot.mode === 'test' && <p style={body}>This is a test flow, not a live subscription purchase.</p>}
      {review !== 'portal' && <p style={small}>Review the final amount, any displayed tax, recurring terms and available cancellation options in Stripe. No tax-deductibility claim is made.</p>}
      <label className={styles.check}><input type="checkbox" checked={confirmed} disabled={disabled} onChange={event => setConfirmed(event.target.checked)} /><span>{review === 'recovery' ? 'I want to check or continue this same earlier checkout request.' : review === 'checkout' ? 'I reviewed the optional monthly support terms and want to prepare checkout.' : 'I want to prepare my own billing management session.'}</span></label>
      <div className={styles.row}><button type="button" style={primary} disabled={disabled || !confirmed} onClick={confirmRequest}>{review === 'recovery' ? 'Confirm pending checkout recovery' : review === 'checkout' ? 'Confirm and prepare checkout' : 'Confirm and prepare billing portal'}</button><button type="button" style={button} disabled={disabled} onClick={() => { setReview(null); setConfirmed(false); }}>Cancel this review</button></div>
    </section>}
    {destination?.receipt.url && <section aria-label="Prepared Stripe session" className={styles.stack} style={card}>
      <p style={body}>{destination.mode === 'test' ? 'Test session prepared.' : 'Session prepared.'} Preparing this link does not confirm payment or a subscription change.</p>
      <a href={destination.receipt.url} style={primary} rel="noreferrer">{destination.receipt.operation === 'checkout' ? 'Continue to Stripe checkout' : 'Open my Stripe billing portal'}</a>
      <Link href={`/billing/return?attempt=${encodeURIComponent(destination.receipt.attemptId)}`}>Check this attempt after returning</Link>
    </section>}
  </div>;
}
