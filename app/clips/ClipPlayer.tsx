'use client';
import Link from 'next/link';
import { reelDiscussionId, withReelDiscussion } from '@/lib/clips/salon';
import { useEffect, useRef, useState } from 'react';
import { parsePublicMediaClip, reelHref, reelLicenseLabel, reelReferenceLabel, type PublicMediaClip } from '@/lib/clips/contracts';
import { fetchClipBytes } from '@/lib/clips/client';
import { ONLINE_CIRCLES_HREF } from '@/lib/circles/discovery';
import styles from './clips.module.css';

type State = { status: 'idle' | 'loading' | 'error' } | { status: 'ready'; media: string; captions: string };
export default function ClipPlayer({ clip, standalone = false }: { clip: PublicMediaClip; standalone?: boolean }) {
  const approved = parsePublicMediaClip(clip);
  if (!approved) return <p>That reviewed clip is unavailable.</p>;
  // A caller may preserve this component while only captions, credits, timing or
  // review metadata changes. Bind the owned request/blob lifetime to the entire
  // bounded, canonically projected review, not only the media hash or parent key.
  return <ReviewedClipPlayer key={JSON.stringify(approved)} clip={approved} standalone={standalone}/>;
}
function ReviewedClipPlayer({ clip: approved, standalone }: { clip: PublicMediaClip; standalone: boolean }) {
  const [state, setState] = useState<State>({ status: 'idle' });
  const lifetime = useRef(0), pending = useRef<AbortController | null>(null), urls = useRef<string[]>([]);
  const canUnload = state.status === 'loading' || state.status === 'ready';
  const actionLabel = {
    idle: `Load ${approved.kind} and captions`,
    loading: 'Cancel loading',
    ready: 'Unload clip',
    error: 'Try loading again',
  }[state.status];
  useEffect(() => () => { lifetime.current += 1; pending.current?.abort(); urls.current.forEach(URL.revokeObjectURL); urls.current = []; }, []);
  function unload() {
    lifetime.current += 1; pending.current?.abort(); pending.current = null;
    urls.current.forEach(URL.revokeObjectURL); urls.current = []; setState({ status: 'idle' });
  }
  async function load() {
    if (state.status === 'loading' || state.status === 'ready') return;
    const generation = ++lifetime.current, controller = new AbortController(); pending.current?.abort(); pending.current = controller;
    const deadline = setTimeout(() => controller.abort(), 15_000);
    setState({ status: 'loading' });
    try {
      const [media, captions] = await Promise.all([
        fetchClipBytes(approved.media.href, approved.media.sha256, approved.media.bytes, approved.media.mime, controller.signal),
        fetchClipBytes(approved.captions.href, approved.captions.sha256, approved.captions.bytes, 'text/vtt', controller.signal),
      ]);
      if (controller.signal.aborted || generation !== lifetime.current) return;
      const mediaUrl = URL.createObjectURL(new Blob([media], { type: approved.media.mime }));
      urls.current.push(mediaUrl);
      const captionUrl = URL.createObjectURL(new Blob([captions], { type: 'text/vtt' }));
      urls.current.push(captionUrl);
      setState({ status: 'ready', media: mediaUrl, captions: captionUrl });
    } catch {
      controller.abort();
      if (generation === lifetime.current) { urls.current.forEach(URL.revokeObjectURL); urls.current = []; setState({ status: 'error' }); }
    } finally { clearTimeout(deadline); if (pending.current === controller) pending.current = null; }
  }
  return <article id={approved.id} tabIndex={-1} className={styles.card} aria-label={approved.title}>
    {!standalone && <h3>{approved.title}</h3>}<p>{approved.description}</p>
    {approved.attribution && approved.sourcePage
      ? <p className={styles.credit}>Footage by <a href={approved.sourcePage} target="_blank" rel="noopener noreferrer">{approved.credit}</a>
        {' · '}<a href={approved.attribution.licenseUrl} target="_blank" rel="noopener noreferrer">
          {reelLicenseLabel(approved.attribution.licenseUrl)}</a>. {approved.attribution.edits}</p>
      : <p className={styles.credit}>{approved.credit}</p>}
    {approved.attribution?.referenceUrl && <p className={styles.credit}>
      <a href={approved.attribution.referenceUrl} target="_blank" rel="noopener noreferrer">{reelReferenceLabel(approved.attribution.referenceUrl)}</a></p>}
    <p className={styles.help}>{approved.reviewLabel}. {approved.territoryLabel}. About {Math.ceil(approved.durationMs / 1000)} seconds.</p>
    <div className={styles.controls}>
      <button type="button" onClick={canUnload ? unload : load}>{actionLabel}</button>
    </div>
    <p role="status" aria-live="polite">{state.status === 'idle' ? 'No media has been loaded. Loading uses no account cookies.' : state.status === 'error' ? 'The reviewed files could not be verified. Nothing is playing.' : state.status === 'ready' ? 'Files verified. Use the player controls to start; playback does not start automatically.' : 'Checking the exact media and caption files…'}</p>
    {state.status === 'ready' && (approved.kind === 'video'
      ? <video className={styles.player} src={state.media} controls preload="none" crossOrigin="anonymous" playsInline onError={() => { unload(); setState({ status: 'error' }); }}><track src={state.captions} kind="captions" srcLang={approved.captions.language} label="English captions" default={approved.attribution?.captionPresentation !== 'embedded-text'} />Your browser cannot play this video. Read the transcript below.</video>
      : <audio className={styles.player} src={state.media} controls preload="none" crossOrigin="anonymous" onError={() => { unload(); setState({ status: 'error' }); }}><track src={state.captions} kind="captions" srcLang={approved.captions.language} label="English captions" />Your browser cannot play this audio. Read the transcript below.</audio>)}
    <details><summary>Read the transcript</summary><p className={styles.transcript}>{approved.transcript}</p></details>
    {approved.sourcePage && !approved.attribution && <a href={approved.sourcePage} target="_blank" rel="noopener noreferrer">Original source and credits</a>}
    {approved.attribution && <ReelLinks clip={approved} standalone={standalone} />}
  </article>;
}

function ReelLinks({ clip, standalone }: { clip: PublicMediaClip; standalone: boolean }) {
  const href = reelHref(clip.id), sharing = useRef(false);
  const [notice, setNotice] = useState('');
  async function share() {
    if (sharing.current) return;
    sharing.current = true;
    setNotice('');
    try {
      const url = new URL(href, window.location.origin).href;
      if (typeof navigator.share === 'function') await navigator.share({ title: clip.title, url });
      else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setNotice('Reel link copied.');
      } else setNotice('Copy the address from the Reel page.');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setNotice('Copy the address from the Reel page.');
    } finally { sharing.current = false; }
  }
  return <>
    <div className={styles.controls}>
      {!standalone && <Link href={href} prefetch={false}>Link to this Reel</Link>}
      <button type="button" onClick={() => void share()}>Share Reel</button>
      <Link href={withReelDiscussion(ONLINE_CIRCLES_HREF, reelDiscussionId(clip.id))} prefetch={false}>Discuss in an online Circle</Link>
    </div>
    {notice && <p role="status">{notice}</p>}
  </>;
}
