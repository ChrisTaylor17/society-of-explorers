'use client';
import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import { parseCircleDetail, parseCircleManagement, parseCircleMembershipReceipt, type CircleDetail as Detail, type CircleManagement } from '@/lib/circles/membership';
import { useReviewAccess } from '@/lib/circles/useReviewAccess';
import { formatDay } from '@/lib/circles/schedule';
import { isUuid } from '@/lib/ids/uuid';
import { body, button, card, gold, h1, h2, label, lead, parchment, primary, small } from '@/lib/circles/ui';
import { safePrivateMeetingUrl } from '@/lib/circles/discussion-reader';
import ReportButton from '../ReportButton';
import CircleConversation from './CircleConversation';
import styles from '../participation.module.css';
import ReadingProgramSummary from '../ReadingProgramSummary';

type Intent = { action: 'join' } | { action: 'leave' } | { action: 'complete' } | { action: 'rsvp'; date: string; status: 'going' | 'not_going' };
type ManagementIntent = Extract<Intent, { action: 'leave' | 'complete' }>;
type Request = Intent & { expectedRevision: number; requestId: string; management?: true };
const completionCopy = 'Close to new members and RSVPs; existing members can continue the conversation or leave. Completing a Circle does not delete messages or remove members.';

export default function CircleDetail({ circleId }: { circleId: string }) {
  if (!isUuid(circleId)) return <><h1 style={h1}>Circle not found</h1><p style={body}>Choose a Circle from the directory or My Circles.</p></>;
  return <CircleView key={circleId.toLowerCase()} circleId={circleId.toLowerCase()} />;
}
function CircleView({ circleId }: { circleId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [management, setManagement] = useState<CircleManagement | null>(null);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<Request | null>(null);
  const [notice, setNotice] = useState('Load this Circle to check current membership, meeting details and available actions.');
  const [epoch, setEpoch] = useState(0);
  const sending = useRef(false);
  const focusConfirmation = useCallback((element: HTMLHeadingElement | null) => element?.focus({ preventScroll: true }), []);
  const retire = useCallback(() => {
    setDetail(null); setManagement(null); setIntent(null); setConfirmed(false); setPending(null); setEpoch(value => value + 1); sending.current = false;
    setNotice('Private Circle details, conversation and action drafts cleared. Load current access to continue. A request already sent may still have completed.');
  }, []);
  const { active, busy, perform } = useReviewAccess(retire);
  const disabled = !active || busy;
  const endpoint = `/api/circles/${circleId}`;
  function unavailable(status?: number) {
    setDetail(null); setManagement(null); setIntent(null); setConfirmed(false); setPending(null);
    setNotice(status === 401 ? 'Sign in to check current Circle access.' : status === 403 || status === 404 ? 'This Circle is not available for this account. My Circles can show Circles you still belong to or host.' : status === 409 ? 'The Circle changed. Load its current state before choosing another action.' : status === 429 ? 'Participation requests are temporarily limited. Wait before checking access again.' : 'Current Circle information could not be loaded. No membership, available seat or saved change is being assumed.');
  }
  function allowed(current: Detail, requested: Intent) {
    const access = current.capabilities;
    return requested.action === 'join' ? access.canJoin : requested.action === 'leave' ? access.canLeave : requested.action === 'complete' ? access.canComplete : access.canRsvp && current.meetings.some(meeting => meeting.date === requested.date);
  }
  function read(requested: Intent | null = null, minimumRevision = 0, saved = false) {
    setDetail(null); setManagement(null); setIntent(null); setPending(null); setConfirmed(false); setEpoch(value => value + 1); setNotice(saved ? 'Request confirmed. Loading current Circle state…' : 'Checking current Circle state…');
    void perform(endpoint, { method: 'GET' }, ({ status, body: value }) => {
      const current = status === 200 ? parseCircleDetail(value) : null;
      if (!current || current.circle.id !== circleId || current.revision < minimumRevision) return unavailable(status);
      setDetail(current);
      if (requested && allowed(current, requested)) {
        setIntent(requested); setNotice('Current access checked. Review and confirm this action. Nothing has been changed yet.');
      } else if (requested) setNotice('Current state loaded. That action is no longer available; review the current membership, seats and meeting dates.');
      else setNotice(saved ? 'Request confirmed. Current state is shown below; an earlier receipt does not override later changes.' : 'Current Circle state loaded. Each change checks current access again before confirmation.');
    }, () => { unavailable(); if (saved) setNotice('The request was confirmed, but the current Circle could not be loaded. Load current access before another change.'); });
  }
  function load(requested: Intent | null = null) { if (!disabled && !sending.current) read(requested); }
  function allowedManagement(current: CircleManagement, requested: Intent) {
    return requested.action === 'leave' ? current.capabilities.canLeave : requested.action === 'complete' && current.capabilities.canComplete;
  }
  function readMembership(requested: ManagementIntent | null = null, minimumRevision = 0, saved = false) {
    setDetail(null); setManagement(null); setIntent(null); setPending(null); setConfirmed(false); setEpoch(value => value + 1);
    setNotice(saved ? 'Request confirmed. Checking current membership controls…' : 'Checking your current membership controls…');
    void perform(`${endpoint}/membership`, { method: 'GET' }, ({ status, body: value }) => {
      const current = status === 200 ? parseCircleManagement(value, circleId) : null;
      if (!current || current.revision < minimumRevision) {
        unavailable(status);
        if (saved) setNotice('Request confirmed. Current membership controls are no longer available for this account. Check My Circles before another change.');
        return;
      }
      setManagement(current);
      if (requested && allowedManagement(current, requested)) {
        setIntent(requested); setNotice('Current membership controls checked. Review and confirm this action. Nothing has been changed yet.');
      } else if (requested) setNotice('Current membership controls loaded. That action is no longer available.');
      else setNotice(saved ? 'Request confirmed. Current membership controls are shown; an earlier receipt does not override later changes.' : 'Current membership controls loaded. Meeting and listing details have not been verified.');
    }, () => { unavailable(); if (saved) setNotice('The request was confirmed, but current membership controls could not be loaded. Check My Circles before another change.'); });
  }
  function loadMembership(requested: ManagementIntent | null = null) { if (!disabled && !sending.current) readMembership(requested); }
  function send(request: Request) {
    if (disabled || sending.current) return;
    sending.current = true; setDetail(null); setManagement(null); setIntent(null); setPending(null); setConfirmed(false); setNotice('Saving participation request…');
    void perform(`${endpoint}/${request.action}`, { method: 'POST', body: JSON.stringify(request.action === 'rsvp' ? { requestId: request.requestId, expectedRevision: request.expectedRevision, date: request.date, status: request.status } : { requestId: request.requestId, expectedRevision: request.expectedRevision }) }, ({ status, body: value }) => {
      sending.current = false;
      const receipt = status === 200 ? parseCircleMembershipReceipt(value) : null;
      const valid = receipt && receipt.requestId === request.requestId && receipt.circleId === circleId && receipt.receipt.action === request.action
        && receipt.state.revision >= request.expectedRevision && (request.action !== 'rsvp' || receipt.receipt.date === request.date && receipt.receipt.status === request.status);
      if (valid) { if (request.management) readMembership(null, receipt.state.revision, true); else read(null, receipt.state.revision, true); }
      else if ([400, 401, 403, 404, 409, 413, 429].includes(status)) unavailable(status);
      else { setPending(request); setNotice('The reply could not be confirmed. This change may have been saved. Retry the exact request manually, or load current Circle state before another action.'); }
    }, sent => { sending.current = false; setPending(request); setNotice(sent ? 'The reply was lost. This change may have been saved. Retry the exact request manually, or load current Circle state before another action.' : 'The request was not sent. You can retry the exact request manually or load current Circle state.'); });
  }
  const c = detail?.circle;
  const viewer = detail?.viewer;
  const meetingUrl = detail && viewer?.is_member && !c?.hidden ? safePrivateMeetingUrl(detail.online_url) : null;
  const confirmLabel = intent?.action === 'join' ? 'Confirm join' : intent?.action === 'leave' ? 'Confirm leave' : intent?.action === 'complete' ? 'Confirm Circle completion' : 'Confirm RSVP';
  function confirmChange() {
    if (!intent || !confirmed) return;
    if (detail && allowed(detail, intent)) send({ ...intent, expectedRevision: detail.revision, requestId: crypto.randomUUID() });
    else if (management && allowedManagement(management, intent)) send({ ...intent, expectedRevision: management.revision, requestId: crypto.randomUUID(), management: true });
  }
  return <div className={styles.scope}>
    <p style={label}><Link href="/circles">Circles</Link> · <Link href="/circles/mine">My Circles</Link></p>
    <h1 style={h1}>{c?.title || management?.circle.title || (management ? 'Circle membership' : 'Circle details')}</h1>
    <p role="status" aria-live="polite" style={lead}>{notice}</p>
    <div className={styles.row} style={{ marginBottom: '1rem' }}><button type="button" style={button} disabled={disabled} onClick={() => load()}>Load current Circle access</button><button id="membership-controls" type="button" style={button} disabled={disabled} onClick={() => loadMembership()}>Check membership controls</button>{pending && <button type="button" style={button} disabled={disabled} onClick={() => send(pending)}>Retry exact participation request</button>}</div>
    <p style={small}>If meeting details cannot load, check membership controls to leave or complete a Circle you still belong to or host.</p>
    <p style={{ ...small, marginBottom: '1rem' }}><Link href={`/login?next=/circles/${circleId}`}>Sign in</Link> · <Link href={`/login?mode=signup&next=/circles/${circleId}`}>Create a free account</Link></p>
    {management && <section aria-label="Your current membership controls" className={styles.stack} style={card}>
      <h2 style={{ ...h2, margin: 0 }}>Membership controls</h2>
      <p style={body}>These controls verify your current membership and hosting role. Full Circle information, meeting dates and video links are unavailable in this view.</p>
      <p style={small}>{management.viewer.is_member ? 'You are currently a member.' : 'You are not currently a member.'}{management.viewer.is_host ? ' You are the host; leaving membership does not transfer hosting.' : ''}{management.circle.hidden ? ' This Circle is hidden from public listings.' : ''}</p>
      <div className={styles.row}>
        {management.capabilities.canLeave && <button type="button" style={button} disabled={disabled} onClick={() => loadMembership({ action: 'leave' })}>Leave this Circle</button>}
        {management.capabilities.canComplete && <button type="button" style={button} disabled={disabled} onClick={() => loadMembership({ action: 'complete' })}>Complete this Circle</button>}
      </div>
    </section>}
    {intent && (detail || management) && <section aria-label="Confirm participation change" className={styles.stack} style={{ ...card, marginTop: '1rem' }}>
      <h2 style={{ ...h2, margin: 0 }} ref={focusConfirmation} tabIndex={-1}>Review participation change</h2>
      <p style={body}>{intent.action === 'join' ? 'Join this free Circle and share your display name with its members. Read the community norms before joining.' : intent.action === 'leave' ? 'Leave this Circle and remove your current RSVPs. Your posted messages remain until you withdraw them. If you are the host, you keep hosting responsibility and can complete the Circle from My Circles.' : intent.action === 'complete' ? completionCopy : `${intent.status === 'going' ? 'Mark yourself going' : 'Mark yourself not going'} on ${formatDay(intent.date)}. Your RSVP is shared with this Circle.`}</p>
      <label className={styles.check}><input type="checkbox" checked={confirmed} disabled={disabled} onChange={event => setConfirmed(event.target.checked)} /><span>{intent.action === 'join' ? <>I read the <Link href="/circles/norms">community norms</Link> and want to join this Circle.</> : 'I reviewed this change and want to continue.'}</span></label>
      <div className={styles.row}><button type="button" style={primary} disabled={disabled || !confirmed} onClick={confirmChange}>{confirmLabel}</button><button type="button" style={button} disabled={disabled} onClick={() => { setIntent(null); setConfirmed(false); }}>Cancel participation change</button></div>
    </section>}
    {detail && c && viewer && <>
      <p style={lead}>{c.format_label} · {c.meeting_label} · hosted by {c.host_name}</p>
      <div style={card} className={styles.stack}>
        {c.hidden && <p style={body}>This Circle is hidden from public listings. Private meeting links and the ordinary conversation are unavailable while hidden. You can still leave, and the host can complete the Circle.</p>}
        {detail.ended && <p style={body}>{c.status === 'completed' ? 'The host completed this Circle.' : `The scheduled ${c.program_length}-week reading plan has ended.`} New joins and RSVPs are closed. Existing members can continue the conversation or leave.</p>}
        <p style={body}><strong style={{ color: parchment }}>Where:</strong> {c.format === 'online' ? 'Online' : [c.venue_name, c.city, c.region].filter(Boolean).join(', ')}</p>
        <p style={body}><strong style={{ color: parchment }}>Members:</strong> {c.member_count} of {c.max_members}{c.spots_left === 0 ? ' (full)' : ''}</p>
        <p style={small}>{viewer.is_member ? 'You are currently a member.' : 'You are not currently a member.'}{viewer.is_host ? ' You are the host; leaving membership does not transfer hosting.' : ''}</p>
        {c.description && <p style={{ ...body, whiteSpace: 'pre-wrap' }}>{c.description}</p>}
        {meetingUrl && <p style={body}><strong>Video link (members only):</strong> <a href={meetingUrl} target="_blank" rel="noopener noreferrer">Open the online meeting</a></p>}
      </div>
      <div className={styles.row} style={{ margin: '1rem 0' }}>
        {detail.capabilities.canJoin && <button type="button" style={primary} disabled={disabled} onClick={() => load({ action: 'join' })}>Join this Circle</button>}
        {detail.capabilities.canLeave && <button type="button" style={button} disabled={disabled} onClick={() => load({ action: 'leave' })}>Leave this Circle</button>}
        {detail.capabilities.canComplete && <button type="button" style={button} disabled={disabled} onClick={() => load({ action: 'complete' })}>Complete this Circle</button>}
      </div>
      {!viewer.signed_in && <p style={small}>Create a free account or sign in to join. Reading and public Circle listings remain free.</p>}
      {!viewer.is_member && !detail.ended && !c.hidden && c.spots_left === 0 && <p style={small}>This Circle is currently full. Load current access later to check for a seat.</p>}
      {c.reading && <><h2 style={h2}>This week</h2><p style={body}>Week {c.reading.week}: <Link href={`/circles/path/${c.reading.week}?circle=${c.id}`}>{c.reading.title}</Link> ({c.reading.author}). {c.reading.selection}.</p></>}
      <h2 style={h2}>Next meetings</h2>
      {!detail.meetings.length && <p style={small}>No future meeting dates were returned for this Circle.</p>}
      <ul className={styles.list}>{detail.meetings.map(meeting => <li key={meeting.date} style={card}>
        <p style={body}>{formatDay(meeting.date)}</p><p style={small}>{meeting.going} going{meeting.my_status ? ` · you: ${meeting.my_status === 'going' ? 'going' : 'not going'}` : ''}</p>
        {detail.capabilities.canRsvp && <div className={styles.row} style={{ marginTop: '12px' }}><button type="button" style={meeting.my_status === 'going' ? primary : button} disabled={disabled} aria-label={`Going on ${formatDay(meeting.date)}`} aria-pressed={meeting.my_status === 'going'} onClick={() => load({ action: 'rsvp', date: meeting.date, status: 'going' })}>Going</button><button type="button" style={button} disabled={disabled} aria-label={`Cannot make it on ${formatDay(meeting.date)}`} aria-pressed={meeting.my_status === 'not_going'} onClick={() => load({ action: 'rsvp', date: meeting.date, status: 'not_going' })}>Can’t make it</button></div>}
      </li>)}</ul>
      {c.reading_program && <ReadingProgramSummary program={c.reading_program} circleId={c.id} />}
      {detail.capabilities.canReadConversation && <><p style={body}><Link href={`/circles/${c.id}/discussion`} prefetch={false}>Open discussion archive and replies</Link></p><p style={body}><Link href={`/quest/${c.id}`} prefetch={false}>Open in Quest Browser</Link></p><p style={body}><Link href={`/circles/passages?circle=${c.id}`}>Discuss a verified source passage</Link></p><CircleConversation key={`${c.id}:${epoch}`} circleId={c.id} active={active} accessEpoch={epoch} /></>}
      {!c.hidden && <div style={{ marginTop: '2.5rem', borderTop: `1px solid ${gold}22`, paddingTop: '1.25rem' }}><ReportButton circleId={c.id} /></div>}
    </>}
  </div>;
}
