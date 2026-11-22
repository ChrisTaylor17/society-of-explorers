'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import CheckoutWelcome from '@/components/CheckoutWelcome';
import { useGuideProgram } from '@/lib/salons/useGuideProgram';
import { isUuid } from '@/lib/ids/uuid';
import { ONLINE_CIRCLES_HREF } from '@/lib/circles/discovery';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

const TRACK_COLORS: Record<string, string> = { singularity: '#4169E1', blockchain: '#c9a84c', consciousness: '#7B68EE' };
const TRACK_LABELS: Record<string, string> = { singularity: 'Singularity & AI', blockchain: 'Blockchain & Data Sovereignty', consciousness: 'The Secret & Consciousness' };
const GUIDE_LEVELS = ['', 'Guide', 'Senior Guide', 'Master Guide'];

type RecruitingSalon = {
  id: string;
  title: string;
  description?: string | null;
  status?: string | null;
  max_members: number;
  topic_rotation?: string[];
  member_count: number;
  guide_name?: string | null;
};

function isProgramListing(value: unknown): value is RecruitingSalon {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const optionalText = (text: unknown, limit: number) => text === null ||
    (typeof text === 'string' && text.length <= limit);
  return isUuid(row.id) && typeof row.title === 'string' && row.title.trim().length > 0 && row.title.length <= 160 &&
    optionalText(row.description, 500) && (row.status === 'recruiting' || row.status === 'active') &&
    typeof row.max_members === 'number' && Number.isInteger(row.max_members) && row.max_members >= 1 && row.max_members <= 20 &&
    typeof row.member_count === 'number' && Number.isInteger(row.member_count) && row.member_count >= 0 && row.member_count <= 20 &&
    Array.isArray(row.topic_rotation) && row.topic_rotation.length <= 12 &&
    row.topic_rotation.every(topic => typeof topic === 'string' && topic.length <= 40) &&
    optionalText(row.guide_name, 160);
}

function SalonChoices() {
  return <nav aria-label="Other ways to gather" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px 20px', margin: '1.25rem auto 0' }}>
    <Link href="/salons/pilot" prefetch={false} style={{ color: gold, display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>Read the four-week fellowship plan</Link>
    <Link href={ONLINE_CIRCLES_HREF} prefetch={false} style={{ color: gold, display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>Find an online reading Circle</Link>
  </nav>;
}

export default function SalonPage() {
  const account = useGuideProgram();
  const { program, joining } = account;
  const mySalon = program?.salon;
  const sessions = program?.sessions ?? [];
  const members = program?.members ?? [];
  const stats = program?.stats;
  const guide = program?.guide;
  const myMembership = program?.myMembership;
  const [recruiting, setRecruiting] = useState<RecruitingSalon[]>([]);
  const [loading, setLoading] = useState(true);
  const [listingError, setListingError] = useState(false);
  const [listingAttempt, setListingAttempt] = useState(0);
  const checking = account.phase === 'loading' || account.phase === 'joining';
  const accountNotice = <section aria-label="Your program access" style={{ maxWidth: 600, margin: '1.5rem auto', textAlign: 'center' }}>
    <p role="status">{account.notice}</p>
    <button type="button" disabled={!account.active || checking} onClick={() => void account.load()}
      style={{ minHeight: 44, padding: '8px 16px', color: gold, border: `1px solid ${gold}`, background: 'transparent' }}>
      Check current access
    </button>
    {(account.phase === 'signed-out' || account.phase === 'unavailable') && <p><Link href="/login?next=%2Fsalon" prefetch={false} style={{ color: gold }}>Sign in to your program</Link></p>}
  </section>;

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    setLoading(true); setListingError(false); setRecruiting([]);
    async function loadListings() {
      try {
        const res = await fetch('/api/salons?status=recruiting,active', { cache: 'no-store', signal: controller.signal });
        const data: unknown = await res.json();
        const rows = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>).salons : null;
        if (!res.ok || !Array.isArray(rows) || rows.length > 20 || !rows.every(isProgramListing)) throw new Error('Program listings unavailable');
        if (!current) return;
        if (controller.signal.aborted) throw new Error('Program listing lookup expired');
        setRecruiting(rows);
      } catch {
        if (current) setListingError(true);
      } finally {
        window.clearTimeout(timeout);
        if (current) setLoading(false);
      }
    }
    void loadListings();
    return () => { current = false; window.clearTimeout(timeout); controller.abort(); };
  }, [listingAttempt]);

  // IN A SALON VIEW
  if (mySalon) {
    const upcomingSessions = sessions.filter(s => s.status === 'scheduled' || s.status === 'live').slice(0, 7);
    const completedSessions = sessions.filter(s => s.status === 'completed');
    const sessionsLed = myMembership?.sessions_led || 0;
    const sessionsAttended = myMembership?.sessions_attended || 0;
    const isGuideCandidate = myMembership?.is_guide_candidate || false;
    const graduationReq = 5; // must lead 5 sessions (one full week)

    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif', animation: 'fadeIn 0.8s ease' }}>
        <PublicNav />
        <CheckoutWelcome />

        {/* Header */}
        <section style={{ padding: '8rem 2rem 2rem', textAlign: 'center' }}>
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>YOUR SEVEN-WEEK SALON</div>
            <h1 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 'clamp(24px, 5vw, 36px)', fontWeight: 400, fontStyle: 'italic', color: parchment, marginBottom: '0.75rem' }}>{mySalon.title}</h1>
            {guide && (
              <p style={{ fontSize: '14px', color: muted }}>
                Guide: {guide.display_name}
                {guide.guide_level > 0 && <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', color: gold, marginLeft: '8px' }}>{GUIDE_LEVELS[guide.guide_level]}</span>}
              </p>
            )}
            <SalonChoices />
            {accountNotice}

            {/* Week progress */}
            {stats && (
              <div style={{ marginTop: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '0.75rem' }}>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', color: gold, border: `1px solid ${gold}44`, padding: '4px 14px', borderRadius: '10px' }}>WEEK {stats.current_week} OF 7</span>
                  {mySalon.status === 'graduating' && <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', color: '#4CAF50', border: '1px solid rgba(76,175,80,0.4)', padding: '4px 14px', borderRadius: '10px' }}>GRADUATING</span>}
                </div>
                <div style={{ maxWidth: '300px', margin: '0 auto', height: '4px', background: '#1a1a1a', borderRadius: '2px' }}>
                  <div style={{ height: '100%', width: `${(stats.current_week / 7) * 100}%`, background: gold, borderRadius: '2px', transition: 'width 0.5s ease' }} />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Graduation Progress */}
        <section style={{ padding: '0 2rem 2rem' }}>
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ background: '#0d0d0d', border: `1px solid ${gold}15`, padding: '1.5rem' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem' }}>GRADUATION PROGRESS</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '28px', color: sessionsAttended > 0 ? parchment : muted }}>{sessionsAttended}</div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted }}>ATTENDED</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '28px', color: sessionsLed >= graduationReq ? gold : sessionsLed > 0 ? parchment : muted }}>{sessionsLed}/{graduationReq}</div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted }}>SESSIONS LED</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '28px', color: isGuideCandidate ? gold : muted }}>{isGuideCandidate ? '\u2713' : '\u2014'}</div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted }}>GUIDE CANDIDATE</div>
                </div>
              </div>
              {sessionsLed < graduationReq ? (
                <p style={{ fontSize: '13px', color: muted, fontStyle: 'italic', textAlign: 'center' }}>Lead {graduationReq - sessionsLed} more session{graduationReq - sessionsLed !== 1 ? 's' : ''} to qualify for graduation.</p>
              ) : (
                <p style={{ fontSize: '13px', color: gold, fontStyle: 'italic', textAlign: 'center' }}>You&apos;ve met the graduation requirement. Guide status awaits.</p>
              )}
            </div>
          </div>
        </section>

        {/* Sessions */}
        <section style={{ padding: '0 2rem 3rem' }}>
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem' }}>
              {upcomingSessions.length > 0 ? 'UPCOMING SESSIONS' : 'SESSION CALENDAR'}
            </div>
            {upcomingSessions.length === 0 && completedSessions.length === 0 ? (
              <p style={{ fontSize: '14px', color: muted, fontStyle: 'italic' }}>Sessions will appear here once your salon begins.</p>
            ) : (
              <>
                {upcomingSessions.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: `1px solid ${gold}08` }}>
                    <div style={{ width: '80px', flexShrink: 0 }}>
                      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', color: parchment }}>{new Date(s.session_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', color: parchment }}>{s.topic || `Session ${s.session_number}`}</div>

                    </div>
                    {s.track && <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: TRACK_COLORS[s.track] || gold, border: `1px solid ${TRACK_COLORS[s.track] || gold}44`, padding: '2px 8px', borderRadius: '10px' }}>{s.track.toUpperCase()}</span>}
                    <span style={{ fontSize: '12px', color: s.status === 'completed' ? '#4CAF50' : s.status === 'live' ? '#FF6B35' : muted }}>
                      {s.status === 'completed' ? '\u2713' : s.status === 'live' ? '\u25cf LIVE' : ''}
                    </span>
                  </div>
                ))}
                {completedSessions.length > 0 && (
                  <div style={{ marginTop: '1rem' }}>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted, marginBottom: '0.5rem' }}>{completedSessions.length} SESSION{completedSessions.length !== 1 ? 'S' : ''} COMPLETED</div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* Members */}
        <section style={{ padding: '0 2rem 3rem' }}>
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem' }}>MEMBERS ({members.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {members.map((m) => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: '#0d0d0d', border: `1px solid ${gold}08`, transition: 'border-color 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = `${gold}33`}
                  onMouseLeave={e => e.currentTarget.style.borderColor = `${gold}08`}>
                  <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: m.role === 'guide' ? `${gold}22` : '#1a1a1a', border: `1px solid ${m.role === 'guide' ? gold : `${gold}44`}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '11px', color: m.role === 'guide' ? gold : parchment }}>
                    {(m.members?.display_name || '?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: '15px', color: parchment }}>{m.members?.display_name || 'Explorer'}</span>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', color: m.role === 'guide' ? gold : m.is_guide_candidate ? '#4CAF50' : muted, marginLeft: '8px' }}>
                      {m.role === 'guide' ? 'GUIDE' : m.is_guide_candidate ? 'GRADUATING' : m.role?.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '12px', color: muted }}>
                    <div>{m.sessions_attended || 0} attended</div>
                    <div>{m.sessions_led || 0} led</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <PublicFooter />
        <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
      </div>
    );
  }

  // RECRUITING VIEW (not in a salon)
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif', animation: 'fadeIn 0.8s ease' }}>
      <PublicNav />
      <CheckoutWelcome />

      {/* Hero */}
      <section style={{ padding: '8rem 2rem 3rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, marginBottom: '1.5rem' }}>SEVEN-WEEK GUIDE PROGRAM</div>
          <h1 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 'clamp(24px, 5vw, 36px)', fontWeight: 400, fontStyle: 'italic', color: parchment, marginBottom: '0.75rem' }}>
            Learn to lead a conversation.
          </h1>
          <p style={{ fontSize: '16px', color: ivory85, lineHeight: 1.7, maxWidth: '520px', margin: '0 auto' }}>
            This program is designed around seven weeks of discussion and shared leadership. The four-week fellowship pilot has its own reading plan, with a host and dates still to be confirmed.
          </p>
          <SalonChoices />
          {accountNotice}
        </div>
      </section>

      {/* How it works */}
      <section style={{ padding: '0 2rem 3rem' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: '1px', background: `${gold}10` }}>
          {[
            { num: '01', title: 'FIND A GROUP', desc: 'Check a listed group’s capacity, host and meeting dates before joining.' },
            { num: '02', title: 'PRACTICE LEADING', desc: 'The program shares session leadership. Agree on your role with the group.' },
            { num: '03', title: 'REVIEW PROGRESS', desc: 'Guide eligibility depends on recorded attendance and sessions led; seven weeks alone does not grant the role.' },
          ].map(step => (
            <div key={step.num} style={{ flex: '1 1 180px', background: '#0d0d0d', padding: '1.5rem 1.25rem', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '24px', color: gold, marginBottom: '0.5rem' }}>{step.num}</div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: parchment, marginBottom: '0.5rem' }}>{step.title}</div>
              <p style={{ fontSize: '13px', color: muted, lineHeight: 1.5 }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tracks */}
      <section style={{ padding: '0 2rem 3rem' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem', textAlign: 'center' }}>THIS PROGRAM’S DISCUSSION TRACKS</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {Object.entries(TRACK_LABELS).map(([key, label]) => (
              <div key={key} style={{ padding: '10px 16px', border: `1px solid ${TRACK_COLORS[key]}33`, background: `${TRACK_COLORS[key]}08` }}>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.1em', color: TRACK_COLORS[key] }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Salon Grid */}
      <section aria-label="Guide program listings" style={{ padding: '0 2rem 4rem' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem' }}>
            GUIDE PROGRAM GROUPS
          </div>
          <noscript><p>Enable JavaScript to check program listings. You can read the four-week plan and library without it.</p></noscript>
          {loading ? <p role="status">Checking program listings…</p> : listingError ? (
            <div role="alert" style={{ padding: '1.25rem', border: `1px solid ${gold}44` }}>
              <p>We could not load the program listings. Availability is unconfirmed.</p>
              <button type="button" onClick={() => setListingAttempt(attempt => attempt + 1)} style={{ color: gold, background: 'transparent', border: `1px solid ${gold}`, padding: '8px 16px', minHeight: 44, cursor: 'pointer' }}>Retry program listings</button>
            </div>
          ) : recruiting.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', border: `1px solid ${gold}15`, background: '#0d0d0d' }}>
              <p style={{ fontSize: '18px', color: parchment, fontStyle: 'italic', marginBottom: '0.75rem' }}>No groups are listed for this program right now.</p>
              <p style={{ fontSize: '14px', color: muted, marginBottom: '1.5rem' }}>A host and meeting dates must be confirmed for each group. Explore the separate four-week fellowship plan or find a reading Circle above.</p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <a href="/practice" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, padding: '0 20px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '40px' }}>DAILY PRACTICE</a>
                <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: gold, textDecoration: 'none', border: `1px solid ${gold}44`, padding: '0 20px', display: 'inline-flex', alignItems: 'center', height: '40px' }}>JOIN THE SOCIETY</a>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {recruiting.map(s => (
                <div key={s.id} style={{ background: '#0d0d0d', border: `1px solid rgba(201,168,76,0.15)`, padding: '1.5rem 2rem', transition: 'border-color 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = `${gold}66`}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)'}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div>
                      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: gold, marginBottom: '4px' }}>{s.title}</div>
                      {s.guide_name && <div style={{ fontSize: '13px', color: muted }}>Guide: {s.guide_name}</div>}
                      {s.description && <p style={{ fontSize: '14px', color: ivory85, marginTop: '6px', lineHeight: 1.5 }}>{s.description}</p>}
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                      {(s.topic_rotation || []).map((t: string) => (
                        <span key={t} style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.08em', color: TRACK_COLORS[t] || muted, border: `1px solid ${TRACK_COLORS[t] || muted}44`, padding: '2px 6px', borderRadius: '8px' }}>{t.toUpperCase()}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: '13px', color: muted }}>{s.member_count}/{s.max_members} explorers</span>
                      <div style={{ width: '120px', height: '3px', background: '#1a1a1a', borderRadius: '2px', marginTop: '4px' }}>
                        <div style={{ height: '100%', width: `${(s.member_count / s.max_members) * 100}%`, background: s.member_count >= s.max_members ? '#4CAF50' : gold, borderRadius: '2px', transition: 'width 0.3s ease' }} />
                      </div>
                    </div>
                    <button onClick={() => void account.join(s.id)} disabled={!account.canJoin || joining !== null || s.member_count >= s.max_members}
                      style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, border: 'none', height: '40px', padding: '0 20px', cursor: 'pointer', borderRadius: 0, opacity: (!account.canJoin || joining !== null || s.member_count >= s.max_members) ? 0.4 : 1, transition: 'opacity 0.2s' }}>
                      {joining === s.id ? 'JOINING...' : s.member_count >= s.max_members ? 'FULL' : 'JOIN'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Bottom CTA */}
      <section style={{ padding: '2rem 2rem 4rem', textAlign: 'center' }}>
        <div style={{ width: '60px', height: '1px', background: `${gold}4d`, margin: '0 auto 2rem' }} />
        <p style={{ fontSize: '16px', color: muted, fontStyle: 'italic', marginBottom: '0.5rem' }}>Every Guide started as a member.</p>
        <a href="/leaderboard" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: gold, textDecoration: 'none' }}>VIEW THE LEADERBOARD &rarr;</a>
      </section>

      <PublicFooter />
      <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
    </div>
  );
}
