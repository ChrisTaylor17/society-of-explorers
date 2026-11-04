'use client';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { parseMessageContributions, type MessageContributions } from '@/lib/circles/message-moderation';
import { useReviewAccess } from '@/lib/circles/useReviewAccess';
import { button, small } from '@/lib/circles/ui';
import MessageActions, { WITHDRAWAL_PRIVACY } from '../messages/MessageActions';
import styles from '../messages/safety.module.css';

export default function Contributions() {
  const [page, setPage] = useState<MessageContributions | null>(null);
  const [readVersion, setReadVersion] = useState(0);
  const [notice, setNotice] = useState('Load your posted messages to check current access.');
  const retire = useCallback(() => { setPage(null); setNotice('Posted messages and action drafts cleared. Load your messages to check access again. A request already sent may still have been saved.'); }, []);
  const { active, busy, perform } = useReviewAccess(retire);
  function unavailable(status?: number) {
    setPage(null);
    setNotice(status === 401 ? 'Sign in to load your posted messages.' : status === 403 ? 'Posted messages are not available for this account.' : 'Posted messages could not be loaded. An empty history is not being assumed.');
  }
  function load(after: string | null = null) {
    if (!active || busy) return;
    setPage(null); setReadVersion(version => version + 1); setNotice('Loading your posted messages…');
    void perform(`/api/circles/contributions${after ? `?after=${encodeURIComponent(after)}` : ''}`, { method: 'GET' }, ({ status, body }) => {
      const value = status === 200 ? parseMessageContributions(body) : null;
      if (!value || (after && value.nextCursor === after) || value?.items.some(item => !item.message.is_mine)) return unavailable(status);
      setPage(value); setNotice(value.items.length ? 'Your posted messages are loaded. Check a message before choosing an action.' : 'No posted messages were returned on this page.');
    }, () => unavailable());
  }
  return <div className={styles.scope}>
    <p style={{ ...small, marginBottom: '1rem' }}>You can withdraw your own messages here even after leaving a Circle or when its listing is hidden. {WITHDRAWAL_PRIVACY}</p>
    <p role="status" aria-live="polite" style={{ ...small, marginBottom: '1rem' }}>{notice}</p>
    <button type="button" style={button} disabled={!active || busy} onClick={() => load()}>Load my posted messages</button>
    <p style={{ ...small, marginTop: '.75rem' }}><Link href="/login?next=/circles/contributions">Sign in</Link> · New messages are written inside the Circle conversation.</p>
    {page && <section aria-label="Your posted messages" aria-busy={busy}>
      <ul className={styles.list}>{page.items.map(item => <li key={`${readVersion}:${item.circleId}:${item.message.id}`}>
        <MessageActions circleId={item.circleId} message={{ ...item.message, content: item.message.content || '' }} initialState={item} active={active} onAccessDenied={unavailable} />
      </li>)}</ul>
      {page.nextCursor && <button type="button" style={button} disabled={!active || busy} onClick={() => load(page.nextCursor)}>Next page of my messages</button>}
    </section>}
  </div>;
}
