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
export default function QuestCircle({ circleId }: { circleId: string }) {
  const connection = useRef<Connection | null>(null);
  const lifetime = useRef({ mounted: false, generation: 0 });
  const [phase, setPhase] = useState<'closed' | 'connecting' | 'connected'>('closed');
  const [notice, setNotice] = useState('Connect your signed-in account to check current Circle access.');
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
      setNotice('This view needs a secure connection. Open the app over HTTPS or use the regular Circle view.'); return;
    }
    if (!providerConfigured()) {
      setNotice('Member sign-in is unavailable for this view. Use the regular Circle view.'); return;
    }
    const generation = ++lifetime.current.generation;
    setPhase('connecting'); setNotice('Connecting your existing account…');
    try {
      const [{ mountExistingMemberCircle }, { createClient }] = await Promise.all([
        import('@/platforms/quest/member-circle-page.mjs'), import('@/lib/supabase/client'),
      ]);
      if (!lifetime.current.mounted || lifetime.current.generation !== generation) return;
      const memberAuth = createQuestMemberAuth(createClient().auth, { origin: window.location.origin,
        request: (url, init) => window.fetch(url, init),
        isCurrent: () => lifetime.current.mounted && lifetime.current.generation === generation
          && document.visibilityState === 'visible' && document.hasFocus() && navigator.onLine !== false,
      });
      try {
        const view = mountExistingMemberCircle({ window, document, config: {
          circleId, origin: window.location.origin, auth: memberAuth.auth,
        } });
        connection.current = { invalidate: memberAuth.invalidate, dispose() { memberAuth.retire(); view.dispose(); } };
      } catch { memberAuth.retire(); throw Error('Circle connection unavailable'); }
      setPhase('connected'); setNotice('Account connection opened. Check the member-session and Circle-access messages below.');
    } catch {
      if (lifetime.current.mounted && lifetime.current.generation === generation) {
        connection.current?.dispose(); connection.current = null;
        setPhase('closed'); setNotice('The Circle view could not connect. Try again or use the regular Circle view.');
      }
    }
  }
  function disconnect() {
    lifetime.current.generation++; connection.current?.dispose(); connection.current = null;
    setPhase('closed'); setNotice('Circle view closed and private data cleared. Your account remains signed in.');
  }
  return <main id="main" className={styles.scope}>
    <section><p>READ. REFLECT. SHARE.</p><h1>Quest Browser Circle</h1>
      <p>This view uses your existing web account. It opens in the regular browser window.</p>
      <p>Use email or Google sign-in for this view. For a wallet-only account, use the regular Circle view.</p>
      <p><Link href={`/circles/${circleId}`}>Regular Circle view and safety controls</Link>{' · '}<Link href={`/circles/${circleId}/discussion`}>Full discussion archive</Link></p>
      <p><Link href={`/login?next=${encodeURIComponent(`/quest/${circleId}`)}`}>Sign in to your account</Link></p>
      <p role="status">{notice}</p>
      <button type="button" disabled={phase !== 'closed'} onClick={() => void connect()}>{phase === 'connecting' ? 'Connecting…' : 'Connect signed-in account'}</button>
      <button type="button" disabled={phase === 'closed'} onClick={disconnect}>Disconnect Circle view</button>
    </section>
    <div data-quest-member-view>
      <h2 id="circle-title">A conversation worth having.</h2>
      <section aria-label="Member session"><p id="member-session-status" role="status">Member session is not connected.</p><button id="member-session-check" type="button" disabled>Check member session</button></section>
      <section aria-label="Circle access"><p id="circle-host-status" role="status">Circle access is not connected.</p><p id="circle-read-status" role="status" /><button id="circle-refresh" type="button" disabled>Refresh circle access</button><button id="circle-archive-open" type="button" disabled>Open discussion archive</button><button id="circle-close" type="button" disabled>Close and clear Circle</button></section>
      <section id="circle-conversation" aria-labelledby="circle-conversation-heading" hidden><h2 id="circle-conversation-heading">Circle conversation</h2><p>Latest 100 messages. Open the full discussion archive for older conversations.</p><div id="circle-messages" /></section>
      <section id="circle-archive" aria-labelledby="circle-archive-heading" hidden><h2 id="circle-archive-heading">Discussion archive</h2><p id="circle-archive-status" role="status" /><div id="circle-archive-messages" /><button id="circle-archive-next" type="button" hidden>Older discussions</button></section>
      <section id="circle-composer"><h2>Your message</h2><label htmlFor="circle-draft">Message to this Circle</label><textarea id="circle-draft" maxLength={2000} autoComplete="off" spellCheck={false} aria-describedby="circle-remaining circle-write-status" disabled /><p id="circle-remaining">2000 characters remaining</p><p id="circle-write-status" role="status" /><button id="circle-post" type="button" disabled>Post to Circle</button><button id="circle-clear" type="button" disabled>Clear draft</button><button id="circle-new" type="button" hidden>I reviewed the conversation; start a new blank message</button></section>
    </div>
    <p>Drafts stay in this view and clear when the view, account, focus or connectivity ends. A sent request may still complete. Nothing is resent automatically.</p>
  </main>;
}
