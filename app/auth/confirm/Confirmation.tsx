'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { captureConfirmationLink, createBrowserEmailSignup, type ConfirmationLink, type EmailSignup, type EmailSignupModel } from '@/lib/auth/emailSignup';
import { DEFAULT_AUTH_REDIRECT_PATH } from '@/lib/auth/redirectPath';
import styles from '../recovery/recovery.module.css';

export default function Confirmation({ timeoutMs }: { timeoutMs?: number }) {
  const connection = useRef<EmailSignup | null>(null), epoch = useRef(0), captured = useRef<ConfirmationLink | null>(null);
  const [model, setModel] = useState<EmailSignupModel | null>(null), [error, setError] = useState('');
  useEffect(() => {
    let controller: EmailSignup;
    try {
      captured.current ??= captureConfirmationLink(window.location.href, window.location.origin, path => window.history.replaceState(null, '', path));
      controller = createBrowserEmailSignup(timeoutMs, captured.current);
    } catch { setError('Email confirmation is unavailable in this browser. Use a secure browser with local storage enabled.'); return; }
    connection.current = controller;
    const invalidate = () => { epoch.current++; };
    const off = controller.subscribe(value => { epoch.current++; setModel(value); });
    const focus = () => controller.activity(document.visibilityState !== 'hidden');
    const blur = () => { epoch.current++; controller.activity(false); };
    const visibility = () => { if (document.visibilityState === 'hidden') blur(); else focus(); };
    const offline = () => { epoch.current++; controller.connectivity(false); };
    const online = () => controller.connectivity(true);
    window.addEventListener('focus', focus); window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
    window.addEventListener('offline', offline); window.addEventListener('online', online);
    controller.connectivity(navigator.onLine); controller.activity(document.visibilityState !== 'hidden' && document.hasFocus());
    return () => {
      invalidate(); off(); connection.current = null; controller.close();
      window.removeEventListener('focus', focus); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('offline', offline); window.removeEventListener('online', online);
    };
  }, [timeoutMs]);
  const instance = connection.current, generation = epoch.current;
  const current = () => instance !== null && connection.current === instance && generation === epoch.current && instance.model().active && instance.model().online && instance.model().phase === model?.phase && !instance.model().busy;
  const signIn = '/login?confirmation=1&next=' + encodeURIComponent(model?.nextPath ?? DEFAULT_AUTH_REDIRECT_PATH);
  return <main className={styles.page}><section className={styles.card} aria-labelledby="confirmation-title">
    <Link className={styles.brand} href="/" prefetch={false}>Society of Explorers</Link>
    <h1 id="confirmation-title">Confirm your email</h1>
    <p>Verify this link, then sign in with your email and password to open your account.</p>
    <p role="status" aria-live="polite">{error || model?.message || 'Preparing confirmation…'}</p>
    {model?.canContinue && <button type="button" onClick={() => {
      if (!instance || !current() || !instance.model().canContinue) return;
      epoch.current++; void instance.continueConfirmation();
    }}>Continue email confirmation</button>}
    {model?.phase === 'confirmed' ? <p><Link href={signIn} prefetch={false}>Sign in to continue</Link></p>
      : <p><Link href="/login?mode=resend" prefetch={false}>Request a new confirmation email</Link></p>}
    <p className={styles.note}>Open the latest email in the browser where you requested it. A link expires after one hour and can be used once.</p>
  </section></main>;
}
