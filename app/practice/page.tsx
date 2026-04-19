'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { getMemberSession } from '@/lib/auth/getSession';
import { createClient } from '@/lib/supabase/client';

const CINZEL = 'Cinzel, serif';
const CORMORANT = 'Cormorant Garamond, serif';
const PLAYFAIR = 'Playfair Display, serif';

const THINKER_NAMES: Record<string, string> = {
  socrates: 'Socrates',
  plato: 'Plato',
  aurelius: 'Marcus Aurelius',
  nietzsche: 'Friedrich Nietzsche',
  einstein: 'Albert Einstein',
  jobs: 'Steve Jobs',
};
const THINKER_SYMBOLS: Record<string, string> = {
  socrates: 'Σ',
  plato: 'Π',
  aurelius: 'M',
  nietzsche: 'N',
  einstein: 'E',
  jobs: 'J',
};
const THINKER_COLORS: Record<string, string> = {
  socrates: '#C9A94E',
  plato: '#7B68EE',
  aurelius: '#8B7355',
  nietzsche: '#DC143C',
  einstein: '#4169E1',
  jobs: '#A0A0A0',
};

type Phase = 'loading' | 'composing' | 'submitting' | 'revealing' | 'complete';

interface Question {
  id: string;
  thinker_id: string;
  question_text: string;
  question_context: string | null;
  date: string;
}
interface MyResponse {
  id: string;
  response_text: string;
  created_at: string;
}
interface Streak {
  current_streak: number;
  longest_streak: number;
  total_responses: number;
}
interface Other {
  id: string;
  display_name: string;
  response_text: string;
  created_at: string;
}

const MILESTONE_NOTES: Record<number, string> = {
  7: 'a week of noticing',
  30: 'a month of presence',
  100: 'something is changing',
  365: 'a year of practice',
};

function formatToday(): { label: string } {
  const now = new Date();
  const day = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' });
  const monthDay = now.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
  return { label: `TODAY · ${day.toUpperCase()} · ${monthDay.toUpperCase()}` };
}

function formatTimeOfDay(iso: string): string {
  const d = new Date(iso);
  return d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
    .toUpperCase();
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 minute ago';
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs === 1) return '1 hour ago';
  if (hrs < 24) return `${hrs} hours ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

function counterColor(n: number): string {
  if (n >= 280) return '#f5e5b6';
  if (n >= 261) return '#fcd34d';
  if (n >= 201) return '#fbbf24';
  return '#78716c';
}

function counterWeight(n: number): number {
  return n >= 280 ? 700 : 400;
}

export default function PracticePage() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [question, setQuestion] = useState<Question | null>(null);
  const [myResponse, setMyResponse] = useState<MyResponse | null>(null);
  const [myReflection, setMyReflection] = useState<string | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [others, setOthers] = useState<Other[]>([]);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [draft, setDraft] = useState('');
  const [textareaHidden, setTextareaHidden] = useState(false);
  const [reflectionMounted, setReflectionMounted] = useState(false);
  const [streakMounted, setStreakMounted] = useState(false);
  const [commonsMounted, setCommonsMounted] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const { label: dayLabel } = useMemo(formatToday, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      let token: string | null = null;
      let mid: string | null = null;
      try {
        const session = await getMemberSession();
        if (session?.member) mid = session.member.id;
        const supabase = createClient();
        const { data: { session: auth } } = await supabase.auth.getSession();
        if (auth?.access_token) token = auth.access_token;
      } catch {}

      if (cancelled) return;
      setMemberId(mid);
      setAuthToken(token);

      try {
        const res = await fetch('/api/practice/my-today', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = await res.json();
        if (cancelled) return;
        if (!data.question) {
          setPhase('composing');
          return;
        }
        setQuestion(data.question);
        setOthers(Array.isArray(data.others) ? data.others : []);
        if (data.streak) setStreak(data.streak);
        if (data.myResponse) {
          setMyResponse(data.myResponse);
          setMyReflection(data.myReflection || null);
          setTextareaHidden(true);
          setReflectionMounted(true);
          setStreakMounted(true);
          setCommonsMounted(true);
          setPhase('complete');
        } else {
          setPhase('composing');
        }
      } catch {
        if (!cancelled) setPhase('composing');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (phase !== 'composing') return;
    if (typeof window === 'undefined') return;
    const desktop = window.matchMedia('(min-width: 768px)').matches;
    if (desktop && textareaRef.current) textareaRef.current.focus();
  }, [phase]);

  async function handleSubmit() {
    if (!question || !draft.trim()) return;
    if (!memberId) {
      window.location.href = '/join';
      return;
    }
    setPhase('submitting');
    try {
      const res = await fetch('/api/practice/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          questionId: question.id,
          responseText: draft.trim(),
          memberId,
        }),
      });
      const data = await res.json();
      if (!data?.success || !data?.responseId) {
        setPhase('composing');
        return;
      }

      const responseId: string = data.responseId;
      const nowIso = new Date().toISOString();
      setMyResponse({ id: responseId, response_text: draft.trim(), created_at: nowIso });
      setStreak({
        current_streak: data.streak ?? 0,
        longest_streak: data.longest ?? 0,
        total_responses: data.total ?? 0,
      });

      setTextareaHidden(true);
      setPhase('revealing');

      // Start fetching the reflection immediately (parallel with the fade).
      const reflectionPromise = fetchReflection(responseId);
      const othersPromise = fetch(
        `/api/practice/others?questionId=${encodeURIComponent(question.id)}`,
        { headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined },
      )
        .then((r) => r.json())
        .then((d) => (Array.isArray(d?.others) ? (d.others as Other[]) : []))
        .catch(() => [] as Other[]);

      const [text, freshOthers] = await Promise.all([reflectionPromise, othersPromise]);
      setMyReflection(text);
      setOthers(freshOthers);

      await new Promise((r) => setTimeout(r, 800));
      setReflectionMounted(true);
      await new Promise((r) => setTimeout(r, 700));
      setStreakMounted(true);
      await new Promise((r) => setTimeout(r, 500));
      setCommonsMounted(true);
      setPhase('complete');
    } catch {
      setPhase('composing');
    }
  }

  async function fetchReflection(responseId: string): Promise<string> {
    try {
      const res = await fetch('/api/practice/reflect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responseId }),
      });
      if (!res.ok || !res.body) return '';
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (typeof evt.delta === 'string') accumulated += evt.delta;
          } catch {}
        }
      }
      return accumulated.trim();
    } catch {
      return '';
    }
  }

  const thinkerName = question ? THINKER_NAMES[question.thinker_id] || question.thinker_id : '';
  const thinkerSymbol = question ? THINKER_SYMBOLS[question.thinker_id] || '·' : '·';
  const thinkerColor = question ? THINKER_COLORS[question.thinker_id] || '#c9a84c' : '#c9a84c';

  const charCount = draft.length;
  const canSubmit = draft.trim().length > 0 && phase === 'composing';
  const showReflection =
    phase === 'complete' || (phase === 'revealing' && reflectionMounted);
  const showStreak = phase === 'complete' || (phase === 'revealing' && streakMounted);
  const showCommons = phase === 'complete' || (phase === 'revealing' && commonsMounted);
  const loggedOut = !memberId;

  const streakNumber = streak?.current_streak ?? 0;
  const streakLabel = streakNumber === 1 ? 'day one' : `${streakNumber} days`;
  const milestoneNote = MILESTONE_NOTES[streakNumber];

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        color: '#e8dcc8',
        fontFamily: CORMORANT,
      }}
    >
      <PublicNav />

      <main className="px-6 md:px-24 pt-24 md:pt-28 pb-20">
        {phase === 'loading' ? (
          <div
            className="flex items-center justify-center"
            style={{ minHeight: '60vh', color: '#78716c', fontStyle: 'italic' }}
          >
            <span>opening today&rsquo;s question&hellip;</span>
          </div>
        ) : question ? (
          <>
            {/* BEAT 1 — ARRIVAL */}
            <section className="flex flex-col items-center text-center gap-4 pb-12">
              <div
                className="animate-fade-up"
                style={{
                  animationDelay: '0ms',
                  fontFamily: CINZEL,
                  fontSize: '10px',
                  letterSpacing: '0.4em',
                  color: '#c9a84c',
                  opacity: 0.65,
                }}
              >
                {dayLabel}
              </div>
              <div
                className="animate-fade-up"
                style={{
                  animationDelay: '120ms',
                  fontFamily: CORMORANT,
                  fontStyle: 'italic',
                  fontSize: '14px',
                  color: '#9a8f7a',
                }}
              >
                Posed by {thinkerName}
              </div>
              <h1
                className="animate-fade-up"
                style={{
                  animationDelay: '240ms',
                  fontFamily: PLAYFAIR,
                  fontStyle: 'italic',
                  fontSize: 'clamp(26px, 4.8vw, 32px)',
                  color: '#f5e5b6',
                  lineHeight: 1.35,
                  maxWidth: '40ch',
                  margin: 0,
                  fontWeight: 400,
                }}
              >
                {question.question_text}
              </h1>
            </section>

            {/* STATE C: own response above reflection */}
            {phase === 'complete' && myResponse && (
              <section className="flex flex-col items-center gap-3 pb-10">
                <div
                  className="animate-fade-up"
                  style={{
                    animationDelay: '360ms',
                    fontFamily: CINZEL,
                    fontSize: '10px',
                    letterSpacing: '0.3em',
                    color: '#c9a84c',
                    opacity: 0.7,
                  }}
                >
                  YOUR RESPONSE · {formatTimeOfDay(myResponse.created_at)}
                </div>
                <div
                  className="animate-fade-up w-full"
                  style={{ animationDelay: '440ms', maxWidth: '560px' }}
                >
                  <blockquote
                    className="border-l pl-4"
                    style={{
                      borderColor: 'rgba(146, 64, 14, 0.35)',
                      fontFamily: CORMORANT,
                      fontSize: '16px',
                      color: 'rgba(255, 251, 235, 0.82)',
                      lineHeight: 1.6,
                      margin: 0,
                    }}
                  >
                    {myResponse.response_text}
                  </blockquote>
                </div>
              </section>
            )}

            {/* BEAT 2 — RESPONSE (State A) */}
            {!textareaHidden && phase === 'composing' && (
              <section
                className="flex flex-col items-center"
                style={{
                  transition: 'opacity 600ms ease',
                  opacity: phase === 'composing' ? 1 : 0,
                }}
              >
                <div className="w-full" style={{ maxWidth: '560px' }}>
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value.slice(0, 280))}
                    onClick={() => {
                      if (loggedOut) window.location.href = '/join';
                    }}
                    readOnly={loggedOut}
                    placeholder="What do you notice?"
                    rows={3}
                    className="w-full bg-stone-900/60 border border-amber-900/40 focus:border-amber-200/70 focus:ring-1 focus:ring-amber-200/20 rounded-sm outline-none p-6 resize-none transition-colors"
                    style={{
                      fontFamily: CORMORANT,
                      fontSize: '16px',
                      color: '#fefce8',
                      minHeight: '120px',
                      fontStyle: draft ? 'normal' : 'italic',
                      caretColor: '#fcd34d',
                    }}
                  />
                  <div
                    className="flex items-center justify-end gap-2 mt-2 tabular-nums"
                    style={{
                      fontFamily: CINZEL,
                      fontSize: '11px',
                      letterSpacing: '0.15em',
                      color: counterColor(charCount),
                      fontWeight: counterWeight(charCount),
                    }}
                  >
                    <span>
                      {charCount} / 280
                    </span>
                    {charCount === 280 && (
                      <span style={{ color: '#f5e5b6', letterSpacing: '0.25em' }}>FULL</span>
                    )}
                  </div>

                  {loggedOut ? (
                    <p
                      className="mt-8 text-center"
                      style={{
                        fontFamily: CORMORANT,
                        fontSize: '15px',
                        fontStyle: 'italic',
                        color: '#9a8f7a',
                      }}
                    >
                      <Link href="/join" style={{ color: '#fcd34d', textDecoration: 'none' }}>
                        Sign in
                      </Link>{' '}
                      to commit your answer and see how others responded today.
                    </p>
                  ) : (
                    <div className="mt-8 flex justify-center">
                      <button
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        className="w-full md:w-auto border border-amber-200/40 hover:bg-amber-950/30 disabled:opacity-30 disabled:cursor-not-allowed rounded-none px-8 py-3 transition-colors"
                        style={{
                          fontFamily: CINZEL,
                          fontSize: '11px',
                          letterSpacing: '0.2em',
                          color: '#fcd34d',
                          background: 'transparent',
                          cursor: canSubmit ? 'pointer' : 'not-allowed',
                        }}
                      >
                        COMMIT YOUR ANSWER
                      </button>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Revealing — contemplation dot while the reflection buffers */}
            {phase === 'revealing' && !reflectionMounted && (
              <section className="flex flex-col items-center py-12">
                <span
                  className="inline-block rounded-full animate-pulse"
                  style={{
                    width: '8px',
                    height: '8px',
                    background: '#fcd34d',
                    boxShadow: '0 0 16px rgba(252, 211, 77, 0.55)',
                  }}
                />
              </section>
            )}

            {/* Submitting indicator */}
            {phase === 'submitting' && (
              <section className="flex flex-col items-center py-6">
                <span
                  style={{
                    fontFamily: CINZEL,
                    fontSize: '11px',
                    letterSpacing: '0.25em',
                    color: '#c9a84c',
                    opacity: 0.8,
                  }}
                >
                  COMMITTING&hellip;
                </span>
              </section>
            )}

            {/* BEAT 3 — REFLECTION */}
            {showReflection && myReflection && (
              <section
                className="flex flex-col items-center gap-4 py-8"
                style={{
                  animation: 'fadeUp 600ms ease-out both',
                }}
              >
                <div className="flex flex-col items-center gap-2">
                  <div
                    className="flex items-center justify-center rounded-full"
                    style={{
                      width: '40px',
                      height: '40px',
                      border: `1px solid ${thinkerColor}`,
                      background: `${thinkerColor}18`,
                      fontFamily: CINZEL,
                      fontSize: '14px',
                      color: thinkerColor,
                    }}
                  >
                    {thinkerSymbol}
                  </div>
                  <div
                    style={{
                      fontFamily: CINZEL,
                      fontSize: '10px',
                      letterSpacing: '0.3em',
                      color: `${thinkerColor}`,
                      opacity: 0.85,
                    }}
                  >
                    {thinkerName.toUpperCase()}
                  </div>
                </div>
                <p
                  className="text-center"
                  style={{
                    fontFamily: CORMORANT,
                    fontStyle: 'italic',
                    fontSize: 'clamp(16px, 2.5vw, 18px)',
                    lineHeight: 1.7,
                    color: 'rgba(232, 220, 200, 0.92)',
                    maxWidth: '48ch',
                    margin: 0,
                  }}
                >
                  {myReflection}
                </p>
              </section>
            )}

            {/* BEAT 4 — STREAK */}
            {showStreak && streak && (
              <section
                className="flex flex-col items-center py-10"
                style={{ animation: 'fadeUp 600ms ease-out both' }}
              >
                <div
                  style={{
                    width: '80px',
                    height: '1px',
                    background: 'rgba(146, 64, 14, 0.3)',
                    marginBottom: '2rem',
                  }}
                />
                <div
                  style={{
                    fontFamily: CINZEL,
                    fontSize: '10px',
                    letterSpacing: '0.3em',
                    color: '#c9a84c',
                    opacity: 0.7,
                    marginBottom: '0.5rem',
                  }}
                >
                  YOUR PRACTICE
                </div>
                <div
                  className={milestoneNote ? 'animate-gold-pulse' : ''}
                  style={{
                    fontFamily: PLAYFAIR,
                    fontSize: 'clamp(40px, 8vw, 56px)',
                    color: '#fde68a',
                    lineHeight: 1,
                    fontWeight: 400,
                  }}
                >
                  {streakNumber}
                </div>
                <div
                  style={{
                    fontFamily: CORMORANT,
                    fontSize: '14px',
                    color: '#9a8f7a',
                    marginTop: '0.5rem',
                    fontStyle: 'italic',
                  }}
                >
                  {streakLabel}
                </div>
                {milestoneNote && (
                  <div
                    style={{
                      fontFamily: CORMORANT,
                      fontStyle: 'italic',
                      fontSize: '15px',
                      color: '#fcd34d',
                      marginTop: '0.75rem',
                      opacity: 0.85,
                    }}
                  >
                    {milestoneNote}
                  </div>
                )}
              </section>
            )}

            {/* BEAT 5 — COMMONS */}
            {showCommons && others.length > 0 && (
              <section
                className="flex flex-col items-center py-10"
                style={{ animation: 'fadeUp 600ms ease-out both' }}
              >
                <div
                  style={{
                    fontFamily: CINZEL,
                    fontSize: '10px',
                    letterSpacing: '0.3em',
                    color: '#c9a84c',
                    opacity: 0.7,
                    marginBottom: '1.5rem',
                  }}
                >
                  OTHER EXPLORERS TODAY
                </div>
                <div className="flex flex-col gap-6 w-full" style={{ maxWidth: '560px' }}>
                  {others.map((o) => (
                    <article key={o.id} className="flex flex-col gap-2">
                      <div
                        style={{
                          fontFamily: CORMORANT,
                          fontSize: '13px',
                          fontStyle: 'italic',
                          color: '#9a8f7a',
                        }}
                      >
                        {o.display_name}
                      </div>
                      <blockquote
                        className="border-l pl-4"
                        style={{
                          borderColor: 'rgba(146, 64, 14, 0.35)',
                          fontFamily: CORMORANT,
                          fontSize: '16px',
                          color: 'rgba(255, 251, 235, 0.82)',
                          lineHeight: 1.6,
                          margin: 0,
                        }}
                      >
                        {o.response_text}
                      </blockquote>
                      <div
                        style={{
                          fontFamily: CORMORANT,
                          fontSize: '11px',
                          color: '#57534e',
                        }}
                      >
                        {timeAgo(o.created_at)}
                      </div>
                    </article>
                  ))}
                </div>
                <Link
                  href="/practice/today"
                  className="mt-8"
                  style={{
                    fontFamily: CINZEL,
                    fontSize: '10px',
                    letterSpacing: '0.3em',
                    color: '#c9a84c',
                    textDecoration: 'none',
                    opacity: 0.75,
                  }}
                >
                  SEE ALL RESPONSES →
                </Link>
              </section>
            )}
          </>
        ) : (
          <div
            className="flex items-center justify-center"
            style={{ minHeight: '60vh', color: '#78716c', fontStyle: 'italic' }}
          >
            <span>No question today. Return tomorrow.</span>
          </div>
        )}
      </main>

      <PublicFooter />
    </div>
  );
}
