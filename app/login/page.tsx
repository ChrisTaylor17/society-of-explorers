'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { setWalletCookie } from '@/lib/auth/getSession';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const gold = '#c9a84c';
const parchment = '#E8DCC8';
const muted = '#9a8f7a';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // If already authed, redirect to dashboard
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.push('/dashboard');
    });
    if (typeof window !== 'undefined' && localStorage.getItem('soe_wallet_id')) {
      router.push('/dashboard');
    }
  }, [supabase, router]);

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
    });
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
      });
      if (error) setError(error.message);
      else setMessage('Check your email to confirm your account.');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else router.push('/dashboard');
    }
    setLoading(false);
  }

  async function connectWallet() {
    setWalletLoading(true);
    setError('');
    try {
      const eth = (window as any).ethereum;
      if (!eth) { setError('MetaMask not found. Install it to continue.'); setWalletLoading(false); return; }

      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
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
        localStorage.setItem('soe_wallet_id', data.member.id);
        router.push('/dashboard');
      } else {
        setError(data.error || 'Verification failed.');
      }
    } catch (e: any) {
      if (e.code === 4001) setError('Signature cancelled.');
      else setError(e.message || 'Connection failed.');
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
            <h1 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f5f0e8', marginBottom: '0.5rem' }}>
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
              onClick={signInWithGoogle}
              style={{
                width: '100%', padding: '12px', background: 'transparent',
                border: `1px solid ${gold}44`, color: gold,
                fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em',
                cursor: 'pointer', marginBottom: '10px',
              }}
            >
              CONTINUE WITH GOOGLE
            </button>

            {/* MetaMask */}
            <button
              onClick={connectWallet}
              disabled={walletLoading}
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
            <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <input
                type="email" placeholder="Email" value={email}
                onChange={e => setEmail(e.target.value)} required
                style={{
                  background: '#111', border: `1px solid ${gold}22`, padding: '11px 14px',
                  fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment,
                  outline: 'none', width: '100%', boxSizing: 'border-box' as const,
                }}
              />
              <input
                type="password" placeholder="Password" value={password}
                onChange={e => setPassword(e.target.value)} required
                style={{
                  background: '#111', border: `1px solid ${gold}22`, padding: '11px 14px',
                  fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment,
                  outline: 'none', width: '100%', boxSizing: 'border-box' as const,
                }}
              />

              {error && <div style={{ fontSize: '12px', color: '#c05050', textAlign: 'center' }}>{error}</div>}
              {message && <div style={{ fontSize: '12px', color: gold, textAlign: 'center' }}>{message}</div>}

              <button
                type="submit" disabled={loading}
                style={{
                  fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em',
                  color: '#000', background: gold, border: 'none', padding: '12px',
                  cursor: 'pointer', opacity: loading ? 0.5 : 1,
                }}
              >
                {loading ? 'ENTERING...' : isSignUp ? 'CREATE ACCOUNT' : 'SIGN IN'}
              </button>
            </form>

            {/* Toggle */}
            <div style={{ fontSize: '13px', color: muted, textAlign: 'center', marginTop: '1.5rem' }}>
              {isSignUp ? (
                <>Have an account?{' '}
                  <button onClick={() => { setIsSignUp(false); setError(''); setMessage(''); }}
                    style={{ color: gold, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>
                    Sign in
                  </button>
                </>
              ) : (
                <>New here?{' '}
                  <button onClick={() => { setIsSignUp(true); setError(''); setMessage(''); }}
                    style={{ color: gold, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>
                    Create account
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Footer note */}
          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <p style={{ fontSize: '12px', color: muted, opacity: 0.4, fontStyle: 'italic' }}>
              Free Explorer accounts get 3 Socrates exchanges. <a href="/join" style={{ color: gold, textDecoration: 'none' }}>See all tiers →</a>
            </p>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
