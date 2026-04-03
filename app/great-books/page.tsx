'use client';
import { useState } from 'react';
import { GREAT_BOOKS } from '@/lib/books/catalog';

const gold = '#c9a84c';
const dim = '#d4c9a8';
const muted = '#9a8f7a';

const THINKER_COLORS: Record<string, string> = {
  socrates: '#C9A94E', plato: '#7B68EE', nietzsche: '#DC143C',
  aurelius: '#8B7355', einstein: '#4169E1', jobs: '#A0A0A0',
};

export default function GreatBooksLibrary() {
  const [filter, setFilter] = useState('all');

  const filtered = filter === 'all' ? GREAT_BOOKS : GREAT_BOOKS.filter(b => b.thinkerAffinity === filter);

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#fff', fontFamily: 'Cormorant Garamond, serif' }}>
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to bottom, #000, transparent)' }}>
        <a href="/salon" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.7 }}>← RETURN TO THE SALON</a>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5 }}>SOCIETY OF EXPLORERS</div>
      </nav>

      <div style={{ textAlign: 'center', padding: '80px 20px 40px' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.5em', color: gold, opacity: 0.5, marginBottom: '1.5rem' }}>THE GREAT BOOKS PROGRAM</div>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 300, letterSpacing: '0.15em', color: '#f5f0e8', marginBottom: '1rem' }}>
          READ WITH THE MINDS
        </h1>
        <p style={{ fontSize: '1.15rem', color: muted, fontStyle: 'italic', maxWidth: '600px', margin: '0 auto 2rem', lineHeight: 1.8 }}>
          The foundational texts of civilization — read alongside Socrates, Nietzsche, Aurelius, and the council. Highlight any passage. A thinker responds in the margin.
        </p>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '3rem' }}>
          {['all', 'socrates', 'plato', 'nietzsche', 'aurelius', 'einstein', 'jobs'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '6px 16px', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', cursor: 'pointer',
              background: filter === f ? `rgba(201,168,76,0.15)` : 'none',
              border: `1px solid ${filter === f ? gold : 'rgba(201,168,76,0.2)'}`,
              color: filter === f ? gold : muted,
            }}>
              {f === 'all' ? 'ALL' : f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '0 2rem 4rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1px', background: `${gold}15` }}>
        {filtered.map(book => {
          const accent = THINKER_COLORS[book.thinkerAffinity] || gold;
          return (
            <a key={book.id} href={`/great-books/${book.id}`} style={{ background: '#0a0a0a', padding: '2rem', textDecoration: 'none', display: 'block', transition: 'background 0.3s' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: accent, opacity: 0.6, marginBottom: '0.75rem' }}>
                {book.thinkerAffinity.toUpperCase()} RECOMMENDS
              </div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', letterSpacing: '0.1em', color: '#f5f0e8', marginBottom: '0.25rem' }}>
                {book.title}
              </div>
              <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '13px', color: muted, fontStyle: 'italic', marginBottom: '1rem' }}>
                {book.author} · {book.year}
              </div>
              <p style={{ fontSize: '13px', color: 'rgba(212,201,168,0.7)', lineHeight: 1.6, marginBottom: '1rem' }}>
                {book.description}
              </p>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {book.themes.slice(0, 3).map(t => (
                  <span key={t} style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted, border: `1px solid rgba(201,168,76,0.15)`, padding: '2px 6px' }}>{t.toUpperCase()}</span>
                ))}
              </div>
              <div style={{ marginTop: '1rem', fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: accent, opacity: 0.5 }}>
                {book.sections.length} SECTIONS · READ NOW →
              </div>
            </a>
          );
        })}
      </div>

      <footer style={{ padding: '3rem 2rem', borderTop: `1px solid ${gold}22`, textAlign: 'center' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, opacity: 0.4 }}>SOCIETY OF EXPLORERS · THE GREAT BOOKS PROGRAM</div>
      </footer>
    </div>
  );
}
