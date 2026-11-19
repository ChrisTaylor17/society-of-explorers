'use client';

import { useEffect, useRef, useState } from 'react';
import { getSupabaseAccessToken } from '@/lib/auth/getSession';
import PublishedProfileLink from '@/components/PublishedProfileLink';
import type { PublicMemberProfile } from '@/lib/members/profile';
import { DIRECTORY_EXPECTED_OWNER_HEADER, DIRECTORY_OWNER_HEADER, DIRECTORY_LIMIT, FINDER_QUERY_LIMIT,
  finderTerms, findPublishedMembers, parsePublishedDirectory, type MemberFinderResult } from '@/lib/members/finder';
import styles from './member-finder.module.css';

export default function MemberFinder({ ownerId, onOpenConversation }: {
  ownerId: string;
  onOpenConversation: (member: PublicMemberProfile) => void;
}) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [results, setResults] = useState<MemberFinderResult[]>([]);
  const [checked, setChecked] = useState(0);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState<string[]>([]);
  const active = useRef<AbortController | null>(null);

  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === 'visible') return;
      active.current?.abort(); active.current = null;
      setResults([]); setSearched([]); setError(''); setState('idle');
    };
    document.addEventListener('visibilitychange', hidden);
    return () => { document.removeEventListener('visibilitychange', hidden); active.current?.abort(); active.current = null; };
  }, []);

  function changeQuery(value: string) {
    active.current?.abort(); active.current = null;
    setQuery(value); setState('idle'); setResults([]); setSearched([]); setError('');
  }

  async function search() {
    const terms = finderTerms(query);
    if (!terms.length || active.current) return;
    const controller = new AbortController(); active.current = controller;
    const current = () => active.current === controller && document.visibilityState === 'visible';
    // Bound the whole operation, including sign-in lookup and response parsing.
    // Retire authority first so a late result cannot replace the error or a retry.
    const timer = window.setTimeout(() => {
      if (!current()) return;
      active.current = null; controller.abort();
      setError('The directory could not be checked. Please try again.'); setState('error');
    }, 10_000);
    setState('loading'); setError(''); setResults([]); setSearched([]);
    try {
      const token = await getSupabaseAccessToken();
      if (!current()) return;
      // Search words stay here. Refresh the public directory without sending
      // self profiles, other profiles, private messages or a model request.
      const response = await fetch('/api/members/discover', {
        cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
        headers: { [DIRECTORY_EXPECTED_OWNER_HEADER]: ownerId, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!current()) return;
      if (!response.ok) {
        setError(response.status === 401 || response.status === 409 ? 'Your sign-in changed. Reload the member page before searching.'
          : response.status === 403 ? 'This directory is available to members of this community.'
            : 'The directory could not be checked. Please try again.');
        setState('error'); return;
      }
      if (response.headers.get(DIRECTORY_OWNER_HEADER) !== ownerId.toLowerCase()) throw Error('Directory account was not confirmed');
      const profiles = parsePublishedDirectory(await response.json());
      if (!current()) return;
      if (!profiles) throw Error('Directory publication response was not confirmed');
      setChecked(profiles.filter(profile => profile.id !== ownerId.toLowerCase()).length);
      setResults(findPublishedMembers(profiles, query, ownerId)); setSearched(terms); setState('ready');
    } catch {
      if (current()) { setError('The directory could not be checked. Please try again.'); setState('error'); }
    } finally {
      window.clearTimeout(timer);
      if (active.current === controller) active.current = null;
    }
  }

  return <section className={styles.finder} aria-labelledby="member-finder-heading">
    <p className={styles.eyebrow}>People &amp; projects</p>
    <h2 id="member-finder-heading">Find people to explore with</h2>
    <p>Find people by the interests, skills and projects they&apos;ve chosen to publish.</p>
    <form className={styles.search} onSubmit={event => { event.preventDefault(); void search(); }}>
      <label htmlFor="member-finder-query">Skills, topics or projects</label>
      <div className={styles.controls}>
        <input id="member-finder-query" value={query} maxLength={FINDER_QUERY_LIMIT} onChange={event => changeQuery(event.target.value)}
          placeholder="Scripture, history, design, TypeScript…" autoComplete="off" />
        <button type="submit" disabled={state === 'loading' || !finderTerms(query).length}>{state === 'loading' ? 'Checking profiles…' : 'Find people'}</button>
      </div>
    </form>
    <p className={styles.note}>Your search words stay in this browser.</p>
    {state === 'error' && <p role="alert" className={styles.error}>{error}</p>}
    {state === 'loading' && <p role="status">Checking the current directory…</p>}
    {state === 'ready' && <>
      <p role="status">{results.length ? `${results.length} ${results.length === 1 ? 'person matches' : 'people match'} at least one of: ${searched.join(', ')}.`
        : checked === 0 ? 'No other published profiles are available in this directory yet.'
          : 'None of the checked profiles matches those words. Try a skill, topic or shorter phrase.'}</p>
      <p className={styles.note}>{checked} other published {checked === 1 ? 'profile' : 'profiles'} checked. Results are ordered by the number of your search words found, then by name.</p>
      <div className={styles.results}>{results.map(({ member, reasons }) => <article key={member.id} className={styles.card} aria-label={member.display_name}>
        <h3>{member.display_name}</h3>
        {member.discipline && <p>{member.discipline}</p>}
        {member.skills.length > 0 && <p>Skills: {member.skills.join(', ')}</p>}
        {member.seeking && <p>Looking for: {member.seeking}</p>}
        <ul aria-label="Why this profile appeared">{reasons.map(reason => <li key={reason.field}>{reason.field}: {reason.terms.join(', ')}</li>)}</ul>
        <div className={styles.actions}>
          <PublishedProfileLink profileId={member.id} />
          <button type="button" onClick={() => onOpenConversation(member)}>Open conversation</button>
        </div>
      </article>)}</div>
    </>}
    <details className={styles.note}>
      <summary>About these results</summary>
      <p>These are keyword matches. Each search refreshes up to {DIRECTORY_LIMIT} published profiles, newest community members first. Private profiles are excluded. Opening a profile checks its publication again.</p>
      <p>No AI service receives your search words. Results do not assess anyone&apos;s beliefs, trustworthiness or compatibility.</p>
    </details>
  </section>;
}
