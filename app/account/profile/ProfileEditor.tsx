'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { circleHeaders } from '@/lib/circles/client';
import { subscribeAuthProviderChanges } from '@/lib/auth/providerSelection';
import { parseOwnerProfile, type OwnerProfile, type ProfileFields } from '@/lib/members/profile';
import styles from './profile.module.css';

type Draft = Omit<ProfileFields, 'skills'> & { skillsText: string };
type Phase = 'idle' | 'loading' | 'ready' | 'saving' | 'saved' | 'conflict' | 'unknown' | 'error';
const fields = [
  { key: 'bio', label: 'About you', limit: 2000 },
  { key: 'discipline', label: 'Your field', limit: 100 },
  { key: 'projectDescription', label: 'What you are building', limit: 2000 },
  { key: 'seeking', label: 'What you are looking for', limit: 1000 },
  { key: 'philosophy', label: 'Your philosophy', limit: 2000 },
] as const;

function draftFrom(profile: ProfileFields): Draft {
  const { skills, ...text } = profile;
  return { ...text, skillsText: skills.join(', ') };
}

function authoredFields(draft: Draft): ProfileFields | null {
  const skills = draft.skillsText.split(',').map(value => value.trim()).filter(Boolean);
  if (skills.length > 40 || skills.some(value => value.length > 100) || !draft.displayName.trim()) return null;
  return {
    displayName: draft.displayName.trim(), bio: draft.bio.trim(), discipline: draft.discipline.trim(),
    projectDescription: draft.projectDescription.trim(), seeking: draft.seeking.trim(),
    philosophy: draft.philosophy.trim(), skills,
  };
}

function sameFields(a: ProfileFields, b: ProfileFields) {
  return a.displayName === b.displayName && a.bio === b.bio && a.discipline === b.discipline &&
    a.projectDescription === b.projectDescription && a.seeking === b.seeking && a.philosophy === b.philosophy &&
    a.skills.length === b.skills.length && a.skills.every((skill, index) => skill === b.skills[index]);
}

async function readProfile(signal: AbortSignal) {
  if (signal.aborted) throw new Error('retired');
  const headers = await circleHeaders();
  if (signal.aborted) throw new Error('retired');
  const response = await fetch('/api/members/profile', {
    credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', headers, signal,
  });
  if (!response.ok) throw new Error(response.status === 401 ? 'signin' : 'unavailable');
  const owner = parseOwnerProfile(await response.json());
  if (!owner) throw new Error('unavailable');
  return owner;
}

async function bounded<T>(controller: AbortController, work: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('deadline')); }, 15_000);
  });
  try { return await Promise.race([work(), deadline]); }
  finally { if (timer) clearTimeout(timer); }
}

export default function ProfileEditor() {
  const [owner, setOwner] = useState<OwnerProfile | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('Load your profile to edit it.');
  const epoch = useRef(0);
  const active = useRef<AbortController | null>(null);

  useEffect(() => {
    const invalidate = () => { epoch.current++; active.current?.abort(); };
    const unsubscribe = subscribeAuthProviderChanges(() => {
      invalidate();
      setOwner(null); setDraft(null); setVisibility('private'); setPhase('idle');
      setMessage('Sign-in changed. Load your profile again.');
    });
    return () => { invalidate(); unsubscribe(); };
  }, []);

  async function load() {
    const generation = ++epoch.current;
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setOwner(null); setDraft(null); setVisibility('private'); setPhase('loading'); setMessage('Loading your profile…');
    try {
      const current = await bounded(controller, () => readProfile(controller.signal));
      if (generation !== epoch.current || controller.signal.aborted) return;
      setOwner(current); setDraft(draftFrom(current.profile)); setVisibility(current.visibility); setPhase('ready');
      setMessage(current.visibility === 'public' ? 'Your saved profile is published.' : 'Your saved profile is private.');
    } catch (error) {
      if (generation !== epoch.current) return;
      setPhase('error'); setMessage(error instanceof Error && error.message === 'signin'
        ? 'Sign in to load your profile.' : 'Profile settings are unavailable. You can try loading again.');
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!owner || !draft || !['ready', 'saved'].includes(phase)) return;
    const profile = authoredFields(draft);
    if (!profile) { setMessage('Enter a display name and up to 40 skills of at most 100 characters each.'); return; }
    const generation = ++epoch.current;
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    let sent = false;
    setPhase('saving'); setMessage('Saving your profile…');
    try {
      await bounded(controller, async () => {
      const headers = await circleHeaders(true);
      if (generation !== epoch.current || controller.signal.aborted) return;
      sent = true;
      const response = await fetch('/api/members/profile', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
        headers, signal: controller.signal,
        body: JSON.stringify({ expectedMemberId: owner.memberId, expectedRevision: owner.revision, patch: { ...profile, visibility } }),
      });
      if (generation !== epoch.current || controller.signal.aborted) return;
      if (response.status === 409) {
        setPhase('conflict'); setMessage('Your profile or sign-in changed. Load the latest profile before editing again.'); return;
      }
      if (response.status === 401 || response.status === 403) {
        setOwner(null); setDraft(null); setVisibility('private'); setPhase('error'); setMessage('Sign in again, then load your profile.'); return;
      }
      if (response.status === 400) { setPhase('ready'); setMessage('Review your profile fields and try again.'); return; }
      if (!response.ok) throw new Error('unknown');
      const receipt = parseOwnerProfile(await response.json());
      if (generation !== epoch.current || controller.signal.aborted) return;
      if (!receipt || receipt.memberId !== owner.memberId || receipt.revision < owner.revision ||
        receipt.visibility !== visibility || !sameFields(receipt.profile, profile)) throw new Error('unknown');
      const confirmed = await readProfile(controller.signal);
      if (generation !== epoch.current || controller.signal.aborted) return;
      if (confirmed.memberId !== owner.memberId) {
        setOwner(null); setDraft(null); setVisibility('private'); setPhase('idle'); setMessage('Sign-in changed. Load your profile again.'); return;
      }
      if (confirmed.revision !== receipt.revision || confirmed.visibility !== visibility || !sameFields(confirmed.profile, profile)) {
        setPhase('conflict'); setMessage('Your profile changed during confirmation. Load the latest profile before editing again.'); return;
      }
      setOwner(confirmed); setDraft(draftFrom(confirmed.profile)); setVisibility(confirmed.visibility); setPhase('saved');
      setMessage(confirmed.visibility === 'public' ? 'Saved and confirmed: your profile is published.' : 'Saved and confirmed: your profile is private.');
      });
    } catch {
      if (generation !== epoch.current) return;
      setPhase(sent ? 'unknown' : 'error');
      if (!sent) { setOwner(null); setDraft(null); setVisibility('private'); }
      setMessage(sent ? 'Save outcome unknown. Load your profile to check its saved state before editing again.'
        : 'Unable to verify your sign-in. Load your profile again.');
    }
  }

  const busy = phase === 'loading' || phase === 'saving';
  const editable = phase === 'ready' || phase === 'saved';
  const preview = draft ? authoredFields(draft) : null;
  return <section className={styles.editor} aria-label="Profile settings">
    <div className={styles.actions}>
      <button type="button" onClick={load} disabled={busy}>{owner ? 'Reload profile' : 'Load your profile'}</button>
      <Link href="/login?next=%2Faccount%2Fprofile">Sign in</Link>
    </div>
    <p role="status" aria-live="polite" className={styles.status}>{message}</p>
    {owner && draft && <form onSubmit={save}>
      <fieldset disabled={!editable} className={styles.fields}>
        <legend>Profile fields</legend>
        <label htmlFor="profile-name">Display name</label>
        <input id="profile-name" name="displayName" autoComplete="nickname" required maxLength={200}
          value={draft.displayName} onChange={event => { setDraft({ ...draft, displayName: event.target.value }); setPhase('ready'); }} />
        {fields.map(field => <div className={styles.field} key={field.key}>
          <label htmlFor={`profile-${field.key}`}>{field.label}</label>
          {field.key === 'discipline'
            ? <input id={`profile-${field.key}`} name={field.key} maxLength={field.limit} value={draft[field.key]} onChange={event => { setDraft({ ...draft, [field.key]: event.target.value }); setPhase('ready'); }} />
            : <textarea id={`profile-${field.key}`} name={field.key} rows={4} maxLength={field.limit}
              value={draft[field.key]} onChange={event => { setDraft({ ...draft, [field.key]: event.target.value }); setPhase('ready'); }} />}
        </div>)}
        <label htmlFor="profile-skills">Skills, separated by commas</label>
        <input id="profile-skills" name="skills" maxLength={4078} value={draft.skillsText}
          onChange={event => { setDraft({ ...draft, skillsText: event.target.value }); setPhase('ready'); }} />
        <p className={styles.hint}>Up to 40 skills, 100 characters each.</p>
        <label htmlFor="profile-visibility">Who can see these profile fields?</label>
        <select id="profile-visibility" value={visibility} onChange={event => { setVisibility(event.target.value === 'public' ? 'public' : 'private'); setPhase('ready'); }}>
          <option value="private">Private — hidden from profiles and directory</option>
          <option value="public">Public — visible to everyone</option>
        </select>
        <p>{visibility === 'public' ? 'Saving will publish your display name, about text, field, skills, project, interests and philosophy.'
          : 'Saving keeps these profile fields out of public profiles and the member directory.'}</p>
        {visibility === 'public' && preview && <section className={styles.preview} aria-label="Public profile preview">
          <h2>Public profile preview</h2><h3>{preview.displayName}</h3>
          {fields.map(field => preview[field.key] ? <div key={field.key}><h4>{field.label}</h4><p>{preview[field.key]}</p></div> : null)}
          {preview.skills.length > 0 && <p>Skills: {preview.skills.join(', ')}</p>}
        </section>}
        <button type="submit">{visibility === 'public' ? 'Save and publish profile' : 'Save private profile'}</button>
      </fieldset>
      {phase === 'saving' && <p>Confirming the saved state…</p>}
      {phase === 'saved' && owner.visibility === 'public' && <Link href={`/explorer/${owner.memberId}`}>View your published profile</Link>}
    </form>}
  </section>;
}
