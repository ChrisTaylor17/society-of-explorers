'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useReviewAccess } from '@/lib/circles/useReviewAccess';
import { circleDetailHref } from '@/lib/circles/discovery';
import { discussionCommentLimit, discussionHref, discussionSearchParams, parseDiscussionLookup, parseDiscussionPage, parseDiscussionPreview, parseDiscussionReceipt, type DiscussionPage, type DiscussionPostInput, type DiscussionPreview, type DiscussionQuery, type DiscussionReceipt, type ThreadMessage } from '@/lib/circles/thread';
import MessageActions from '../../messages/MessageActions';
import type { MessageSafetyState } from '@/lib/circles/message-moderation';
import { body, button, card, fieldLabel, h2, input, primary, small } from '@/lib/circles/ui';
import styles from './discussion.module.css';
import { reelHref } from '@/lib/clips/contracts';
import { REEL_QUESTIONS, reelDiscussionDraft, withReelDiscussion, type ReelDiscussionId } from '@/lib/clips/salon';

type ReadQuery = Exclude<DiscussionQuery, { kind: 'receipt' }>;
type Pending = { body: string; request: DiscussionPostInput; content: string; rootMessageId: string | null };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

export default function DiscussionBrowser({ circleId, messageId, invalidIntent = false, reel }: {
  circleId: string; messageId: string | null; invalidIntent?: boolean; reel?: ReelDiscussionId;
}) {
  const [page, setPage] = useState<DiscussionPage | null>(null), [readVersion, setReadVersion] = useState(0);
  const [query, setQuery] = useState<ReadQuery>(messageId ? { kind: 'thread', messageId, after: null, limit: 25 } : { kind: 'archive', before: null, limit: 25 });
  const [target, setTarget] = useState<ThreadMessage | null>(null), [writing, setWriting] = useState(false), [comment, setComment] = useState('');
  const [preview, setPreview] = useState<DiscussionPreview | null>(null), [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null), [receipt, setReceipt] = useState<DiscussionReceipt | null>(null);
  const [notice, setNotice] = useState(invalidIntent ? 'This discussion link has invalid, duplicate or unsupported parameters. Open the archive to continue; no message has been assumed.' : 'Load the current discussion to check access. Nothing is loaded or posted automatically.');
  const sending = useRef(false), statusRef = useRef<HTMLParagraphElement>(null);
  const [errorFocus, setErrorFocus] = useState(0);
  useEffect(() => {
    if (errorFocus && document.visibilityState === 'visible' && document.hasFocus()) statusRef.current?.focus({ preventScroll: true });
  }, [errorFocus]);
  const clearReview = useCallback(() => { setPreview(null); setConfirmed(false); }, []);
  const retire = useCallback(() => {
    setPage(null); setTarget(null); setWriting(false); setComment(''); setPreview(null); setConfirmed(false); setPending(null); setReceipt(null); setReadVersion(value => value + 1); sending.current = false;
    setNotice('Private discussion, comment and review cleared. A request already sent may still have been saved. Nothing will reload or retry automatically.');
  }, []);
  const { active, busy, perform } = useReviewAccess(retire);
  const disabled = !active || busy || Boolean(pending);
  const endpoint = `/api/circles/${circleId}/discussion`;
  const returnHref = withReelDiscussion(discussionHref(circleId, query.kind === 'thread' ? query.messageId : null), reel);
  const signInHref = `/login?next=${encodeURIComponent(returnHref)}`;
  const commentLimit = discussionCommentLimit(circleId, target?.id ?? null);
  const focusHeading = useCallback((element: HTMLHeadingElement | null) => { element?.focus({ preventScroll: true }); }, []);
  function unavailable(status?: number) {
    setErrorFocus(value => value + 1);
    setPage(null); setTarget(null); setWriting(false); setComment(''); clearReview(); setReceipt(null);
    setNotice(status === 401 ? 'Sign in, then load this discussion to check current access.' : status === 403 || status === 404 ? 'This discussion or message is not available for this account. Check your current Circle membership.' : status === 429 ? 'Too many requests. Wait, then load the discussion manually.' : 'The current discussion could not be verified. No empty archive or successful change is being assumed.');
  }
  function load(next: ReadQuery = query) {
    if (disabled || sending.current) return;
    setPage(null); setTarget(null); setWriting(false); setComment(''); clearReview(); setReceipt(null); setReadVersion(value => value + 1); setQuery(next); setNotice('Checking current discussion access and messages…');
    const params = discussionSearchParams(next);
    void perform(`${endpoint}${params.size ? `?${params}` : ''}`, { method: 'GET' }, ({ status, body: value }) => {
      const current = status === 200 ? parseDiscussionPage(value, { circleId, kind: next.kind, limit: next.limit, ...(next.kind === 'archive' ? { before: next.before } : { messageId: next.messageId, after: next.after }) }) : null;
      if (!current) return unavailable(status);
      setPage(current); setNotice(current.kind === 'archive' ? current.items.length ? 'Current archive page loaded, newest messages first. Older pages replace this page.' : 'No messages were returned on this archive page. You can start a conversation.' : 'Current thread loaded. Root and selected message are shown separately; reply pages contain this root’s descendants in chronological order.');
    }, () => unavailable());
  }
  function selectTarget(message: ThreadMessage | null, initialComment = '') {
    if (disabled || !page || message && message.visibility !== 'visible') return;
    setTarget(message); setWriting(true); setComment(initialComment); clearReview(); setReceipt(null);
    setNotice(message ? 'Reply target selected. Write your own comment; the preview checks the parent again. No parent quotation is copied into your reply.' : 'Write a new message for this Circle, then review its server preview.');
  }
  function review() {
    if (disabled || !page || !writing || !comment.trim() || comment.trim().length > commentLimit) return;
    const request = { requestId: crypto.randomUUID(), comment: comment.trim(), parentMessageId: target?.id ?? null };
    clearReview(); setNotice('Preparing the exact message and checking the current reply target. This does not post…');
    void perform(`${endpoint}/preview`, { method: 'POST', body: JSON.stringify(request) }, ({ status, body: value }) => {
      const current = status === 200 ? parseDiscussionPreview(value) : null;
      if (!current || current.circleId !== circleId || current.requestId !== request.requestId || current.comment !== request.comment || current.parentMessageId !== request.parentMessageId) {
        clearReview(); setTarget(null); setWriting(false); setComment(''); setPage(null);
        if (status === 401 || status === 403 || status === 404) return unavailable(status);
        setErrorFocus(value => value + 1);
        setNotice(status === 409 ? 'The parent changed or is no longer visible. Load the current discussion before choosing a new target. Nothing was posted.' : 'The exact preview could not be verified. Load the current discussion and review again. Nothing was posted.'); return;
      }
      setPreview(current); setConfirmed(false); setTarget(current.parent?.message ?? null); setNotice('Review the complete message. It has not been posted.');
    }, () => { clearReview(); setErrorFocus(value => value + 1); setNotice('The preview could not be confirmed. Nothing was posted. Prepare a new preview manually.'); });
  }
  function accept(value: unknown, request: Pending): boolean {
    const current = parseDiscussionReceipt(value);
    if (!current || current.circleId !== circleId || current.requestId !== request.request.requestId || current.message.parentMessageId !== request.request.parentMessageId
      || request.rootMessageId !== null && current.message.rootMessageId !== request.rootMessageId
      || current.message.visibility === 'visible' && current.message.content !== request.content) return false;
    setReceipt(current); setPending(null); setWriting(false); setTarget(null); setComment(''); clearReview(); setPage(null);
    setNotice(current.message.visibility === 'visible' ? 'Posting confirmed. Open the saved message to check its current thread.' : `Posting confirmed. The saved message is currently ${current.message.visibility}; its earlier body is not displayed.`);
    return true;
  }
  function send(request: Pending) {
    if (!active || busy || sending.current) return;
    sending.current = true; setPending(request); clearReview(); setTarget(null); setWriting(false); setComment(''); setPage(null); setReceipt(null); setNotice('Sending the exact reviewed message…');
    void perform(endpoint, { method: 'POST', body: request.body }, ({ status, body: value }) => {
      sending.current = false;
      if (status === 200 && accept(value, request)) return;
      setNotice(record(value) && value.outcome === 'not_attempted' ? 'The current attempt was refused before saving. An earlier attempt may still have been saved. Keep this request key; check its receipt or retry the exact reviewed request manually.' : 'The posting reply could not be confirmed. It may have been saved. Check the receipt or retry this exact reviewed request manually; do not create a duplicate.');
    }, sent => { sending.current = false; setNotice(sent ? 'The posting reply was lost. It may have been saved. Check its receipt or retry this exact reviewed request manually.' : 'This attempt was not sent. The exact reviewed request is kept for manual receipt checking or retry.'); });
  }
  function post() {
    if (disabled || !preview || !confirmed || preview.circleId !== circleId || preview.comment !== comment.trim() || preview.parentMessageId !== (target?.id ?? null)) return;
    const request: DiscussionPostInput = { requestId: preview.requestId, comment: preview.comment, parentMessageId: preview.parentMessageId, expectedParentRevision: preview.parent?.revision ?? null, expectedParentHash: preview.parent?.contentHash ?? null, contentHash: preview.contentHash, reviewKey: preview.reviewKey };
    send({ request, body: JSON.stringify(request), content: preview.content, rootMessageId: preview.parent?.message.rootMessageId ?? null });
  }
  function lookup() {
    if (!active || busy || !pending || sending.current) return;
    const request = pending; setNotice('Checking this request’s receipt without posting…');
    void perform(`${endpoint}?requestId=${request.request.requestId}`, { method: 'GET' }, ({ status, body: value }) => {
      const current = status === 200 ? parseDiscussionLookup(value) : null;
      if (current?.circleId === circleId && current.requestId === request.request.requestId) {
        if (current.receipt && accept(current.receipt, request)) return;
        if (current.receipt === null) { setNotice('No receipt was found at this check. An earlier attempt could still complete. Keep the same request key and use only the exact manual retry.'); return; }
      }
      setNotice('The receipt could not be confirmed. No new post was sent; the same pending key and body are retained.');
    }, () => setNotice('The receipt check failed. No post was sent by this read; the exact pending request is retained.'));
  }
  function messageCard(message: ThreadMessage) {
    function checkedState(current: MessageSafetyState) {
      if (current.circleId !== circleId || current.message.id !== message.id || current.message.visibility === message.visibility && current.message.content === message.content) return;
      setPage(null); setTarget(null); setWriting(false); setComment(''); clearReview(); setReceipt(null); setReadVersion(value => value + 1);
      if (!pending) setNotice(`The checked message is now ${current.message.visibility}. Discussion and draft cleared. Load the current discussion before replying.`);
    }
    return <div className={styles.stack} data-discussion-message={message.id}>
      <div className={styles.relations}>
        <div className={styles.row}><Link href={discussionHref(circleId, message.id)} prefetch={false}>Open this message’s thread</Link>{message.parentMessageId && <Link href={discussionHref(circleId, message.parentMessageId)} prefetch={false}>Open parent message</Link>}{message.parentMessageId && message.rootMessageId !== message.parentMessageId && <Link href={discussionHref(circleId, message.rootMessageId)} prefetch={false}>Open thread root</Link>}</div>
        <p style={small}>{message.parentMessageId ? 'Reply relationship verified by the current discussion response.' : 'This message starts a thread.'}</p>
      </div>
      {message.visibility !== 'unavailable' && message.created_at !== null ? <MessageActions circleId={circleId} message={{ id: message.id, member_name: message.member_name, publicProfileId: message.visibility === 'visible' ? message.publicProfileId : null, content: message.content ?? (message.visibility === 'withdrawn' ? 'Message withdrawn by its author.' : 'Message hidden from member views.'), created_at: message.created_at, is_mine: message.is_mine }} active={active} onAccessDenied={unavailable} onCurrentState={checkedState} /> : <article style={card}><p style={small}>{message.member_name} · {message.created_at === null ? 'Date unavailable' : <time dateTime={message.created_at}>{new Date(message.created_at).toUTCString()}</time>}</p><p style={body}>{message.visibility === 'withdrawn' ? 'Message withdrawn by its author.' : message.visibility === 'unavailable' ? 'This legacy message could not be displayed.' : 'Message hidden from member views.'}</p></article>}
      {message.visibility === 'visible' && <button type="button" style={button} disabled={disabled} onClick={() => selectTarget(message)}>Reply to this message</button>}
    </div>;
  }
  return <div className={`${styles.scope} ${styles.stack}`} aria-busy={busy}>
    <nav className={styles.row} aria-label="Discussion navigation"><Link href={withReelDiscussion(circleDetailHref(circleId, Boolean(reel)), reel)}>Return to Circle details</Link><Link href="/circles/mine">My Circles</Link><Link href={signInHref}>Sign in or create an account</Link></nav>
    {reel && <section aria-label="Question from the Reel" style={card}>
      <p style={body}>{REEL_QUESTIONS[reel]}</p>
      <Link href={reelHref(reel)} prefetch={false}>Watch the Reel</Link>
      {page?.kind === 'archive' && <div><button type="button" style={button} disabled={disabled || writing}
        onClick={() => selectTarget(null, reelDiscussionDraft(reel, window.location.origin))}>Use Reel question in a draft</button></div>}
    </section>}
    <p ref={statusRef} tabIndex={-1} role="status" aria-live="polite" style={body}>{notice}</p>
    <div className={styles.row}>
      {!invalidIntent && <button type="button" style={primary} disabled={disabled} onClick={() => load()}>{query.kind === 'thread' ? 'Load current thread' : 'Load current discussion archive'}</button>}
      <button type="button" style={button} disabled={disabled} onClick={() => load({ kind: 'archive', before: null, limit: 25 })}>Open newest archive page</button>
    </div>
    {active && page && !preview && <section className={styles.stack} aria-label={page.kind === 'archive' ? 'Discussion archive page' : 'Current discussion thread'} key={readVersion}>
      <h2 style={h2} tabIndex={-1} ref={focusHeading}>{page.kind === 'archive' ? 'Discussion archive' : 'Current thread'}</h2>
      <button type="button" style={button} disabled={disabled} onClick={() => selectTarget(null)}>Write a new Circle message</button>
      {page.kind === 'archive' ? <>
        <p style={small}>Newest messages first. Replies retain their parent and root links. Each older page replaces this page.</p>
        {!page.items.length && <p style={body}>No messages were returned on this page.</p>}
        <ol className={styles.list}>{page.items.map(message => <li key={message.id}>{messageCard(message)}</li>)}</ol>
        {page.nextCursor && <button type="button" style={button} disabled={disabled} onClick={() => load({ kind: 'archive', before: page.nextCursor, limit: page.limit })}>Older discussion messages</button>}
      </> : <>
        <section className={styles.stack} aria-label="Thread root"><h3 style={h2}>Thread root</h3>{messageCard(page.root)}</section>
        {page.focus.id !== page.root.id && <section className={styles.stack} aria-label="Selected message"><h3 style={h2}>Selected message</h3>{messageCard(page.focus)}</section>}
        <div className={styles.row}><button type="button" style={button} disabled={disabled} onClick={() => load({ kind: 'thread', messageId: page.focus.id, after: null, limit: page.limit })}>First replies</button>{page.focus.id !== page.root.id && <button type="button" style={button} disabled={disabled} onClick={() => load({ kind: 'thread', messageId: page.focus.id, after: page.focus.id, limit: page.limit })}>Replies after selected message</button>}</div>
        <p style={small}>Replies below are this root’s descendants, oldest first, including nested replies. The selected message is shown above if it is outside this page; parent links preserve the exact relationship without relying on indentation.</p>
        <ol className={styles.list} aria-label="Thread replies">{page.items.filter(message => message.id !== page.focus.id).map(message => <li key={message.id}>{messageCard(message)}</li>)}</ol>
        {!page.items.length && <p style={body}>No replies were returned on this page.</p>}
        {page.nextCursor && <button type="button" style={button} disabled={disabled} onClick={() => load({ kind: 'thread', messageId: page.focus.id, after: page.nextCursor, limit: page.limit })}>Next replies</button>}
      </>}
    </section>}
    {active && writing && page && !preview && <section style={card} className={styles.stack} aria-label="Write your message">
      <h2 style={h2} tabIndex={-1} ref={focusHeading}>{target ? 'Write a reply' : 'Write a new message'}</h2>
      <p style={small}>{target ? 'Your reply includes a stable parent link. It does not copy the parent’s name or words. The server preview checks current parent visibility again.' : 'Start a conversation with your own thoughts. Nothing posts until you review and confirm.'} Choosing a different target clears this comment and review.</p>
      <div><label htmlFor="discussion-comment" style={fieldLabel}>Your discussion comment</label><textarea id="discussion-comment" style={input} rows={5} value={comment} disabled={disabled} maxLength={commentLimit} aria-describedby="discussion-comment-help" onChange={event => { setComment(event.target.value); clearReview(); }} /></div>
      <p id="discussion-comment-help" style={small}>{comment.length} of {commentLimit} comment characters. Full message limit: 2,000 characters. Drafts stay only in this page’s memory and clear on account or activity retirement.</p>
      <button type="button" style={primary} disabled={disabled || !comment.trim() || comment.trim().length > commentLimit} onClick={review}>Prepare discussion preview</button>
      <button type="button" style={button} disabled={disabled} onClick={() => { setTarget(null); setWriting(false); setComment(''); clearReview(); }}>Cancel this draft</button>
    </section>}
    {active && preview && <section style={card} className={styles.stack} aria-label="Review discussion message">
      <h2 style={h2} tabIndex={-1} ref={focusHeading}>Review the complete discussion message</h2>
      {preview.parent && <section aria-label="Current reply parent"><p style={small}>Current parent, checked for this preview:</p><p className={styles.message}>{preview.parent.message.content}</p></section>}
      <p style={small}>The complete message to be posted follows. Its parent link is plain text readable in existing clients.</p><p className={styles.message}>{preview.content}</p>
      <label className={styles.check}><input type="checkbox" checked={confirmed} disabled={disabled} onChange={event => setConfirmed(event.target.checked)} /><span>I reviewed this exact message and its target, and want to post it to this Circle.</span></label>
      <button type="button" style={primary} disabled={disabled || !confirmed} onClick={post}>Post reviewed discussion message</button>
      <button type="button" style={button} disabled={disabled} onClick={clearReview}>Edit this draft before posting</button>
    </section>}
    {active && pending && <section style={card} className={styles.stack} aria-label="Unconfirmed discussion post">
      <h2 style={h2}>Discussion posting result unconfirmed</h2><p style={body}>Keep this page open to preserve the exact request key. A later refusal does not disprove an earlier save. Check its receipt or retry the same request manually. Leaving or reloading clears the local key; check the Circle before composing another message.</p>
      <div className={styles.row}><button type="button" style={button} disabled={busy} onClick={lookup}>Check discussion posting receipt</button><button type="button" style={button} disabled={busy} onClick={() => send(pending)}>Retry exact reviewed discussion post</button><Link href={`/circles/${circleId}`}>Leave this page to check the Circle</Link></div>
    </section>}
    {active && receipt && <section style={card} className={styles.stack} aria-label="Confirmed discussion post"><h2 style={h2}>Discussion posting confirmed</h2><p style={body}>{receipt.message.visibility === 'visible' ? 'The message was saved. Load its current thread to read it and any replies.' : `The saved message is currently ${receipt.message.visibility}. Its earlier body is not displayed.`}</p><Link href={discussionHref(circleId, receipt.message.id)} prefetch={false}>Open saved discussion message</Link></section>}
  </div>;
}
