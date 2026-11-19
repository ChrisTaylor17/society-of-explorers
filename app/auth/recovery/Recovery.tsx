'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { captureRecoveryLink, createBrowserEmailRecovery, type RecoveryLink, type EmailRecovery, type EmailRecoveryModel } from '../../../lib/auth/emailRecovery';
import styles from './recovery.module.css';

export default function Recovery({ timeoutMs }: { timeoutMs?: number }) {
  const connection = useRef<EmailRecovery | null>(null), epoch = useRef(0), captured = useRef<RecoveryLink | null>(null);
  const [model, setModel] = useState<EmailRecoveryModel | null>(null), [error, setError] = useState('');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  useEffect(() => {
    let controller: EmailRecovery;
    try {
      captured.current ??= captureRecoveryLink(window.location.href, window.location.origin, path => window.history.replaceState(null, '', path));
      controller = createBrowserEmailRecovery(timeoutMs, captured.current);
    } catch { setError('Password recovery is unavailable in this browser. Use a secure browser with local storage enabled.'); return; }
    connection.current = controller;
    const clear = () => { epoch.current++; setPassword(''); setConfirmation(''); };
    const off = controller.subscribe(value => { epoch.current++; setModel(value); if (!value.active || !value.online || value.busy || value.phase !== 'ready') { setPassword(''); setConfirmation(''); } });
    const focus = () => { controller.activity(document.visibilityState !== 'hidden'); };
    const blur = () => { clear(); controller.activity(false); };
    const visibility = () => { if (document.visibilityState === 'hidden') blur(); else focus(); };
    const offline = () => { clear(); controller.connectivity(false); };
    const online = () => controller.connectivity(true);
    window.addEventListener('focus', focus); window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
    window.addEventListener('offline', offline); window.addEventListener('online', online);
    controller.connectivity(navigator.onLine); focus();
    return () => { clear(); off(); connection.current = null; controller.close(); window.removeEventListener('focus', focus); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('offline', offline); window.removeEventListener('online', online); };
  }, [timeoutMs]);
  const view = model, instance = connection.current, generation = epoch.current;
  const current = () => instance !== null && connection.current === instance && generation === epoch.current && instance.model().active && instance.model().online && instance.model().phase === view?.phase && !instance.model().busy;
  return <main className={styles.page}><section className={styles.card} aria-labelledby="recovery-title">
    <Link className={styles.brand} href="/" prefetch={false}>Society of Explorers</Link><h1 id="recovery-title">Recover your password</h1>
    <p>This page only changes your password. Afterward, sign in to access your account.</p>
    <p role="status" aria-live="polite">{error || model?.message || 'Preparing recovery…'}</p>
    {model?.warning && <p role="alert">{model.warning}</p>}
    {model && model.phase !== 'accepted' && <form onSubmit={event => { event.preventDefault(); if (!instance || !current() || !instance.model().canRequest) return; const value = email; epoch.current++; setEmail(''); setPassword(''); setConfirmation(''); void instance.requestEmail(value); }}>
      <label htmlFor="recovery-email">Email</label><input id="recovery-email" type="email" autoComplete="email" maxLength={254} value={email} disabled={!model.canRequest} onChange={event => { if (current()) { epoch.current++; setEmail(event.target.value); } }} required />
      <button disabled={!model.canRequest}>Send recovery email</button>
    </form>}
    {model?.canContinue && <button type="button" onClick={() => { if (instance && current() && instance.model().canContinue) { epoch.current++; void instance.verifyLink(); } }}>Continue recovery</button>}
    {model?.phase === 'ready' && <form onSubmit={event => { event.preventDefault(); if (!instance || !current() || !instance.model().canUpdate) return; const value = password, repeated = confirmation; epoch.current++; setPassword(''); setConfirmation(''); void instance.updatePassword(value, repeated); }}>
      <label htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={1024} value={password} disabled={!model.canUpdate} onChange={event => { if (current()) { epoch.current++; setPassword(event.target.value); } }} required />
      <label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" type="password" autoComplete="new-password" minLength={8} maxLength={1024} value={confirmation} disabled={!model.canUpdate} onChange={event => { if (current()) { epoch.current++; setConfirmation(event.target.value); } }} required />
      <button disabled={!model.canUpdate}>Update password</button>
    </form>}
    <p className={styles.note}>Open the latest email in the browser where you requested it. Links expire and can be used once. Nothing retries automatically. A password change already sent may still finish after you leave this page.</p>
    <Link href="/login?recovery=1" prefetch={false}>Sign in</Link>
  </section></main>;
}
