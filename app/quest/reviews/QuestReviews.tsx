'use client';

import Link from 'next/link';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import MessageReviews from '@/app/moderation/messages/MessageReviews';
import { subscribeAuthProviderChanges } from '@/lib/auth/providerSelection';
import { body, button, gold, h1, label, lead, small } from '@/lib/circles/ui';

/** Reuse the complete human/AI review workflow in the regular Quest Browser.
 * No reviewer client or private view is mounted until explicit connection. */
export default function QuestReviews() {
  const lifetime = useRef({ mounted: false, epoch: 0, open: false });
  const [view, setView] = useState({ epoch: 0, open: false, notice: 'Connect your signed-in account, then load assigned message reviews to check current access.' });
  const publish = useCallback((open: boolean, notice: string) => {
    const life = lifetime.current;
    life.open = open;
    setView({ epoch: ++life.epoch, open, notice });
  }, []);
  useLayoutEffect(() => {
    const life = lifetime.current;
    life.mounted = true;
    publish(false, 'Connect your signed-in account, then load assigned message reviews to check current access.');
    const retire = () => publish(false, 'Review view closed and private evidence cleared. Reconnect and load assignments when ready. A decision already sent may still finish.');
    const changed = () => publish(false, 'The selected account changed. Reconnect and load assignments to check current review access.');
    const visibility = () => { if (document.visibilityState !== 'visible') retire(); };
    const offProvider = subscribeAuthProviderChanges(changed);
    window.addEventListener('blur', retire);
    window.addEventListener('offline', retire);
    window.addEventListener('pagehide', retire);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      life.mounted = false; life.open = false; life.epoch++;
      offProvider();
      window.removeEventListener('blur', retire);
      window.removeEventListener('offline', retire);
      window.removeEventListener('pagehide', retire);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [publish]);
  const current = () => lifetime.current.mounted && lifetime.current.epoch === view.epoch;
  function connect() {
    if (!current() || lifetime.current.open) return;
    if (!window.isSecureContext || window.location.protocol !== 'https:') {
      publish(false, 'Open the app over a secure connection before connecting your review account.'); return;
    }
    if (document.visibilityState !== 'visible' || !document.hasFocus() || navigator.onLine === false) {
      publish(false, 'Return to this view with a connection, then connect your account.'); return;
    }
    publish(true, 'Review view opened. Load assigned message reviews to check access. Opening this view does not grant a reviewer assignment.');
  }
  function disconnect() {
    if (!current() || !lifetime.current.open) return;
    publish(false, 'Review view closed and private evidence cleared. Your account remains signed in. A decision already sent may still finish.');
  }
  return <>
    <p style={label}>Assigned human reviewers · Quest Browser</p>
    <h1 style={h1}>Review Circle messages</h1>
    <p style={lead}>Read current evidence and explain decisions about conduct. Political or religious disagreement alone does not justify a restriction.</p>
    <p style={body}>This review opens in the regular browser window and uses your existing signed-in account.</p>
    <p style={{ ...small, marginBottom: '1rem' }}>
      <Link href="/login?next=%2Fquest%2Freviews" style={{ color: gold, display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>Sign in</Link>{' · '}
      <Link href="/quest" style={{ color: gold, display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>Quest Browser home</Link>{' · '}
      <Link href="/moderation/circles" style={{ color: gold, display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>Circle listing reviews</Link>
    </p>
    <p role="status" style={body}>{view.notice}</p>
    {view.open ? <>
      <button type="button" style={{ ...button, marginBottom: '1rem' }} onClick={disconnect}>Close review view</button>
      <MessageReviews key={view.epoch} />
    </> : <button type="button" style={button} onClick={connect}>Connect my review account</button>}
  </>;
}
