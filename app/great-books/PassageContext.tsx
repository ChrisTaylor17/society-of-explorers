'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { BookEditionResponse } from '@/lib/books/bookmarks';
import { parseBookPassage, parsePassageReaderIntent, passageReferenceFromMessage, passageReaderHref, samePassageReference, type BookPassage, type PassageReference } from '@/lib/books/passages';
import { body, button, card, h2, small } from '@/lib/circles/ui';
import styles from '../circles/passages/passage.module.css';

export function passageSourceUrl(reference: PassageReference): string {
  const query = new URLSearchParams({ book: reference.bookId, edition: reference.editionId, block: String(reference.blockIndex) });
  if (reference.start !== null) { query.set('start', String(reference.start)); query.set('end', String(reference.end)); }
  return `/api/great-books/passage?${query}`;
}
export async function readPublicPassage(reference: PassageReference, signal: AbortSignal): Promise<BookPassage | null> {
  const response = await fetch(passageSourceUrl(reference), { credentials: 'omit', cache: 'no-store', redirect: 'error', signal });
  if (!response.ok) return null;
  const source = parseBookPassage(await response.json());
  return source && samePassageReference(source.reference, reference) ? source : null;
}
export function PassageSource({ source }: { source: BookPassage }) {
  return <div className={styles.stack}>
    {source.quote !== null ? <blockquote className={styles.quote}>{source.quote}</blockquote> : <p style={body}>Source-block link only. {source.reason === 'table' || source.reason === 'non_text' ? 'This block contains an equation, image or table; open the complete source to see it.' : 'No words are being quoted.'}</p>}
    <p style={small}>{source.metadata.edition.attribution}</p>
    <p style={small}>Reading block {source.reference.blockIndex + 1}. Project Gutenberg public-domain determination applies in the United States; rights elsewhere have not been assessed.</p>
    <div className={styles.row}><Link href={source.readerHref}>Open this source in the reader</Link><a href={source.metadata.edition.sourceCatalogUrl} target="_blank" rel="noopener noreferrer">Project Gutenberg edition record</a></div>
  </div>;
}

/** This component is mounted only inside the current visible message gate. */
export function MessagePassageContext({ content }: { content: string }) {
  return <MessageSource key={content} content={content} />;
}
function MessageSource({ content }: { content: string }) {
  const reference = passageReferenceFromMessage(content);
  const [notice, setNotice] = useState(''), [verified, setVerified] = useState(false), [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null), mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  if (!reference) return null;
  async function verify() {
    if (busy || controller.current) return;
    const owned = new AbortController(); controller.current = owned; setBusy(true); setVerified(false); setNotice('Checking the current edition and the complete source footer…');
    const deadline = setTimeout(() => { owned.abort(); if (mounted.current && controller.current === owned) { controller.current = null; setBusy(false); setNotice('Source verification timed out. Try again manually.'); } }, 15_000);
    try {
      const source = await readPublicPassage(reference!, owned.signal);
      if (!mounted.current || owned.signal.aborted || controller.current !== owned) return;
      const matches = source && content.endsWith(`\n\n${source.contentSuffix}`) && content.length > source.contentSuffix.length + 2;
      setVerified(Boolean(matches)); setNotice(matches ? 'Source footer verified against this exact edition. This does not verify the member’s comment.' : 'The quoted text or attribution does not match this edition. Treat this as an unverified source hint.');
    } catch { if (mounted.current && !owned.signal.aborted) setNotice('The source could not be verified. No verification is being assumed.'); }
    finally { clearTimeout(deadline); if (controller.current === owned) { controller.current = null; if (mounted.current) setBusy(false); } }
  }
  return <aside className={styles.scope} aria-label="Passage source" aria-busy={busy} style={{ marginTop: '12px' }}>
    <div className={styles.row}><Link href={passageReaderHref(reference)}>Open referenced source (unverified hint)</Link><button type="button" style={button} disabled={busy} onClick={() => void verify()}>Verify message source</button></div>
    <p role="status" style={small}>{verified ? 'Verified edition reference. ' : ''}{notice}</p>
  </aside>;
}

export default function PassageContext({ metadata, search, frameReady, jump }: { metadata: BookEditionResponse; search?: string; frameReady: boolean; jump: (index: number) => void }) {
  const intent = parsePassageReaderIntent(metadata.bookId, new URLSearchParams(search));
  return intent.present ? <ReaderSource key={`${metadata.edition.editionId}:${search}`} metadata={metadata} intent={intent} frameReady={frameReady} jump={jump} /> : null;
}
function ReaderSource({ metadata, intent, frameReady, jump }: { metadata: BookEditionResponse; intent: ReturnType<typeof parsePassageReaderIntent>; frameReady: boolean; jump: (index: number) => void }) {
  const [source, setSource] = useState<BookPassage | null>(null), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null), mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  const reference = intent.reference;
  const valid = !intent.invalid && reference && reference.editionId === metadata.edition.editionId && reference.blockIndex < metadata.edition.blockCount;
  async function open() {
    if (!valid || !reference || !frameReady || controller.current) return;
    const owned = new AbortController(); controller.current = owned; setBusy(true); setSource(null); setNotice('Verifying the referenced source…');
    const deadline = setTimeout(() => { owned.abort(); if (mounted.current && controller.current === owned) { controller.current = null; setBusy(false); setNotice('Source verification timed out. Try again manually.'); } }, 15_000);
    try {
      const current = await readPublicPassage(reference, owned.signal);
      if (!mounted.current || owned.signal.aborted || controller.current !== owned) return;
      if (!current) return setNotice('This reference could not be verified in the current edition. No jump was made.');
      setSource(current); jump(reference.blockIndex); setNotice('Verified reference. Moved to its source block; the excerpt below preserves its exact text.');
    } catch { if (mounted.current && !owned.signal.aborted) setNotice('The reference could not be verified. No jump was made.'); }
    finally { clearTimeout(deadline); if (controller.current === owned) { controller.current = null; if (mounted.current) setBusy(false); } }
  }
  return <section className={styles.scope} style={card} aria-label="Referenced passage" aria-busy={busy}>
    <h2 style={h2}>Referenced source</h2>
    {!valid ? <p role="status" style={body}>This passage link has an invalid or changed edition, or mixes a passage with a Circle reading plan. No reading position was opened.</p> : <>
      <p style={body}>This is an edition reference, not an agreed Circle reading plan.</p>
      <button type="button" style={button} disabled={!frameReady || busy} onClick={() => void open()}>Verify and open referenced block</button>
      {source && <PassageSource source={source} />}
      <p role="status" style={small}>{notice}</p>
    </>}
  </section>;
}
