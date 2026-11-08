'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { GREAT_BOOKS } from '@/lib/books/catalog';
import { useBookSalonAccount } from '@/lib/book-salons/useBookSalonAccount';
import { useBookSalonDiscovery } from '@/lib/books/useBookSalonDiscovery';
import { ONLINE_CIRCLES_HREF } from '@/lib/circles/discovery';

const gold = '#C5A55A';
const parchment = '#E8DCC8';
const muted = '#9a8f7a';

const THINKER_NAMES: Record<string, string> = {
  socrates: 'Socrates', plato: 'Plato', nietzsche: 'Nietzsche',
  aurelius: 'Aurelius', einstein: 'Einstein', jobs: 'Jobs',
};

export default function BookSalons() {
  const discovery = useBookSalonDiscovery();
  const { cohorts, loading, load: loadCohorts } = discovery;
  const account = useBookSalonAccount();
  const showCreate = account.draft !== null, creating = account.phase === 'creating';
  const busy = ['loading', 'creating', 'joining', 'checking'].includes(account.phase);
  const { bookId: createBook, title: createTitle, maxMembers: createMax, startDate: createDate } = account.draft
    ?? { bookId: '', title: '', maxMembers: 8, startDate: '' };
  useEffect(() => { if (account.successRevision) void loadCohorts(); }, [account.successRevision, loadCohorts]);

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <nav aria-label="Book salon navigation" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '1rem', display: 'flex', flexWrap: 'wrap', gap: '8px 16px', justifyContent: 'space-between', alignItems: 'center', background: '#0A0A0A' }}>
        <Link href="/great-books" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.7 }}>← GREAT BOOKS LIBRARY</Link>
        <Link href={account.label ? '/salon' : '/login?next=%2Fsalon'} prefetch={false} style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.12em', color: gold, textDecoration: 'none', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>{account.label ? 'SEVEN-WEEK GUIDE PROGRAM' : 'SIGN IN FOR THE GUIDE PROGRAM'}</Link>
      </nav>

      <div style={{ textAlign: 'center', padding: '144px 20px 40px' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.5em', color: gold, opacity: 0.5, marginBottom: '1.5rem' }}>READING TOGETHER</div>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 300, letterSpacing: '0.15em', color: parchment, marginBottom: '1rem' }}>BOOK SALONS</h1>
        <p style={{ fontSize: '1.15rem', color: muted, fontStyle: 'italic', maxWidth: '600px', margin: '0 auto 2rem', lineHeight: 1.8 }}>
          Read with a small group and discuss the text together. Book-salon discussions are public. Confirm the human host, schedule and any optional AI perspective before joining.
        </p>
        <p><Link href="/salons/pilot" prefetch={false} style={{ color: gold, display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>Explore the four-week fellowship plan</Link></p>
        <p><Link href={ONLINE_CIRCLES_HREF} prefetch={false} style={{ color: gold, display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>Find an online reading Circle</Link></p>
        <section aria-label="Book salon account" style={{ maxWidth: 600, margin: '1.5rem auto', lineHeight: 1.6, scrollMarginTop: 120 }}>
          {account.label && <p>Signed in as {account.label}.</p>}
          <p role="status">{account.notice}</p>
          <button type="button" disabled={!account.active || busy} onClick={() => void account.load()}
            style={{ minHeight: 44, padding: '8px 16px', color: gold, border: `1px solid ${gold}44`, background: 'transparent' }}>Check current account</button>
          {!account.label && <p><Link href="/login?next=%2Fbook-salons" prefetch={false} style={{ color: gold, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>Sign in to create or join a book salon</Link></p>}
          {account.pendingCreation && <p>An earlier creation is unconfirmed. Keep this page open and use exactly the same details to check that request. Drafts clear when you leave the page or change accounts.</p>}
          {account.pendingJoin && <p><button type="button" disabled={!account.canAct} onClick={() => void account.checkJoin()}
            style={{ minHeight: 44, padding: '8px 16px', color: gold, border: `1px solid ${gold}44`, background: 'transparent' }}>Check join status</button></p>}
          {account.result && <p><Link href={`/book-salons/${account.result.cohortId}`} prefetch={false} style={{ color: gold, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>Open confirmed salon</Link></p>}
          {account.error && !showCreate && <p role="alert" style={{ color: '#e5b8a2' }}>{account.error}</p>}
        </section>
        {account.canAct && (
          <button onClick={account.openCreate} style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.25em', color: '#000', background: gold, border: 'none', minHeight: 44, padding: '12px 30px', cursor: 'pointer' }}>
            START A NEW SALON
          </button>
        )}
      </div>

      <section aria-label="Public book salon listings" style={{ maxWidth: '900px', margin: '0 auto', padding: '0 2rem 4rem' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1.5rem' }}>
          {loading ? (cohorts.length ? 'LOADING MORE SALONS…' : 'CHECKING PUBLIC SALONS…') : discovery.error && !cohorts.length ? 'AVAILABILITY UNCONFIRMED' : `${cohorts.length} SALON${cohorts.length !== 1 ? 'S' : ''} SHOWN`}
        </div>

        <noscript><p>Public salon listings require JavaScript. You can still read the fellowship plan and browse the Great Books library.</p></noscript>
        {discovery.error && <div role="alert" style={{ padding: '1.5rem 0', color: parchment }}>
          <p>{cohorts.length ? 'More salons could not be loaded. The groups already shown are from the earlier lookup.' : 'We could not load the book salons. Availability is unconfirmed.'}</p>
          <button type="button" disabled={loading} onClick={() => void loadCohorts(discovery.requestedOffset)} style={{ minHeight: 44, padding: '8px 16px', color: gold, border: `1px solid ${gold}`, background: 'transparent' }}>Retry salon listings</button>
        </div>}
        {!loading && !discovery.error && cohorts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem', color: muted, fontStyle: 'italic' }}>
            No public book salons are listed right now.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: `${gold}15` }}>
          {cohorts.map(cohort => {
            const book = GREAT_BOOKS.find(b => b.id === cohort.book_id);
            const spotsLeft = cohort.max_members === null ? null : Math.max(0, cohort.max_members - cohort.member_count);
            return (
              <div key={cohort.id} style={{ background: '#0d0d0d', padding: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 220px', minWidth: 0, overflowWrap: 'anywhere' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: cohort.status === 'active' ? '#6B9E6B' : gold, opacity: 0.8 }}>
                      {cohort.status === 'active' ? '● ACTIVE' : cohort.status === 'completed' ? '○ COMPLETED' : cohort.status === 'forming' ? '○ FORMING' : 'STATUS TO CONFIRM'}
                    </span>
                  </div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', letterSpacing: '0.1em', color: parchment, marginBottom: '0.25rem' }}>{cohort.title}</div>
                  <div style={{ fontSize: '13px', color: muted, fontStyle: 'italic' }}>
                    {book?.author || 'Book details to confirm'}
                    {cohort.start_date ? ` · Recorded start: ${new Date(cohort.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ' · Start date to confirm'}
                    <div>Human host: confirm with the group.</div>
                    <div>{THINKER_NAMES[cohort.thinker_id || ''] ? `Optional AI perspective: ${THINKER_NAMES[cohort.thinker_id!]}. Confirm with the host.` : 'Optional AI perspective: not specified.'}</div>
                  </div>
                  {cohort.description && <p style={{ fontSize: '12px', color: muted, marginTop: '0.5rem', lineHeight: 1.6 }}>{cohort.description}</p>}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', color: gold, marginBottom: '0.5rem' }}>
                    {cohort.max_members === null ? `${cohort.member_count} members · capacity unconfirmed` : `${cohort.member_count}/${cohort.max_members} members`}
                  </div>
                  {cohort.status === 'forming' && spotsLeft !== null && spotsLeft > 0 && account.canAct && !account.pendingJoin && account.result?.cohortId !== cohort.id ? (
                    <button onClick={() => void account.join(cohort.id)} disabled={busy} style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: '#000', background: gold, border: 'none', padding: '8px 18px', minHeight: 44, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
                      {account.joining === cohort.id ? 'JOINING...' : `JOIN · ${spotsLeft} SPOTS`}
                    </button>
                  ) : (
                    <Link href={`/book-salons/${cohort.id}`} style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, border: `1px solid ${gold}44`, padding: '8px 18px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>
                      ENTER SALON
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {!discovery.error && discovery.nextOffset !== null && <button type="button" disabled={loading} onClick={() => void loadCohorts(discovery.nextOffset!)}
          style={{ minHeight: 44, marginTop: '1.5rem', padding: '8px 16px', color: gold, border: `1px solid ${gold}`, background: 'transparent' }}>Load more salons</button>}
        {cohorts.length > 0 && <p><button type="button" disabled={loading} onClick={() => void loadCohorts()}
          style={{ minHeight: 44, color: gold, border: 0, background: 'transparent' }}>Refresh salon listings</button></p>}
      </section>

      {/* How It Works */}
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 2rem 4rem' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '2rem', textAlign: 'center' }}>HOW BOOK SALONS WORK</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 14rem), 1fr))', gap: '1px', background: `${gold}15` }}>
          {[
            { num: 'I', title: 'CHOOSE A TEXT', desc: 'Pick from the Great Books catalog and agree on a reading schedule with your group.' },
            { num: 'II', title: 'GATHER YOUR COHORT', desc: 'Confirm the group’s host, capacity and meeting dates. Make room for respectful disagreement.' },
            { num: 'III', title: 'EXPLORE TOGETHER', desc: 'Bring a question from the reading. An optional AI thinker can offer another perspective when the group chooses to use it.' },
          ].map(step => (
            <div key={step.num} style={{ minWidth: 0, background: '#0d0d0d', padding: '2rem', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1.5rem', color: gold, opacity: 0.2, marginBottom: '1rem' }}>{step.num}</div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, marginBottom: '0.75rem' }}>{step.title}</div>
              <p style={{ fontSize: '13px', color: muted, lineHeight: 1.7 }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div onClick={account.closeCreate} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div role="dialog" aria-modal="true" aria-label="Start a new book salon" onClick={e => e.stopPropagation()} style={{ background: '#0a0a0a', border: `1px solid ${gold}22`, padding: 'clamp(1rem, 5vw, 3rem)', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto', width: '100%' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.6, marginBottom: '1.5rem', textAlign: 'center' }}>START A NEW BOOK SALON</div>
            <p style={{ lineHeight: 1.6 }}>This creates a public book-salon listing and joins you as its creator. Confirm a human host and meeting arrangements separately.</p>
            {account.pendingCreation && <p>Re-enter the same details to check the earlier request. Changed details will not create a second salon.</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, opacity: 0.7, display: 'block', marginBottom: '0.5rem' }}>BOOK</label>
                <select aria-label="Book" disabled={creating} value={createBook} onChange={e => { const b = GREAT_BOOKS.find(x => x.id === e.target.value); account.editDraft({ bookId: e.target.value, title: b ? `${b.title} — Reading Group` : '' }); }} style={{ width: '100%', background: '#111', border: `1px solid ${gold}22`, padding: '10px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment, outline: 'none' }}>
                  <option value="">Select a book...</option>
                  {GREAT_BOOKS.map(b => <option key={b.id} value={b.id}>{b.title} — {b.author}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, opacity: 0.7, display: 'block', marginBottom: '0.5rem' }}>SALON NAME</label>
                <input aria-label="Salon name" disabled={creating} maxLength={160} value={createTitle} onChange={e => account.editDraft({ title: e.target.value })} style={{ width: '100%', background: '#111', border: `1px solid ${gold}22`, padding: '10px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, opacity: 0.7, display: 'block', marginBottom: '0.5rem' }}>MAX MEMBERS</label>
                  <input aria-label="Max members" disabled={creating} type="number" value={createMax} onChange={e => account.editDraft({ maxMembers: Number(e.target.value) })} min={2} max={12} style={{ width: '100%', background: '#111', border: `1px solid ${gold}22`, padding: '10px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, opacity: 0.7, display: 'block', marginBottom: '0.5rem' }}>START DATE</label>
                  <input aria-label="Start date" disabled={creating} type="date" value={createDate} onChange={e => account.editDraft({ startDate: e.target.value })} style={{ width: '100%', background: '#111', border: `1px solid ${gold}22`, padding: '10px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              {account.error && <p role="alert" style={{ color: '#e5b8a2', lineHeight: 1.5, margin: 0 }}>{account.error}</p>}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => void account.create()} disabled={!account.canAct || creating || !createBook || !createTitle.trim()} style={{ flex: 1, fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: '#000', background: gold, border: 'none', minHeight: 44, padding: '10px', cursor: 'pointer', opacity: creating ? 0.5 : 1 }}>
                  {creating ? 'CREATING...' : 'CREATE SALON'}
                </button>
                <button disabled={creating} onClick={account.closeCreate} style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: muted, background: 'none', border: `1px solid ${gold}22`, minHeight: 44, padding: '10px 20px', cursor: 'pointer' }}>CANCEL</button>
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
