'use client';
import { useState, useEffect } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { getMemberSession } from '@/lib/auth/getSession';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

function useCountdown(targetDate: string | null) {
  const [time, setTime] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  useEffect(() => {
    if (!targetDate) return;
    const tick = () => {
      const diff = Math.max(0, new Date(targetDate).getTime() - Date.now());
      setTime({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetDate]);
  return time;
}

export default function LivePage() {
  const [upcoming, setUpcoming] = useState<any>(null);
  const [past, setPast] = useState<any[]>([]);
  const [nextDate, setNextDate] = useState<string | null>(null);
  const [calLinks, setCalLinks] = useState<{ google: string; ics: string } | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [dailyUrl, setDailyUrl] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const countdown = useCountdown(nextDate);

  useEffect(() => {
    getMemberSession().then(s => { if (s?.member) setMemberId(s.member.id); }).catch(() => {});
    fetch('/api/live').then(r => r.json()).then(d => {
      setUpcoming(d.upcoming);
      setPast(d.past || []);
      setNextDate(d.nextSessionDate);
      setCalLinks(d.calendarLinks);
      if (d.upcoming?.is_live) { setIsLive(true); setDailyUrl(d.upcoming.daily_room_url); }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function joinSession() {
    if (!upcoming?.id) return;
    const res = await fetch(`/api/live/${upcoming.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'join', memberId }),
    });
    const d = await res.json();
    if (d.dailyUrl) setDailyUrl(d.dailyUrl);
  }

  const boxStyle: React.CSSProperties = {
    background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.15)',
    padding: '12px 16px', textAlign: 'center', minWidth: '60px',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <section style={{ padding: '8rem 2rem 2rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>LIVE COUNCIL</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(28px, 5vw, 40px)', fontWeight: 400, fontStyle: 'italic', color: parchment, marginBottom: '0.5rem' }}>
            Every Wednesday. 8pm Eastern.
          </h1>
          <p style={{ fontSize: '18px', color: ivory85 }}>Six minds. One room. Your question.</p>
        </div>
      </section>

      {/* Countdown or Live */}
      <section style={{ padding: '1rem 2rem 3rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '400px', margin: '0 auto' }}>
          {isLive ? (
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#DC143C', animation: 'pulse 1.5s infinite' }} />
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.2em', color: '#DC143C' }}>LIVE NOW</span>
              </div>
              {!dailyUrl ? (
                <button onClick={joinSession} style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, border: 'none', height: '52px', padding: '0 36px', cursor: 'pointer', borderRadius: 0, display: 'block', margin: '0 auto' }}>JOIN SESSION</button>
              ) : null}
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '1rem' }}>
                {[
                  { val: countdown.days, label: 'DAYS' },
                  { val: countdown.hours, label: 'HOURS' },
                  { val: countdown.minutes, label: 'MIN' },
                  { val: countdown.seconds, label: 'SEC' },
                ].map(b => (
                  <div key={b.label} style={boxStyle}>
                    <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '28px', color: gold }}>{b.val}</div>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted, marginTop: '2px' }}>{b.label}</div>
                  </div>
                ))}
              </div>
              {nextDate && (
                <p style={{ fontSize: '14px', color: muted }}>
                  {new Date(nextDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} &middot; 8:00 PM ET
                </p>
              )}
            </div>
          )}

          {/* Calendar links */}
          {calLinks && !isLive && (
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '1.5rem' }}>
              <a href={calLinks.google} target="_blank" rel="noopener" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.12em', color: gold, border: `1px solid ${gold}44`, padding: '8px 16px', textDecoration: 'none' }}>GOOGLE CALENDAR</a>
              <a href={calLinks.ics} download="soe-live-council.ics" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.12em', color: gold, border: `1px solid ${gold}44`, padding: '8px 16px', textDecoration: 'none' }}>DOWNLOAD .ICS</a>
            </div>
          )}
        </div>
      </section>

      {/* Daily.co embed */}
      {dailyUrl && (
        <section style={{ padding: '0 2rem 3rem' }}>
          <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            <iframe src={dailyUrl} style={{ width: '100%', height: '500px', border: `1px solid rgba(201,168,76,0.15)` }}
              allow="camera; microphone; fullscreen; display-capture" />
          </div>
        </section>
      )}

      {/* Past sessions */}
      {past.length > 0 && (
        <section style={{ padding: '2rem' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '1.5rem', textAlign: 'center' }}>PAST SESSIONS</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1px', background: `${gold}10` }}>
              {past.map(s => {
                const summary = s.metadata?.summary;
                return (
                  <div key={s.id} style={{ background: '#0d0d0d', padding: '1.5rem', border: `1px solid rgba(201,168,76,0.1)` }}>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', color: gold, marginBottom: '0.5rem' }}>{summary?.title || s.title}</div>
                    <div style={{ fontSize: '12px', color: muted, marginBottom: '0.75rem' }}>{new Date(s.scheduled_for || s.started_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
                    {summary?.summary && <p style={{ fontSize: '14px', color: ivory85, lineHeight: 1.6, marginBottom: '0.75rem' }}>{summary.summary}</p>}
                    {summary?.question_of_the_week && <p style={{ fontSize: '14px', color: gold, fontStyle: 'italic' }}>&ldquo;{summary.question_of_the_week}&rdquo;</p>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <PublicFooter />
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
    </div>
  );
}
