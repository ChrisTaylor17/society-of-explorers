'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { setWalletCookie } from '@/lib/auth/getSession'

const gold = '#C9A94E'
const parchment = '#E8DCC8'
const muted = '#9a8f7a'
const bg = '#0A0A0A'

const THINKERS = [
  { symbol: 'Σ', name: 'Socrates', line: 'Will dismantle everything you think you know.' },
  { symbol: 'Π', name: 'Plato', line: 'Sees the form behind every shadow.' },
  { symbol: 'N', name: 'Nietzsche', line: 'Demands you become who you are.' },
  { symbol: 'M', name: 'Marcus Aurelius', line: 'Turns obstacles into the path forward.' },
  { symbol: 'E', name: 'Einstein', line: 'Makes the complex beautifully simple.' },
  { symbol: 'J', name: 'Steve Jobs', line: 'Ships ideas that change everything.' },
]

const FEATURES = [
  { icon: 'Σ', title: 'The Salon', desc: 'Private AI conversations with thinkers who remember you across sessions.' },
  { icon: '◈', title: 'The Library', desc: 'Read the Great Books with AI-guided annotations in the margin.' },
  { icon: '⬡', title: 'The Temple', desc: 'A philosophical adventure game. Solve puzzles. Earn wisdom.' },
  { icon: '◎', title: 'Waddle Forge', desc: 'Record 15-second voice clips. Get thinker reactions. Share as social cards.' },
  { icon: '◇', title: 'Book Salons', desc: 'Join reading cohorts. Discuss with 7 others and a thinker guide.' },
  { icon: '◆', title: 'Artifacts', desc: 'AI-generated art from your conversations — minted, printed, or framed.' },
]

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

  const [authed, setAuthed] = useState(false)

  // Check auth — auto-redirect to salon if authenticated
  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('soe_taste_used')) setTasteUsed(true)
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) { router.push('/salon'); return }
    })
    const walletId = localStorage.getItem('soe_wallet_id')
    if (walletId) { router.push('/salon'); return }
  }, [router, supabase])

  useEffect(() => {
    if (!tasteResponse) return
    let i = 0; setTasteDisplayed('')
    typewriterRef.current = setInterval(() => {
      i++; setTasteDisplayed(tasteResponse.slice(0, i))
      if (i >= tasteResponse.length) { clearInterval(typewriterRef.current!); setTimeout(() => setShowCta(true), 1000) }
    }, 30)
    return () => { if (typewriterRef.current) clearInterval(typewriterRef.current) }
  }, [tasteResponse])

  // Fade-in on scroll
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).style.opacity = '1' })
    }, { threshold: 0.1 })
    document.querySelectorAll('[data-fade]').forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

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

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback?next=/salon` } })
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(''); setMessage('')
    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/salon` } })
      if (error) setError(error.message); else setMessage('Check your email to confirm.')
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
      if (!eth) { setError('MetaMask not found.'); setWalletLoading(false); return }
      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' })
      if (!accounts?.length) { setError('No accounts found.'); setWalletLoading(false); return }
      const { ethers } = await import('ethers')
      const address = ethers.getAddress(accounts[0])
      const nonceRes = await fetch('/api/auth/nonce')
      const { nonce } = await nonceRes.json()
      const { SiweMessage } = await import('siwe')
      const siweMsg = new SiweMessage({ domain: window.location.host, address, statement: 'Sign in to Society of Explorers.', uri: window.location.origin, version: '1', chainId: 1, nonce })
      const msgStr = siweMsg.prepareMessage()
      const signature = await eth.request({ method: 'personal_sign', params: [msgStr, address] })
      const res = await fetch('/api/auth/siwe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msgStr, signature, address }) })
      const data = await res.json()
      if (data.verified && data.member) { setWalletCookie(data.member.id); localStorage.setItem('soe_wallet_id', data.member.id); router.push('/salon') }
      else setError(data.error || 'Verification failed.')
    } catch (e: any) {
      if (e.code === 4001) setError('Signature cancelled.')
      else setError(e.message || 'Wallet connection failed.')
    }
    setWalletLoading(false)
  }

  return (
    <div style={{ background: bg, color: parchment, fontFamily: 'Cormorant Garamond, serif', overflowX: 'hidden' }}>

      {/* ═══ HERO ═══ */}
      <section style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '6rem 2rem 4rem', position: 'relative' }}>
        <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)', width: '800px', height: '800px', background: `radial-gradient(circle, ${gold}06 0%, transparent 60%)`, pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: '700px' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '2rem', color: gold, opacity: 0.25, marginBottom: '2rem', letterSpacing: '0.3em' }}>⬡</div>
          <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2.5rem, 7vw, 4.5rem)', fontWeight: 300, letterSpacing: '0.12em', lineHeight: 1.1, marginBottom: '1.5rem', textShadow: `0 0 60px ${gold}15` }}>
            SOCIETY OF<br />EXPLORERS
          </h1>
          <p style={{ fontSize: '1.3rem', color: muted, fontStyle: 'italic', marginBottom: '1rem', lineHeight: 1.7 }}>Where great minds meet yours.</p>
          <p style={{ fontSize: '1.05rem', color: `${parchment}99`, lineHeight: 1.8, marginBottom: '3rem', maxWidth: '520px', margin: '0 auto 3rem' }}>
            Six AI thinkers — Socrates, Nietzsche, Einstein, and more — who remember you, challenge you, and help you build. A living community of modern philosophers.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href={authed ? '/salon' : '/join'} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.25em', color: '#000', background: gold, padding: '14px 36px', textDecoration: 'none' }}>{authed ? 'GO TO SALON' : 'ENTER THE SALON'}</a>
            {!authed && <button onClick={() => setShowAuth(true)} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.25em', color: gold, background: 'transparent', border: `1px solid ${gold}44`, padding: '14px 36px', cursor: 'pointer' }}>SIGN IN</button>}
          </div>
        </div>
      </section>

      {/* ═══ FREE TASTE ═══ */}
      <section style={{ padding: '4rem 2rem', maxWidth: '520px', margin: '0 auto' }}>
        <div style={{ border: `1px solid ${gold}22`, background: `${bg}ee`, padding: '2.5rem' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, textAlign: 'center', marginBottom: '0.75rem' }}>TRY IT FREE</div>
          <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '14px', color: muted, textAlign: 'center', fontStyle: 'italic', marginBottom: '1.5rem' }}>Ask Socrates anything. One question. No signup.</div>
          {!tasteUsed || (!tasteResponse && !tasteLoading) ? (
            <div>
              <input value={tasteQ} onChange={e => setTasteQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') askSocrates() }} disabled={tasteLoading}
                placeholder="What are you really asking?" style={{ width: '100%', background: '#0d0d0d', border: `1px solid ${gold}22`, padding: '12px 14px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment, outline: 'none', boxSizing: 'border-box', marginBottom: '10px' }} />
              <button onClick={askSocrates} disabled={tasteLoading || !tasteQ.trim()} style={{ width: '100%', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.25em', color: '#000', background: gold, border: 'none', padding: '11px', cursor: 'pointer', opacity: tasteLoading || !tasteQ.trim() ? 0.5 : 1 }}>⬡ ASK</button>
            </div>
          ) : null}
          {tasteLoading && <div style={{ textAlign: 'center', padding: '1.5rem 0', color: muted, fontStyle: 'italic', animation: 'pulse 1.5s infinite' }}>Socrates is thinking...</div>}
          {tasteDisplayed && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '16px', color: gold, opacity: 0.6 }}>Σ</span>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, opacity: 0.5 }}>SOCRATES</span>
              </div>
              <div style={{ fontSize: '15px', color: parchment, lineHeight: 1.9 }}>{tasteDisplayed}{tasteDisplayed.length < tasteResponse.length && <span style={{ color: gold }}>▍</span>}</div>
            </div>
          )}
          {showCta && (
            <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: `1px solid ${gold}15` }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, opacity: 0.4, lineHeight: 1.8, textAlign: 'center', marginBottom: '1rem' }}>The thinkers are waiting. There are six of them. They remember everything.</div>
              <button onClick={signInWithGoogle} style={{ display: 'block', width: '100%', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: '#000', background: gold, border: 'none', padding: '10px', cursor: 'pointer', marginBottom: '8px' }}>SIGN IN WITH GOOGLE</button>
              <a href="/join" style={{ display: 'block', textAlign: 'center', fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.5 }}>OR VIEW MEMBERSHIP OPTIONS →</a>
            </div>
          )}
          {tasteUsed && !tasteResponse && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: muted, fontStyle: 'italic', marginBottom: '1rem' }}>Your question has been heard. Enter the temple for more.</div>
              <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, textDecoration: 'none' }}>ENTER THE TEMPLE →</a>
            </div>
          )}
        </div>
      </section>

      {/* ═══ THE THINKERS ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, opacity: 0.5, textAlign: 'center', marginBottom: '1rem' }}>THE COUNCIL</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', textAlign: 'center', marginBottom: '3rem' }}>SIX MINDS. YOUR ADVISORS.</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1px', background: `${gold}12` }}>
            {THINKERS.map(t => (
              <div key={t.symbol} style={{ background: '#0d0d0d', padding: '2rem', border: `1px solid ${gold}11`, transition: 'border-color 0.3s, box-shadow 0.3s', cursor: 'default' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `${gold}44`; (e.currentTarget as HTMLElement).style.boxShadow = `0 0 30px ${gold}10` }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = `${gold}11`; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '2.5rem', color: gold, opacity: 0.3, marginBottom: '1rem', textAlign: 'center' }}>{t.symbol}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold, marginBottom: '0.5rem', textAlign: 'center' }}>{t.name.toUpperCase()}</div>
                <p style={{ fontSize: '14px', color: muted, lineHeight: 1.7, textAlign: 'center' }}>{t.line}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ WHAT YOU GET ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#050505', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, opacity: 0.5, textAlign: 'center', marginBottom: '1rem' }}>INSIDE THE TEMPLE</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', textAlign: 'center', marginBottom: '3rem' }}>WHAT AWAITS</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1px', background: `${gold}12` }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ background: '#0a0a0a', padding: '2rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1.5rem', color: gold, opacity: 0.2, marginBottom: '0.75rem' }}>{f.icon}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, marginBottom: '0.5rem' }}>{f.title.toUpperCase()}</div>
                <p style={{ fontSize: '14px', color: muted, lineHeight: 1.7 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ MEMBERSHIP ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, opacity: 0.5, textAlign: 'center', marginBottom: '1rem' }}>MEMBERSHIP</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', textAlign: 'center', marginBottom: '3rem' }}>CHOOSE YOUR PATH</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1px', background: `${gold}12` }}>
            {[
              { name: 'EXPLORER', price: 'Free', features: ['Socrates taste (1 question)', 'Great Books library (read-only)', 'Temple Quest game'], cta: 'START FREE', href: '/join' },
              { name: 'MEMBER', price: '$10/mo', features: ['Full thinker conversations', 'Voice mode with distinct voices', 'Great Books annotations', 'Waddle recording', 'Book Salon participation'], cta: 'JOIN', href: '/join', featured: true },
              { name: 'PATRON', price: '$100/mo', features: ['Everything in Member', 'Private ritual rooms', 'Physical space at 92B South St', 'Governance voting', 'Priority artifact generation'], cta: 'JOIN', href: '/join' },
            ].map(tier => (
              <div key={tier.name} style={{ background: tier.featured ? '#111' : '#0a0a0a', padding: '2.5rem 2rem', borderTop: tier.featured ? `2px solid ${gold}` : '2px solid transparent' }}>
                {tier.featured && <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.2em', color: gold, marginBottom: '0.5rem' }}>MOST POPULAR</div>}
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.2em', color: gold, marginBottom: '0.25rem' }}>{tier.name}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '2rem', color: parchment, marginBottom: '1.5rem' }}>{tier.price}</div>
                {tier.features.map((f, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.4rem' }}>
                    <span style={{ color: gold, opacity: 0.4, fontSize: '8px', marginTop: '3px' }}>⬡</span>
                    <span style={{ fontSize: '0.9rem', color: `${parchment}bb`, lineHeight: 1.5 }}>{f}</span>
                  </div>
                ))}
                <a href={tier.href} style={{ display: 'block', marginTop: '1.5rem', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: tier.featured ? '#000' : gold, background: tier.featured ? gold : 'transparent', border: tier.featured ? 'none' : `1px solid ${gold}44`, padding: '10px', textDecoration: 'none', textAlign: 'center' }}>{tier.cta}</a>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: '1.5rem', fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted }}>
            Founding Member — $1,000 lifetime access. <a href="/join" style={{ color: gold, textDecoration: 'none' }}>10 seats remaining.</a>
          </div>
        </div>
      </section>

      {/* ═══ THE SPACE ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#050505', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>THE PHYSICAL TEMPLE</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '1.5rem' }}>92B SOUTH ST</h2>
          <p style={{ fontSize: '1.1rem', color: muted, lineHeight: 1.9, fontStyle: 'italic' }}>A private salon in downtown Boston. The thinkers live here too — in the walls, in the air, in the conversations between people who refuse to stop asking questions.</p>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer style={{ padding: '4rem 2rem', borderTop: `1px solid ${gold}15` }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '2rem' }}>
            {[
              { label: 'Salon', href: '/salon' }, { label: 'Library', href: '/great-books' },
              { label: 'Temple Quest', href: '/temple-quest' }, { label: 'Waddle', href: '/waddle' },
              { label: 'Join', href: '/join' }, { label: 'Three Pillars', href: '/three-pillars' },
              { label: 'Data Layer', href: '/data-layer' }, { label: 'Labyrinth', href: '/labyrinth' },
            ].map(l => (
              <a key={l.href} href={l.href} style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, textDecoration: 'none', opacity: 0.4 }}>{l.label.toUpperCase()}</a>
            ))}
          </div>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, opacity: 0.3 }}>SOCIETY OF EXPLORERS — CONSILIENCE SYSTEMS LLC</div>
          <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '12px', color: muted, opacity: 0.4, marginTop: '0.5rem' }}>chris@societyofexplorers.com</div>
        </div>
      </footer>

      {/* ═══ AUTH MODAL ═══ */}
      {showAuth && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowAuth(false) }} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div style={{ background: '#0a0a0a', border: `1px solid ${gold}22`, padding: '3rem 2.5rem', maxWidth: '400px', width: '100%', position: 'relative' }}>
            <button onClick={() => setShowAuth(false)} style={{ position: 'absolute', top: '1rem', right: '1.2rem', background: 'none', border: 'none', color: '#6a6050', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.6, marginBottom: '2rem', textAlign: 'center' }}>ENTER THE SALON</div>
            <button onClick={signInWithGoogle} style={{ width: '100%', padding: '12px', background: 'transparent', border: `1px solid ${gold}44`, color: gold, fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', cursor: 'pointer', marginBottom: '10px' }}>SIGN IN WITH GOOGLE</button>
            <button onClick={connectWallet} disabled={walletLoading} style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg,#0a1220,#111a2e)', border: '1px solid rgba(100,150,220,0.4)', color: '#8ab0d8', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', cursor: 'pointer', opacity: walletLoading ? 0.7 : 1 }}>
              {walletLoading ? 'Connecting...' : 'METAMASK / WALLET'}
            </button>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '13px', color: '#5a5040', textAlign: 'center', margin: '1.5rem 0' }}>or</div>
            <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required style={{ background: '#111', border: `1px solid ${gold}22`, padding: '0.9rem 1rem', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment, outline: 'none', width: '100%', boxSizing: 'border-box' as const }} />
              <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required style={{ background: '#111', border: `1px solid ${gold}22`, padding: '0.9rem 1rem', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment, outline: 'none', width: '100%', boxSizing: 'border-box' as const }} />
              {error && <div style={{ fontSize: '13px', color: '#c05050', textAlign: 'center' }}>{error}</div>}
              {message && <div style={{ fontSize: '13px', color: gold, textAlign: 'center' }}>{message}</div>}
              <button type="submit" disabled={loading} style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.25em', color: '#000', background: gold, border: 'none', padding: '1rem', cursor: 'pointer', opacity: loading ? 0.6 : 1, marginTop: '0.5rem' }}>
                {loading ? 'ENTERING...' : isSignUp ? 'REQUEST ADMISSION' : 'ENTER THE SALON'}
              </button>
            </form>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '12px', color: '#5a5040', textAlign: 'center', marginTop: '1.5rem' }}>
              {isSignUp ? <>Already a member? <button onClick={() => { setIsSignUp(false); setError(''); setMessage('') }} style={{ color: gold, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>Sign in</button></> :
              <>New? <button onClick={() => { setIsSignUp(true); setError(''); setMessage('') }} style={{ color: gold, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>Request admission</button></>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
