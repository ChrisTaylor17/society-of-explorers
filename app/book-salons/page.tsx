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

export default function BookSalons() {
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createBook, setCreateBook] = useState('');
  const [createTitle, setCreateTitle] = useState('');
  const [createMax, setCreateMax] = useState(8);
  const [createDate, setCreateDate] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);

  useEffect(() => {
    import('@/lib/auth/getSession').then(({ getMemberSession }) => {
      getMemberSession().then(s => { if (s?.member?.id) setMemberId(s.member.id); });
    });
    loadCohorts();
  }, []);

  async function loadCohorts() {
    setLoading(true);
    try {
      const res = await fetch('/api/book-salons');
      const data = await res.json();
      setCohorts(data.cohorts || []);
    } catch {}
    setLoading(false);
  }

  async function createCohort() {
    if (!createBook || !createTitle || !memberId) return;
    setCreating(true);
    const book = GREAT_BOOKS.find(b => b.id === createBook);
    await fetch('/api/book-salons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookId: createBook,
        title: createTitle,
        maxMembers: createMax,
        startDate: createDate || new Date().toISOString(),
        memberId,
        thinkerId: book?.recommended_thinker || 'socrates',
      }),
    });
    setCreating(false); setShowCreate(false); setCreateTitle(''); setCreateBook('');
    loadCohorts();
  }

  async function joinCohort(cohortId: string) {
    if (!memberId) { alert('Sign in to join a salon'); return; }
    setJoining(cohortId);
    await fetch('/api/book-salons/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cohortId, memberId }),
    });
    setJoining(null);
    loadCohorts();
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to bottom, #000, transparent)' }}>
        <a href="/great-books" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.7 }}>← GREAT BOOKS LIBRARY</a>
        <a href="/salon" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.5 }}>SALON</a>
      </nav>

      <div style={{ textAlign: 'center', padding: '80px 20px 40px' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.5em', color: gold, opacity: 0.5, marginBottom: '1.5rem' }}>READING TOGETHER</div>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 300, letterSpacing: '0.15em', color: parchment, marginBottom: '1rem' }}>BOOK SALONS</h1>
        <p style={{ fontSize: '1.15rem', color: muted, fontStyle: 'italic', maxWidth: '600px', margin: '0 auto 2rem', lineHeight: 1.8 }}>
          Join a cohort. Read the same text on the same schedule. Meet weekly with a thinker who guides the conversation.
        </p>
        {memberId && (
          <button onClick={() => setShowCreate(true)} style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.25em', color: '#000', background: gold, border: 'none', padding: '12px 30px', cursor: 'pointer' }}>
            START A NEW SALON
          </button>
        )}
      </div>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 2rem 4rem' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1.5rem' }}>
          {loading ? 'LOADING...' : `${cohorts.length} SALON${cohorts.length !== 1 ? 'S' : ''}`}
        </div>

        {!loading && cohorts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem', color: muted, fontStyle: 'italic' }}>
            No salons yet. Be the first to start one.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: `${gold}15` }}>
          {cohorts.map(cohort => {
            const book = GREAT_BOOKS.find(b => b.id === cohort.book_id);
            const spotsLeft = (cohort.max_members || 8) - (cohort.member_count || 0);
            return (
              <div key={cohort.id} style={{ background: '#0d0d0d', padding: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '2rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: cohort.status === 'active' ? '#6B9E6B' : gold, opacity: 0.8 }}>
                      {cohort.status === 'active' ? '● ACTIVE' : cohort.status === 'completed' ? '○ COMPLETED' : '○ FORMING'}
                    </span>
                  </div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', letterSpacing: '0.1em', color: parchment, marginBottom: '0.25rem' }}>{cohort.title}</div>
                  <div style={{ fontSize: '13px', color: muted, fontStyle: 'italic' }}>
                    {book?.author || 'Unknown'} · Led by {THINKER_NAMES[cohort.thinker_id] || 'Socrates'}
                    {cohort.start_date && ` · Starts ${new Date(cohort.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                  </div>
                  {cohort.description && <p style={{ fontSize: '12px', color: muted, marginTop: '0.5rem', lineHeight: 1.6 }}>{cohort.description}</p>}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', color: gold, marginBottom: '0.5rem' }}>
                    {cohort.member_count || 0}/{cohort.max_members || 8} members
                  </div>
                  {cohort.status === 'forming' && spotsLeft > 0 && memberId ? (
                    <button onClick={() => joinCohort(cohort.id)} disabled={joining === cohort.id} style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: '#000', background: gold, border: 'none', padding: '8px 18px', cursor: 'pointer', opacity: joining === cohort.id ? 0.5 : 1 }}>
                      {joining === cohort.id ? 'JOINING...' : `JOIN · ${spotsLeft} SPOTS`}
                    </button>
                  ) : (
                    <a href={`/book-salons/${cohort.id}`} style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, border: `1px solid ${gold}44`, padding: '8px 18px', textDecoration: 'none', display: 'inline-block' }}>
                      ENTER SALON
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* How It Works */}
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 2rem 4rem' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '2rem', textAlign: 'center' }}>HOW BOOK SALONS WORK</div>
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

      {/* Create Modal */}
      {showCreate && (
        <div onClick={() => setShowCreate(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#0a0a0a', border: `1px solid ${gold}22`, padding: '3rem', maxWidth: '500px', width: '100%' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.6, marginBottom: '1.5rem', textAlign: 'center' }}>START A NEW BOOK SALON</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, opacity: 0.7, display: 'block', marginBottom: '0.5rem' }}>BOOK</label>
                <select value={createBook} onChange={e => { setCreateBook(e.target.value); const b = GREAT_BOOKS.find(x => x.id === e.target.value); if (b) setCreateTitle(`${b.title} — Reading Group`); }} style={{ width: '100%', background: '#111', border: `1px solid ${gold}22`, padding: '10px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment, outline: 'none' }}>
                  <option value="">Select a book...</option>
                  {GREAT_BOOKS.map(b => <option key={b.id} value={b.id}>{b.title} — {b.author}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, opacity: 0.7, display: 'block', marginBottom: '0.5rem' }}>SALON NAME</label>
                <input value={createTitle} onChange={e => setCreateTitle(e.target.value)} style={{ width: '100%', background: '#111', border: `1px solid ${gold}22`, padding: '10px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, opacity: 0.7, display: 'block', marginBottom: '0.5rem' }}>MAX MEMBERS</label>
                  <input type="number" value={createMax} onChange={e => setCreateMax(Number(e.target.value))} min={2} max={12} style={{ width: '100%', background: '#111', border: `1px solid ${gold}22`, padding: '10px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, opacity: 0.7, display: 'block', marginBottom: '0.5rem' }}>START DATE</label>
                  <input type="date" value={createDate} onChange={e => setCreateDate(e.target.value)} style={{ width: '100%', background: '#111', border: `1px solid ${gold}22`, padding: '10px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={createCohort} disabled={creating || !createBook || !createTitle} style={{ flex: 1, fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: '#000', background: gold, border: 'none', padding: '10px', cursor: 'pointer', opacity: creating ? 0.5 : 1 }}>
                  {creating ? 'CREATING...' : 'CREATE SALON'}
                </button>
                <button onClick={() => setShowCreate(false)} style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: muted, background: 'none', border: `1px solid ${gold}22`, padding: '10px 20px', cursor: 'pointer' }}>CANCEL</button>
              </div>
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
