'use client';
import { useEffect, useRef, useState } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { currentBrowserAuthIntent } from '@/lib/auth/browserIntent';
import { getSupabaseAccessToken } from '@/lib/auth/getSession';
import { subscribeAuthProviderChanges } from '@/lib/auth/providerSelection';
import { safePrivateMeetingUrl } from '@/lib/circles/discussion-reader';
import { liveSessionTime, readPublicLiveSchedule, type PublicLiveSession } from '@/lib/live/publicSchedule';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

function formatSessionDate(session: PublicLiveSession) {
  return liveSessionTime(session.started_at || session.scheduled_for || session.ended_at);
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
  const [upcoming, setUpcoming] = useState<PublicLiveSession | null>(null);
  const [past, setPast] = useState<PublicLiveSession[]>([]);
  const [nextDate, setNextDate] = useState<string | null>(null);
  const [calLinks, setCalLinks] = useState<{ google: string; ics: string } | null>(null);
  const [dailyUrl, setDailyUrl] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const activeJoin = useRef<AbortController | null>(null);
  const countdown = useCountdown(nextDate);

  useEffect(() => {
    const controller = new AbortController();
    let retired = false;
    const timeout = setTimeout(() => controller.abort(), 12_000);
    async function loadLive() {
      try {
        const res = await fetch('/api/live', {
          cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal,
        });
        if (!res.ok) throw new Error('Schedule unavailable');
        const data = readPublicLiveSchedule(await res.json());
        if (!data || controller.signal.aborted) throw new Error('Invalid schedule');
        if (retired) return;
        setUpcoming(data.upcoming);
        setPast(data.past);
        setNextDate(data.nextSessionDate);
        setCalLinks(data.calendarLinks);
      } catch { if (!retired) setLoadError(true); }
      finally { clearTimeout(timeout); if (!retired) setLoading(false); }
    }
    void loadLive();
    return () => { retired = true; clearTimeout(timeout); controller.abort(); };
  }, [loadAttempt]);

  function refreshSchedule() {
    activeJoin.current?.abort();
    activeJoin.current = null;
    setDailyUrl(null);
    setJoining(false);
    setJoinError(false);
    setUpcoming(null);
    setPast([]);
    setNextDate(null);
    setCalLinks(null);
    setLoadError(false);
    setLoading(true);
    setLoadAttempt(value => value + 1);
  }

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
    padding: '12px 4px', textAlign: 'center', minWidth: 0, flex: 1,
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <section style={{ padding: '8rem 2rem 2rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>LIVE COUNCIL</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(28px, 5vw, 40px)', fontWeight: 400, fontStyle: 'italic', color: parchment, marginBottom: '0.5rem' }}>
            A place to think together.
          </h1>
          <p style={{ fontSize: '18px', color: ivory85 }}>See scheduled online sessions and return here when your host opens the room.</p>
          <a href="/salons/pilot" style={{ color: gold, display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>Explore the four-week salon plan</a>
        </div>
      </section>

      {/* Countdown or Live */}
      <section aria-label="Session schedule" aria-busy={loading} style={{ padding: '1rem 2rem 3rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '400px', margin: '0 auto' }}>
          {loading ? (
            <div style={{ minHeight: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.3em', color: muted, opacity: 0.5 }}>LOADING</span>
            </div>
          ) : loadError ? (
            <p role="alert">We couldn’t load the session schedule. Try again.</p>
          ) : upcoming?.is_live ? (
            <div>
              <h2 style={{ fontSize: '24px', overflowWrap: 'anywhere' }}>{upcoming.title}</h2>
              <p style={{ color: muted }}>{formatSessionDate(upcoming)}</p>
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
              <h2 style={{ fontSize: '24px', overflowWrap: 'anywhere' }}>{upcoming?.title}</h2>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '1rem' }}>
                {[
                  { val: countdown.days, label: 'DAYS' },
                  { val: countdown.hours, label: 'HOURS' },
                  { val: countdown.minutes, label: 'MIN' },
                  { val: countdown.seconds, label: 'SEC' },
                ].map(b => (
                  <div key={b.label} style={boxStyle}>
                    <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(18px, 6vw, 28px)', color: gold }}>{b.val}</div>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted, marginTop: '2px' }}>{b.label}</div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: '14px', color: muted }}>
                {liveSessionTime(nextDate)}
              </p>
              {calLinks && (
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '1.5rem' }}>
                  <a href={calLinks.google} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.12em', color: gold, border: `1px solid ${gold}44`, padding: '12px 16px', minHeight: 44, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>GOOGLE CALENDAR</a>
                  <a href={calLinks.ics} download="soe-live-council.ics" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.12em', color: gold, border: `1px solid ${gold}44`, padding: '12px 16px', minHeight: 44, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>DOWNLOAD .ICS</a>
                </div>
              )}
              <p style={{ fontSize: '14px', color: muted }}>One session; end time is not confirmed. Check this page for changes after saving it to your calendar.</p>
              {Object.values(countdown).every(value => value === 0) && <p role="status">The scheduled start has arrived. Refresh to check whether the host has opened the room.</p>}
            </div>
          ) : (
            <p style={{ fontSize: '14px', color: muted, fontStyle: 'italic' }}>No session scheduled yet.</p>
          )}
          <button type="button" onClick={refreshSchedule} disabled={loading} style={{ minHeight: 44, marginTop: '1rem', padding: '10px 18px', background: 'transparent', color: gold, border: `1px solid ${gold}66`, cursor: loading ? 'default' : 'pointer' }}>
            {loading ? 'Loading schedule' : loadError ? 'Try again' : 'Refresh schedule'}
          </button>
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
