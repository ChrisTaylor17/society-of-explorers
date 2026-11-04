'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createQuestMemberAuth } from '@/lib/circles/quest-member-auth';
import { subscribeAuthProviderChanges } from '@/lib/auth/providerSelection';
import styles from './quest.module.css';

type Connection = { dispose(): void; invalidate(): void };
function providerConfigured() {
  const address = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!address || !key || /placeholder|offline/i.test(key) || /[\s\u0000-\u001f\u007f]/.test(key)) return false;
  try {
    const url = new URL(address);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
      && !url.hostname.endsWith('.invalid') && url.hostname !== 'placeholder.supabase.co';
  } catch { return false; }
}

/** The platform view owns this DOM island. React only owns its surrounding
 * connect controls; no credential or private message enters React props/state. */
export default function QuestCircle({ circleId }: { circleId?: string }) {
  const connection = useRef<Connection | null>(null);
  const lifetime = useRef({ mounted: false, generation: 0 });
  const [phase, setPhase] = useState<'closed' | 'connecting' | 'connected'>('closed');
  const [notice, setNotice] = useState(circleId ? 'Connect your signed-in account to check current Circle access.' : 'Connect your signed-in account to check your posted messages across Circles.');
  useEffect(() => {
    const current = lifetime.current;
    current.mounted = true;
    const changed = () => {
      current.generation++; connection.current?.dispose(); connection.current = null;
      setPhase('closed'); setNotice('Your selected account changed. Connect and check the current account before continuing.');
    };
    const offProvider = subscribeAuthProviderChanges(changed);
    const pause = () => connection.current?.invalidate();
    const visibility = () => { if (document.visibilityState !== 'visible') pause(); };
    window.addEventListener('blur', pause); window.addEventListener('offline', pause); window.addEventListener('pagehide', pause);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      current.mounted = false; current.generation++; connection.current?.dispose(); connection.current = null; offProvider();
      window.removeEventListener('blur', pause); window.removeEventListener('offline', pause); window.removeEventListener('pagehide', pause);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  async function connect() {
    if (phase !== 'closed') return;
    if (!window.isSecureContext || window.location.protocol !== 'https:') {
      setNotice(circleId ? 'This view needs a secure connection. Open the app over HTTPS or use the regular Circle view.' : 'This view needs a secure connection. Open the app over HTTPS or use your regular posted messages page.'); return;
    }
    if (!providerConfigured()) {
      setNotice(circleId ? 'Member sign-in is unavailable for this view. Use the regular Circle view.' : 'Member sign-in is unavailable for this view. Use your regular posted messages page.'); return;
    }
    const generation = ++lifetime.current.generation;
    setPhase('connecting'); setNotice('Connecting your existing account…');
    try {
      const [{ mountExistingMemberCircle, mountExistingMemberContributions }, { createClient }] = await Promise.all([
        import('@/platforms/quest/member-circle-page.mjs'), import('@/lib/supabase/client'),
      ]);
      if (!lifetime.current.mounted || lifetime.current.generation !== generation) return;
      const memberAuth = createQuestMemberAuth(createClient().auth, { origin: window.location.origin,
        request: (url, init) => window.fetch(url, init),
        isCurrent: () => lifetime.current.mounted && lifetime.current.generation === generation
          && document.visibilityState === 'visible' && document.hasFocus() && navigator.onLine !== false,
      });
      try {
        const view = circleId
          ? mountExistingMemberCircle({ window, document, config: { circleId, origin: window.location.origin, auth: memberAuth.auth } })
          : mountExistingMemberContributions({ window, document, config: { origin: window.location.origin, auth: memberAuth.auth } });
        connection.current = { invalidate: memberAuth.invalidate, dispose() { memberAuth.retire(); view.dispose(); } };
      } catch { memberAuth.retire(); throw Error('Circle connection unavailable'); }
      setPhase('connected'); setNotice(circleId ? 'Account connection opened. Check the member-session and Circle-access messages below.' : 'Account connection opened. Check the member session, then load your own posted messages when ready.');
    } catch {
      if (lifetime.current.mounted && lifetime.current.generation === generation) {
        connection.current?.dispose(); connection.current = null;
        setPhase('closed'); setNotice(circleId ? 'The Circle view could not connect. Try again or use the regular Circle view.' : 'Your contributions could not connect. Try again or use your regular posted messages page.');
      }
    }
  }
  function disconnect() {
    lifetime.current.generation++; connection.current?.dispose(); connection.current = null;
    setPhase('closed'); setNotice(circleId ? 'Circle view closed and private data cleared. Your account remains signed in.' : 'Contributions view closed and private data cleared. Your account remains signed in.');
  }
  return <main id="main" className={styles.scope}>
    <section><p>READ. REFLECT. SHARE.</p><h1>{circleId ? 'Quest Browser Circle' : 'My Quest Browser contributions'}</h1>
      <p>This view uses your existing web account. It opens in the regular browser window.</p>
      <p>Use email or Google sign-in for this view. For a wallet-only account, use the regular {circleId ? 'Circle view' : 'posted messages page'}.</p>
      <p>{circleId ? <><Link href={`/circles/${circleId}`}>Regular Circle view and safety controls</Link>{' · '}<Link href={`/circles/${circleId}/discussion`}>Full discussion archive</Link>{' · '}<Link href="/quest/contributions">My posted messages across Circles</Link></> : <><Link href="/circles/contributions">Regular posted messages and AI review settings</Link>{' · '}<Link href="/quest">Quest Browser home</Link></>}</p>
      <p><Link href={`/login?next=${encodeURIComponent(circleId ? `/quest/${circleId}` : '/quest/contributions')}`}>Sign in to your account</Link></p>
      <p role="status">{notice}</p>
      <button type="button" disabled={phase !== 'closed'} onClick={() => void connect()}>{phase === 'connecting' ? 'Connecting…' : 'Connect signed-in account'}</button>
      <button type="button" disabled={phase === 'closed'} onClick={disconnect}>{circleId ? 'Disconnect Circle view' : 'Disconnect contributions view'}</button>
    </section>
    <div data-quest-member-view>
      {circleId ? <h2 id="circle-title">A conversation worth having.</h2> : null}
      <section aria-label="Member session"><p id="member-session-status" role="status">Member session is not connected.</p><button id="member-session-check" type="button" disabled>Check member session</button></section>
      <button id="member-contributions-open" type="button" disabled>My posted messages</button>
      <section id="member-contributions" aria-labelledby="member-contributions-heading" hidden>
        <h2 id="member-contributions-heading" tabIndex={-1}>My posted messages</h2>
        <p>Find your own contributions across Circles, including after leaving or when a Circle is hidden. Check a message’s current state before withdrawing it.</p>
        <p id="member-contributions-status" role="status" />
        <section id="member-contributions-list" aria-label="Your posted messages">
          <button id="member-contributions-refresh" type="button" disabled>Load my posted messages</button>
          <div id="member-contributions-items" />
          <button id="member-contributions-next" type="button" hidden disabled>Next posted messages</button>
        </section>
        <section id="member-contributions-selected" aria-labelledby="member-contributions-selected-heading" hidden>
          <h3 id="member-contributions-selected-heading" tabIndex={-1}>Current contribution</h3>
          <p id="member-contributions-action-status" role="status" /><div id="member-contributions-message" /><div id="member-contributions-explanations" />
          <p id="member-contributions-privacy" />
          <label id="member-contributions-confirm-label" hidden style={{ minHeight: 44, padding: '8px 0' }}><input id="member-contributions-confirm" type="checkbox" disabled /> I understand withdrawal removes this message from member views and cannot be undone here.</label>
          <button id="member-contributions-withdraw" type="button" disabled hidden aria-describedby="member-contributions-privacy">Withdraw my contribution</button>
          <button id="member-contributions-check" type="button" disabled>Check current contribution</button>
          <button id="member-contributions-retry" type="button" hidden disabled>Retry exact withdrawal</button>
          <button id="member-contributions-back" type="button" disabled>Back to my posted messages</button>
          <p>A current-state check does not confirm an earlier withdrawal request. A sent request may still complete. Nothing retries automatically. These controls do not change AI consent.</p>
        </section>
        <button id="member-contributions-return" type="button" disabled>Return to Circle</button>
      </section>
      <div id="member-circle-workspace">
      {circleId ? <>
      <section aria-label="Circle access"><p id="circle-host-status" role="status">Circle access is not connected.</p><p id="circle-read-status" role="status" /><button id="circle-refresh" type="button" disabled>Refresh circle access</button><button id="circle-archive-open" type="button" disabled>Open discussion archive</button><button id="circle-close" type="button" disabled>Close and clear Circle</button></section>
      <section id="circle-conversation" aria-labelledby="circle-conversation-heading" hidden><h2 id="circle-conversation-heading">Circle conversation</h2><p>Latest 100 messages. Open the full discussion archive for older conversations.</p><div id="circle-messages" /></section>
      <section id="circle-archive" aria-labelledby="circle-archive-heading" hidden><h2 id="circle-archive-heading">Discussion archive</h2><p id="circle-archive-status" role="status" /><div id="circle-archive-messages" /><button id="circle-archive-next" type="button" hidden>Older discussions</button>
        <section id="circle-thread-write" aria-labelledby="circle-thread-write-heading" hidden>
          <h3 id="circle-thread-write-heading">Write in this discussion</h3>
          <button id="circle-thread-new" type="button" disabled>Start a new discussion</button>
          <p id="circle-thread-target" /><label htmlFor="circle-thread-draft">Your contribution</label>
          <textarea id="circle-thread-draft" maxLength={2000} autoComplete="off" spellCheck={false} aria-describedby="circle-thread-remaining circle-thread-status" disabled />
          <p id="circle-thread-remaining">2000 characters remaining</p><p id="circle-thread-status" role="status" />
          <button id="circle-thread-review" type="button" disabled>Review contribution</button>
          <section id="circle-thread-preview" aria-label="Contribution preview" hidden>
            <h4>Review the selected parent and full contribution</h4><p id="circle-thread-preview-parent" style={{ whiteSpace: 'pre-wrap' }} /><p id="circle-thread-preview-content" style={{ whiteSpace: 'pre-wrap' }} />
            <label style={{ minHeight: 44, padding: '8px 0' }}><input id="circle-thread-confirm" type="checkbox" disabled /> I reviewed this exact contribution and its reply context.</label>
            <button id="circle-thread-post" type="button" disabled>Post reviewed contribution</button><button id="circle-thread-edit" type="button" disabled>Edit contribution</button>
          </section>
          <button id="circle-thread-check" type="button" hidden>Check saved contribution</button><button id="circle-thread-retry" type="button" hidden>Retry exact contribution</button>
          <button id="circle-thread-cancel" type="button" disabled>Clear contribution</button><button id="circle-thread-saved" type="button" hidden>Open saved thread</button>
          <p>Replies link to the selected contribution. Check message actions to report or withdraw, or use its regular-view link. A missing receipt does not prove that an earlier request failed; only check or retry the same contribution.</p>
        </section>
      </section>
      <section id="circle-safety" aria-labelledby="circle-safety-heading" hidden>
        <h2 id="circle-safety-heading" tabIndex={-1}>Current message actions</h2>
        <p id="circle-safety-status" role="status" /><div id="circle-safety-message" /><div id="circle-safety-explanations" />
        <fieldset id="circle-safety-report-fields" hidden style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <legend>Private report</legend><p>Reports are private to eligible assigned reviewers. Describe conduct, rather than political or religious disagreement. Do not include unnecessary personal details. A report is an allegation, not a finding.</p>
          <label htmlFor="circle-safety-reason">Report reason</label><select id="circle-safety-reason" disabled style={{ maxWidth: '100%', minHeight: 44, font: 'inherit' }}><option value="">Choose a reason</option></select>
          <label htmlFor="circle-safety-note">Private report details (optional)</label><textarea id="circle-safety-note" maxLength={1000} autoComplete="off" spellCheck={false} aria-describedby="circle-safety-remaining" disabled /><p id="circle-safety-remaining">1000 characters remaining</p>
        </fieldset>
        <p id="circle-safety-privacy" hidden />
        <label style={{ minHeight: 44, padding: '8px 0' }} hidden><input id="circle-safety-confirm" type="checkbox" disabled /> <span id="circle-safety-confirm-label" /></label>
        <button id="circle-safety-report" type="button" disabled hidden>Send private report</button><button id="circle-safety-withdraw" type="button" disabled hidden aria-describedby="circle-safety-privacy">Withdraw my message</button>
        <button id="circle-safety-refresh" type="button" disabled>Check current message</button><button id="circle-safety-retry" type="button" hidden>Retry exact action</button><button id="circle-safety-close" type="button" disabled>Close message actions</button>
        <p>Checking the current message does not confirm a previous request. A sent request may still complete. Nothing retries automatically. Message AI consent is separate and is not changed by these actions.</p>
      </section>
      <section id="circle-composer"><h2>Your message</h2><label htmlFor="circle-draft">Message to this Circle</label><textarea id="circle-draft" maxLength={2000} autoComplete="off" spellCheck={false} aria-describedby="circle-remaining circle-write-status" disabled /><p id="circle-remaining">2000 characters remaining</p><p id="circle-write-status" role="status" /><button id="circle-post" type="button" disabled>Post to Circle</button><button id="circle-clear" type="button" disabled>Clear draft</button><button id="circle-new" type="button" hidden>I reviewed the conversation; start a new blank message</button></section>
      </> : null}
      </div>
    </div>
    <p>Drafts stay in this view and clear when the view, account, focus or connectivity ends. A sent request may still complete. Nothing is resent automatically.</p>
  </main>;
}
