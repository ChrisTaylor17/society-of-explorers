'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getMemberSession, setWalletCookie } from '@/lib/auth/getSession';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import {
  DEFAULT_NEXT_PATH,
  MIN_PASSWORD_LENGTH,
  friendlyAuthError,
  getSafeNextPath,
  isExistingAccountSignup,
  modeFromSearch,
  validateCredentials,
} from '@/lib/auth/loginForm';

const gold = '#c9a84c';
const parchment = '#E8DCC8';
const muted = '#9a8f7a';

// Visually hidden but read by screen readers.
const srOnly: React.CSSProperties = {
  position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px',
  overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0,
};

type EthereumProvider = {
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
};

function hasErrorCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function requestedNextPath(): string {
  if (typeof window === 'undefined') return DEFAULT_NEXT_PATH;
  return getSafeNextPath(new URLSearchParams(window.location.search).get('next'));
}

function authCallbackUrl(nextPath: string): string {
  const callback = new URL('/auth/callback', window.location.origin);
  callback.searchParams.set('next', nextPath);
  return callback.toString();
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Links from "Start free" open the form in create-account mode.
  useEffect(() => {
    if (modeFromSearch(window.location.search) === 'signup') setIsSignUp(true);
  }, []);

  // If already authed, redirect to dashboard
  useEffect(() => {
    let active = true;

    getMemberSession()
      .then((session) => {
        if (active && session?.member) router.replace(requestedNextPath());
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [router]);

  async function signInWithGoogle() {
    setError('');
    setMessage('');
    setGoogleLoading(true);
    try {
      const nextPath = requestedNextPath();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: authCallbackUrl(nextPath) },
      });
      if (error) {
        setError(friendlyAuthError(error, isSignUp ? 'signup' : 'signin'));
        setGoogleLoading(false);
      }
      // On success the browser navigates to Google; keep the button disabled.
    } catch (err: unknown) {
      setError(friendlyAuthError(err as { message?: string }, isSignUp ? 'signup' : 'signin'));
      setGoogleLoading(false);
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError('');
    setMessage('');
    const mode = isSignUp ? 'signup' : 'signin';
    const invalid = validateCredentials(mode, email, password);
    if (invalid) {
      setError(invalid);
      return;
    }

    setLoading(true);
    try {
      const nextPath = requestedNextPath();
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: authCallbackUrl(nextPath) },
        });
        if (error) setError(friendlyAuthError(error, mode));
        else if (isExistingAccountSignup(data)) setError(friendlyAuthError({ code: 'user_already_exists' }, mode));
        else if (data?.session) router.push(nextPath);
        else setMessage(`Check ${email.trim()} for a confirmation link. It opens your first question.`);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) setError(friendlyAuthError(error, mode));
        else router.push(nextPath);
      }
    } catch (err: unknown) {
      setError(friendlyAuthError(err as { message?: string }, mode));
    } finally {
      setLoading(false);
    }
  }

  async function connectWallet() {
    setWalletLoading(true);
    setError('');
    try {
      const eth = (window as Window & { ethereum?: EthereumProvider }).ethereum;
      if (!eth) { setError('MetaMask not found. Install it to continue.'); setWalletLoading(false); return; }

      const requestedAccounts = await eth.request({ method: 'eth_requestAccounts' });
      const accounts = Array.isArray(requestedAccounts)
        ? requestedAccounts.filter((value): value is string => typeof value === 'string')
        : [];
      if (!accounts?.length) { setError('No accounts found.'); setWalletLoading(false); return; }

      const { ethers } = await import('ethers');
      const address = ethers.getAddress(accounts[0]);

      const nonceRes = await fetch('/api/auth/nonce');
      const { nonce } = await nonceRes.json();

      const { SiweMessage } = await import('siwe');
      const siweMsg = new SiweMessage({
        domain: window.location.host,
        address,
        statement: 'Sign in to Society of Explorers.',
        uri: window.location.origin,
        version: '1',
        chainId: 1,
        nonce,
      });
      const msgStr = siweMsg.prepareMessage();
      const signature = await eth.request({ method: 'personal_sign', params: [msgStr, address] });

      const res = await fetch('/api/auth/siwe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msgStr, signature, address }),
      });
      const data = await res.json();

      if (data.verified && data.member) {
        setWalletCookie(data.member.id);
        router.push(requestedNextPath());
      } else {
        setError(data.error || 'Verification failed.');
      }
    } catch (error: unknown) {
      if (hasErrorCode(error, 4001)) setError('Signature cancelled.');
      else setError(errorMessage(error, 'Connection failed.'));
    }
    setWalletLoading(false);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <section style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '8rem 2rem 4rem' }}>
        <div style={{ maxWidth: '400px', width: '100%' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.5em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>SOCIETY OF EXPLORERS</div>
            <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f5f0e8', marginBottom: '0.5rem' }}>
              {isSignUp ? 'Create Account' : 'Welcome Back'}
            </h1>
            <p style={{ fontSize: '1rem', color: muted, fontStyle: 'italic' }}>
              {isSignUp ? 'Begin your exploration.' : 'The thinkers are waiting.'}
            </p>
          </div>

          {/* Auth card */}
          <div style={{ border: `1px solid ${gold}22`, background: '#0d0d0d', padding: '2.5rem 2rem' }}>
            {/* Google OAuth */}
            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={googleLoading}
              aria-busy={googleLoading}
              style={{
                width: '100%', padding: '12px', background: 'transparent',
                border: `1px solid ${gold}44`, color: gold,
                fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em',
                cursor: googleLoading ? 'wait' : 'pointer', marginBottom: '10px', opacity: googleLoading ? 0.5 : 1,
              }}
            >
              {googleLoading ? 'OPENING GOOGLE...' : 'CONTINUE WITH GOOGLE'}
            </button>

            {/* MetaMask */}
            <button
              type="button"
              onClick={connectWallet}
              disabled={walletLoading}
              aria-busy={walletLoading}
              style={{
                width: '100%', padding: '12px',
                background: 'linear-gradient(135deg, #0a1220, #111a2e)',
                border: '1px solid rgba(100,150,220,0.4)', color: '#8ab0d8',
                fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em',
                cursor: 'pointer', opacity: walletLoading ? 0.5 : 1,
              }}
            >
              {walletLoading ? 'CONNECTING...' : 'CONNECT WALLET'}
            </button>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1.5rem 0' }}>
              <div style={{ flex: 1, height: '1px', background: `${gold}15` }} />
              <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted }}>OR</span>
              <div style={{ flex: 1, height: '1px', background: `${gold}15` }} />
            </div>

            {/* Email form */}
            <form onSubmit={handleEmailSubmit} noValidate aria-describedby="login-status" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label htmlFor="login-email" style={srOnly}>Email</label>
              <input
                id="login-email" name="email"
                type="email" placeholder="Email" value={email}
                autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false}
                aria-invalid={!!error && !email.trim()}
                onChange={e => setEmail(e.target.value)} required
                style={{
                  background: '#111', border: `1px solid ${gold}22`, padding: '11px 14px',
                  fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment,
                  outline: 'none', width: '100%', boxSizing: 'border-box' as const,
                }}
              />
              <label htmlFor="login-password" style={srOnly}>Password</label>
              <input
                id="login-password" name="password"
                type="password" placeholder={isSignUp ? `Password (${MIN_PASSWORD_LENGTH}+ characters)` : 'Password'} value={password}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                minLength={isSignUp ? MIN_PASSWORD_LENGTH : undefined}
                onChange={e => setPassword(e.target.value)} required
                style={{
                  background: '#111', border: `1px solid ${gold}22`, padding: '11px 14px',
                  fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment,
                  outline: 'none', width: '100%', boxSizing: 'border-box' as const,
                }}
              />

              <div id="login-status" aria-live="polite">
                {error && <div role="alert" style={{ fontSize: '14px', color: '#e07070', textAlign: 'center' }}>{error}</div>}
                {message && <div role="status" style={{ fontSize: '14px', color: gold, textAlign: 'center' }}>{message}</div>}
              </div>

              <button
                type="submit" disabled={loading} aria-busy={loading}
                style={{
                  fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em',
                  color: '#000', background: gold, border: 'none', padding: '12px',
                  cursor: 'pointer', opacity: loading ? 0.5 : 1,
                }}
              >
                {loading ? (isSignUp ? 'CREATING...' : 'ENTERING...') : isSignUp ? 'CREATE FREE ACCOUNT' : 'SIGN IN'}
              </button>
            </form>

            {/* Toggle */}
            <div style={{ fontSize: '13px', color: muted, textAlign: 'center', marginTop: '1.5rem' }}>
              {isSignUp ? (
                <>Have an account?{' '}
                  <button type="button" onClick={() => { setIsSignUp(false); setError(''); setMessage(''); }}
                    style={{ color: gold, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>
                    Sign in
                  </button>
                </>
              ) : (
                <>New here?{' '}
                  <button type="button" onClick={() => { setIsSignUp(true); setError(''); setMessage(''); }}
                    style={{ color: gold, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>
                    Create account
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Footer note */}
          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <p style={{ fontSize: '13px', color: muted, fontStyle: 'italic' }}>
              Free Explorer accounts get 3 Socrates exchanges. <a href="/join" style={{ color: gold, textDecoration: 'none' }}>See all tiers →</a>
            </p>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
