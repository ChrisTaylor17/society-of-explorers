'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { fetchPulse, type PulseQuestion } from '@/lib/feed/pulseClient';
import styles from './feed.module.css';

export default function FeedPage() {
  const [question, setQuestion] = useState<PulseQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await fetchPulse();
      if (cancelled) return;
      setQuestion(result.ok ? result.data.todayQuestion : null);
      setLoadError(!result.ok);
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [attempt]);

  return (
    <div className={styles.page}>
      <PublicNav />
      <main className={styles.main}>
        <header>
          <h1>Community feed</h1>
          <p className={styles.lead}>
            Start with a question, a passage, or a short video. Bring the conversation to a Circle.
          </p>
        </header>

        <section aria-labelledby="feed-question" className={styles.question}>
          <h2 id="feed-question">Daily Practice</h2>
          {loading ? (
            <p role="status">Loading the latest question…</p>
          ) : loadError ? (
            <div>
              <p role="alert">We could not load the community feed right now.</p>
              <button
                type="button"
                onClick={() => { setLoading(true); setAttempt((value) => value + 1); }}
              >
                TRY AGAIN
              </button>
            </div>
          ) : question ? (
            <div>
              <time dateTime={question.date}>{question.date}</time>
              <p className={styles.prompt}>{question.question_text}</p>
            </div>
          ) : (
            <p>The latest question will appear here after it opens in Daily Practice.</p>
          )}
          <Link href="/practice" prefetch={false}>
            Open Daily Practice
          </Link>
        </section>

        <nav aria-label="Continue exploring" className={styles.links}>
          <Link href="/clips" prefetch={false}>Watch Reels and read passages</Link>
          <Link href="/circles" prefetch={false}>Find a Circle</Link>
        </nav>
      </main>
      <PublicFooter />
    </div>
  );
}
