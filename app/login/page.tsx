'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { createBrowserEmailSignup, type EmailSignup, type EmailSignupModel } from '@/lib/auth/emailSignup';
import { createBrowserWebAccount, type WebAccountModel } from '@/lib/auth/webAccount';
import { getSafeNextPath } from '@/lib/auth/loginForm';
import { subscribeAuthProviderChanges } from '@/lib/auth/providerSelection';
import styles from './login.module.css';

type Mode = 'signin' | 'signup' | 'resend';
type Retire = { current: (() => void) | null };
type Lifecycle = { activity(active: boolean): void; connectivity(online: boolean): void };
type WebAccount = ReturnType<typeof createBrowserWebAccount>;

function listen(controller: Lifecycle, clear: () => void) {
  const focus = () => controller.activity(document.visibilityState !== 'hidden');
  const blur = () => { clear(); controller.activity(false); };
  const visibility = () => { if (document.visibilityState === 'hidden') blur(); else focus(); };
  const offline = () => { clear(); controller.connectivity(false); };
  const online = () => controller.connectivity(true);
  window.addEventListener('focus', focus); window.addEventListener('blur', blur);
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('offline', offline); window.addEventListener('online', online);
  controller.connectivity(navigator.onLine); controller.activity(document.visibilityState !== 'hidden' && document.hasFocus());
  return () => {
    window.removeEventListener('focus', focus); window.removeEventListener('blur', blur);
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('offline', offline); window.removeEventListener('online', online);
  };
}

function SignIn({ nextPath, retireRef }: { nextPath: string; retireRef: Retire }) {
  const router = useRouter(), connection = useRef<WebAccount | null>(null), epoch = useRef(0);
  const [model, setModel] = useState<WebAccountModel | null>(null), [error, setError] = useState('');
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  useEffect(() => {
    let controller: WebAccount;
    try { controller = createBrowserWebAccount({ nextPath, navigate: path => router.push(path) }); }
    catch { let mounted = true; queueMicrotask(() => { if (mounted) setError('Sign-in is unavailable in this browser. Use a secure browser with cookies enabled.'); }); return () => { mounted = false; }; }
    connection.current = controller;
    const clear = () => { epoch.current++; setEmail(''); setPassword(''); };
    const close = () => { clear(); connection.current = null; controller.close(); };
    retireRef.current = close;
    const off = controller.subscribe(value => {
      epoch.current++; setModel(value);
      // Controller emissions retire drafts, including an account change while idle.
      setEmail(''); setPassword('');
    });
    const stop = listen(controller, clear);
    return () => { off(); stop(); close(); if (retireRef.current === close) retireRef.current = null; };
  }, [nextPath, retireRef, router]);
  const instance = connection.current, generation = epoch.current;
  const current = () => instance !== null && connection.current === instance && generation === epoch.current && instance.model().active && instance.model().online && instance.model().phase === model?.phase && !instance.model().busy;
  const begin = (action: (controller: WebAccount) => void) => {
    if (!instance || !current() || !instance.model().canSignIn) return;
    epoch.current++; setEmail(''); setPassword(''); action(instance);
  };
  return <>
    <p role="status" aria-live="polite" id="login-status">{error || model?.message || 'Preparing sign-in…'}</p>
    <div className={styles.providers}>
      <button type="button" disabled={!model?.canSignIn} onClick={() => begin(controller => { void controller.google(); })}>Continue with Google</button>
      <button type="button" disabled={!model?.canSignIn} onClick={() => begin(controller => { void controller.wallet(); })}>Connect wallet</button>
    </div>
    {model?.canContinueWallet && <button type="button" onClick={() => {
      if (!instance || !current() || !instance.model().canContinueWallet) return;
      epoch.current++; void instance.continueWallet();
    }}>Continue wallet sign-in</button>}
    <p className={styles.divider}>or sign in with email</p>
    <form noValidate aria-describedby="login-status" onSubmit={event => {
      event.preventDefault(); const submittedEmail = email, submittedPassword = password;
      begin(controller => { void controller.signIn(submittedEmail, submittedPassword); });
    }}>
      <label htmlFor="login-email">Email</label>
      <input id="login-email" name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} maxLength={254} value={email} disabled={!model?.canSignIn} onChange={event => { if (current()) { epoch.current++; setEmail(event.target.value); } }} required />
      <label htmlFor="login-password">Password</label>
      <input id="login-password" name="password" type="password" autoComplete="current-password" maxLength={1024} value={password} disabled={!model?.canSignIn} onChange={event => { if (current()) { epoch.current++; setPassword(event.target.value); } }} required />
      <button type="submit" disabled={!model?.canSignIn} aria-busy={model?.busy}>Sign in</button>
    </form>
    <p><a href="/auth/recovery">Forgot your password?</a></p>
  </>;
}

function EmailForm({ mode, nextPath, retireRef }: { mode: 'signup' | 'resend'; nextPath: string; retireRef: Retire }) {
  const connection = useRef<EmailSignup | null>(null), epoch = useRef(0);
  const [model, setModel] = useState<EmailSignupModel | null>(null), [error, setError] = useState('');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  useEffect(() => {
    let controller: EmailSignup;
    try { controller = createBrowserEmailSignup(undefined, { kind: 'none' }, nextPath); }
    catch { let mounted = true; queueMicrotask(() => { if (mounted) setError('Email signup is unavailable in this browser. Use a secure browser with local storage enabled.'); }); return () => { mounted = false; }; }
    connection.current = controller;
    const clear = () => { epoch.current++; setEmail(''); setPassword(''); setConfirmation(''); };
    const close = () => { clear(); connection.current = null; controller.close(); };
    retireRef.current = close;
    const off = controller.subscribe(value => {
      epoch.current++; setModel(value);
      if (!value.active || !value.online || value.busy) { setEmail(''); setPassword(''); setConfirmation(''); }
    });
    const stop = listen(controller, clear);
    const stopProvider = subscribeAuthProviderChanges(() => {
      clear(); controller.activity(false);
      controller.activity(document.visibilityState !== 'hidden' && document.hasFocus());
    });
    return () => { off(); stop(); stopProvider(); close(); if (retireRef.current === close) retireRef.current = null; };
  }, [nextPath, retireRef]);
  const instance = connection.current, generation = epoch.current;
  const current = () => instance !== null && connection.current === instance && generation === epoch.current && instance.model().active && instance.model().online && instance.model().phase === model?.phase && !instance.model().busy;
  const enabled = mode === 'signup' ? model?.canSignUp : model?.canResend;
  return <>
    <p role="status" aria-live="polite" id="signup-status">{error || model?.message || 'Preparing email confirmation…'}</p>
    <form noValidate aria-describedby="signup-status" onSubmit={event => {
      event.preventDefault(); if (!instance || !current() || !(mode === 'signup' ? instance.model().canSignUp : instance.model().canResend)) return;
      const submittedEmail = email, submittedPassword = password, repeated = confirmation;
      epoch.current++; setEmail(''); setPassword(''); setConfirmation('');
      if (mode === 'signup') void instance.signUp(submittedEmail, submittedPassword, repeated);
      else void instance.resend(submittedEmail);
    }}>
      <label htmlFor="signup-email">Email</label>
      <input id="signup-email" name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} maxLength={254} value={email} disabled={!enabled} onChange={event => { if (current()) { epoch.current++; setEmail(event.target.value); } }} required />
      {mode === 'signup' && <>
        <label htmlFor="signup-password">Password</label>
        <input id="signup-password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={1024} value={password} disabled={!enabled} onChange={event => { if (current()) { epoch.current++; setPassword(event.target.value); } }} required />
        <label htmlFor="signup-confirmation">Confirm password</label>
        <input id="signup-confirmation" name="confirmation" type="password" autoComplete="new-password" minLength={8} maxLength={1024} value={confirmation} disabled={!enabled} onChange={event => { if (current()) { epoch.current++; setConfirmation(event.target.value); } }} required />
        <p className={styles.note}>Use at least eight characters.</p>
      </>}
      <button type="submit" disabled={!enabled} aria-busy={model?.busy}>{mode === 'signup' ? 'Create free account' : 'Resend confirmation email'}</button>
    </form>
    <p className={styles.note}>Open the latest email in this browser within one hour. After confirming, sign in with your email and password. If your email is already confirmed, you can sign in now.</p>
  </>;
}

const subscribeLocation = () => () => {};
const browserSearch = () => window.location.search;
const serverSearch = () => null;

export default function LoginPage() {
  const search = useSyncExternalStore(subscribeLocation, browserSearch, serverSearch);
  const [chosenMode, setMode] = useState<Mode | null>(null), [noticeDismissed, setNoticeDismissed] = useState(false);
  const retireRef = useRef<(() => void) | null>(null), query = new URLSearchParams(search ?? '');
  const mode: Mode = chosenMode ?? (query.get('mode') === 'signup' ? 'signup' : query.get('mode') === 'resend' ? 'resend' : 'signin');
  const nextPath = getSafeNextPath(query.get('next')), ready = search !== null;
  const notice = noticeDismissed ? '' : query.get('auth_error') === '1' ? 'We could not finish that sign-in link. Please sign in again.'
    : query.get('confirmation') === '1' ? 'Email confirmation finished. Sign in to continue.'
      : query.get('recovery') === '1' ? 'Sign in with your chosen password to continue.' : '';
  const changeMode = (next: Mode) => { retireRef.current?.(); retireRef.current = null; setNoticeDismissed(true); setMode(next); };
  return <div className={styles.page}>
    <PublicNav checkSession={false} />
    <main className={styles.main}><section className={styles.card} aria-labelledby="login-title">
      <p className={styles.brand}>Society of Explorers</p>
      <h1 id="login-title">{mode === 'signup' ? 'Create an account' : mode === 'resend' ? 'Confirm your email' : 'Welcome back'}</h1>
      {notice && <p role="status">{notice}</p>}
      {ready ? mode === 'signin' ? <SignIn key="signin" nextPath={nextPath} retireRef={retireRef} /> : <EmailForm key={mode} mode={mode} nextPath={nextPath} retireRef={retireRef} /> : <p role="status">Preparing your account options…</p>}
      <div className={styles.modes} aria-label="Account options">
        {mode !== 'signin' && <button type="button" onClick={() => changeMode('signin')}>Sign in instead</button>}
        {mode !== 'signup' && <button type="button" onClick={() => changeMode('signup')}>Create account</button>}
        {mode !== 'resend' && <button type="button" onClick={() => changeMode('resend')}>Resend confirmation</button>}
      </div>
      <p className={styles.note}>Your account opens the community, reading, and discussion spaces. <a href="/join">Explore membership</a>.</p>
    </section></main>
    <PublicFooter />
  </div>;
}
