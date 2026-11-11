'use client';

import { useEffect, useRef, useState } from 'react';
import { createDirectoryReader, type DirectoryState, type DirectoryFailure } from './directory-read';

const failures: Record<DirectoryFailure, string> = {
  http: 'The directory service could not return a successful response. You can try again.',
  network: 'The directory connection failed. Check your connection and try again.',
  malformed: 'The directory response could not be read reliably. No listings are shown. You can try again.',
  timeout: 'The directory took too long to respond. Loading has stopped; you can try again.',
};

export default function CommunityDirectory() {
  const [state, setState] = useState<DirectoryState>({ kind: 'idle' });
  const request = useRef<ReturnType<typeof createDirectoryReader> | null>(null);
  useEffect(() => {
    const reader = createDirectoryReader({ emit: setState });
    request.current = reader;
    reader.load();
    return () => { request.current = null; reader.dispose(); };
  }, []);

  const message = state.kind === 'idle' ? 'The directory loads when JavaScript is available. You can explore the reading and community ideas below at any time.'
    : state.kind === 'loading' ? 'Loading community records…'
    : state.kind === 'empty' ? 'No community records were returned. You can try again, or explore the materials below.'
    : state.kind === 'error' ? failures[state.reason]
    : `${state.communities.length} community ${state.communities.length === 1 ? 'record' : 'records'} returned. Descriptions are supplied with each record.`;

  return (
    <div className="directory">
      <div className="directory-status">
        <p id="directory-status" role="status" aria-live="polite" aria-atomic="true">{message}</p>
        {state.kind !== 'idle' && <button type="button" aria-disabled={state.kind === 'loading'} aria-describedby="directory-status" onClick={() => { if (state.kind !== 'loading') request.current?.load(); }}>
          {state.kind === 'loading' ? 'Loading directory…' : state.kind === 'ready' ? 'Refresh directory' : 'Try again'}
        </button>}
        <noscript><p>JavaScript is off. The reading links and Society of Explorers introduction remain available.</p></noscript>
      </div>
      <div role="region" aria-busy={state.kind === 'loading'} aria-label="Directory results">
        {state.kind === 'ready' && <ul className="grid directory-cards">{state.communities.map(community => (
          <li key={community.id} className="card">
            <p className="eyebrow">Community record</p>
            <h3>{community.name}</h3>
            <p className="record-description">{community.description?.trim() || 'No description was supplied with this record.'}</p>
            <a href={`/c/${encodeURIComponent(community.slug)}`} aria-label={`View community record: ${community.name}`}>View community record <span aria-hidden="true">→</span></a>
          </li>
        ))}</ul>}
      </div>
    </div>
  );
}
