'use client'
export default function JoinPage() {
  const FOUNDING = 'https://buy.stripe.com/7sY7sE0Ic3lQ1wifXC9oc00'
  const SALON = 'https://buy.stripe.com/00w9AM62w8Gaej49ze9oc01'
  const DIGITAL = 'https://buy.stripe.com/9B6fZabmQ3lQ0sebHm9oc02'

  const card = (title: string, price: string, period: string, desc: string, features: string[], link: string, featured: boolean) => (
    <div style={{background: featured ? 'linear-gradient(135deg,#1c1500,#2a1e00)' : 'var(--bg-surface)', border: `1px solid ${featured ? 'var(--gold)' : 'var(--border)'}`, borderRadius: '4px', padding: '32px', flex: 1, minWidth: '260px', maxWidth: '340px', position: 'relative', boxShadow: featured ? '0 0 40px var(--glow-strong)' : 'none'}}>
      {featured && <div style={{position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', background: 'var(--gold)', color: '#0a0900', fontFamily: 'Cinzel,serif', fontSize: '10px', letterSpacing: '0.2em', padding: '4px 14px', borderRadius: '2px'}}>FOUNDING</div>}
      <div style={{fontFamily: 'Cinzel,serif', fontSize: '11px', letterSpacing: '0.3em', color: 'var(--gold-dim)', textTransform: 'uppercase', marginBottom: '12px'}}>{title}</div>
      <div style={{fontFamily: 'Cinzel,serif', fontSize: '42px', color: 'var(--gold-light)', lineHeight: 1}}>{price}</div>
      <div style={{fontSize: '12px', color: 'var(--ivory-muted)', marginTop: '4px', marginBottom: '20px', fontStyle: 'italic'}}>{period}</div>
      <div style={{fontFamily: 'Cormorant Garamond,serif', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '24px', fontStyle: 'italic'}}>{desc}</div>
      <div style={{marginBottom: '28px'}}>
        {features.map((f, i) => <div key={i} style={{display: 'flex', gap: '10px', marginBottom: '8px', fontSize: '13px', color: 'var(--ivory-muted)'}}>
          <span style={{color: 'var(--gold-dim)', flexShrink: 0}}>✦</span>{f}
        </div>)}
      </div>
      <a href={link} target="_blank" rel="noopener noreferrer" style={{display: 'block', width: '100%', padding: '12px', background: featured ? 'var(--gold)' : 'transparent', border: `1px solid ${featured ? 'var(--gold)' : 'var(--border-bright)'}`, borderRadius: '3px', color: featured ? '#0a0900' : 'var(--gold)', fontFamily: 'Cinzel,serif', fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', textAlign: 'center', textDecoration: 'none', cursor: 'pointer', transition: 'all 0.3s'}}>
        {featured ? 'Secure Your Place' : 'Join Now'}
      </a>
    </div>
  )

  return (
    <div style={{minHeight: '100vh', background: 'var(--bg-void)', padding: '60px 24px'}}>
      <div style={{position: 'fixed', inset: 0, background: 'radial-gradient(ellipse at center,rgba(200,168,75,0.04) 0%,transparent 70%)', pointerEvents: 'none'}}/>
      <div style={{textAlign: 'center', marginBottom: '56px'}}>
        <div style={{fontFamily: 'Cinzel,serif', fontSize: '10px', letterSpacing: '0.4em', color: 'var(--gold-dim)', marginBottom: '12px'}}>MEMBERSHIP</div>
        <h1 style={{fontFamily: 'Cinzel,serif', fontSize: 'clamp(28px,5vw,48px)', fontWeight: 400, color: 'var(--gold-light)', letterSpacing: '0.12em', marginBottom: '12px'}}>Join the Society</h1>
        <p style={{fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: '18px', color: 'var(--ivory-muted)', maxWidth: '500px', margin: '0 auto', lineHeight: 1.7}}>
          A private salon where the greatest minds of history help you build the future. Beauty and the pursuit of truth — in Boston and online.
        </p>
        <div style={{margin: '24px auto', width: '200px', height: '1px', background: 'linear-gradient(90deg,transparent,var(--gold-dim),transparent)'}}/>
      </div>

      <div style={{display: 'flex', gap: '24px', justifyContent: 'center', flexWrap: 'wrap', maxWidth: '1100px', margin: '0 auto 60px'}}>
        {card('Digital', '$9.99', 'per month', 'Full access to the digital salon from anywhere in the world.', [
          'AI salon — all 7 great thinkers',
          'Member directory + messaging',
          'EXP token equity',
          'Salon conversation history',
          'Cancel anytime'
        ], DIGITAL, false)}
        {card('Founding', '$499', 'one time · lifetime', 'You were here at the beginning. This price never returns.',  [
          'Lifetime physical + digital access',
          'Founding EXP stake (appreciates)',
          'Your name on the wall at 92B South St',
          'Priority for all events',
          'Founding dinner invitation',
          'Hardware priority access (Tribekey, Crystal Hub)'
        ], FOUNDING, true)}
        {card('Salon', '$99', 'per month', 'The full experience — physical space and digital platform.',  [
          'Physical space access — 92B South St Boston',
          'All digital features included',
          'Events + workshops',
          'AI matchmaking priority',
          'Monthly salon evenings'
        ], SALON, false)}
      </div>

      <div style={{textAlign: 'center', fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.8}}>
        <div>Questions? Email <span style={{color: 'var(--gold-dim)'}}>christaylor17@icloud.com</span></div>
        <div style={{marginTop: '8px'}}>92B South St · Downtown Boston · <a href="/salon" style={{color: 'var(--gold-dim)', textDecoration: 'none'}}>Enter the Salon →</a></div>
      </div>
    </div>
  )
}
