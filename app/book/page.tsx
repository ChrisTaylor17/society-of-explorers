'use client';
import { useState } from 'react';

export default function Book() {
  const gold = '#c9a84c';
  const dim = '#d4c9a8';
  const muted = '#9a8f7a';
  const [revealed, setRevealed] = useState(false);

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#fff', fontFamily: 'Cormorant Garamond, serif', overflowX: 'hidden' }}>

      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to bottom, #000, transparent)' }}>
        <a href="/salon" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.7 }}>← RETURN TO THE SALON</a>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5 }}>SOCIETY OF EXPLORERS</div>
      </nav>

      {/* HERO */}
      <section style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse at center, #0d0a02 0%, #000 70%)', textAlign: 'center', padding: '6rem 2rem 4rem' }}>
        <div style={{ maxWidth: '800px' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, opacity: 0.6, marginBottom: '2rem' }}>THE SOCIETY ARTIFACT</div>
          <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2.5rem, 8vw, 6rem)', fontWeight: 300, letterSpacing: '0.15em', lineHeight: 1.1, marginBottom: '2rem' }}>
            THE BOOK<br />
            <span style={{ fontSize: '0.45em', letterSpacing: '0.3em', color: gold }}>AS LIVING ARTIFACT</span>
          </h1>
          <p style={{ fontSize: '1.4rem', color: dim, lineHeight: 1.9, marginBottom: '1.5rem' }}>
            Every book you own is a dormant node in a global network. It is waiting to be activated — to become a living artifact that earns for you, connects you to other readers, and writes your name into an unbreakable chain of human knowledge.
          </p>
          <p style={{ fontSize: '1.2rem', color: gold, fontStyle: 'italic', lineHeight: 1.8, marginBottom: '3rem' }}>
            This is where the blockchain meets the oldest technology humans ever built.
          </p>
          <a href="#how-it-works" style={{ fontFamily: 'Cinzel, serif', fontSize: '0.8rem', letterSpacing: '0.25em', color: gold, border: `1px solid ${gold}`, padding: '1rem 3rem', textDecoration: 'none', display: 'inline-block' }}>
            SEE HOW IT WORKS
          </a>
        </div>
      </section>

      {/* THE VISION */}
      <section style={{ padding: '8rem 2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>THE VISION</div>
        <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '2rem', borderBottom: `1px solid ${gold}44`, paddingBottom: '1rem' }}>
          THE SHARING ECONOMY, REBUILT
        </h2>
        <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim, marginBottom: '2rem' }}>
          Heidegger warned that technology turns everything into <em>standing-reserve</em> — resources waiting to be used and discarded. The current book industry is the perfect example: you buy a book, read it once, and it sits on a shelf. Dead weight. A resource going to waste. The publisher collected your money. The author got a fraction. You got nothing after the first read.
        </p>
        <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim, marginBottom: '2rem' }}>
          <strong style={{ color: '#e8e0d0' }}>We break that model entirely.</strong> Every Society Artifact book contains an embedded NFC chip and a unique QR code. When you share your book — lend it to a friend, leave it in a caf&eacute;, pass it to a stranger on a train — and they tap or scan it, a micro-payment flows automatically to you in <strong style={{ color: gold }}>$SOE</strong>. The blockchain records every handoff. You become a node in a living network of ideas.
        </p>
        <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim }}>
          The more you share, the more you earn. The more the book travels, the more valuable your original ownership becomes. <strong style={{ color: '#e8e0d0' }}>This is the sharing economy that actually shares.</strong>
        </p>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" style={{ padding: '8rem 2rem', background: '#050505' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>THE MECHANISM</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '4rem', borderBottom: `1px solid ${gold}44`, paddingBottom: '1rem' }}>
            HOW IT WORKS
          </h2>

          {[
            {
              num: 'I',
              title: 'Acquire the Artifact',
              body: 'You receive a physical Society book. Embedded inside the spine: an NFC chip encoded with your unique membership address on the Base blockchain. On the cover: a QR code linked to your node. This is not a product. It is an activation key.',
            },
            {
              num: 'II',
              title: 'The First Tap — Your Ritual',
              body: 'You hold the book to your phone. The NFC chip fires. A micro-transaction mints your membership NFT on-chain in seconds. You are now a verified node in the Society of Explorers network. The book is alive.',
            },
            {
              num: 'III',
              title: 'Share — and Earn',
              body: 'You lend the book to a friend. They tap or scan it. A micro-payment — denominated in $SOE — flows automatically to your wallet. Every future tap anywhere in the world continues to pay you. The book travels. Your earnings accumulate. The network grows.',
            },
            {
              num: 'IV',
              title: 'The Chain of Knowledge',
              body: 'Every tap is recorded immutably on-chain. You can see exactly how far your book has traveled — how many people it has reached, which cities, which networks. Your artifact builds a permanent record of ideas in motion. This is provenance for the age of abundance.',
            },
            {
              num: 'V',
              title: 'AI Meets the Artifact',
              body: "Each tap also unlocks an AI conversation with the thinkers of history — Socrates, Heidegger, Einstein — personalized to the reader's context. The book is not just words. It is a portal. Every reader who finds it gets a unique experience shaped by where and when they encountered it.",
            },
          ].map(step => (
            <div key={step.num} style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '2rem', marginBottom: '4rem', paddingBottom: '4rem', borderBottom: `1px solid ${gold}11` }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '2.5rem', fontWeight: 300, color: gold, opacity: 0.3, textAlign: 'center', paddingTop: '0.25rem' }}>{step.num}</div>
              <div>
                <h3 style={{ fontFamily: 'Cinzel, serif', fontSize: '1.1rem', fontWeight: 300, letterSpacing: '0.15em', color: gold, marginBottom: '1rem' }}>{step.title.toUpperCase()}</h3>
                <p style={{ fontSize: '1.15rem', lineHeight: 2, color: dim }}>{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* WHY BOOKS */}
      <section style={{ padding: '8rem 2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>THE PHILOSOPHY</div>
        <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '2rem', borderBottom: `1px solid ${gold}44`, paddingBottom: '1rem' }}>
          WHY BOOKS FIRST
        </h2>
        <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim, marginBottom: '2rem' }}>
          Books are the oldest technology for transmitting consciousness across time. A book written 2,500 years ago by Plato still changes the mind of someone reading it today. No other medium has that durability. No algorithm, no platform, no social network has survived a century intact. Books survive millennia.
        </p>
        <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim, marginBottom: '2rem' }}>
          The Society of Explorers starts with books because they represent the deepest form of the sharing economy — ideas that travel freely between minds, building civilization one reader at a time. We are simply making the invisible visible: encoding that journey on-chain, so the value created by every act of sharing flows back to the people who made it possible.
        </p>
        <blockquote style={{ margin: '3rem 0', padding: '1.5rem 2rem', borderLeft: `2px solid ${gold}`, background: '#0a0800', fontStyle: 'italic', fontSize: '1.2rem', color: dim, lineHeight: 1.8 }}>
          &ldquo;Wherever the art of medicine is loved, there is also a love of humanity.&rdquo;<br />
          <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: gold, opacity: 0.7, fontStyle: 'normal' }}>— HIPPOCRATES · A BOOK THAT HAS SAVED MILLIONS</span>
        </blockquote>
        <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim }}>
          Books are where we start. But the mechanism — NFC artifact + blockchain micropayments + AI portal + network ownership — applies to every physical object that carries knowledge or beauty. We begin with the book. We do not end there.
        </p>
      </section>

      {/* SECRET PASSAGE */}
      <section style={{ padding: '4rem 2rem', background: '#050505', textAlign: 'center' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          {!revealed ? (
            <button
              onClick={() => setRevealed(true)}
              style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, background: 'none', border: `1px solid ${gold}44`, padding: '1rem 2rem', cursor: 'pointer', opacity: 0.6 }}
            >
              ⬡ THERE IS MORE — IF YOU ARE READY
            </button>
          ) : (
            <div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1.5rem' }}>THE DEEPER VISION</div>
              <p style={{ fontSize: '1.15rem', lineHeight: 2, color: dim, marginBottom: '1.5rem' }}>
                Every physical object in the world — every tool, every garment, every instrument, every painting — can become a node. Every act of sharing becomes a transaction. Every creator becomes an owner. Every owner becomes a network.
              </p>
              <p style={{ fontSize: '1.15rem', lineHeight: 2, color: gold, fontStyle: 'italic' }}>
                This is not a product feature. This is the redesign of the entire economy — from extraction to circulation, from ownership to stewardship, from standing-reserve to living artifact.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse at center, #0d0a02 0%, #000 70%)', textAlign: 'center', padding: '4rem 2rem' }}>
        <div style={{ maxWidth: '600px' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '2rem' }}>THE ARTIFACT AWAITS</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '2rem', lineHeight: 1.3 }}>
            BECOME A NODE.<br />EARN FROM EVERY HANDOFF.<br />OWN THE NETWORK.
          </h2>
          <p style={{ fontSize: '1.1rem', color: muted, lineHeight: 1.8, marginBottom: '3rem' }}>
            The first Society Artifact books go to founding members.<br />Join the Society to secure yours.
          </p>
          <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '0.8rem', letterSpacing: '0.2em', color: '#000', background: gold, padding: '1.2rem 3rem', textDecoration: 'none', display: 'inline-block' }}>JOIN THE SOCIETY</a>
            <a href="/labyrinth" style={{ fontFamily: 'Cinzel, serif', fontSize: '0.8rem', letterSpacing: '0.2em', color: gold, border: `2px solid ${gold}`, padding: '1.2rem 3rem', textDecoration: 'none', display: 'inline-block' }}>ENTER THE LABYRINTH</a>
          </div>
        </div>
      </section>

      <footer style={{ padding: '3rem 2rem', borderTop: `1px solid ${gold}22`, textAlign: 'center' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, opacity: 0.4 }}>SOCIETY OF EXPLORERS · 92B SOUTH ST · SOCIETYOFEXPLORERS.COM</div>
      </footer>
    </div>
  );
}
