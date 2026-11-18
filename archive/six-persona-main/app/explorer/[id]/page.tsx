import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

const THINKER_NAMES: Record<string, string> = {
  socrates: 'Socrates', plato: 'Plato', aurelius: 'Marcus Aurelius',
  nietzsche: 'Nietzsche', einstein: 'Einstein', jobs: 'Steve Jobs',
};
const THINKER_COLORS: Record<string, string> = {
  socrates: '#C9A94E', plato: '#7B68EE', aurelius: '#8B7355',
  nietzsche: '#DC143C', einstein: '#4169E1', jobs: '#A0A0A0',
};
const THINKER_AVATARS: Record<string, string> = {
  socrates: 'SO', plato: 'PL', aurelius: 'MA',
  nietzsche: 'FN', einstein: 'AE', jobs: 'SJ',
};

const TIER_LABELS: Record<string, string> = {
  free: 'EXPLORER',
  seeker: 'SEEKER',
  philosopher: 'PHILOSOPHER',
  oracle: 'ORACLE',
};

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function loadExplorer(id: string) {
  const supabase = getAdmin();
  const { data: explorer } = await supabase
    .from('members')
    .select('id, display_name, created_at, current_streak, longest_streak, total_responses, exp_tokens, tier, decision_archetype')
    .eq('id', id)
    .single();

  if (!explorer) return null;

  const { data: responses } = await supabase
    .from('question_responses')
    .select('id, response_text, created_at, question_id')
    .eq('member_id', id)
    .order('created_at', { ascending: false })
    .limit(30);

  const recentIds = (responses || []).slice(0, 5).map(r => r.question_id);
  let questionsById: Record<string, any> = {};
  if (recentIds.length > 0) {
    const { data: questions } = await supabase
      .from('daily_questions')
      .select('id, question_text, thinker_id')
      .in('id', recentIds);
    questionsById = Object.fromEntries((questions || []).map(q => [q.id, q]));
  }

  const recentResponses = (responses || []).slice(0, 5).map(r => ({
    id: r.id,
    response_text: r.response_text,
    created_at: r.created_at,
    question: questionsById[r.question_id] || null,
  }));

  const responseDates = (responses || []).map(r => r.created_at as string);

  const { data: expRows } = await supabase
    .from('exp_events')
    .select('amount')
    .eq('member_id', id);
  const totalExp = (expRows || []).reduce((sum, row: any) => sum + (Number(row.amount) || 0), 0);

  const daysSinceJoined = Math.max(1, Math.floor((Date.now() - new Date(explorer.created_at).getTime()) / 86400000));

  return { explorer, recentResponses, responseDates, stats: { totalExp, daysSinceJoined, responsesCount: (responses || []).length } };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await loadExplorer(id);
  if (!data) return { title: 'Explorer — Society of Explorers' };
  const { explorer } = data;
  const name = explorer.display_name || 'Explorer';
  const title = `${name} — Society of Explorers`;
  const description = `${name} has a ${explorer.current_streak || 0}-day streak and has answered ${explorer.total_responses || 0} philosophical questions. Start your own practice.`;
  return {
    title, description,
    openGraph: { title, description, type: 'profile' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

function streakEncouragement(streak: number): string {
  if (streak === 0) return 'No active streak';
  if (streak < 3) return 'Building momentum';
  if (streak < 7) return 'On the path';
  if (streak < 30) return 'Philosopher-level dedication';
  return 'Master of daily reflection';
}

function monthYear(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function buildStreakGrid(responseDates: string[]): { key: string; active: boolean }[] {
  // 30-day grid, oldest → newest
  const days: { key: string; active: boolean }[] = [];
  const dateSet = new Set(responseDates.map(d => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })));
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    days.push({ key, active: dateSet.has(key) });
  }
  return days;
}

export default async function ExplorerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadExplorer(id);

  if (!data) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
        <PublicNav />
        <div style={{ padding: '10rem 2rem', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>EXPLORER NOT FOUND</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '26px', fontWeight: 400, color: parchment, marginBottom: '1.5rem' }}>This profile does not exist.</h1>
          <a href="/practice" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: gold, border: `1px solid ${gold}`, padding: '12px 28px', textDecoration: 'none' }}>START YOUR PRACTICE</a>
        </div>
        <PublicFooter />
      </div>
    );
  }

  const { explorer, recentResponses, responseDates, stats } = data;
  const name = explorer.display_name || 'Explorer';
  const initial = name[0].toUpperCase();
  const streak = explorer.current_streak || 0;
  const tier = explorer.tier || 'free';
  const tierLabel = TIER_LABELS[tier] || tier.toUpperCase();
  const showTierBadge = tier && tier !== 'free';
  const grid = buildStreakGrid(responseDates);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {/* HEADER */}
      <section style={{ padding: '7rem 2rem 2rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '1.5rem' }}>EXPLORER PROFILE</div>

          {/* Avatar */}
          <div style={{
            width: '72px', height: '72px', borderRadius: '50%',
            background: `${gold}18`, border: `2px solid ${gold}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1rem',
            fontFamily: 'Playfair Display, serif', fontSize: '32px', color: gold,
          }}>{initial}</div>

          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(24px, 4vw, 30px)', fontWeight: 400, color: parchment, marginBottom: '0.5rem' }}>
            {name}
          </h1>

          {showTierBadge && (
            <div style={{ marginBottom: '0.75rem' }}>
              <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, border: `1px solid ${gold}`, padding: '3px 12px' }}>{tierLabel}</span>
            </div>
          )}

          <p style={{ fontSize: '14px', color: muted, fontStyle: 'italic', margin: 0 }}>
            Explorer since {monthYear(explorer.created_at)}
          </p>
        </div>
      </section>

      {/* STATS ROW */}
      <section style={{ padding: '1rem 2rem 2rem' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', background: `${gold}15` }}>
          {[
            {
              label: 'CURRENT STREAK',
              value: streak > 0 ? `${streak}` : '0',
              sub: streak >= 7 ? '\ud83d\udd25 On fire' : streakEncouragement(streak),
              gold: streak >= 3,
            },
            { label: 'RESPONSES', value: (explorer.total_responses || 0).toLocaleString(), sub: 'total' },
            { label: '$EXP', value: (explorer.exp_tokens || 0).toLocaleString(), sub: 'earned' },
            { label: 'DAYS ACTIVE', value: stats.daysSinceJoined.toLocaleString(), sub: 'since joining' },
          ].map(s => (
            <div key={s.label} style={{ background: '#0d0d0d', padding: '1.25rem 0.5rem', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '26px', color: s.gold ? gold : parchment, lineHeight: 1.1, marginBottom: '2px' }}>{s.value}</div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.12em', color: muted, marginBottom: '4px' }}>{s.label}</div>
              <div style={{ fontSize: '10px', color: `${muted}cc`, fontStyle: 'italic' }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* STREAK VISUALIZATION */}
      <section style={{ padding: '1rem 2rem 2rem' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', background: '#0d0d0d', border: `1px solid ${gold}15`, padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold }}>LAST 30 DAYS</span>
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', color: muted }}>{grid.filter(g => g.active).length}/30 ACTIVE</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(30, 1fr)', gap: '3px' }}>
            {grid.map(d => (
              <div
                key={d.key}
                title={d.key}
                style={{
                  aspectRatio: '1 / 1',
                  background: d.active ? gold : '#1a1a1a',
                  border: `1px solid ${d.active ? gold : '#2a2a2a'}`,
                  opacity: d.active ? 1 : 0.8,
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.12em', color: `${muted}aa` }}>30d AGO</span>
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.12em', color: `${muted}aa` }}>TODAY</span>
          </div>
        </div>
      </section>

      {/* RECENT REFLECTIONS */}
      <section style={{ padding: '1rem 2rem 2rem' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem' }}>RECENT REFLECTIONS</div>

          {recentResponses.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', border: `1px dashed ${gold}22` }}>
              <p style={{ fontSize: '14px', color: muted, fontStyle: 'italic', margin: 0 }}>No reflections yet.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {recentResponses.map(r => {
                const thinkerId = r.question?.thinker_id || '';
                const tName = THINKER_NAMES[thinkerId] || thinkerId;
                const tColor = THINKER_COLORS[thinkerId] || gold;
                const tAvatar = THINKER_AVATARS[thinkerId] || '??';
                return (
                  <div key={r.id} style={{ background: '#0d0d0d', border: `1px solid ${gold}10`, padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
                      <div style={{
                        width: '26px', height: '26px', borderRadius: '50%',
                        background: `${tColor}18`, border: `1.5px solid ${tColor}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'Cinzel, serif', fontSize: '9px', color: tColor,
                      }}>{tAvatar}</div>
                      <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: tColor }}>{tName.toUpperCase()}</span>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontSize: '11px', color: muted }}>{timeAgo(r.created_at)}</span>
                    </div>
                    {r.question?.question_text && (
                      <p style={{ fontSize: '14px', color: ivory85, fontStyle: 'italic', lineHeight: 1.5, margin: 0, marginBottom: '0.75rem' }}>&ldquo;{r.question.question_text}&rdquo;</p>
                    )}
                    <p style={{
                      fontSize: '15px', color: parchment, lineHeight: 1.6, margin: 0,
                      display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>{r.response_text}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '2rem 2rem 5rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          <div style={{ width: '60px', height: '1px', background: `${gold}4d`, margin: '0 auto 2rem' }} />
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(22px, 4vw, 28px)', fontWeight: 400, fontStyle: 'italic', color: parchment, marginBottom: '0.75rem', lineHeight: 1.3 }}>
            Start your own practice.
          </h2>
          <p style={{ fontSize: '15px', color: muted, lineHeight: 1.7, marginBottom: '1.75rem' }}>
            One question every morning. 280 characters. See what happens.
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/practice" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px' }}>TODAY&apos;S QUESTION</a>
            <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: gold, textDecoration: 'none', border: `1px solid ${gold}`, padding: '0 24px', display: 'inline-flex', alignItems: 'center', height: '48px' }}>JOIN FREE</a>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
