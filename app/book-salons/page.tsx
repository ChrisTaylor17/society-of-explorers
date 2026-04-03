'use client';
import { useState, useEffect } from 'react';
import { GREAT_BOOKS } from '@/lib/books/catalog';

const gold = '#C5A55A';
const parchment = '#E8DCC8';
const muted = '#9a8f7a';

const THINKER_NAMES: Record<string, string> = {
  socrates: 'Socrates', plato: 'Plato', nietzsche: 'Nietzsche',
  aurelius: 'Aurelius', einstein: 'Einstein', jobs: 'Jobs',
};

interface Cohort {
  id: string;
  bookId: string;
  name: string;
  startDate: string;
  members: number;
  maxMembers: number;
  thinkerId: string;
  status: 'forming' | 'active' | 'completed';
}

// Sample cohorts — in production these would come from Supabase
const SAMPLE_COHORTS: Cohort[] = [
  { id: 'c1', bookId: 'republic', name: 'The Republic — Spring 2026', startDate: '2026-04-14', members: 3, maxMembers: 8, thinkerId: 'plato', status: 'forming' },
  { id: 'c2', bookId: 'meditations', name: 'Meditations — Weekly Stoic', startDate: '2026-04-07', members: 5, maxMembers: 8, thinkerId: 'aurelius', status: 'active' },
  { id: 'c3', bookId: 'genealogy-of-morals', name: 'Genealogy of Morals — Deep Dive', startDate: '2026-04-21', members: 1, maxMembers: 6, thinkerId: 'nietzsche', status: 'forming' },
];

export default function BookSalons() {
  const [cohorts] = useState(SAMPLE_COHORTS);
  const [selectedBook, setSelectedBook] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to bottom, #000, transparent)' }}>
        <a href="/great-books" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.7 }}>← GREAT BOOKS LIBRARY</a>
        <a href="/salon" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.5 }}>SALON</a>
      </nav>

      {/* Header */}
      <div style={{ textAlign: 'center', padding: '80px 20px 40px' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.5em', color: gold, opacity: 0.5, marginBottom: '1.5rem' }}>READING TOGETHER</div>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 300, letterSpacing: '0.15em', color: parchment, marginBottom: '1rem' }}>
          BOOK SALONS
        </h1>
        <p style={{ fontSize: '1.15rem', color: muted, fontStyle: 'italic', maxWidth: '600px', margin: '0 auto 2rem', lineHeight: 1.8 }}>
          Join a cohort. Read the same text on the same schedule. Meet weekly with a thinker who guides the conversation. This is how the Great Books were meant to be read — together.
        </p>
        <button onClick={() => setShowCreate(true)} style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.25em', color: '#000', background: gold, border: 'none', padding: '12px 30px', cursor: 'pointer' }}>
          START A NEW SALON
        </button>
      </div>

      {/* Active & Forming Cohorts */}
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 2rem 4rem' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1.5rem' }}>
          OPEN SALONS
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: `${gold}15` }}>
          {cohorts.map(cohort => {
            const book = GREAT_BOOKS.find(b => b.id === cohort.bookId);
            const spotsLeft = cohort.maxMembers - cohort.members;
            return (
              <div key={cohort.id} style={{ background: '#0d0d0d', padding: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '2rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: cohort.status === 'active' ? '#6B9E6B' : gold, opacity: 0.8 }}>
                      {cohort.status === 'active' ? '● ACTIVE' : '○ FORMING'}
                    </span>
                  </div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', letterSpacing: '0.1em', color: parchment, marginBottom: '0.25rem' }}>
                    {cohort.name}
                  </div>
                  <div style={{ fontSize: '13px', color: muted, fontStyle: 'italic' }}>
                    {book?.author} · Led by {THINKER_NAMES[cohort.thinkerId] || cohort.thinkerId} · Starts {new Date(cohort.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', color: gold, marginBottom: '0.5rem' }}>
                    {cohort.members}/{cohort.maxMembers} members
                  </div>
                  {cohort.status === 'forming' && spotsLeft > 0 ? (
                    <a href={`/great-books/${cohort.bookId}/seminar`} style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: '#000', background: gold, padding: '8px 18px', textDecoration: 'none', display: 'inline-block' }}>
                      JOIN · {spotsLeft} SPOTS
                    </a>
                  ) : cohort.status === 'active' ? (
                    <a href={`/great-books/${cohort.bookId}/seminar`} style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, border: `1px solid ${gold}44`, padding: '8px 18px', textDecoration: 'none', display: 'inline-block' }}>
                      ENTER SALON
                    </a>
                  ) : (
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', color: muted }}>FULL</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {cohorts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem', color: muted, fontStyle: 'italic' }}>
            No salons yet. Be the first to start one.
          </div>
        )}
      </div>

      {/* How It Works */}
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 2rem 4rem' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '2rem', textAlign: 'center' }}>
          HOW BOOK SALONS WORK
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: `${gold}15` }}>
          {[
            { num: 'I', title: 'CHOOSE A TEXT', desc: 'Pick from the Great Books catalog. Each salon reads one book over 4-8 weeks.' },
            { num: 'II', title: 'GATHER YOUR COHORT', desc: '3-8 members. Small enough for real conversation. Large enough for diverse perspectives.' },
            { num: 'III', title: 'READ WITH A THINKER', desc: 'Each week, a thinker leads the discussion. They read the same passage you do — and they disagree with the author.' },
          ].map(step => (
            <div key={step.num} style={{ background: '#0d0d0d', padding: '2rem', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1.5rem', color: gold, opacity: 0.2, marginBottom: '1rem' }}>{step.num}</div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, marginBottom: '0.75rem' }}>{step.title}</div>
              <p style={{ fontSize: '13px', color: muted, lineHeight: 1.7 }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Create Salon Modal */}
      {showCreate && (
        <div onClick={() => setShowCreate(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#0a0a0a', border: `1px solid ${gold}22`, padding: '3rem', maxWidth: '500px', width: '100%' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.6, marginBottom: '1.5rem', textAlign: 'center' }}>START A NEW BOOK SALON</div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, opacity: 0.7, display: 'block', marginBottom: '0.5rem' }}>CHOOSE A BOOK</label>
              <select value={selectedBook} onChange={e => setSelectedBook(e.target.value)} style={{ width: '100%', background: '#111', border: `1px solid ${gold}22`, padding: '10px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment, outline: 'none' }}>
                <option value="">Select a book...</option>
                {GREAT_BOOKS.map(b => (
                  <option key={b.id} value={b.id}>{b.title} — {b.author}</option>
                ))}
              </select>
            </div>

            <p style={{ fontSize: '13px', color: muted, fontStyle: 'italic', lineHeight: 1.7, marginBottom: '1.5rem' }}>
              Your salon will appear in the list above. Other members can join until it reaches capacity. The recommended thinker for the book will lead weekly discussions.
            </p>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowCreate(false)} style={{ flex: 1, fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: '#000', background: gold, border: 'none', padding: '10px', cursor: 'pointer' }}>
                CREATE SALON
              </button>
              <button onClick={() => setShowCreate(false)} style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: muted, background: 'none', border: `1px solid ${gold}22`, padding: '10px 20px', cursor: 'pointer' }}>
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      <footer style={{ padding: '3rem 2rem', borderTop: `1px solid ${gold}22`, textAlign: 'center' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, opacity: 0.4 }}>SOCIETY OF EXPLORERS · BOOK SALONS</div>
      </footer>
    </div>
  );
}
