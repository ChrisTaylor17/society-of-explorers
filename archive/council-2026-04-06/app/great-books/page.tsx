'use client';
import { useState, useEffect } from 'react';
import { GREAT_BOOKS } from '@/lib/books/catalog';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const gold = '#c9a84c';
const dim = '#d4c9a8';
const muted = '#9a8f7a';

const THINKER_COLORS: Record<string, string> = {
  socrates: '#C9A94E', plato: '#7B68EE', nietzsche: '#DC143C',
  aurelius: '#8B7355', einstein: '#4169E1', jobs: '#A0A0A0',
};

export default function GreatBooksLibrary() {
  const [filter, setFilter] = useState('all');
  const [progress, setProgress] = useState<Record<string, { section_id?: string }>>({});

  useEffect(() => {
    import('@/lib/auth/getSession').then(({ getMemberSession }) => {
      getMemberSession().then(s => {
        if (s?.member?.id) {
          fetch(`/api/great-books/progress?memberId=${s.member.id}`)
            .then(r => r.json())
            .then(d => {
              const map: Record<string, any> = {};
              (d.progress || []).forEach((p: any) => { map[p.book_id] = p; });
              setProgress(map);
            }).catch(() => {});
        }
      });
    });
  }, []);

  const filtered = filter === 'all' ? GREAT_BOOKS : GREAT_BOOKS.filter(b => b.recommended_thinker === filter);

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#fff', fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <div style={{ textAlign: 'center', padding: '80px 20px 40px' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.5em', color: gold, opacity: 0.5, marginBottom: '1.5rem' }}>THE GREAT BOOKS PROGRAM</div>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 300, letterSpacing: '0.15em', color: '#f5f0e8', marginBottom: '1rem' }}>
          READ WITH THE MINDS
        </h1>
        <p style={{ fontSize: '1.15rem', color: muted, fontStyle: 'italic', maxWidth: '600px', margin: '0 auto 2rem', lineHeight: 1.8 }}>
          The foundational texts of civilization — read alongside Socrates, Nietzsche, Aurelius, and the council. Highlight any passage. A thinker responds in the margin.
        </p>

        <a href="/book-salons" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, border: `1px solid ${gold}44`, padding: '10px 24px', textDecoration: 'none', display: 'inline-block', marginBottom: '2rem' }}>
          JOIN A BOOK SALON →
        </a>

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
          const accent = THINKER_COLORS[book.recommended_thinker] || gold;
          return (
            <a key={book.id} href={`/great-books/${book.id}`} style={{ background: '#0a0a0a', padding: '2rem', textDecoration: 'none', display: 'block', transition: 'background 0.3s' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: accent, opacity: 0.6, marginBottom: '0.75rem' }}>
                {book.recommended_thinker.toUpperCase()} RECOMMENDS
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
              {progress[book.id] && (
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: gold, opacity: 0.6, marginTop: '0.5rem' }}>
                  Section {progress[book.id].section_id || '1'} · In progress
                </div>
              )}
              <div style={{ marginTop: '0.75rem', fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: accent, opacity: 0.5 }}>
                {progress[book.id] ? 'CONTINUE READING →' : 'READ NOW →'}
              </div>
            </a>
          );
        })}
      </div>

      <PublicFooter />
    </div>
  );
}
