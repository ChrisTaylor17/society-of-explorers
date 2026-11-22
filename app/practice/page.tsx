'use client';
import { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { subscribeAuthProviderChanges } from '@/lib/auth/providerSelection';
import {
  PRACTICE_MAX_CHARS,
  PRACTICE_SIGNIN_PATH,
  PRACTICE_SIGNUP_PATH,
  classifyTodayResponse,
  clampDraft,
  clearDraft,
  loadDraft,
  saveDraft,
  submitErrorMessage,
} from '@/lib/practice/draft';

function draftStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

const CINZEL = 'Cinzel, serif';
const CORMORANT = 'Cormorant Garamond, serif';
const PLAYFAIR = 'Cormorant Garamond, serif';

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
const THINKER_AVATARS: Record<string, string> = {
  socrates: 'SO',
  plato: 'PL',
  aurelius: 'MA',
  nietzsche: 'FN',
  einstein: 'AE',
  jobs: 'SJ',
};

type Phase = 'loading' | 'composing' | 'submitting' | 'complete';

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
  created_at: string | null;
}
interface Streak {
  current_streak: number;
  longest_streak: number;
  total_responses: number;
}
const MILESTONE_NOTES: Record<number, string> = {
  7: 'a week of noticing',
  30: 'a month of presence',
  100: 'something is changing',
  365: 'a year of practice',
};

function formatToday(): { day: string; monthDay: string } {
  const now = new Date();
  const day = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' });
  const monthDay = now.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
  return { day: day.toUpperCase(), monthDay: monthDay.toUpperCase() };
}

function formatTimeOfDay(iso: string): string {
  const d = new Date(iso);
  return d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
    .toUpperCase();
}

function counterColor(n: number): string {
  if (n >= 280) return '#fde68a';
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
  const [memberId, setMemberId] = useState<string | null>(null);

  const [draft, setDraft] = useState('');
  const [textareaFocused, setTextareaFocused] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const saving = useRef(false);

  const { day: dayName, monthDay } = useMemo(() => formatToday(), []);

  const retire = useCallback(() => {
    lifetime.current?.abort();
    setMemberId(null);
    setQuestion(null);
    setMyResponse(null);
    setMyReflection(null);
    setStreak(null);
    setDraft('');
    setSubmitError('');
    setLoadError(true);
    setPhase('composing');
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    const unsubscribe = subscribeAuthProviderChanges(retire);
    window.addEventListener('pagehide', retire);

    async function load() {
      try {
        const res = await fetch('/api/practice/my-today', {
          credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        });
        const data = await res.json().catch(() => null);
        if (controller.signal.aborted) return;
        const state = classifyTodayResponse(res.ok, data);
        if (state !== 'question') {
          setLoadError(state === 'error');
          setPhase('composing');
          return;
        }
        const owner = typeof data.memberId === 'string' ? data.memberId : null;
        setMemberId(owner);
        setQuestion(data.question);
        const saved = loadDraft(draftStorage(), data.question.id);
        if (owner) clearDraft(draftStorage());
        if (owner && data.streak) setStreak(data.streak);
        if (owner && data.myResponse) {
          setMyResponse(data.myResponse);
          setMyReflection(data.myReflection || null);
          setPhase('complete');
        } else {
          if (saved) setDraft(saved);
          setPhase('composing');
        }
      } catch {
        if (!controller.signal.aborted) {
          setLoadError(true);
          setPhase('composing');
        }
      }
    }

    void load();
    return () => {
      unsubscribe();
      window.removeEventListener('pagehide', retire);
      controller.abort();
    };
  }, [retire]);

  useEffect(() => {
    if (phase !== 'composing') return;
    if (typeof window === 'undefined') return;
    const desktop = window.matchMedia('(min-width: 768px)').matches;
    if (desktop && textareaRef.current) textareaRef.current.focus();
  }, [phase]);

  async function handleSubmit() {
    const controller = lifetime.current;
    if (!controller || controller.signal.aborted || saving.current || !question || !draft.trim()) return;
    if (!memberId) {
      saveDraft(draftStorage(), question.id, draft);
      window.location.assign(PRACTICE_SIGNUP_PATH);
      return;
    }
    const responseText = draft.trim();
    saving.current = true;
    setSubmitError('');
    setPhase('submitting');
    try {
      const res = await fetch('/api/practice/respond', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-SOE-Practice-Owner': memberId,
        },
        body: JSON.stringify({ questionId: question.id, responseText }),
      });
      const data = await res.json().catch(() => null);
      if (controller.signal.aborted) return;
      if (res.status === 401 || res.status === 409) {
        retire();
        return;
      }
      if (!res.ok || !data?.success || typeof data.responseId !== 'string' ||
        data.response?.id !== data.responseId || data.response.response_text !== responseText ||
        (data.response.created_at !== null && typeof data.response.created_at !== 'string')) {
        setSubmitError(submitErrorMessage(res.status));
        setPhase('composing');
        return;
      }

      clearDraft(draftStorage());
      setDraft('');
      setMyResponse({ id: data.responseId, response_text: responseText, created_at: data.response.created_at });
      setStreak({
        current_streak: data.streak ?? 0,
        longest_streak: data.longest ?? 0,
        total_responses: data.total ?? 0,
      });
      setPhase('complete');
    } catch {
      if (!controller.signal.aborted) {
        setSubmitError(submitErrorMessage(0));
        setPhase('composing');
      }
    } finally {
      saving.current = false;
    }
  }

  const thinkerName = question ? THINKER_NAMES[question.thinker_id] || question.thinker_id : '';
  const thinkerSymbol = question ? THINKER_SYMBOLS[question.thinker_id] || '·' : '·';
  const thinkerColor = question ? THINKER_COLORS[question.thinker_id] || '#c9a84c' : '#c9a84c';
  const thinkerAvatar = question ? THINKER_AVATARS[question.thinker_id] || '··' : '··';

  const charCount = draft.length;
  const canSubmit = draft.trim().length > 0 && phase === 'composing';
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
            <style>{`
              .practice-shell {
                max-width: 720px;
                margin: 0 auto;
                padding: 96px 24px 64px;
              }
              .practice-card {
                padding: 48px 40px;
              }
              .practice-textarea::placeholder {
                color: #78716c;
                font-style: italic;
                opacity: 1;
              }
              @media (max-width: 768px) {
                .practice-shell { padding: 64px 16px 48px; }
                .practice-card { padding: 32px 24px; }
              }
            `}</style>

            <div className="practice-shell">
              {/* QUESTION CARD */}
              <div
                className="practice-card animate-fade-up"
                style={{
                  border: '1px solid rgba(200, 168, 75, 0.15)',
                  backgroundColor: 'transparent',
                  borderRadius: 0,
                  marginBottom: '48px',
                  animationDelay: '0ms',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    marginBottom: '24px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div
                    style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '50%',
                      background: `${thinkerColor}18`,
                      border: `1.5px solid ${thinkerColor}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: CINZEL,
                      fontSize: '12px',
                      color: thinkerColor,
                      flexShrink: 0,
                    }}
                  >
                    {thinkerAvatar}
                  </div>
                  <span
                    style={{
                      fontFamily: CINZEL,
                      fontSize: '12px',
                      letterSpacing: '0.25em',
                      color: '#c9a84c',
                      textAlign: 'center',
                    }}
                  >
                    TODAY · {dayName} · {monthDay} · {thinkerName.toUpperCase()}
                  </span>
                </div>

                <p
                  style={{
                    fontFamily: PLAYFAIR,
                    fontStyle: 'italic',
                    fontSize: 'clamp(24px, 4vw, 32px)',
                    lineHeight: 1.4,
                    color: '#f5f0e8',
                    textAlign: 'center',
                    margin: 0,
                    fontWeight: 400,
                  }}
                >
                  &ldquo;{question.question_text}&rdquo;
                </p>

                <div
                  style={{
                    width: '40px',
                    height: '1px',
                    backgroundColor: '#c9a84c',
                    opacity: 0.4,
                    margin: '32px auto 24px',
                  }}
                />

                <p
                  style={{
                    fontFamily: CORMORANT,
                    fontStyle: 'italic',
                    fontSize: '14px',
                    color: '#888',
                    textAlign: 'center',
                    margin: 0,
                  }}
                >
                  Posed by {thinkerName}
                </p>
              </div>

              {/* STATE C: own response above reflection */}
              {phase === 'complete' && myResponse && (
                <section
                  className="animate-fade-up"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '40px',
                    animationDelay: '120ms',
                  }}
                >
                  <div
                    style={{
                      fontFamily: CINZEL,
                      fontSize: '12px',
                      letterSpacing: '0.3em',
                      color: '#c9a84c',
                      opacity: 0.7,
                    }}
                  >
                    YOUR RESPONSE{myResponse.created_at && ` · ${formatTimeOfDay(myResponse.created_at)}`}
                  </div>
                  <blockquote
                    style={{
                      borderLeft: '1px solid rgba(146, 64, 14, 0.35)',
                      paddingLeft: '16px',
                      fontFamily: CORMORANT,
                      fontSize: '16px',
                      color: 'rgba(255, 251, 235, 0.82)',
                      lineHeight: 1.6,
                      margin: 0,
                      width: '100%',
                    }}
                  >
                    {myResponse.response_text}
                  </blockquote>
                </section>
              )}

              {/* TEXTAREA SECTION */}
              {phase === 'composing' && (
                <div
                  style={{
                    width: '100%',
                    marginBottom: '24px',
                    transition: 'opacity 600ms ease',
                    opacity: 1,
                  }}
                >
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(e) => {
                      const next = clampDraft(e.target.value);
                      setDraft(next);
                      if (submitError) setSubmitError('');
                      if (loggedOut && question) saveDraft(draftStorage(), question.id, next);
                    }}
                    onFocus={() => setTextareaFocused(true)}
                    onBlur={() => setTextareaFocused(false)}
                    aria-label={`Your answer to today's question, up to ${PRACTICE_MAX_CHARS} characters`}
                    aria-describedby="practice-composer-hint"
                    maxLength={PRACTICE_MAX_CHARS}
                    placeholder="What do you notice?"
                    rows={3}
                    className="practice-textarea"
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(28, 25, 23, 0.5)',
                      border: textareaFocused
                        ? '1px solid rgba(253, 230, 138, 0.6)'
                        : '1px solid rgba(200, 168, 75, 0.15)',
                      boxShadow: textareaFocused
                        ? '0 0 0 3px rgba(253, 230, 138, 0.1)'
                        : 'none',
                      borderRadius: '2px',
                      fontFamily: CORMORANT,
                      fontSize: '20px',
                      lineHeight: 1.5,
                      color: '#fafaf9',
                      padding: '24px',
                      minHeight: '120px',
                      resize: 'vertical',
                      outline: 'none',
                      caretColor: '#fcd34d',
                      transition: 'border-color 150ms ease, box-shadow 150ms ease',
                    }}
                  />

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: '16px',
                      gap: '16px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '12px',
                        fontFamily: CORMORANT,
                        color: counterColor(charCount),
                        fontWeight: counterWeight(charCount),
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      <span>{charCount} / 280</span>
                      {charCount === 280 && (
                        <span style={{ marginLeft: '8px', color: '#fde68a', letterSpacing: '0.25em' }}>
                          FULL
                        </span>
                      )}
                    </div>

                    {loggedOut ? (
                      <Link
                        href={PRACTICE_SIGNUP_PATH}
                        onClick={() => {
                          if (question) saveDraft(draftStorage(), question.id, draft);
                        }}
                        style={{
                          fontFamily: CINZEL,
                          fontSize: '12px',
                          letterSpacing: '0.2em',
                          color: '#fde68a',
                          textDecoration: 'none',
                          border: '1px solid rgba(253, 230, 138, 0.4)',
                          padding: '12px 24px',
                          textTransform: 'uppercase',
                        }}
                      >
                        Save with a free account
                      </Link>
                    ) : (
                      <button
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        style={{
                          backgroundColor: 'transparent',
                          border: '1px solid rgba(253, 230, 138, 0.4)',
                          borderRadius: 0,
                          padding: '12px 32px',
                          fontFamily: CINZEL,
                          fontSize: '12px',
                          letterSpacing: '0.2em',
                          color: '#fde68a',
                          textTransform: 'uppercase',
                          cursor: canSubmit ? 'pointer' : 'not-allowed',
                          opacity: canSubmit ? 1 : 0.3,
                          transition: 'opacity 150ms ease',
                        }}
                      >
                        Save answer
                      </button>
                    )}
                  </div>
                  <div id="practice-composer-hint" aria-live="polite" style={{ marginTop: '12px', fontSize: '15px', fontStyle: 'italic', color: '#a8a29e' }}>
                    {submitError ? (
                      <span role="alert" style={{ color: '#f0a0a0', fontStyle: 'normal' }}>{submitError}</span>
                    ) : loggedOut ? (
                      <span>
                        Write freely. Your answer is kept on this device for a few hours while you create a free account.{' '}
                        <Link href={PRACTICE_SIGNIN_PATH} style={{ color: '#fde68a' }} onClick={() => {
                          if (question) saveDraft(draftStorage(), question.id, draft);
                        }}>
                          Already a member? Sign in
                        </Link>
                      </span>
                    ) : (
                      <span>Save your answer to your account. You can share a thought separately in a Circle.</span>
                    )}
                  </div>
                </div>
              )}

            </div>

            {/* Submitting indicator */}
            {phase === 'submitting' && (
              <section className="flex flex-col items-center py-6">
                <span
                  style={{
                    fontFamily: CINZEL,
                    fontSize: '12px',
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
            {phase === 'complete' && myReflection && (
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
                      fontSize: '12px',
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
            {phase === 'complete' && streak && (
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
                    fontSize: '12px',
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

            {phase === 'complete' && (
              <section style={{ display: 'grid', justifyItems: 'center', margin: '2rem 1rem 3rem', textAlign: 'center' }}>
                <p style={{ color: '#d0c5b4' }}>Take the question further with other readers.</p>
                <Link href="/circles" prefetch={false} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, color: '#fde68a', textUnderlineOffset: '.2em' }}>
                  Find a Circle
                </Link>
              </section>
            )}
          </>
        ) : (
          <div
            className="flex items-center justify-center"
            style={{ minHeight: '60vh', color: '#78716c', fontStyle: 'italic' }}
          >
            {loadError ? (
              <div role="alert" style={{ textAlign: 'center' }}>
                <p style={{ margin: 0 }}>We could not open today&rsquo;s question.</p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  style={{
                    marginTop: '16px', background: 'transparent', color: '#fde68a',
                    border: '1px solid rgba(253, 230, 138, 0.4)', padding: '10px 24px',
                    fontFamily: CINZEL, fontSize: '12px', letterSpacing: '0.2em', cursor: 'pointer',
                    fontStyle: 'normal',
                  }}
                >
                  TRY AGAIN
                </button>
              </div>
            ) : (
              <span>No question today. Return tomorrow.</span>
            )}
          </div>
        )}
      </main>

      <PublicFooter />
    </div>
  );
}
