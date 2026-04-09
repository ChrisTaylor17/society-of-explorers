'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import WelcomeModal from '@/components/WelcomeModal';
import { computeFrequencyProfile, deriveTags, type CoherenceInput } from '@/lib/world/frequency';

const gold = '#c9a84c';
const parchment = '#E8DCC8';
const muted = '#9a8f7a';

interface Member {
  id: string;
  display_name: string;
  tier: string;
  exp_tokens: number;
  coherence_data: CoherenceInput | null;
  supabase_auth_id: string | null;
}

interface ExpEvent {
  id: string;
  amount: number;
  reason: string;
  metadata: string;
  created_at: string;
}

interface ScanWithSpace {
  id: string;
  space_id: string;
  quality_score: number | null;
  verified: boolean;
  is_first_scan: boolean;
  exp_awarded: number;
  created_at: string;
  space_name?: string;
  space_city?: string;
  space_type?: string;
}

interface StampSpace {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  space_type: string;
  slug: string;
}

const TIER_BADGES: Record<string, { label: string; color: string; icon: string }> = {
  free: { label: 'Explorer', color: '#9a8f7a', icon: '🧭' },
  explorer: { label: 'Explorer', color: '#9a8f7a', icon: '🧭' },
  seeker: { label: 'Seeker', color: '#c9a84c', icon: '⬡' },
  scholar: { label: 'Scholar', color: '#7B68EE', icon: '◇' },
  philosopher: { label: 'Philosopher', color: '#DC143C', icon: '◈' },
};

const REASON_LABELS: Record<string, string> = {
  scan_verified: 'Scan verified',
  space_created: 'Space created',
  spatial_annotation: 'Annotation placed',
  thinker_question: 'Thinker question',
  book_progress: 'Reading progress',
  salon_message: 'Salon message',
  seminar_completion: 'Seminar completed',
};

const DIM_BARS: { key: string; label: string; color: string }[] = [
  { key: 'focus', label: 'Focus', color: '#c9a84c' },
  { key: 'coherence', label: 'Coherence', color: '#7B68EE' },
  { key: 'engagement', label: 'Engagement', color: '#DC143C' },
  { key: 'exploration', label: 'Exploration', color: '#4169E1' },
];

const TYPE_ICONS: Record<string, string> = {
  salon: '⬡', library: '📚', temple: '◈', garden: '🌿', waypoint: '🧭', outpost: '⚑',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ExplorerDashboard() {
  const router = useRouter();
  const [member, setMember] = useState<Member | null>(null);
  const [events, setEvents] = useState<ExpEvent[]>([]);
  const [scans, setScans] = useState<ScanWithSpace[]>([]);
  const [stampSpaces, setStampSpaces] = useState<StampSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const hasCheckedWelcomeRef = useRef(false);
  const [briefing, setBriefing] = useState<any>(null);

  useEffect(() => {
    import('@/lib/auth/getSession').then(({ getMemberSession }) => {
      getMemberSession().then(async session => {
        if (!session) { router.push('/join'); return; }
        const m = session.member as Member;
        setMember(m);
        const sb = session.supabase;

        // Parallel data fetches
        const [eventsRes, scansRes] = await Promise.all([
          sb.from('exp_events').select('*').eq('member_id', m.id).order('created_at', { ascending: false }).limit(10),
          sb.from('scan_uploads').select('id, space_id, quality_score, verified, is_first_scan, exp_awarded, created_at').eq('scanner_id', m.supabase_auth_id).order('created_at', { ascending: false }),
        ]);

        // Check if first visit (no salon messages) — show welcome modal
        if (!hasCheckedWelcomeRef.current) {
          hasCheckedWelcomeRef.current = true;
          const { data: salonData } = await sb.from('salon_messages').select('id').eq('member_id', m.id).limit(1);
          if (!salonData || salonData.length === 0) {
            setShowWelcome(true);
          }
        }

        setEvents(eventsRes.data || []);

        const scanRows = scansRes.data || [];
        // Fetch space names for scans
        if (scanRows.length > 0) {
          const spaceIds = [...new Set(scanRows.map((s: any) => s.space_id))];
          const { data: spaces } = await sb.from('spaces').select('id, name, city, space_type').in('id', spaceIds);
          const spaceMap = new Map((spaces || []).map((s: any) => [s.id, s]));

          const enriched = scanRows.map((s: any) => {
            const sp = spaceMap.get(s.space_id);
            return { ...s, space_name: sp?.name, space_city: sp?.city, space_type: sp?.space_type };
          });
          setScans(enriched);

          // Unique spaces = passport stamps
          const uniqueSpaces = [...spaceMap.values()] as StampSpace[];
          setStampSpaces(uniqueSpaces);
        }

        setLoading(false);

        // Fetch morning briefing data
        fetch('/api/dashboard/briefing').then(r => r.json()).then(d => {
          if (!d.error) setBriefing(d);
        }).catch(() => {});
      });
    });
  }, [router]);

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).style.opacity = '1'; });
    }, { threshold: 0.1 });
    document.querySelectorAll('[data-fade]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [loading]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1.5rem', color: gold, opacity: 0.2, marginBottom: '1rem' }}>⬡</div>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: muted }}>LOADING DASHBOARD...</div>
        </div>
      </div>
    );
  }

  if (!member) return null;

  const tierInfo = TIER_BADGES[member.tier] || TIER_BADGES.free;
  const freqVector = member.coherence_data ? computeFrequencyProfile(member.coherence_data) : null;
  const freqTags = freqVector ? deriveTags(freqVector) : [];
  const verifiedScans = scans.filter(s => s.verified);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {showWelcome && (
        <WelcomeModal
          displayName={member.display_name || 'Explorer'}
          onEnterSalon={() => { setShowWelcome(false); router.push('/salon?thinker=socrates'); }}
          onDismiss={() => setShowWelcome(false)}
        />
      )}

      {/* ═══ WELCOME HEADER ═══ */}
      <section style={{ padding: '100px 2rem 2rem', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
          <span style={{ fontSize: '1.25rem' }}>{tierInfo.icon}</span>
          <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: tierInfo.color, padding: '4px 14px', border: `1px solid ${tierInfo.color}44` }}>
            {tierInfo.label.toUpperCase()}
          </span>
        </div>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.8rem, 4.5vw, 3rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f5f0e8', marginBottom: '0.5rem' }}>
          Welcome back, {member.display_name}
        </h1>
        <p style={{ fontSize: '1rem', color: muted, fontStyle: 'italic' }}>Your explorer home base.</p>
      </section>

      {/* ═══ MORNING BRIEFING ═══ */}
      {briefing && (
        <section data-fade style={{ padding: '0 2rem 2rem', opacity: 0, transition: 'opacity 0.8s ease' }}>
          <div style={{ maxWidth: '640px', margin: '0 auto' }}>
            {/* Context line */}
            {briefing.profile?.active_goals?.length > 0 && (
              <p style={{ fontSize: '15px', color: muted, textAlign: 'center', marginBottom: '1rem', fontStyle: 'italic' }}>
                {briefing.profile.active_goals.length} active goal{briefing.profile.active_goals.length !== 1 ? 's' : ''}.
                {briefing.profile.pending_commitments?.length > 0 && ` ${briefing.profile.pending_commitments.length} commitment${briefing.profile.pending_commitments.length !== 1 ? 's' : ''} pending.`}
              </p>
            )}

            {/* Proactive check-ins */}
            {briefing.triggers.length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '0.75rem' }}>COUNCIL CHECK-INS</div>
                {briefing.triggers.map((t: any) => (
                  <div key={t.id} style={{ background: '#0d0d0d', border: `1px solid ${gold}15`, padding: '1rem 1.25rem', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.1em', color: gold }}>{(t.suggested_thinker || '').toUpperCase()}</span>
                      <p style={{ fontSize: '14px', color: parchment, lineHeight: 1.6, margin: '4px 0 0' }}>{t.message_sent || t.context_summary}</p>
                    </div>
                    <a href="/council" style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.12em', color: '#0a0a0a', background: gold, padding: '6px 14px', textDecoration: 'none', flexShrink: 0 }}>RESPOND</a>
                  </div>
                ))}
              </div>
            )}

            {/* Quick actions */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <a href="/council" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, padding: '10px 20px', textDecoration: 'none' }}>ASK THE COUNCIL</a>
              <a href="/council" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: gold, border: `1px solid ${gold}44`, padding: '10px 20px', textDecoration: 'none' }}>REVIEW MY GOALS</a>
            </div>
          </div>
        </section>
      )}

      {/* ═══ STATS ROW ═══ */}
      <section data-fade style={{ padding: '1rem 2rem 3rem', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', background: `${gold}12` }}>
          {[
            { label: '$EXP Earned', value: member.exp_tokens.toLocaleString(), color: gold },
            { label: 'Spaces Scanned', value: String(stampSpaces.length), color: '#4169E1' },
            { label: 'Passport Stamps', value: String(stampSpaces.length), color: '#7B68EE' },
            { label: 'Frequency', value: freqVector ? `${Math.round(freqVector.magnitude * 50)}%` : '—', color: '#DC143C' },
          ].map(stat => (
            <div key={stat.label} style={{ background: '#0d0d0d', padding: '1.5rem 1rem', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.4rem, 3vw, 2rem)', color: stat.color, marginBottom: '0.25rem' }}>{stat.value}</div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: muted }}>{stat.label.toUpperCase()}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ QUICK ACTIONS ═══ */}
      <section data-fade style={{ padding: '0 2rem 3rem', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>QUICK ACTIONS</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1px', background: `${gold}10` }}>
            {[
              { label: 'Scan a Space', desc: 'Upload photos or LiDAR', icon: '📸', href: '/world' },
              { label: 'Find Your Frequency', desc: 'Match with explorers', icon: '🔮', href: '/world/match' },
              { label: 'Talk to a Thinker', desc: 'Enter the Salon', icon: 'Σ', href: '/salon' },
              { label: 'Book Travel', desc: 'Sovereign booking', icon: '✈️', href: '/travel' },
            ].map(action => (
              <a key={action.label} href={action.href} style={{ background: '#0d0d0d', padding: '1.5rem', textDecoration: 'none', display: 'block', transition: 'background 0.2s' }}>
                <div style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>{action.icon}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.1em', color: '#f5f0e8', marginBottom: '0.25rem' }}>{action.label}</div>
                <div style={{ fontSize: '12px', color: muted }}>{action.desc}</div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ RECENT ACTIVITY ═══ */}
      <section data-fade style={{ padding: '0 2rem 3rem', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>RECENT ACTIVITY</div>
          {events.length === 0 ? (
            <div style={{ background: '#0d0d0d', padding: '2rem', textAlign: 'center', color: muted, fontStyle: 'italic' }}>
              No activity yet. Start exploring to earn $EXP.
            </div>
          ) : (
            <div style={{ background: '#0d0d0d', border: `1px solid ${gold}11` }}>
              {events.map((ev, i) => (
                <div key={ev.id} style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: i < events.length - 1 ? `1px solid ${gold}08` : 'none' }}>
                  <div>
                    <div style={{ fontSize: '14px', color: parchment }}>{REASON_LABELS[ev.reason] || ev.reason}</div>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted, marginTop: '2px' }}>{timeAgo(ev.created_at)}</div>
                  </div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: gold }}>+{ev.amount} EXP</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ═══ PASSPORT STAMPS ═══ */}
      <section data-fade style={{ padding: '0 2rem 3rem', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>PASSPORT STAMPS</div>
          {stampSpaces.length === 0 ? (
            <div style={{ background: '#0d0d0d', padding: '2rem', textAlign: 'center' }}>
              <p style={{ color: muted, fontStyle: 'italic', marginBottom: '0.75rem' }}>No stamps yet. Scan a space to earn your first.</p>
              <a href="/world" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: gold, textDecoration: 'none' }}>Explore Spaces →</a>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
              {stampSpaces.map(sp => (
                <div key={sp.id} style={{ background: '#0d0d0d', border: `1px solid ${gold}18`, padding: '1.25rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{TYPE_ICONS[sp.space_type] || '⬡'}</div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.08em', color: '#f5f0e8', marginBottom: '2px' }}>{sp.name}</div>
                  {sp.city && <div style={{ fontSize: '11px', color: muted }}>{sp.city}</div>}
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '6px', letterSpacing: '0.15em', color: gold, opacity: 0.4, marginTop: '0.5rem' }}>SOULBOUND</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ═══ SCANNED SPACES ═══ */}
      <section data-fade style={{ padding: '0 2rem 3rem', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>YOUR SCANS</div>
          {scans.length === 0 ? (
            <div style={{ background: '#0d0d0d', padding: '2rem', textAlign: 'center', color: muted, fontStyle: 'italic' }}>
              No scans uploaded yet.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1px', background: `${gold}10` }}>
              {scans.map(scan => (
                <div key={scan.id} style={{ background: '#0d0d0d', padding: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <div>
                      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.06em', color: '#f5f0e8' }}>{scan.space_name || 'Unknown Space'}</div>
                      {scan.space_city && <div style={{ fontSize: '11px', color: muted }}>{scan.space_city}</div>}
                    </div>
                    {scan.verified && scan.quality_score !== null && (
                      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: scan.quality_score >= 80 ? '#22c55e' : scan.quality_score >= 60 ? gold : muted }}>
                        {scan.quality_score}%
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {scan.verified ? (
                      <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: '#22c55e', border: '1px solid #22c55e44', padding: '2px 8px' }}>VERIFIED</span>
                    ) : (
                      <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted, border: `1px solid ${muted}33`, padding: '2px 8px' }}>PENDING</span>
                    )}
                    {scan.is_first_scan && (
                      <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: gold, border: `1px solid ${gold}44`, padding: '2px 8px' }}>FIRST SCAN · 2×</span>
                    )}
                    {scan.exp_awarded > 0 && (
                      <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: gold }}>+{scan.exp_awarded} EXP</span>
                    )}
                  </div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', color: muted, marginTop: '0.5rem' }}>{timeAgo(scan.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ═══ FREQUENCY PROFILE ═══ */}
      {freqVector && (
        <section data-fade style={{ padding: '0 2rem 3rem', opacity: 0, transition: 'opacity 0.8s ease' }}>
          <div style={{ maxWidth: '480px', margin: '0 auto' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>FREQUENCY PROFILE</div>
            <div style={{ background: '#0d0d0d', border: `1px solid ${gold}18`, padding: '1.5rem 2rem' }}>
              {DIM_BARS.map(d => {
                const val = (freqVector as any)[d.key] as number;
                const pct = Math.round(val * 100);
                return (
                  <div key={d.key} style={{ marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                      <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.12em', color: muted }}>{d.label.toUpperCase()}</span>
                      <span style={{ fontSize: '11px', color: parchment }}>{pct}%</span>
                    </div>
                    <div style={{ height: '4px', background: `${gold}12`, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: d.color, transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                );
              })}
              {freqTags.length > 0 && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '1rem', paddingTop: '0.75rem', borderTop: `1px solid ${gold}10` }}>
                  {freqTags.map(tag => (
                    <span key={tag} style={{ padding: '3px 10px', fontSize: '9px', fontFamily: 'Cinzel, serif', letterSpacing: '0.06em', color: gold, border: `1px solid ${gold}33`, background: `${gold}08` }}>{tag}</span>
                  ))}
                </div>
              )}
              <a href="/world/match" style={{ display: 'block', textAlign: 'center', marginTop: '1rem', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: gold, textDecoration: 'none' }}>Find Resonant Explorers →</a>
            </div>
          </div>
        </section>
      )}

      <PublicFooter />
    </div>
  );
}
