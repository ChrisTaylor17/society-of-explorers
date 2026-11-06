'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { notifyAuthProviderChanged, subscribeAuthProviderChanges } from '@/lib/auth/providerSelection';
import { isCurrentBrowserAuthIntent, parseBrowserIntent } from '@/lib/auth/browserIntent';
import { ACCOUNT_DELETION_PATH, parseDeletionOwner } from '@/lib/account/deletion-contract';
import { memberSessionDto } from '@/lib/auth/memberDto';
import { isUuid } from '@/lib/ids/uuid';
import { getSafeAuthRedirectPath } from '@/lib/auth/redirectPath';
import styles from '../recovery/recovery.module.css';

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
async function readJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error('Sign-in unavailable');
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 262144) throw new Error('Sign-in unavailable'); chunks.push(part.value); } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export default function Completion({ nextPath, intent }: { nextPath: string; intent: string | null }) {
  const forDeletion = nextPath === ACCOUNT_DELETION_PATH;
  const router = useRouter(), state = useRef({ mounted: false, active: false, online: false, busy: false, epoch: 0, notifying: false, operation: null as AbortController | null });
  const [enabled, setEnabled] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(forDeletion
    ? 'Continue to verify your Google sign-in and open the account deletion page.'
    : 'Continue to verify your Google sign-in and open your member profile.');
  useEffect(() => {
    const owner = state.current; owner.mounted = true;
    const refresh = () => setEnabled(owner.mounted && owner.active && owner.online && !owner.busy && !!intent && isCurrentBrowserAuthIntent(intent));
    const retire = () => { owner.epoch++; owner.operation?.abort(); owner.operation = null; owner.busy = false; setBusy(false); refresh(); };
    const focus = () => { owner.active = document.visibilityState !== 'hidden'; refresh(); };
    const blur = () => { owner.active = false; retire(); };
    const visibility = () => { if (document.visibilityState === 'hidden') blur(); else focus(); };
    const offline = () => { owner.online = false; retire(); };
    const online = () => { owner.online = true; refresh(); };
    const stop = subscribeAuthProviderChanges(() => { if (!owner.notifying && (!intent || !isCurrentBrowserAuthIntent(intent))) { retire(); setMessage('The account choice changed. Sign in again to continue.'); } });
    window.addEventListener('focus', focus); window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
    window.addEventListener('offline', offline); window.addEventListener('online', online);
    owner.online = navigator.onLine; owner.active = document.visibilityState !== 'hidden' && document.hasFocus();
    if (!intent || !isCurrentBrowserAuthIntent(intent)) setMessage('This sign-in is no longer current. Sign in again to continue.');
    refresh();
    return () => {
      owner.mounted = false; owner.active = false; retire(); stop();
      window.removeEventListener('focus', focus); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('offline', offline); window.removeEventListener('online', online);
    };
  }, [intent]);
  const generation = state.current.epoch;
  async function complete() {
    const owner = state.current;
    if (!owner.mounted || !owner.active || !owner.online || owner.busy || generation !== owner.epoch || !intent || parseBrowserIntent(intent) !== intent || !isCurrentBrowserAuthIntent(intent)) return;
    owner.busy = true; owner.epoch++; const attempt = owner.epoch, operation = new AbortController(); owner.operation = operation;
    setBusy(true); setEnabled(false); setMessage('Checking your selected account…');
    const current = () => owner.mounted && owner.active && owner.online && owner.operation === operation && owner.epoch === attempt && !operation.signal.aborted && isCurrentBrowserAuthIntent(intent);
    const check = () => { if (!current()) throw new Error('Sign-in unavailable'); };
    const timer = setTimeout(() => operation.abort(), 8000);
    async function request(path: string, options: RequestInit = {}) {
      check(); const url = window.location.origin + path;
      const response = await fetch(url, { ...options, credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: operation.signal });
      check(); if (response.redirected || response.url !== url) throw new Error('Sign-in unavailable');
      const body = await readJson(response); check(); return { response, body };
    }
    try {
      if (forDeletion) {
        const proof = await request('/api/account/deletion');
        if (!proof.response.ok || !record(proof.body) || parseDeletionOwner(proof.body.owner)?.provider !== 'supabase') throw new Error('Sign-in unavailable');
      } else {
        let proof = await request('/api/auth/member');
        if (proof.response.status === 401) {
          const setup = await request('/api/auth/ensure-member', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: 'Explorer' }) });
          if (!setup.response.ok) throw new Error('Sign-in unavailable');
          proof = await request('/api/auth/member');
        }
        const member = record(proof.body) ? memberSessionDto(proof.body.member) : null;
        if (!proof.response.ok || !record(proof.body) || !record(proof.body.auth) || proof.body.auth.provider !== 'supabase' || !isUuid(proof.body.auth.subject) || !member || member.supabase_auth_id !== proof.body.auth.subject) throw new Error('Sign-in unavailable');
      }
      check(); owner.notifying = true;
      try { notifyAuthProviderChanged(); } finally { owner.notifying = false; }
      check(); setMessage('Signed in. Opening your account…'); router.replace(getSafeAuthRedirectPath(nextPath));
    } catch { if (owner.mounted && owner.epoch === attempt) setMessage('Sign-in could not be confirmed. Sign in again to continue.'); }
    finally {
      clearTimeout(timer); operation.abort();
      if (owner.operation === operation) { owner.operation = null; owner.busy = false; if (owner.mounted) { setBusy(false); setEnabled(owner.active && owner.online && isCurrentBrowserAuthIntent(intent)); } }
    }
  }
  return <main className={styles.page}><section className={styles.card} aria-labelledby="completion-title">
    <Link className={styles.brand} href="/" prefetch={false}>Society of Explorers</Link>
    <h1 id="completion-title">Finish signing in</h1>
    <p role="status" aria-live="polite">{message}</p>
    <button type="button" disabled={!enabled} aria-busy={busy} onClick={() => { void complete(); }}>Continue to your account</button>
    <p><a href={'/login?next=' + encodeURIComponent(getSafeAuthRedirectPath(nextPath))}>Sign in again</a></p>
  </section></main>;
}
