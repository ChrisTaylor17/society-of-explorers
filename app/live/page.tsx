'use client';
import { useEffect, useRef, useState } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { currentBrowserAuthIntent } from '@/lib/auth/browserIntent';
import { getSupabaseAccessToken } from '@/lib/auth/getSession';
import { subscribeAuthProviderChanges } from '@/lib/auth/providerSelection';
import { safePrivateMeetingUrl } from '@/lib/circles/discussion-reader';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

type LiveSession = {
  id: string;
  title: string;
  scheduled_for?: string | null;
  started_at?: string | null;
  is_live?: boolean | null;
};

type LivePayload = {
  upcoming?: LiveSession | null;
  past?: LiveSession[];
  nextSessionDate?: string | null;
  calendarLinks?: { google: string; ics: string } | null;
};

function formatSessionDate(session: LiveSession) {
  const dateValue = session.scheduled_for || session.started_at;
  if (!dateValue) return 'Date pending';
  return new Date(dateValue).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

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
  const [upcoming, setUpcoming] = useState<LiveSession | null>(null);
  const [past, setPast] = useState<LiveSession[]>([]);
  const [nextDate, setNextDate] = useState<string | null>(null);
  const [calLinks, setCalLinks] = useState<{ google: string; ics: string } | null>(null);
  const [dailyUrl, setDailyUrl] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState(false);
  const [loading, setLoading] = useState(true);
  const activeJoin = useRef<AbortController | null>(null);
  const countdown = useCountdown(nextDate);

  useEffect(() => {
    const controller = new AbortController();
    async function loadLive() {
      try {
        const res = await fetch('/api/live', {
          cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as LivePayload;
        if (controller.signal.aborted) return;
        setUpcoming(data.upcoming ?? null);
        setPast(data.past ?? []);
        setNextDate(data.nextSessionDate ?? null);
        setCalLinks(data.calendarLinks ?? null);
      } catch {}
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void loadLive();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const retire = () => {
      activeJoin.current?.abort();
      activeJoin.current = null;
      setDailyUrl(null);
      setJoining(false);
      setJoinError(false);
    };
    const restore = (event: PageTransitionEvent) => { if (event.persisted) retire(); };
    const unsubscribe = subscribeAuthProviderChanges(retire);
    window.addEventListener('pagehide', retire);
    window.addEventListener('pageshow', restore);
    window.addEventListener('offline', retire);
    return () => {
      unsubscribe();
      window.removeEventListener('pagehide', retire);
      window.removeEventListener('pageshow', restore);
      window.removeEventListener('offline', retire);
      activeJoin.current?.abort();
      activeJoin.current = null;
    };
  }, []);

  async function joinSession() {
    if (!upcoming?.is_live || activeJoin.current) return;
    const controller = new AbortController();
    const intent = currentBrowserAuthIntent();
    const isCurrent = () => activeJoin.current === controller && currentBrowserAuthIntent() === intent;
    activeJoin.current = controller;
    setJoinError(false);
    setJoining(true);
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const accessToken = await getSupabaseAccessToken();
      if (!isCurrent()) return;
      const res = await fetch(`/api/live/${upcoming.id}`, {
        method: 'POST', cache: 'no-store', credentials: 'same-origin', redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ action: 'join' }),
        signal: controller.signal,
      });
      if (!isCurrent()) return;
      if (res.status === 401) {
        window.location.assign('/login?next=%2Flive');
        return;
      }
      if (!res.ok) throw new Error('Room unavailable');
      const data = await res.json() as { success?: boolean; dailyUrl?: string };
      const url = data.success === true ? safePrivateMeetingUrl(data.dailyUrl) : null;
      if (!url || !navigator.onLine || controller.signal.aborted) throw new Error('Room unavailable');
      if (isCurrent()) setDailyUrl(url);
    } catch {
      if (isCurrent()) setJoinError(true);
    } finally {
      clearTimeout(timeout);
      if (activeJoin.current === controller) {
        activeJoin.current = null;
        setJoining(false);
      }
    }
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
          {loading ? (
            <div style={{ minHeight: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.3em', color: muted, opacity: 0.5 }}>LOADING</span>
            </div>
          ) : upcoming?.is_live ? (
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#DC143C', animation: 'pulse 1.5s infinite' }} />
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.2em', color: '#DC143C' }}>LIVE NOW</span>
              </div>
              {!dailyUrl ? (
                <button onClick={joinSession} disabled={joining} style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, border: 'none', height: '52px', padding: '0 36px', cursor: 'pointer', borderRadius: 0, display: 'block', margin: '0 auto' }}>{joining ? 'CHECKING ACCESS' : 'JOIN SESSION'}</button>
              ) : null}
              {joinError && <p role="status">Couldn’t open the live room. Try again.</p>}
            </div>
          ) : nextDate ? (
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
              <p style={{ fontSize: '14px', color: muted }}>
                {new Date(nextDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} &middot; 8:00 PM ET
              </p>
              {calLinks && (
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '1.5rem' }}>
                  <a href={calLinks.google} target="_blank" rel="noopener" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.12em', color: gold, border: `1px solid ${gold}44`, padding: '8px 16px', textDecoration: 'none' }}>GOOGLE CALENDAR</a>
                  <a href={calLinks.ics} download="soe-live-council.ics" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.12em', color: gold, border: `1px solid ${gold}44`, padding: '8px 16px', textDecoration: 'none' }}>DOWNLOAD .ICS</a>
                </div>
              )}
            </div>
          ) : (
            <p style={{ fontSize: '14px', color: muted, fontStyle: 'italic' }}>No session scheduled yet.</p>
          )}
        </div>
      </section>

      {/* Daily.co embed */}
      {dailyUrl && (
        <section style={{ padding: '0 2rem 3rem' }}>
          <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            <iframe title="Society of Explorers Live Council" src={dailyUrl} referrerPolicy="no-referrer" style={{ width: '100%', height: '500px', border: `1px solid rgba(201,168,76,0.15)` }}
              allow="camera; microphone; fullscreen; display-capture" />
          </div>
        </section>
      )}

      {/* Past sessions */}
      {past.length > 0 && (
        <section style={{ padding: '2rem' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '1.5rem', textAlign: 'center' }}>PAST SESSIONS</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '1px', background: `${gold}10` }}>
              {past.map(s => (
                  <div key={s.id} style={{ background: '#0d0d0d', padding: '1.5rem', border: `1px solid rgba(201,168,76,0.1)` }}>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', color: gold, marginBottom: '0.5rem' }}>{s.title}</div>
                    <div style={{ fontSize: '12px', color: muted, marginBottom: '0.75rem' }}>{formatSessionDate(s)}</div>
                  </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <PublicFooter />
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
    </div>
  );
}
