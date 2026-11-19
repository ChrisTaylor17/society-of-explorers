'use client';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { parseMyCircles, type MyCircles as MyCirclesPage } from '@/lib/circles/membership';
import { useReviewAccess } from '@/lib/circles/useReviewAccess';
import { formatDay } from '@/lib/circles/schedule';
import { body, button, card, h2, lead, small } from '@/lib/circles/ui';
import styles from '../participation.module.css';
import ReadingProgramSummary from '../ReadingProgramSummary';

export default function MyCircles() {
  const [page, setPage] = useState<MyCirclesPage | null>(null);
  const [notice, setNotice] = useState('Load the Circles you currently belong to or host. This includes hidden and completed Circles.');
  const retire = useCallback(() => { setPage(null); setNotice('Your Circle list was cleared. Load My Circles to check current access again.'); }, []);
  const { active, busy, perform } = useReviewAccess(retire);
  function unavailable(status?: number) {
    setPage(null); setNotice(status === 401 ? 'Sign in or create a free account to load your Circles.' : status === 403 ? 'Your Circles are not available for this account.' : 'Your Circles could not be loaded. An empty membership or hosting history is not being assumed.');
  }
  function load(after: string | null = null) {
    if (!active || busy) return;
    setPage(null); setNotice('Loading current memberships and hosted Circles…');
    void perform(`/api/circles/mine${after ? `?after=${encodeURIComponent(after)}` : ''}`, { method: 'GET' }, ({ status, body: value }) => {
      const current = status === 200 ? parseMyCircles(value, { after }) : null;
      if (!current || after && current.nextCursor === after) return unavailable(status);
      setPage(current); setNotice(current.items.length ? 'Your Circles are loaded. Open a Circle to check its latest state before changing membership or an RSVP.' : 'No current memberships or hosted Circles were returned on this page.');
    }, () => unavailable());
  }
  return <div className={styles.scope}>
    <p role="status" aria-live="polite" style={lead}>{notice}</p>
    <button type="button" style={button} disabled={!active || busy} onClick={() => load()}>Load My Circles</button>
    <p style={{ ...small, marginTop: '.75rem' }}><Link href="/login?next=/circles/mine">Sign in</Link> · <Link href="/login?mode=signup&next=/circles/mine">Create a free account</Link> · <Link href="/circles/start">Start a Circle</Link></p>
    {page && <section aria-label="Your memberships and hosted Circles" aria-busy={busy}>
      <ul className={styles.list}>{page.items.map(item => <li key={item.circle.id} style={card}>
        <h2 style={{ ...h2, marginTop: 0 }}>{item.circle.title || 'Circle membership'}</h2>
        <p style={body}>{item.viewer.is_member ? 'Current member' : 'Not currently a member'}{item.viewer.is_host ? ' · Host' : ''}{item.circle.hidden ? ' · Hidden from public listings' : ''}</p>
        {item.kind === 'management' ? <>
          <p style={small}>Full Circle information is unavailable. You can still check current membership controls to leave or, as host, complete the Circle.</p>
          <Link href={`/circles/${item.circle.id}#membership-controls`} style={{ ...button, marginTop: '12px' }}>Membership controls for {item.circle.title || 'this Circle'}</Link>
        </> : <>
          {item.ended && <p style={small}>Closed to new members and RSVPs</p>}
          <p style={small}>{item.circle.format_label} · {item.circle.meeting_label}</p>
          <p style={small}>{item.circle.next_meeting ? `Next scheduled meeting: ${formatDay(item.circle.next_meeting)}` : 'No future scheduled meeting is available.'}</p>
          {item.circle.reading_program && <ReadingProgramSummary program={item.circle.reading_program} circleId={item.circle.id} compact />}
          <Link href={`/circles/${item.circle.id}`} style={{ ...button, marginTop: '12px' }}>Open {item.circle.title}</Link>
        </>}
      </li>)}</ul>
      {page.nextCursor && <button type="button" style={button} disabled={!active || busy} onClick={() => load(page.nextCursor)}>Next page of My Circles</button>}
    </section>}
  </div>;
}
