'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCircleParticipation } from '@/lib/circles/useCircleParticipation';
import { formatDay } from '@/lib/circles/schedule';
import { isUuid } from '@/lib/ids/uuid';
import { body, button, card, gold, h1, h2, label, lead, parchment, primary, small } from '@/lib/circles/ui';
import { circleDetailHref, ONLINE_CIRCLES_HREF } from '@/lib/circles/discovery';
import { parseCircleListing, type CircleListing } from '@/lib/circles/membership';
import ReportButton from '../ReportButton';
import CircleConversation from './CircleConversation';
import styles from '../participation.module.css';
import ReadingProgramSummary from '../ReadingProgramSummary';
import PublishedProfileLink from '@/components/PublishedProfileLink';
import { withReelDiscussion, type ReelDiscussionId } from '@/lib/clips/salon';

const completionCopy = 'Close to new members and RSVPs; existing members can continue the conversation or leave. Completing a Circle does not delete messages or remove members.';

export default function CircleDetail({ circleId, fromOnline = false, reel }: { circleId: string; fromOnline?: boolean; reel?: ReelDiscussionId }) {
  if (!isUuid(circleId)) return <><h1 style={h1}>Circle not found</h1><p style={body}>Choose a Circle from the directory or My Circles.</p></>;
  return <CircleView key={circleId.toLowerCase()} circleId={circleId.toLowerCase()} fromOnline={fromOnline} reel={reel} />;
}
function CircleView({ circleId, fromOnline, reel }: { circleId: string; fromOnline: boolean; reel?: ReelDiscussionId }) {
  const participation = useCircleParticipation(circleId);
  const [preview, setPreview] = useState<CircleListing | 'unavailable' | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const deadline = window.setTimeout(() => {
      controller.abort();
      setPreview('unavailable');
    }, 10_000);
    fetch(`/api/circles/${circleId}?view=listing`, { credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(value => { if (!controller.signal.aborted) setPreview(parseCircleListing(value, circleId) ?? 'unavailable'); })
      .catch(() => { if (!controller.signal.aborted) setPreview('unavailable'); })
      .finally(() => window.clearTimeout(deadline));
    return () => { controller.abort(); window.clearTimeout(deadline); };
  }, [circleId]);
  const scopeRef = useRef<HTMLDivElement>(null), statusRef = useRef<HTMLParagraphElement>(null);
  const returnTrigger = useRef<string | null>(null);
  const [cancelFocus, setCancelFocus] = useState(0);
  useEffect(() => {
    if (!cancelFocus || document.visibilityState !== 'visible' || !document.hasFocus()) return;
    const trigger = Array.from(scopeRef.current?.querySelectorAll<HTMLButtonElement>('button[data-participation-trigger]') ?? [])
      .find(element => element.dataset.participationTrigger === returnTrigger.current && !element.disabled);
    (trigger ?? statusRef.current)?.focus({ preventScroll: true });
  }, [cancelFocus]);
  const { detail, management, intent, confirmed, notice, epoch, active, busy, load, loadMembership } = participation;
  const disabled = !active || busy;
  const actionDisabled = disabled || participation.uncertain || participation.phase === 'review';
  const focusConfirmation = useCallback((element: HTMLHeadingElement | null) => element?.focus({ preventScroll: true }), []);
  const c = detail?.circle;
  const viewer = detail?.viewer;
  const listing = !detail && !management && preview !== 'unavailable' ? preview : null;
  const nextPath = encodeURIComponent(withReelDiscussion(circleDetailHref(circleId, fromOnline), reel));
  const confirmLabel = participation.retry ? 'Confirm exact participation retry' : intent?.action === 'join' ? 'Confirm join' : intent?.action === 'leave' ? 'Confirm leave' : intent?.action === 'complete' ? 'Confirm Circle completion' : 'Confirm RSVP';
  return <div ref={scopeRef} className={styles.scope} onClickCapture={event => {
    const trigger = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-participation-trigger]');
    if (trigger && participation.phase !== 'review') returnTrigger.current = trigger.dataset.participationTrigger ?? null;
    const link = (event.target as HTMLElement).closest('a');
    if (link && (participation.uncertain || busy || participation.phase === 'review' && link.getAttribute('href') !== '/circles/norms')) event.preventDefault();
  }}>
    <p style={label}><Link href={withReelDiscussion(fromOnline ? ONLINE_CIRCLES_HREF : '/circles', reel)}>{fromOnline ? 'Online Circles' : 'Circles'}</Link> · <Link href="/circles/mine">My Circles</Link></p>
    <h1 style={h1}>{c?.title || management?.circle.title || listing?.title || (management ? 'Circle membership' : 'Circle details')}</h1>
    {listing && <section aria-label="Public Circle preview" className={styles.stack} style={{ ...card, marginBottom: '1rem' }}>
      {listing.description && <p style={{ ...body, whiteSpace: 'pre-wrap' }}>{listing.description}</p>}
      <p style={body}>{listing.format_label} · {listing.meeting_label} · hosted by {listing.host_name}</p>
      <p style={small}>{listing.next_meeting ? `Next meeting · ${formatDay(listing.next_meeting)}, ${listing.next_meeting.slice(0, 4)}` : 'No upcoming meetings are listed.'}</p>
    </section>}
    {!detail && !management && !listing && <p role="status" style={small}>{preview === 'unavailable' ? 'The public Circle preview is unavailable.' : 'Loading public Circle preview…'}</p>}
    <p style={{ ...small, marginBottom: '1rem' }}><Link href={`/login?next=${nextPath}`}>Sign in</Link> · <Link href={`/login?mode=signup&next=${nextPath}`}>Create a free account</Link></p>
    <p ref={statusRef} tabIndex={-1} role="status" aria-live="polite" style={lead}>{notice}</p>
    <div className={styles.row} style={{ marginBottom: '1rem' }}><button type="button" style={button} disabled={disabled || participation.phase === 'review'} onClick={() => load()}>Load current Circle access</button><button id="membership-controls" type="button" style={button} disabled={disabled || participation.phase === 'review'} onClick={() => loadMembership()}>Check membership controls</button>{participation.canRetry && <button type="button" style={button} disabled={disabled} onClick={participation.retryRequest}>Retry exact participation request</button>}</div>
    {participation.uncertain && <><p style={small}>An earlier participation request may still complete. Other changes and links are paused until a fresh check or an exact retry resolves it. Closing this view discards its retry information without cancelling a sent request.</p><button type="button" style={button} disabled={disabled} onClick={participation.close}>Close this Circle view</button></>}
    <p style={small}>If meeting details cannot load, check membership controls to leave or complete a Circle you still belong to or host.</p>
    {management && <section aria-label="Your current membership controls" className={styles.stack} style={card}>
      <h2 style={{ ...h2, margin: 0 }}>Membership controls</h2>
      <p style={body}>These controls verify your current membership and hosting role. Full Circle information, meeting dates and video links are unavailable in this view.</p>
      <p style={small}>{management.viewer.is_member ? 'You are currently a member.' : 'You are not currently a member.'}{management.viewer.is_host ? ' You are the host; leaving membership does not transfer hosting.' : ''}{management.circle.hidden ? ' This Circle is hidden from public listings.' : ''}</p>
      <div className={styles.row}>
        {management.capabilities.canLeave && <button type="button" style={button} disabled={actionDisabled} data-participation-trigger="membership-leave" onClick={() => loadMembership({ action: 'leave' })}>Leave this Circle</button>}
        {management.capabilities.canComplete && <button type="button" style={button} disabled={actionDisabled} data-participation-trigger="membership-complete" onClick={() => loadMembership({ action: 'complete' })}>Complete this Circle</button>}
      </div>
    </section>}
    {intent && (detail || management) && <section aria-label="Confirm participation change" className={styles.stack} style={{ ...card, marginTop: '1rem' }}>
      <h2 style={{ ...h2, margin: 0 }} ref={focusConfirmation} tabIndex={-1}>Review participation change</h2>
      <p style={body}>{intent.action === 'join' ? 'Join this free Circle and share your display name with its members. Read the community norms before joining.' : intent.action === 'leave' ? 'Leave this Circle and remove your current RSVPs. Your posted messages remain until you withdraw them. If you are the host, you keep hosting responsibility and can complete the Circle from My Circles.' : intent.action === 'complete' ? completionCopy : `${intent.status === 'going' ? 'Mark yourself going' : 'Mark yourself not going'} on ${formatDay(intent.date)}, ${intent.date.slice(0, 4)}${detail ? ` · ${detail.circle.meeting_label}` : ''}. Your RSVP is shared with this Circle. This is your stated plan to attend, not an attendance record.`}</p>
      <label className={styles.check}><input type="checkbox" checked={confirmed} disabled={disabled} onChange={event => participation.check(event.target.checked)} /><span>{intent.action === 'join' ? <>I read the <Link href="/circles/norms" target="_blank" rel="noopener noreferrer">community norms</Link> and want to join this Circle.</> : 'I reviewed this change and want to continue.'}</span></label>
      <div className={styles.row}><button type="button" style={primary} disabled={disabled || !confirmed} onClick={participation.confirm}>{confirmLabel}</button><button type="button" style={button} disabled={disabled} onClick={() => { participation.cancel(); setCancelFocus(value => value + 1); }}>Cancel participation change</button></div>
    </section>}
    {detail && c && viewer && <>
      <p style={lead}>{c.format_label} · {c.meeting_label} · hosted by {c.host_name}</p>
      <PublishedProfileLink profileId={c.publicProfileId} active={!actionDisabled} label="View host’s published profile" />
      <div style={card} className={styles.stack}>
        {c.hidden && <p style={body}>This Circle is hidden from public listings. Private meeting links and the ordinary conversation are unavailable while hidden. You can still leave, and the host can complete the Circle.</p>}
        {detail.ended && <p style={body}>{c.status === 'completed' ? 'The host completed this Circle.' : `The scheduled ${c.program_length}-week reading plan has ended.`} New joins and RSVPs are closed. Existing members can continue the conversation or leave.</p>}
        <p style={body}><strong style={{ color: parchment }}>Where:</strong> {c.format === 'online' ? 'Online' : [c.venue_name, c.city, c.region].filter(Boolean).join(', ')}</p>
        <p style={body}><strong style={{ color: parchment }}>Members:</strong> {c.member_count} of {c.max_members}{c.spots_left === 0 ? ' (full)' : ''}</p>
        <p style={small}>{viewer.is_member ? 'You are currently a member.' : 'You are not currently a member.'}{viewer.is_host ? ' You are the host; leaving membership does not transfer hosting.' : ''}</p>
        {c.description && <p style={{ ...body, whiteSpace: 'pre-wrap' }}>{c.description}</p>}
        {detail.online_url && <div>
          <p style={small}>Open the host’s meeting in this tab. Current Circle access is checked first.</p>
          <button type="button" style={button} disabled={actionDisabled} onClick={() => {
            statusRef.current?.focus({ preventScroll: true });
            participation.openMeeting();
          }}>Open the online meeting</button>
        </div>}
      </div>
      <div className={styles.row} style={{ margin: '1rem 0' }}>
        {detail.capabilities.canJoin && <button type="button" style={primary} disabled={actionDisabled} data-participation-trigger="join" onClick={() => load({ action: 'join' })}>Join this Circle</button>}
        {detail.capabilities.canLeave && <button type="button" style={button} disabled={actionDisabled} data-participation-trigger="leave" onClick={() => load({ action: 'leave' })}>Leave this Circle</button>}
        {detail.capabilities.canComplete && <button type="button" style={button} disabled={actionDisabled} data-participation-trigger="complete" onClick={() => load({ action: 'complete' })}>Complete this Circle</button>}
      </div>
      {!viewer.signed_in && <p style={small}>Create a free account or sign in to join. Reading and public Circle listings remain free.</p>}
      {!viewer.is_member && !detail.ended && !c.hidden && c.spots_left === 0 && <p style={small}>This Circle is currently full. Load current access later to check for a seat.</p>}
      {c.reading && <><h2 style={h2}>This week</h2><p style={body}>Week {c.reading.week}: <Link href={`/circles/path/${c.reading.week}?circle=${c.id}`}>{c.reading.title}</Link> ({c.reading.author}). {c.reading.selection}.</p></>}
      <h2 style={h2}>Next meetings</h2>
      {!detail.meetings.length && <p style={small}>No future meeting dates were returned for this Circle.</p>}
      <ul className={styles.list}>{detail.meetings.map(meeting => <li key={meeting.date} style={card}>
        <p style={body}>{formatDay(meeting.date)}, {meeting.date.slice(0, 4)}</p><p style={small}>{meeting.going} going{meeting.my_status ? ` · you: ${meeting.my_status === 'going' ? 'going' : 'not going'}` : ''}</p>
        {detail.capabilities.canRsvp && <div className={styles.row} style={{ marginTop: '12px' }}><button type="button" style={meeting.my_status === 'going' ? primary : button} disabled={actionDisabled} aria-label={`Going on ${formatDay(meeting.date)}`} aria-pressed={meeting.my_status === 'going'} data-participation-trigger={`rsvp:${meeting.date}:going`} onClick={() => load({ action: 'rsvp', date: meeting.date, status: 'going' })}>Going</button><button type="button" style={button} disabled={actionDisabled} aria-label={`Cannot make it on ${formatDay(meeting.date)}`} aria-pressed={meeting.my_status === 'not_going'} data-participation-trigger={`rsvp:${meeting.date}:not_going`} onClick={() => load({ action: 'rsvp', date: meeting.date, status: 'not_going' })}>Can’t make it</button></div>}
      </li>)}</ul>
      {c.reading_program && <ReadingProgramSummary program={c.reading_program} circleId={c.id} />}
      {detail.capabilities.canReadConversation && <><p style={body}><Link href={withReelDiscussion(`/circles/${c.id}/discussion`, reel)} prefetch={false}>{reel ? 'Open discussion with the Reel question' : 'Open discussion archive and replies'}</Link></p><p style={body}><Link href={`/quest/${c.id}`} prefetch={false}>Open in Quest Browser</Link></p><p style={body}><Link href={`/circles/passages?circle=${c.id}`}>Discuss a verified source passage</Link></p><CircleConversation key={`${c.id}:${epoch}`} circleId={c.id} active={active && !participation.uncertain && participation.phase !== 'review'} accessEpoch={epoch} /></>}
      {!c.hidden && <div style={{ marginTop: '2.5rem', borderTop: `1px solid ${gold}22`, paddingTop: '1.25rem' }}><ReportButton circleId={c.id} /></div>}
    </>}
  </div>;
}
