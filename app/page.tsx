'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { setWalletCookie } from '@/lib/auth/getSession'
import PublicFooter from '@/components/PublicFooter'

const gold = '#c9a84c'
const parchment = '#E8DCC8'
const muted = '#9a8f7a'

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
  const [authed, setAuthed] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const typewriterRef = useRef<NodeJS.Timeout | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('soe_taste_used')) setTasteUsed(true)
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setAuthed(true) })
    if (localStorage.getItem('soe_wallet_id')) setAuthed(true)
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [supabase])

  useEffect(() => {
    if (!tasteResponse) return
    let i = 0; setTasteDisplayed('')
    typewriterRef.current = setInterval(() => {
      i++; setTasteDisplayed(tasteResponse.slice(0, i))
      if (i >= tasteResponse.length) { clearInterval(typewriterRef.current!); setTimeout(() => setShowCta(true), 1000) }
    }, 30)
    return () => { if (typewriterRef.current) clearInterval(typewriterRef.current) }
  }, [tasteResponse])

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).style.opacity = '1' })
    }, { threshold: 0.1 })
    document.querySelectorAll('[data-fade]').forEach(el => obs.observe(el))
    return () => obs.disconnect()
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
      const nonceRes = await fetch('/api/auth/nonce'); const { nonce } = await nonceRes.json()
      const { SiweMessage } = await import('siwe')
      const siweMsg = new SiweMessage({ domain: window.location.host, address, statement: 'Sign in to Society of Explorers.', uri: window.location.origin, version: '1', chainId: 1, nonce })
      const msgStr = siweMsg.prepareMessage()
      const signature = await eth.request({ method: 'personal_sign', params: [msgStr, address] })
      const res = await fetch('/api/auth/siwe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msgStr, signature, address }) })
      const data = await res.json()
      if (data.verified && data.member) { setWalletCookie(data.member.id); localStorage.setItem('soe_wallet_id', data.member.id); router.push('/salon') }
      else setError(data.error || 'Verification failed.')
    } catch (e: any) { if (e.code === 4001) setError('Signature cancelled.'); else setError(e.message || 'Connection failed.') }
    setWalletLoading(false)
  }

  const navLink = { fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: parchment, textDecoration: 'none', opacity: 0.7, transition: 'opacity 0.2s' } as const

  return (
    <div style={{ background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>

      {/* ═══ NAV ═══ */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200, padding: '0 2rem', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: scrolled ? 'rgba(10,10,10,0.95)' : 'transparent', backdropFilter: scrolled ? 'blur(8px)' : 'none', borderBottom: scrolled ? `1px solid ${gold}11` : 'none', transition: 'all 0.3s' }}>
        <a href="/" style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.2em', color: gold, textDecoration: 'none' }}>SOCIETY OF EXPLORERS</a>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          <a href="/great-books" style={navLink}>Great Books</a>
          <a href="/join" style={navLink}>Join</a>
          {authed ? (
            <a href="/salon" style={{ ...navLink, color: gold, opacity: 1 }}>Enter Salon</a>
          ) : (
            <button onClick={() => setShowAuth(true)} style={{ ...navLink, background: 'none', border: `1px solid ${gold}44`, padding: '6px 16px', cursor: 'pointer' }}>Sign In</button>
          )}
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <section style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8rem 2rem 6rem', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.03, pointerEvents: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='100' viewBox='0 0 56 100'%3E%3Cpath d='M28 66L0 50L0 16L28 0L56 16L56 50L28 66' fill='none' stroke='%23C9A84C' stroke-width='0.5'/%3E%3C/svg%3E")`, backgroundSize: '56px 100px' }} />
        <div style={{ maxWidth: '720px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 300, letterSpacing: '0.06em', lineHeight: 1.3, marginBottom: '1.5rem' }}>
            A living philosophical community where great minds meet — across centuries and over coffee.
          </h1>
          <p style={{ fontSize: '1.15rem', color: muted, lineHeight: 1.8, maxWidth: '560px', margin: '0 auto 2.5rem' }}>
            AI-powered thinkers. A salon in downtown Boston. The Great Books tradition, reimagined for the age of artificial intelligence.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/great-books" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: '#000', background: gold, padding: '13px 32px', textDecoration: 'none' }}>Explore the Experience →</a>
            <a href="#demo" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, border: `1px solid ${gold}44`, padding: '13px 32px', textDecoration: 'none' }}>Talk to Socrates Now</a>
          </div>
        </div>
      </section>

      {/* ═══ THREE PILLARS ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1px', background: `${gold}12` }}>
          {[
            { icon: '⬡', title: 'AI Thinkers', desc: 'Six philosophical minds available 24/7. Socrates, Nietzsche, Einstein, and more — not chatbots, but deeply trained intellectual companions who remember you.' },
            { icon: '◇', title: 'The Salon', desc: 'A permanent home at 92B South St in downtown Boston. Monthly gatherings. A place where ideas stop being abstract and become real.' },
            { icon: '◈', title: 'Great Books', desc: 'Read Plato, Homer, and Shakespeare alongside AI thinkers who annotate in real time. A structured curriculum for lifelong learners.' },
          ].map(p => (
            <div key={p.title} style={{ background: '#0d0d0d', padding: '2.5rem 2rem' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1.5rem', color: gold, opacity: 0.25, marginBottom: '1rem' }}>{p.icon}</div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold, marginBottom: '0.75rem' }}>{p.title.toUpperCase()}</div>
              <p style={{ fontSize: '15px', color: muted, lineHeight: 1.8 }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ AI DEMO ═══ */}
      <section id="demo" data-fade style={{ padding: '6rem 2rem', background: '#050505', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '520px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, opacity: 0.5, marginBottom: '0.75rem' }}>EXPERIENCE IT RIGHT NOW</div>
            <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 300, letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Ask any question.</h2>
            <p style={{ fontSize: '1rem', color: muted, fontStyle: 'italic' }}>Socrates is listening.</p>
          </div>
          <div style={{ border: `1px solid ${gold}22`, background: '#0a0a0a', padding: '2rem' }}>
            {!tasteUsed || (!tasteResponse && !tasteLoading) ? (
              <div>
                <input value={tasteQ} onChange={e => setTasteQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') askSocrates() }} disabled={tasteLoading}
                  placeholder="What are you really asking?" style={{ width: '100%', background: '#111', border: `1px solid ${gold}22`, padding: '12px 14px', fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: parchment, outline: 'none', boxSizing: 'border-box', marginBottom: '10px' }} />
                <button onClick={askSocrates} disabled={tasteLoading || !tasteQ.trim()} style={{ width: '100%', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.25em', color: '#000', background: gold, border: 'none', padding: '12px', cursor: 'pointer', opacity: tasteLoading || !tasteQ.trim() ? 0.4 : 1 }}>ASK SOCRATES</button>
              </div>
            ) : null}
            {tasteLoading && <div style={{ textAlign: 'center', padding: '1.5rem 0', color: muted, fontStyle: 'italic' }}>Socrates is thinking...</div>}
            {tasteDisplayed && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '16px', color: gold, opacity: 0.6 }}>Σ</span>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, opacity: 0.5 }}>SOCRATES</span>
                </div>
                <div style={{ fontSize: '16px', color: parchment, lineHeight: 1.9 }}>{tasteDisplayed}{tasteDisplayed.length < tasteResponse.length && <span style={{ color: gold }}>▍</span>}</div>
              </div>
            )}
            {showCta && (
              <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: `1px solid ${gold}15` }}>
                <p style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.12em', color: muted, lineHeight: 1.8, textAlign: 'center', marginBottom: '1rem' }}>This is just the beginning. Members have unlimited access to six thinkers.</p>
                <a href="/join" style={{ display: 'block', textAlign: 'center', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, textDecoration: 'none' }}>Join the Society →</a>
              </div>
            )}
            {tasteUsed && !tasteResponse && (
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '14px', color: muted, fontStyle: 'italic', marginBottom: '1rem' }}>Your question has been heard.</p>
                <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, textDecoration: 'none' }}>Enter the Temple →</a>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ═══ SOCIAL PROOF ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, opacity: 0.4, textAlign: 'center', marginBottom: '3rem' }}>TRUSTED BY EXPLORERS</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1px', background: `${gold}08` }}>
            {[
              { quote: 'The thinker conversations changed how I approach my work. It is like having a board of advisors from history.', author: 'Founding Member' },
              { quote: 'I have never experienced anything like this online community. The Great Books program alone is worth it.', author: 'Explorer' },
              { quote: 'Finally, a space that takes ideas as seriously as I do. The salon evenings are extraordinary.', author: 'Scholar' },
            ].map((t, i) => (
              <div key={i} style={{ background: '#0d0d0d', padding: '2rem' }}>
                <p style={{ fontSize: '15px', color: `${parchment}cc`, lineHeight: 1.8, fontStyle: 'italic', marginBottom: '1rem' }}>&ldquo;{t.quote}&rdquo;</p>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, opacity: 0.5 }}>— {t.author.toUpperCase()}</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: '2rem', fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted, opacity: 0.5 }}>92B SOUTH ST · DOWNTOWN BOSTON · EST. 2024</div>
        </div>
      </section>

      {/* ═══ FINAL CTA ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#050505', textAlign: 'center', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '500px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', fontWeight: 300, letterSpacing: '0.08em', marginBottom: '1rem' }}>Ready to explore?</h2>
          <p style={{ fontSize: '1rem', color: muted, lineHeight: 1.8, marginBottom: '2rem' }}>Digital membership from $9.99/mo. Physical salon access from $99/mo.</p>
          <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: '#000', background: gold, padding: '14px 36px', textDecoration: 'none', display: 'inline-block' }}>View Membership Options →</a>
        </div>
      </section>

      <PublicFooter />

      {/* ═══ AUTH MODAL ═══ */}
      {showAuth && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowAuth(false) }} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div style={{ background: '#0a0a0a', border: `1px solid ${gold}22`, padding: '2.5rem 2rem', maxWidth: '380px', width: '100%', position: 'relative' }}>
            <button onClick={() => setShowAuth(false)} style={{ position: 'absolute', top: '1rem', right: '1.2rem', background: 'none', border: 'none', color: muted, fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.6, marginBottom: '1.5rem', textAlign: 'center' }}>SIGN IN</div>
            <button onClick={signInWithGoogle} style={{ width: '100%', padding: '11px', background: 'transparent', border: `1px solid ${gold}44`, color: gold, fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', cursor: 'pointer', marginBottom: '8px' }}>CONTINUE WITH GOOGLE</button>
            <button onClick={connectWallet} disabled={walletLoading} style={{ width: '100%', padding: '11px', background: 'linear-gradient(135deg,#0a1220,#111a2e)', border: '1px solid rgba(100,150,220,0.4)', color: '#8ab0d8', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', cursor: 'pointer', opacity: walletLoading ? 0.5 : 1 }}>
              {walletLoading ? 'CONNECTING...' : 'CONNECT WALLET'}
            </button>
            <div style={{ fontSize: '12px', color: muted, textAlign: 'center', margin: '1.2rem 0' }}>or</div>
            <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required style={{ background: '#111', border: `1px solid ${gold}22`, padding: '10px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment, outline: 'none', width: '100%', boxSizing: 'border-box' as const }} />
              <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required style={{ background: '#111', border: `1px solid ${gold}22`, padding: '10px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment, outline: 'none', width: '100%', boxSizing: 'border-box' as const }} />
              {error && <div style={{ fontSize: '12px', color: '#c05050', textAlign: 'center' }}>{error}</div>}
              {message && <div style={{ fontSize: '12px', color: gold, textAlign: 'center' }}>{message}</div>}
              <button type="submit" disabled={loading} style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: '#000', background: gold, border: 'none', padding: '11px', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>
                {loading ? 'ENTERING...' : isSignUp ? 'CREATE ACCOUNT' : 'SIGN IN'}
              </button>
            </form>
            <div style={{ fontSize: '11px', color: muted, textAlign: 'center', marginTop: '1.2rem' }}>
              {isSignUp ? <>Have an account? <button onClick={() => { setIsSignUp(false); setError(''); setMessage('') }} style={{ color: gold, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>Sign in</button></> :
              <>New? <button onClick={() => { setIsSignUp(true); setError(''); setMessage('') }} style={{ color: gold, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>Create account</button></>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
