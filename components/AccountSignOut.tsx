'use client';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { signOutBrowser, type BrowserSignOutResult } from '@/lib/auth/browserSignOut';

export default function AccountSignOut({ available = true, resumeWalletSignOut = false }: {
  available?: boolean; resumeWalletSignOut?: boolean;
}) {
  const [phase, setPhase] = useState<'idle' | 'working' | 'unknown' | 'done'>('idle');
  const [completion, setCompletion] = useState<Extract<BrowserSignOutResult, { confirmed: true }> | null>(null);
  const request = useRef<string | null>(null);
  const working = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function signOut() {
    if (working.current) return;
    working.current = true;
    setPhase('working');
    try {
      request.current ??= crypto.randomUUID();
      const result = await signOutBrowser(createClient, request.current);
      if (!active.current) return;
      if (result.confirmed) {
        setCompletion(result);
        setPhase('done');
        request.current = null;
      } else setPhase('unknown');
    } catch { if (active.current) setPhase('unknown'); }
    finally { working.current = false; }
  }
  if (!available && !resumeWalletSignOut && phase === 'idle') return null;
  return <div style={{ fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#E8DCC8' }}>
    {phase !== 'done' && <button type="button" disabled={phase === 'working'} aria-busy={phase === 'working'} onClick={signOut}
      style={{ minHeight: 44, padding: '8px 12px', border: '1px solid #c9a84c', color: '#E8DCC8', background: '#15120c', cursor: 'pointer' }}>
      {phase === 'working' ? 'Signing out…' : phase === 'unknown' || resumeWalletSignOut ? 'Retry browser sign-out' : 'Sign out of this browser'}
    </button>}
    <div aria-live="polite">
      {(phase === 'unknown' || (phase === 'idle' && resumeWalletSignOut)) &&
        <p role="alert">Sign-out could not be confirmed. Retry before leaving this shared browser.</p>}
      {phase === 'done' && <><p role="status">Signed out of this browser. Other devices may still be signed in.</p>
        {completion?.walletSessionRevoked && <p>This wallet session was revoked.</p>}
        {completion?.sdkCleanup === 'unconfirmed' && <p>Provider cleanup could not be confirmed. This browser remains blocked from private access.</p>}
        <a href="/login" style={{ color: '#c9a84c', minHeight: 44, display: 'inline-block', padding: '12px 0' }}>Sign in again</a></>}
    </div>
  </div>;
}
