'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GREAT_BOOKS } from '@/lib/books/catalog';
import { parseBookPassage, parsePassageComposeIntent, parsePassageReference, passageCatalog, passageComposeHref, passageReaderHref, samePassageReference, type BookPassage, type PassageReference } from '@/lib/books/passages';
import { parseMyCircles, type MyCircles } from '@/lib/circles/membership';
import { parsePassageAccess, parsePassageLookup, parsePassagePreview, parsePassageReceipt, type PassagePostInput, type PassagePreview, type PassageReceipt } from '@/lib/circles/passage';
import { useReviewAccess } from '@/lib/circles/useReviewAccess';
import { isUuid } from '@/lib/ids/uuid';
import { body, button, card, fieldLabel, h2, input, primary, small } from '@/lib/circles/ui';
import { PassageSource, passageSourceUrl } from '@/app/great-books/PassageContext';
import styles from './passage.module.css';

type Pending = { circleId: string; request: PassagePostInput; body: string; content: string };
const pins = passageCatalog();
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export default function PassageComposer({ search = '' }: { search?: string }) {
  return <Composer key={search} search={search} />;
}
function Composer({ search }: { search: string }) {
  const intent = parsePassageComposeIntent(new URLSearchParams(search));
  const initial = !intent.invalid && intent.reference ? intent.reference : { version: 1 as const, bookId: 'hamlet', editionId: pins.find(pin => pin.bookId === 'hamlet')!.editionId, blockIndex: 0, start: null, end: null };
  const [reference, setReference] = useState<PassageReference>(initial), [block, setBlock] = useState(String(initial.blockIndex + 1));
  const [source, setSource] = useState<BookPassage | null>(null), [sourceBusy, setSourceBusy] = useState(false);
  const [circle, setCircle] = useState(intent.invalid ? '' : intent.circleId || ''), [access, setAccess] = useState<string | null>(null);
  const [circles, setCircles] = useState<MyCircles | null>(null), [comment, setComment] = useState('');
  const [preview, setPreview] = useState<PassagePreview | null>(null), [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null), [receipt, setReceipt] = useState<PassageReceipt | null>(null);
  const [notice, setNotice] = useState(intent.invalid ? 'This source link is invalid or has duplicate or unsupported parameters. Choose a source below; no reference or Circle access has been assumed.' : 'Choose a source, then verify it.');
  const sourceController = useRef<AbortController | null>(null), mounted = useRef(false), sending = useRef(false);
  const clearReview = useCallback(() => { setPreview(null); setConfirmed(false); setReceipt(null); }, []);
  const retire = useCallback(() => {
    sourceController.current?.abort(); sourceController.current = null; setSourceBusy(false);
    setAccess(null); setCircles(null); setComment(''); setPreview(null); setConfirmed(false); setPending(null); setReceipt(null); sending.current = false;
    setNotice('Private Circle details, comment and review cleared. A request already sent may still have been saved. Nothing will retry automatically.');
  }, []);
  const { active, busy, perform } = useReviewAccess(retire);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; sourceController.current?.abort(); }; }, []);
  const disabled = !active || busy || sourceBusy || Boolean(pending);
  const sourceDisabled = busy || sourceBusy || Boolean(pending);
  const pin = pins.find(value => value.bookId === reference.bookId)!;
  const currentEdition = reference.editionId === pin.editionId;
  const validBlock = /^(0|[1-9][0-9]*)$/.test(block) && Number(block) >= 1 && Number(block) <= pin.blockCount;
  const returnReference = validBlock ? parsePassageReference({ ...reference, blockIndex: Number(block) - 1 }) : null;
  const signInHref = `/login?next=${encodeURIComponent(passageComposeHref(returnReference, isUuid(circle) ? circle.toLowerCase() : null))}`;
  const commentLimit = source?.commentLimit ?? 0;
  const focusReview = useCallback((element: HTMLHeadingElement | null) => { element?.focus({ preventScroll: true }); }, []);
  function changeReference(next: PassageReference) {
    sourceController.current?.abort(); sourceController.current = null; setSourceBusy(false);
    setReference(next); setSource(null); setAccess(null); setComment(''); clearReview(); setNotice('Source changed. Verify it again before continuing.');
  }
  function privateFailure(status?: number) {
    setAccess(null); setCircles(null); setComment(''); clearReview();
    setNotice(status === 401 ? 'Sign in or create a free account, then check Circle access again.' : status === 403 || status === 404 ? 'This Circle is unavailable for this account. Choose a current Circle and check access again.' : status === 429 ? 'Too many requests. Wait before trying again.' : 'Current Circle access could not be confirmed. Check it again manually.');
  }
  async function verifySource() {
    if (sourceBusy || busy || pending || sourceController.current || !validBlock) return;
    const selected = parsePassageReference({ ...reference, blockIndex: Number(block) - 1 });
    if (!selected) return;
    const owned = new AbortController(); sourceController.current = owned; setSourceBusy(true); setSource(null); setAccess(null); setComment(''); clearReview(); setNotice('Verifying the exact local edition and source block…');
    const deadline = setTimeout(() => { owned.abort(); if (mounted.current && sourceController.current === owned) { sourceController.current = null; setSourceBusy(false); setNotice('Source verification timed out. Try again manually.'); } }, 15_000);
    try {
      const response = await fetch(passageSourceUrl(selected), { credentials: 'omit', cache: 'no-store', redirect: 'error', signal: owned.signal });
      const value: unknown = response.ok ? await response.json() : null;
      if (!mounted.current || owned.signal.aborted || sourceController.current !== owned) return;
      const current = parseBookPassage(value);
      if (!current || !samePassageReference(current.reference, selected)) return setNotice('This source could not be verified. If the edition changed, explicitly choose the current edition. No quotation has been accepted.');
      setReference(selected); setSource(current); setNotice('Source verified. Choose a Circle and check your current access.');
    } catch { if (mounted.current && !owned.signal.aborted) setNotice('The source could not be verified. Try again manually.'); }
    finally { clearTimeout(deadline); if (sourceController.current === owned) { sourceController.current = null; if (mounted.current) setSourceBusy(false); } }
  }
  function chooseCircle(value: string) { setCircle(value); setAccess(null); setComment(''); clearReview(); setNotice('Circle changed. Check current access before writing your comment.'); }
  function loadCircles(after?: string) {
    if (disabled) return;
    setCircles(null); clearReview(); setNotice('Loading your current Circles…');
    void perform(`/api/circles/mine${after ? `?after=${encodeURIComponent(after)}` : ''}`, { method: 'GET' }, ({ status, body: value }) => {
      const page = status === 200 ? parseMyCircles(value, { after }) : null;
      if (!page || page.nextCursor && page.nextCursor === after) return privateFailure(status);
      setCircles(page); setNotice('Choose a Circle, then check access. A listing alone does not authorize posting.');
    }, () => privateFailure());
  }
  function checkAccess() {
    if (disabled || !source || !isUuid(circle)) return;
    const target = circle.toLowerCase(); setAccess(null); setComment(''); clearReview(); setNotice('Checking current Circle membership and visibility…');
    void perform(`/api/circles/${target}/passages`, { method: 'GET' }, ({ status, body: value }) => {
      const current = status === 200 ? parsePassageAccess(value) : null;
      if (!current || current.circleId !== target) return privateFailure(status);
      setCircle(target); setAccess(target); setNotice('Current access checked. Add your own comment; the server checks access again before posting.');
    }, () => privateFailure());
  }
  function review() {
    if (disabled || !source || access !== circle || !comment.trim() || comment.trim().length > commentLimit) return;
    const request = { requestId: crypto.randomUUID(), reference: { ...source.reference }, comment: comment.trim() }, target = circle;
    clearReview(); setNotice('Preparing a server preview. This does not post a message…');
    void perform(`/api/circles/${target}/passages/preview`, { method: 'POST', body: JSON.stringify(request) }, ({ status, body: value }) => {
      const current = status === 200 ? parsePassagePreview(value) : null;
      if (!current || current.circleId !== target || current.requestId !== request.requestId || current.comment !== request.comment || !samePassageReference(current.reference, request.reference)) {
        if (status === 401 || status === 403 || status === 404) return privateFailure(status);
        setNotice('The exact message preview could not be verified. Nothing was posted. Review again manually.'); return;
      }
      setPreview(current); setConfirmed(false); setNotice('Review the complete message below. It has not been posted.');
    }, () => { clearReview(); setNotice('The preview reply was lost. Nothing was posted. Request a new preview manually.'); });
  }
  function acceptReceipt(value: unknown, request: Pending): boolean {
    const current = parsePassageReceipt(value);
    if (!current || current.circleId !== request.circleId || current.requestId !== request.request.requestId || current.message.visibility === 'visible' && current.message.content !== request.content) return false;
    setReceipt(current); setPending(null); setPreview(null); setConfirmed(false); setComment(''); setAccess(null);
    setNotice(current.message.visibility === 'visible' ? 'Posting confirmed. Open the Circle to read the current conversation.' : `Posting confirmed. The message is currently ${current.message.visibility}; its earlier content is not displayed.`);
    return true;
  }
  function send(request: Pending) {
    if (!active || busy || sourceBusy || sending.current) return;
    sending.current = true; setPending(request); setPreview(null); setConfirmed(false); setComment(''); setNotice('Sending the exact reviewed message…');
    void perform(`/api/circles/${request.circleId}/passages`, { method: 'POST', body: request.body }, ({ status, body: value }) => {
      sending.current = false;
      if (status === 200 && acceptReceipt(value, request)) return;
      if (record(value) && value.outcome === 'not_attempted') {
        setAccess(null); setNotice('The current attempt was refused before saving. An earlier attempt may still have been saved. Keep this request key; check its receipt or retry the exact reviewed request manually.'); return;
      }
      setNotice('The posting reply could not be confirmed. It may have been saved. Check its receipt or retry this exact request manually; do not create a duplicate.');
    }, sent => { sending.current = false; setNotice(sent ? 'The posting reply was lost. It may have been saved. Check its receipt or retry this exact request manually.' : 'This attempt was not sent. The exact reviewed request is kept for a manual retry.'); });
  }
  function post() {
    if (disabled || !preview || !confirmed || preview.circleId !== circle || preview.comment !== comment.trim() || !source || !samePassageReference(preview.reference, source.reference)) return;
    const request = { requestId: preview.requestId, reference: { ...preview.reference }, comment: preview.comment, contentHash: preview.contentHash, reviewKey: preview.reviewKey };
    send({ circleId: preview.circleId, request, body: JSON.stringify(request), content: preview.content });
  }
  function lookup() {
    if (!active || busy || !pending || sending.current) return;
    const request = pending; setNotice('Checking the receipt without posting…');
    void perform(`/api/circles/${request.circleId}/passages?requestId=${request.request.requestId}`, { method: 'GET' }, ({ status, body: value }) => {
      const result = status === 200 ? parsePassageLookup(value) : null;
      if (result?.circleId === request.circleId && result.requestId === request.request.requestId) {
        if (result.receipt && acceptReceipt(result.receipt, request)) return;
        if (result.receipt === null) { setNotice('No receipt was found at this check. An earlier request could still complete. Keep the same request key and use the exact manual retry.'); return; }
      }
      setNotice('The current receipt could not be confirmed. No new post was sent; the exact pending request is retained.');
    }, () => setNotice('The receipt check failed. No new post was sent; retry the read manually.'));
  }
  return <div className={`${styles.scope} ${styles.stack}`} aria-busy={busy || sourceBusy}>
    <section style={card} className={styles.stack} aria-label="Verify source">
      <h2 style={h2}>1. Verify the source</h2>
      <p style={small}>All eight library editions are available. Ordinary HTML wrapping folds spaces; explicit verse and preformatted line breaks are retained. No pasted quotation is used as source evidence.</p>
      <div><label htmlFor="passage-book" style={fieldLabel}>Book edition</label><select id="passage-book" style={input} value={reference.bookId} disabled={sourceDisabled} onChange={event => { const next = pins.find(value => value.bookId === event.target.value)!; setBlock('1'); changeReference({ version: 1, bookId: next.bookId, editionId: next.editionId, blockIndex: 0, start: null, end: null }); }}>{GREAT_BOOKS.map(book => <option key={book.id} value={book.id}>{book.title} — {book.author}</option>)}</select></div>
      <div><label htmlFor="passage-block" style={fieldLabel}>Reading block (1–{pin.blockCount.toLocaleString()})</label><input id="passage-block" style={input} inputMode="numeric" value={block} disabled={sourceDisabled} onChange={event => { setBlock(event.target.value); changeReference({ ...reference, start: null, end: null }); }} /></div>
      {reference.start !== null && <p style={body}>Selected excerpt: characters {reference.start}–{reference.end} within this block. <button type="button" style={button} disabled={sourceDisabled} onClick={() => changeReference({ ...reference, start: null, end: null })}>Use source block without quotation</button></p>}
      {!currentEdition && <p style={body}>This link names an older edition. <button type="button" style={button} disabled={sourceDisabled} onClick={() => changeReference({ ...reference, editionId: pin.editionId, start: null, end: null })}>Use current edition</button></p>}
      <div className={styles.row}><button type="button" style={primary} disabled={sourceDisabled || !validBlock} onClick={() => void verifySource()}>Verify source</button><Link href={passageReaderHref({ ...reference, blockIndex: validBlock ? Number(block) - 1 : 0 })}>Select an excerpt in the reader</Link></div>
      {source && <PassageSource source={source} />}
    </section>
    <p role="status" style={body}>{notice}</p>
    {source && <section style={card} className={styles.stack} aria-label="Choose Circle">
      <h2 style={h2}>2. Choose your Circle</h2><p style={small}>Only a current member of a visible Circle can post. Signing in and joining remain explicit actions.</p>
      <button type="button" style={button} disabled={disabled} onClick={() => loadCircles()}>Load My Circles</button>
      {active && circles && <><ul className={styles.list}>{circles.items.map(item => <li key={item.circle.id}><button type="button" style={button} disabled={disabled || !item.viewer.is_member || item.circle.hidden} onClick={() => chooseCircle(item.circle.id)}>{item.circle.title || 'Circle'}{item.circle.hidden ? ' · hidden' : !item.viewer.is_member ? ' · not currently a member' : ''}</button></li>)}</ul>{!circles.items.length && <p style={small}>No Circles were returned. Browse public Circles to join one.</p>}{circles.nextCursor && <button type="button" style={button} disabled={disabled} onClick={() => loadCircles(circles.nextCursor!)}>Next page of My Circles</button>}</>}
      <div><label htmlFor="passage-circle" style={fieldLabel}>Circle ID</label><input id="passage-circle" style={input} value={circle} disabled={disabled} autoComplete="off" spellCheck={false} onChange={event => chooseCircle(event.target.value)} /></div>
      <button type="button" style={button} disabled={disabled || !isUuid(circle)} onClick={checkAccess}>Check current Circle access</button>
      <div className={styles.row}><Link href="/circles">Browse Circles</Link><Link href={signInHref}>Sign in or create an account</Link></div>
    </section>}
    {active && access === circle && source && <section style={card} className={styles.stack} aria-label="Your comment">
      <h2 style={h2}>3. Add your own thoughts</h2><div><label htmlFor="passage-comment" style={fieldLabel}>Your comment</label><textarea id="passage-comment" style={input} rows={5} value={comment} maxLength={commentLimit} disabled={disabled} onChange={event => { setComment(event.target.value); clearReview(); }} aria-describedby="passage-comment-help" /></div>
      <p id="passage-comment-help" style={small}>{comment.length} of {commentLimit} comment characters. The complete message, source and attribution share a 2,000-character limit. Your comment stays in this page’s memory; it is cleared when activity or account access retires.</p>
      <button type="button" style={primary} disabled={disabled || !comment.trim() || comment.trim().length > commentLimit} onClick={review}>Prepare server preview</button>
    </section>}
    {active && preview && <section style={card} className={styles.stack} aria-label="Review complete message">
      <h2 style={h2} tabIndex={-1} ref={focusReview}>4. Review the complete message</h2><p style={small}>This is the entire message other members will read, including the quotation, attribution and source link.</p><p className={styles.message}>{preview.content}</p>
      <label className={styles.check}><input type="checkbox" checked={confirmed} disabled={disabled} onChange={event => setConfirmed(event.target.checked)} /><span>I reviewed this exact message and want to post it to the selected Circle.</span></label>
      <button type="button" style={primary} disabled={disabled || !confirmed} onClick={post}>Post reviewed message</button>
    </section>}
    {active && pending && <section style={card} className={styles.stack} aria-label="Unconfirmed post">
      <h2 style={h2}>Posting result unconfirmed</h2><p style={body}>Keep this page open to check the receipt or retry the exact reviewed request. Reloading clears its local key; check the Circle conversation before composing another message. No background retry occurs.</p>
      <div className={styles.row}><button type="button" style={button} disabled={busy} onClick={lookup}>Check posting receipt</button><button type="button" style={button} disabled={busy} onClick={() => send(pending)}>Retry exact reviewed post</button><Link href={`/circles/${pending.circleId}`}>Open Circle to check conversation</Link></div>
    </section>}
    {active && receipt && <section style={card} aria-label="Confirmed post"><h2 style={h2}>Posting confirmed</h2><p style={body}>{receipt.message.visibility === 'visible' ? 'Your message was saved. Check the Circle for its current visibility and replies.' : `The saved message is currently ${receipt.message.visibility}.`}</p><Link href={`/circles/${receipt.circleId}`}>Open Circle conversation</Link></section>}
  </div>;
}
