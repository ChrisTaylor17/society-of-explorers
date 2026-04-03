'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { setWalletCookie } from '@/lib/auth/getSession'

export default function HomePage() {
  const [showAuth, setShowAuth] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [walletLoading, setWalletLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [tasteQ, setTasteQ] = useState('')
  const [tasteResponse, setTasteResponse] = useState('')
  const [tasteDisplayed, setTasteDisplayed] = useState('')
  const [tasteLoading, setTasteLoading] = useState(false)
  const [tasteUsed, setTasteUsed] = useState(false)
  const [showCta, setShowCta] = useState(false)
  const typewriterRef = useRef<NodeJS.Timeout | null>(null)
  const router = useRouter()
  const supabase = createClient()

  // Check if taste was already used this session
  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('soe_taste_used')) setTasteUsed(true)
  }, [])

  // Typewriter effect
  useEffect(() => {
    if (!tasteResponse) return
    let i = 0
    setTasteDisplayed('')
    typewriterRef.current = setInterval(() => {
      i++
      setTasteDisplayed(tasteResponse.slice(0, i))
      if (i >= tasteResponse.length) {
        clearInterval(typewriterRef.current!)
        setTimeout(() => setShowCta(true), 1000)
      }
    }, 30)
    return () => { if (typewriterRef.current) clearInterval(typewriterRef.current) }
  }, [tasteResponse])

  async function askSocrates() {
    if (!tasteQ.trim() || tasteLoading) return
    setTasteLoading(true); setTasteResponse(''); setTasteDisplayed(''); setShowCta(false)
    try {
      const res = await fetch('/api/taste', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: tasteQ }) })
      const data = await res.json()
      if (data.response) { setTasteResponse(data.response); setTasteUsed(true); sessionStorage.setItem('soe_taste_used', 'true') }
      else setTasteResponse(data.error || 'Socrates is silent.')
    } catch { setTasteResponse('Something went wrong.') }
    setTasteLoading(false)
  }

  const gold = '#c9a84c'

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/salon` },
    })
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(''); setMessage('')
    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/salon` } })
      if (error) setError(error.message); else setMessage('Check your email to confirm, then sign in.')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message); else router.push('/salon')
    }
    setLoading(false)
  }

  async function connectWallet() {
    setWalletLoading(true); setError('')
    try {
      const eth = (window as any).ethereum
      if (!eth) { setError('MetaMask not found. Install the MetaMask extension first.'); setWalletLoading(false); return }

      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' })
      if (!accounts?.length) { setError('No accounts found. Unlock MetaMask and try again.'); setWalletLoading(false); return }

      const rawAddress = accounts[0]
      const { ethers } = await import('ethers')
      const address = ethers.getAddress(rawAddress)

      const nonceRes = await fetch('/api/auth/nonce')
      const { nonce } = await nonceRes.json()

      const { SiweMessage } = await import('siwe')
      const siweMsg = new SiweMessage({
        domain: window.location.host,
        address,
        statement: 'Sign in to Society of Explorers.',
        uri: window.location.origin,
        version: '1',
        chainId: 1,
        nonce,
      })
      const msgStr = siweMsg.prepareMessage()

      const signature = await eth.request({ method: 'personal_sign', params: [msgStr, address] })

      const res = await fetch('/api/auth/siwe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msgStr, signature, address })
      })
      const data = await res.json()

      if (data.verified && data.member) {
        setWalletCookie(data.member.id)
        localStorage.setItem('soe_wallet_id', data.member.id)
        router.push('/salon')
      } else {
        setError(data.error || 'Verification failed.')
      }
    } catch (e: any) {
      if (e.code === 4001) setError('Signature cancelled. Please sign the message to enter the salon.')
      else setError(e.message || 'Wallet connection failed.')
      console.error('Wallet error:', e)
    }
    setWalletLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#000',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Subtle radial glow */}
      <div style={{
        position: 'absolute',
        top: '40%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '800px', height: '800px',
        background: `radial-gradient(circle, ${gold}06 0%, transparent 60%)`,
        pointerEvents: 'none',
      }} />

      {/* Main content */}
      <div style={{
        position: 'relative', zIndex: 1,
        textAlign: 'center',
        padding: '2rem',
        maxWidth: '600px',
      }}>
        <div style={{
          fontFamily: 'Cinzel, serif',
          fontSize: '2.5rem',
          color: gold,
          opacity: 0.3,
          marginBottom: '2rem',
          letterSpacing: '0.3em',
        }}>
          ⬡
        </div>

        <h1 style={{
          fontFamily: 'Cinzel, serif',
          fontSize: 'clamp(1.8rem, 5vw, 3rem)',
          fontWeight: 300,
          letterSpacing: '0.15em',
          color: '#f5f0e8',
          marginBottom: '1rem',
          lineHeight: 1.2,
        }}>
          SOCIETY OF<br />EXPLORERS
        </h1>

        <p style={{
          fontFamily: 'Cormorant Garamond, serif',
          fontSize: '1.15rem',
          color: '#9a8f7a',
          fontStyle: 'italic',
          marginBottom: '4rem',
          lineHeight: 1.6,
        }}>
          Where great minds converge across time
        </p>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          alignItems: 'center',
        }}>
          <a
            href="/labyrinth"
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: '10px',
              letterSpacing: '0.25em',
              color: '#000',
              background: gold,
              padding: '1.1rem 3rem',
              textDecoration: 'none',
              display: 'inline-block',
              minWidth: '280px',
              textAlign: 'center',
            }}
          >
            ENTER THE LABYRINTH
          </a>

          <button
            onClick={() => setShowAuth(true)}
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: '10px',
              letterSpacing: '0.25em',
              color: gold,
              background: 'transparent',
              border: `1px solid ${gold}44`,
              padding: '1.1rem 3rem',
              cursor: 'pointer',
              minWidth: '280px',
            }}
          >
            ENTER THE SALON
          </button>

          <a
            href="/great-books"
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: '10px',
              letterSpacing: '0.25em',
              color: gold,
              background: 'transparent',
              border: `1px solid ${gold}22`,
              padding: '1.1rem 3rem',
              textDecoration: 'none',
              display: 'inline-block',
              minWidth: '280px',
              textAlign: 'center',
            }}
          >
            READ THE GREAT BOOKS
          </a>

          <a
            href="/join"
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: '8px',
              letterSpacing: '0.2em',
              color: '#6a6050',
              textDecoration: 'none',
              marginTop: '1rem',
            }}
          >
            VIEW MEMBERSHIP OPTIONS →
          </a>
        </div>

        {/* ════ TASTE OF SOCRATES ════ */}
        <div style={{ marginTop: '4rem', width: '100%', maxWidth: '480px' }}>
          <div style={{ border: `1px solid ${gold}22`, background: 'rgba(10,10,10,0.8)', padding: '2rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.3em', color: gold, opacity: 0.5, textAlign: 'center', marginBottom: '0.75rem' }}>
              ASK A QUESTION
            </div>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '13px', color: '#9a8f7a', textAlign: 'center', fontStyle: 'italic', marginBottom: '1.5rem' }}>
              Any question. Socrates is listening.
            </div>

            {!tasteUsed || (!tasteResponse && !tasteLoading) ? (
              <div>
                <input
                  value={tasteQ}
                  onChange={e => setTasteQ(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') askSocrates() }}
                  placeholder="What are you really asking?"
                  disabled={tasteLoading}
                  style={{
                    width: '100%', background: '#0d0d0d', border: `1px solid ${gold}22`,
                    padding: '12px 14px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px',
                    color: '#F5E6C8', outline: 'none', boxSizing: 'border-box' as const,
                    marginBottom: '10px',
                  }}
                />
                <button
                  onClick={askSocrates}
                  disabled={tasteLoading || !tasteQ.trim()}
                  style={{
                    width: '100%', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.25em',
                    color: '#000', background: gold, border: 'none', padding: '11px',
                    cursor: tasteLoading ? 'not-allowed' : 'pointer',
                    opacity: tasteLoading || !tasteQ.trim() ? 0.5 : 1,
                  }}
                >
                  ⬡ ASK
                </button>
              </div>
            ) : null}

            {/* Loading */}
            {tasteLoading && (
              <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '14px', color: '#9a8f7a', fontStyle: 'italic', animation: 'pulse 1.5s infinite' }}>
                  Socrates is thinking...
                </div>
              </div>
            )}

            {/* Response with typewriter */}
            {tasteDisplayed && (
              <div style={{ marginTop: tasteUsed ? 0 : '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '16px', color: gold, opacity: 0.6 }}>Σ</span>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, opacity: 0.5 }}>SOCRATES</span>
                </div>
                <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: '#F5E6C8', lineHeight: 1.9 }}>
                  {tasteDisplayed}
                  {tasteDisplayed.length < tasteResponse.length && <span style={{ color: gold }}>▍</span>}
                </div>
              </div>
            )}

            {/* CTA after response */}
            {showCta && (
              <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: `1px solid ${gold}15`, animation: 'fadeIn 0.8s ease' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, opacity: 0.4, lineHeight: 1.8, textAlign: 'center', marginBottom: '1rem' }}>
                  The thinkers are waiting. There are six of them.<br />They remember everything.
                </div>
                <button onClick={signInWithGoogle} style={{
                  display: 'block', width: '100%', fontFamily: 'Cinzel, serif', fontSize: '9px',
                  letterSpacing: '0.2em', color: '#000', background: gold, border: 'none',
                  padding: '10px', cursor: 'pointer', marginBottom: '10px',
                }}>
                  SIGN IN WITH GOOGLE
                </button>
                <a href="/join" style={{
                  display: 'block', textAlign: 'center', fontFamily: 'Cinzel, serif', fontSize: '8px',
                  letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.6,
                }}>
                  OR VIEW MEMBERSHIP OPTIONS →
                </a>
              </div>
            )}

            {/* Used state */}
            {tasteUsed && !tasteResponse && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '13px', color: '#9a8f7a', fontStyle: 'italic', marginBottom: '1rem' }}>
                  Your question has been heard.<br />Enter the temple for more.
                </div>
                <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, textDecoration: 'none' }}>
                  ENTER THE TEMPLE →
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        position: 'absolute',
        bottom: '2rem',
        fontFamily: 'Cinzel, serif',
        fontSize: '8px',
        letterSpacing: '0.2em',
        color: gold,
        opacity: 0.2,
        textAlign: 'center',
      }}>
        92B SOUTH ST · DOWNTOWN BOSTON
      </div>

      {/* ════ AUTH MODAL ════ */}
      {showAuth && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '2rem',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAuth(false) }}
        >
          <div style={{
            background: '#0a0a0a',
            border: `1px solid ${gold}22`,
            padding: '3rem 2.5rem',
            maxWidth: '400px',
            width: '100%',
            position: 'relative',
          }}>
            <button
              onClick={() => setShowAuth(false)}
              style={{
                position: 'absolute', top: '1rem', right: '1.2rem',
                background: 'none', border: 'none', color: '#6a6050',
                fontSize: '1.2rem', cursor: 'pointer',
              }}
            >
              ×
            </button>

            <div style={{
              fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em',
              color: gold, opacity: 0.6, marginBottom: '2rem', textAlign: 'center',
            }}>
              ENTER THE SALON
            </div>

            {/* Wallet Connect */}
            <button
              onClick={connectWallet}
              disabled={walletLoading}
              style={{
                width: '100%', padding: '12px',
                background: 'linear-gradient(135deg,#0a1220,#111a2e)',
                border: '1px solid rgba(100,150,220,0.4)',
                color: '#8ab0d8',
                fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em',
                cursor: walletLoading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                opacity: walletLoading ? 0.7 : 1,
              }}
            >
              <span style={{ fontSize: '18px' }}>🦊</span>
              {walletLoading ? 'Connecting...' : 'MetaMask / Browser Wallet'}
            </button>

            {/* Google Sign-In */}
            <button
              onClick={signInWithGoogle}
              style={{
                width: '100%', padding: '12px', marginTop: '10px',
                background: 'transparent',
                border: `1px solid ${gold}44`,
                color: gold,
                fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
              }}
            >
              SIGN IN WITH GOOGLE
            </button>

            <div style={{
              fontFamily: 'Cormorant Garamond, serif', fontSize: '13px',
              color: '#5a5040', textAlign: 'center', margin: '1.5rem 0',
            }}>
              or
            </div>

            {/* Email/Password Form */}
            <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                style={{
                  background: '#111', border: `1px solid ${gold}22`, padding: '0.9rem 1rem',
                  fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: '#f5f0e8',
                  outline: 'none', width: '100%', boxSizing: 'border-box' as const,
                }}
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                style={{
                  background: '#111', border: `1px solid ${gold}22`, padding: '0.9rem 1rem',
                  fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: '#f5f0e8',
                  outline: 'none', width: '100%', boxSizing: 'border-box' as const,
                }}
              />
              {error && (
                <div style={{
                  fontFamily: 'Cormorant Garamond, serif', fontSize: '13px',
                  color: '#c05050', textAlign: 'center',
                }}>
                  {error}
                </div>
              )}
              {message && (
                <div style={{
                  fontFamily: 'Cormorant Garamond, serif', fontSize: '13px',
                  color: gold, textAlign: 'center',
                }}>
                  {message}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                style={{
                  fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.25em',
                  color: '#000', background: gold, border: 'none', padding: '1rem',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                  marginTop: '0.5rem',
                }}
              >
                {loading ? 'ENTERING...' : isSignUp ? 'REQUEST ADMISSION' : 'ENTER THE SALON'}
              </button>
            </form>

            <div style={{
              fontFamily: 'Cormorant Garamond, serif', fontSize: '12px',
              color: '#5a5040', textAlign: 'center', marginTop: '1.5rem',
            }}>
              {isSignUp ? (
                <>Already a member?{' '}<button onClick={() => { setIsSignUp(false); setError(''); setMessage('') }} style={{ color: gold, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>Sign in</button></>
              ) : (
                <>New to the Society?{' '}<button onClick={() => { setIsSignUp(true); setError(''); setMessage('') }} style={{ color: gold, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>Request admission</button></>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
