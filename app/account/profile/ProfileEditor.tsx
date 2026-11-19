'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import PublishedProfileLink from '@/components/PublishedProfileLink';
import { circleHeaders } from '@/lib/circles/client';
import { bindCircleAccess } from '@/lib/circles/browser-access';
import { createClient } from '@/lib/supabase/client';
import { memberSessionDto } from '@/lib/auth/memberDto';
import { PROFILE_LIMITS, parseOwnerProfile, parseProfileMutation, parsePublicMemberProfileResponse,
  type OwnerProfile, type ProfileFields, type ProfileVisibility, type PublicMemberProfile } from '@/lib/members/profile';
import styles from './profile.module.css';

type Draft = Omit<ProfileFields, 'skills'> & { skillsText: string };
type Phase = 'idle' | 'loading' | 'editing' | 'review' | 'saving' | 'unknown' | 'closed';
type Pending = { memberId: string; subject: string; base: number; body: string; profile: ProfileFields; visibility: ProfileVisibility; sent: boolean };
type View = { active: boolean; phase: Phase; owner: OwnerProfile | null; draft: Draft | null; visibility: ProfileVisibility;
  review: Pending | null; recovered: boolean; publicProfile: PublicMemberProfile | null; publicMessage: string; message: string };
const initial = (): View => ({ active: true, phase: 'idle', owner: null, draft: null, visibility: 'private', review: null, recovered: false,
  publicProfile: null, publicMessage: 'Your saved public profile has not been checked.', message: 'Load your profile to edit it. Nothing loads automatically.' });
const fields = [
  { key: 'displayName', label: 'Display name', multiline: false }, { key: 'bio', label: 'About you', multiline: true },
  { key: 'discipline', label: 'Your field', multiline: false }, { key: 'projectDescription', label: 'What you are building', multiline: true },
  { key: 'seeking', label: 'What you are looking for', multiline: true }, { key: 'philosophy', label: 'Your philosophy', multiline: true },
] as const;
const refused = new Set([400, 401, 403, 404, 409, 413, 415, 429]);
const draftFrom = ({ skills, ...text }: ProfileFields): Draft => ({ ...text, skillsText: skills.join(', ') });
const sameFields = (a: ProfileFields, b: ProfileFields) => fields.every(field => a[field.key] === b[field.key]) && JSON.stringify(a.skills) === JSON.stringify(b.skills);
const matches = (value: OwnerProfile, pending: Pending) => value.memberId === pending.memberId && value.visibility === pending.visibility && sameFields(value.profile, pending.profile);

/** Recovery belongs to this mounted view. Temporary retirement hides the exact
 * pending CAS without treating an abort or unchanged GET as cancellation. */
export default function ProfileEditor() {
  const [view, setView] = useState<View>(initial);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (view.phase === 'review') reviewHeading.current?.focus(); }, [view.phase]);
  const ref = useRef({ mounted: false, observing: false, active: true, closed: false, busy: false, epoch: 0, generation: 0,
    subject: null as string | null, pending: null as Pending | null, controller: null as AbortController | null, view: initial() });
  const core = ref.current;
  const publish = (next: Partial<View>) => { core.view = { ...core.view, ...next }; ++core.epoch; if (core.mounted) setView(core.view); };
  useEffect(() => {
    core.mounted = true; core.closed = false; core.active = document.visibilityState === 'visible' && navigator.onLine !== false;
    core.view = { ...initial(), active: core.active }; setView(core.view);
    const retire = (inactive: boolean) => {
      ++core.generation; ++core.epoch; core.controller?.abort(); core.controller = null; core.busy = false; core.subject = null;
      if (!core.pending?.sent) core.pending = null;
      if (inactive) core.active = false;
      core.view = { ...initial(), active: core.active, phase: core.closed ? 'closed' : 'idle', message: core.pending?.sent
        ? 'Private fields were cleared. A save may still complete. Load your profile under the same account to check it before reviewing an exact retry.'
        : 'Private fields were cleared. Load your profile to check your current account.' };
      if (core.mounted) setView(core.view);
    };
    const active = () => { if (core.mounted && core.observing && !core.closed && document.visibilityState === 'visible' && navigator.onLine !== false) {
      core.active = true; core.view = { ...core.view, active: true }; setView(core.view);
    } };
    const offline = () => retire(true);
    const wrappers = new Map<() => void, () => void>();
    const profileWindow = { addEventListener(name: string, listener: () => void) {
      const fn = name === 'blur' ? () => { if (!document.hasFocus()) listener(); } : listener;
      if (name === 'blur') wrappers.set(listener, fn); window.addEventListener(name, fn);
    }, removeEventListener(name: string, listener: () => void) { window.removeEventListener(name, name === 'blur' ? wrappers.get(listener) || listener : listener); if (name === 'blur') wrappers.delete(listener); } };
    window.addEventListener('offline', offline); window.addEventListener('online', active);
    const dispose = bindCircleAccess({ window: profileWindow, document,
      subscribeAuth(listener) { try { const { data } = createClient().auth.onAuthStateChange(listener); core.observing = true; return () => data.subscription.unsubscribe(); }
        catch { retire(true); return () => {}; } },
      onInactive: () => retire(true), onActive: active, onIdentity: () => retire(false) });
    return () => { core.mounted = false; retire(true); core.pending = null; core.observing = false; dispose();
      window.removeEventListener('offline', offline); window.removeEventListener('online', active); };
  // This mounted account view owns its private recovery lifetime.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const epoch = core.epoch;
  const valid = () => core.mounted && !core.closed && core.observing && core.active && !core.busy && core.epoch === epoch;
  const editable = valid() && view.phase === 'editing' && !!view.owner && !!view.draft && !core.pending;

  async function run(action: 'load' | 'confirm' | 'public') {
    if (!valid()) return;
    const pending = action === 'confirm' ? core.pending : null;
    const earlierUnknown = pending?.sent === true;
    if (action === 'confirm' && (!pending || core.view.phase !== 'review') || action === 'load' && core.view.phase === 'review'
      || action === 'public' && (!core.view.owner || core.view.phase === 'review')) return;
    const publicId = core.view.owner?.memberId;
    const generation = ++core.generation, controller = new AbortController(); core.controller = controller; core.busy = true;
    const current = () => core.mounted && !core.closed && core.active && core.generation === generation && !controller.signal.aborted;
    const visible = () => core.mounted && !core.closed && core.active && core.generation === generation;
    publish(action === 'public' ? { publicProfile: null, publicMessage: 'Checking your saved public profile…' }
      : { phase: pending ? 'saving' : 'loading', owner: null, draft: null, visibility: 'private', review: null, recovered: false,
        publicProfile: null, publicMessage: initial().publicMessage, message: pending ? 'Checking your account before saving the reviewed profile…' : 'Checking your current account and saved profile…' });
    let status: number | null = null, posted = false, receipt: OwnerProfile | null = null, discarded = false;
    const aborted = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(Error('Profile request retired')), { once: true }));
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      await Promise.race([aborted, (async () => {
        if (action === 'public') {
          const response = await fetch(`/api/explorer/${publicId}`, { headers: {}, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal });
          if (!current() || response.redirected) throw Error('Public profile request retired');
          const value: unknown = await response.json(); if (!current()) return;
          if (response.status === 404 && value && typeof value === 'object' && !Array.isArray(value)
            && Object.keys(value).length === 1 && (value as { error?: unknown }).error === 'Public profile unavailable.') {
            publish({ publicMessage: 'No public profile is visible at this address.' }); return;
          }
          const profile = response.status === 200 ? parsePublicMemberProfileResponse(value) : null;
          if (!profile || profile.id !== publicId) throw Error('Public profile invalid');
          publish({ publicProfile: profile, publicMessage: 'The public profile returned these saved fields.' }); return;
        }
        let operationOwner: { memberId: string; subject: string } | null = null;
        async function proof() {
          if (!current()) throw Error('Profile operation retired');
          const headers = new Headers(await circleHeaders()); if (!current()) throw Error('Profile operation retired');
          const response = await fetch('/api/auth/member', { headers, credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal });
          if (!current() || !response.ok || response.redirected) throw Error('Member check unavailable');
          const value = await response.json(); if (!current()) throw Error('Profile operation retired');
          const member = memberSessionDto(value?.member), auth = value?.auth;
          if (!member || !auth || !['supabase', 'wallet'].includes(auth.provider) || typeof auth.subject !== 'string' || !auth.subject
            || auth.subject.length > 300 || /[\u0000-\u001f\u007f]/.test(auth.subject)) throw Error('Member check invalid');
          const subject = `${auth.provider}:${auth.subject}`, owner = { memberId: member.id, subject };
          if (operationOwner && (operationOwner.memberId !== owner.memberId || operationOwner.subject !== subject)) throw Error('Account changed');
          if (core.pending && (core.pending.memberId !== owner.memberId || core.pending.subject !== subject)) {
            discarded = core.pending.sent; core.pending = null; core.subject = null;
            if (pending) throw Error('Account changed');
          }
          if (pending && core.pending !== pending) throw Error('Account changed');
          operationOwner = owner; core.subject = subject; return { ...owner, headers };
        }
        async function request(method: 'GET' | 'POST') {
          const owner = await proof(); if (!current()) throw Error('Profile operation retired');
          const headers = new Headers(owner.headers); if (method === 'POST') headers.set('content-type', 'application/json');
          if (method === 'POST') { posted = true; pending!.sent = true; }
          const response = await fetch('/api/members/profile', { method, headers, credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal,
            ...(method === 'POST' ? { body: pending!.body } : {}) });
          status = response.status;
          if (!current() || response.redirected || !response.ok) throw Error('Profile request unavailable');
          const value = parseOwnerProfile(await response.json());
          if (!current() || !value || value.memberId !== owner.memberId) throw Error('Profile reply invalid');
          return value;
        }
        if (pending) {
          receipt = await request('POST'); if (!current()) return;
          if (!matches(receipt, pending) || receipt.revision !== pending.base + 1) throw Error('Profile receipt invalid');
        }
        const saved = await request('GET'); if (!current()) return;
        const held = core.pending;
        if (pending && receipt) {
          if (saved.revision < receipt.revision || saved.revision === receipt.revision && !matches(saved, pending)) throw Error('Profile readback invalid');
          core.pending = null;
          publish({ owner: saved, draft: draftFrom(saved.profile), visibility: saved.visibility, phase: 'editing',
            message: saved.revision > receipt.revision ? 'Your profile changed again. The current saved profile is shown.'
              : saved.visibility === 'public' ? 'Saved and confirmed: your profile is published.' : 'Saved and confirmed: your profile is private.' });
        } else if (held?.sent && saved.revision <= held.base) {
          if (saved.revision < held.base) throw Error('Profile revision moved backwards');
          publish({ owner: saved, phase: 'unknown', recovered: true, message: 'The earlier save is still uncertain. An unchanged profile does not prove it failed. You can review an exact retry.' });
        } else {
          core.pending = null;
          publish({ owner: saved, draft: draftFrom(saved.profile), visibility: saved.visibility, phase: 'editing',
            message: discarded ? 'Your account changed. An earlier account’s save may still complete; its private recovery was discarded. This is your current profile.'
              : held?.sent ? 'A newer saved profile prevents the earlier save from changing it. Review the current state.'
              : saved.visibility === 'public' ? 'Your saved profile is published.' : 'Your saved profile is private.' });
        }
      })()]);
    } catch {
      if (visible()) {
        if (action === 'public') publish({ publicProfile: null, publicMessage: 'The public profile could not be checked. Its visibility has not been confirmed.' });
        else {
          if (pending && posted && !receipt && refused.has(status || 0) && !earlierUnknown) core.pending = null;
          if (!core.pending?.sent) core.pending = null;
          core.subject = null;
          publish({ owner: null, draft: null, visibility: 'private', review: null, recovered: false, phase: core.pending?.sent ? 'unknown' : 'idle',
            message: discarded ? 'Your account changed. The earlier save may still complete; its private recovery was discarded. Load your current profile.'
              : core.pending?.sent ? 'The save could not be confirmed and may still complete. Load your profile before reviewing an exact retry.'
              : 'Your profile or sign-in could not be confirmed. Load the latest profile before editing again.' });
        }
      }
    } finally { clearTimeout(timer); if (core.generation === generation) { core.busy = false; core.controller = null; if (core.mounted) setView({ ...core.view }); } }
  }
  function edit(key: keyof Draft, value: string) {
    if (!valid() || core.view.phase !== 'editing' || !core.view.draft || core.pending) return;
    publish({ draft: { ...core.view.draft, [key]: value }, publicProfile: null, publicMessage: initial().publicMessage });
  }
  function review(retry = false) {
    if (!valid()) return;
    if (retry) {
      if (core.view.phase !== 'unknown' || !core.view.recovered || !core.pending?.sent || core.subject !== core.pending.subject || core.view.owner?.memberId !== core.pending.memberId) return;
    } else {
      const { owner, draft, visibility } = core.view;
      if (core.view.phase !== 'editing' || !owner || !draft || !core.subject || core.pending) return;
      const { skillsText, ...text } = draft;
      const parsed = parseProfileMutation({ expectedMemberId: owner.memberId, expectedRevision: owner.revision,
        patch: { ...text, skills: skillsText.split(',').map(value => value.trim()).filter(Boolean), visibility } });
      if (!parsed) { publish({ message: 'Review the field limits, enter a display name and use up to 40 skills of 100 characters each.' }); return; }
      const profile = parsed.patch as ProfileFields;
      const patch = { displayName: profile.displayName, bio: profile.bio, discipline: profile.discipline, skills: profile.skills,
        projectDescription: profile.projectDescription, seeking: profile.seeking, philosophy: profile.philosophy, visibility };
      core.pending = { memberId: owner.memberId, subject: core.subject, base: owner.revision, profile: { displayName: profile.displayName, bio: profile.bio, discipline: profile.discipline, skills: [...profile.skills], projectDescription: profile.projectDescription, seeking: profile.seeking, philosophy: profile.philosophy }, visibility, sent: false,
        body: JSON.stringify({ expectedMemberId: owner.memberId, expectedRevision: owner.revision, patch }) };
    }
    publish({ phase: 'review', review: core.pending, publicProfile: null, publicMessage: initial().publicMessage,
      message: retry ? 'Review the exact earlier save. Confirming sends the same fields and original revision; the earlier request may still complete.' : 'Review all of these fields. Nothing has been sent.' });
  }
  function cancel() {
    if (!valid() || core.view.phase !== 'review') return;
    const uncertain = core.pending?.sent;
    if (!uncertain) core.pending = null;
    publish({ phase: uncertain ? 'unknown' : 'editing', review: null, message: uncertain ? 'The earlier save remains uncertain. Nothing was retried.' : 'Review cancelled. Nothing was sent.' });
  }
  function close() {
    if (!core.mounted || core.epoch !== epoch || core.closed) return;
    const uncertain = core.pending?.sent; core.closed = true; ++core.generation; core.controller?.abort(); core.controller = null; core.busy = false;
    core.pending = null; core.subject = null;
    publish({ ...initial(), active: false, phase: 'closed', message: uncertain ? 'Profile view closed. The save already sent may still complete. Local recovery was discarded.' : 'Profile view closed. Private fields were cleared.' });
  }
  return <section className={styles.editor} aria-label="Profile settings">
    <div className={styles.actions}>
      <button type="button" onClick={() => void run('load')} disabled={!valid() || view.phase === 'review'}>{view.phase === 'unknown' ? 'Check saved profile' : 'Load your profile'}</button>
      {view.phase === 'closed' || !core.busy && !core.pending ? <Link href="/login?next=%2Faccount%2Fprofile">Sign in</Link> : null}
    </div>
    <p role="status" aria-live="polite" className={styles.status}>{view.message}</p>
    {view.owner ? <p>Current saved profile: {view.owner.visibility === 'public' ? 'Published' : 'Private'}.</p> : null}
    {view.draft && !view.review ? <fieldset disabled={!editable} className={styles.fields}>
      <legend>Profile fields</legend>
      {fields.map(field => <div className={styles.field} key={field.key}>
        <label htmlFor={`profile-${field.key}`}>{field.label}</label>
        {field.multiline ? <textarea id={`profile-${field.key}`} rows={4} maxLength={PROFILE_LIMITS[field.key]} value={view.draft![field.key]} onChange={event => edit(field.key, event.target.value)}/>
          : <input id={`profile-${field.key}`} autoComplete={field.key === 'displayName' ? 'nickname' : undefined} maxLength={PROFILE_LIMITS[field.key]} value={view.draft![field.key]} onChange={event => edit(field.key, event.target.value)}/>}
      </div>)}
      <label htmlFor="profile-skills">Skills, separated by commas</label>
      <input id="profile-skills" maxLength={4078} value={view.draft.skillsText} onChange={event => edit('skillsText', event.target.value)}/>
      <p className={styles.hint}>Up to 40 skills, 100 characters each.</p>
      <label htmlFor="profile-visibility">Who can see these profile fields?</label>
      <select id="profile-visibility" value={view.visibility} onChange={event => { if (editable && valid()) publish({ visibility: event.target.value === 'public' ? 'public' : 'private', publicProfile: null, publicMessage: initial().publicMessage }); }}>
        <option value="private">Private — hidden from profiles and directory</option><option value="public">Public — visible to everyone</option>
      </select>
      <p>{view.visibility === 'public' ? 'Publishing makes all seven profile fields visible to everyone.' : 'Your profile stays hidden from public profiles and directories. Your display name can still appear with contributions you shared.'}</p>
      <button type="button" onClick={() => review()}>Review profile changes</button>
    </fieldset> : null}
    {view.review ? <section className={styles.preview} aria-label="Profile save review">
      <h2 ref={reviewHeading} tabIndex={-1}>{view.review.sent ? 'Review this same save again' : view.review.visibility === 'public' ? 'Review publication' : 'Review private profile'}</h2>
      <p>{view.review.visibility === 'public' ? 'Confirming will publish these exact profile fields for everyone to see.' : 'Confirming will save these profile fields privately. Existing contributions remain visible where they were shared.'}</p>
      <ProfileText profile={view.review.profile}/>
      <div className={styles.actions}><button type="button" disabled={!valid()} onClick={() => void run('confirm')}>{view.review.sent ? 'Confirm retry of same profile save' : view.review.visibility === 'public' ? 'Confirm save and publish profile' : 'Confirm save private profile'}</button>
        <button type="button" disabled={!valid()} onClick={cancel}>Cancel profile review</button></div>
    </section> : null}
    {view.phase === 'unknown' && view.recovered ? <button type="button" disabled={!valid()} onClick={() => review(true)}>Review retry of same profile save</button> : null}
    {view.owner && view.phase !== 'review' ? <section className={styles.preview} aria-label="Saved public profile">
      <h2>Your saved public profile</h2><p>Check the saved fields visible to everyone. Unsaved changes are not included.</p>
      <button type="button" disabled={!valid()} onClick={() => void run('public')}>Check my public profile</button>
      <p role="status">{view.publicMessage}</p>
      {view.publicProfile ? <><ProfileText profile={{ displayName: view.publicProfile.display_name, bio: view.publicProfile.bio ?? '', discipline: view.publicProfile.discipline ?? '', skills: view.publicProfile.skills,
        projectDescription: view.publicProfile.project_description ?? '', seeking: view.publicProfile.seeking ?? '', philosophy: view.publicProfile.philosophy ?? '' }}/>
        <PublishedProfileLink profileId={view.publicProfile.id} active={!core.busy && !core.pending} label="View your published profile"/></> : null}
    </section> : null}
    <p className={styles.hint}>Leaving this page clears private fields and local recovery. A save already sent may still complete. Nothing retries automatically.</p>
    <button type="button" disabled={view.phase === 'closed'} onClick={close}>Close profile view</button>
  </section>;
}
function ProfileText({ profile }: { profile: ProfileFields }) {
  return <div>{fields.map(field => <div key={field.key}><h3>{field.label}</h3><p>{profile[field.key] || 'Not provided'}</p></div>)}<h3>Skills</h3><p>{profile.skills.join(', ') || 'Not provided'}</p></div>;
}
