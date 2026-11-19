'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { CIRCLE_REVIEW_REASON_LABELS, parseCircleHostReviews, type CircleHostReviews } from '@/lib/circles/moderation';
import { useReviewAccess } from '@/lib/circles/useReviewAccess';
import { body, button, card, gold, h2, parchment, small } from '@/lib/circles/ui';

type State = { status: 'idle' | 'loading' | 'retired' | 'unauthorized' | 'forbidden' | 'unavailable' }
  | { status: 'ready'; data: CircleHostReviews };

export default function HostReviews() {
  const [state, setState] = useState<State>({ status: 'idle' });
  const clear = useCallback(() => setState({ status: 'retired' }), []);
  const { active, busy, perform } = useReviewAccess(clear);

  function load(after: string | null = null) {
    if (!active || busy) return;
    setState({ status: 'loading' });
    void perform(`/api/circles/review${after ? `?after=${encodeURIComponent(after)}` : ''}`, { method: 'GET' }, ({ status, body: reply }) => {
      if (status === 401) return setState({ status: 'unauthorized' });
      if (status === 403) return setState({ status: 'forbidden' });
      const data = status >= 200 && status < 300 ? parseCircleHostReviews(reply) : null;
      if (!data || (after !== null && data.nextCursor === after)) return setState({ status: 'unavailable' });
      setState({ status: 'ready', data });
    }, () => setState({ status: 'unavailable' }));
  }

  const message = state.status === 'idle' ? 'Load review outcomes for the circles you host.'
    : state.status === 'loading' ? 'Loading your review outcomes…'
    : state.status === 'retired' ? 'Your private view was cleared. Load your review outcomes again to continue.'
    : state.status === 'unauthorized' ? 'Sign in to view outcomes for the circles you host.'
    : state.status === 'forbidden' ? 'These review outcomes are not available for this account.'
    : state.status === 'unavailable' ? 'Review outcomes could not be loaded. Please try again.'
    : state.status === 'ready' && state.data.items.length === 0 ? 'No hosted circles are available in this view.'
    : 'Your hosted circle review outcomes are loaded.';

  return (
    <section aria-label="Your circle review outcomes" aria-busy={busy}>
      <p style={body}>Reviewer decisions include an explanation for the host. Private reports and reporter details are not shown here.</p>
      <p role="status" aria-live="polite" style={{ ...small, marginBottom: '1rem' }}>{message}</p>
      {state.status === 'unauthorized' && <p style={body}><Link href="/login?next=/circles/review" style={{ color: gold }}>Sign in</Link> to continue.</p>}
      {!active && <p style={{ ...small, marginBottom: '1rem' }}>Return to this tab before loading private outcomes.</p>}
      <button type="button" onClick={() => load()} disabled={!active || busy} style={button}>
        {state.status === 'ready' ? 'Refresh my review outcomes' : 'Load my review outcomes'}
      </button>

      {state.status === 'ready' && (
        <>
          <ul style={{ listStyle: 'none', padding: 0, margin: '1.5rem 0', display: 'grid', gap: '1rem' }}>
            {state.data.items.map(({ circle, decisions }) => (
              <li key={circle.id} style={{ ...card, overflowWrap: 'anywhere' }}>
                <h2 style={{ ...h2, marginTop: 0, color: parchment }}><Link href={`/circles/${circle.id}`} style={{ color: parchment }}>{circle.title}</Link></h2>
                <p style={{ ...small, marginBottom: '1rem' }}>{circle.hidden ? 'Hidden from public listings' : 'Not hidden by moderation'}</p>
                {decisions.length === 0 ? <p style={body}>No recorded reviewer decisions for this circle.</p> : (
                  <ol style={{ margin: 0, paddingLeft: '1.25rem' }}>
                    {decisions.map(decision => (
                      <li key={decision.id} style={{ marginBottom: '1.25rem' }}>
                        <p style={{ ...body, marginBottom: '0.25rem' }}><strong>{decision.action === 'hide' ? 'Circle hidden' : 'Visibility hold removed'}</strong> · {CIRCLE_REVIEW_REASON_LABELS[decision.reason]}</p>
                        <p style={{ ...body, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginBottom: '0.25rem' }}>{decision.summary}</p>
                        <p style={small}><time dateTime={decision.created_at}>{new Date(decision.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time></p>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ul>
          {state.data.nextCursor && <button type="button" disabled={!active || busy} style={button} onClick={() => load(state.data.nextCursor)}>Next page of hosted circles</button>}
          {state.data.items.length > 0 && <p style={{ ...small, marginTop: '1rem' }}>This page shows the available recorded decisions for these hosted circles. Refresh starts again from the first page.</p>}
        </>
      )}
    </section>
  );
}
