'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { BookEditionResponse } from '@/lib/books/bookmarks';
import { passageBlockReference, type PassageSelection } from '@/lib/books/passage-text';
import { passageComposeHref, type PassageReference } from '@/lib/books/passages';
import { body, button, card, h2, small } from '@/lib/circles/ui';
import styles from '../circles/passages/passage.module.css';
import { readPublicPassage } from './PassageContext';

export default function PassageTools({ metadata, currentIndex, frameReady, capture }: { metadata: BookEditionResponse; currentIndex: number; frameReady: boolean; capture: () => PassageSelection }) {
  const [selection, setSelection] = useState<PassageReference | null>(null), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null), mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  const current = passageBlockReference(metadata, currentIndex);
  async function select() {
    if (!frameReady || controller.current) return;
    const result = capture(); setSelection(null);
    if (!result.ok) return setNotice(result.reason);
    const owned = new AbortController(); controller.current = owned; setBusy(true); setNotice('Checking the selected words against the verified source…');
    const deadline = setTimeout(() => { owned.abort(); if (mounted.current && controller.current === owned) { controller.current = null; setBusy(false); setNotice('The selection check timed out. Capture it again manually.'); } }, 15_000);
    try {
      const source = await readPublicPassage(result.reference, owned.signal);
      if (!mounted.current || owned.signal.aborted || controller.current !== owned) return;
      if (!source || source.quote !== result.selectedText) return setNotice('The selected words do not match this edition. Reload the complete source and select again, or use a source-block link.');
      setSelection(result.reference); setNotice('Selected words verified against this edition. Continue to choose a Circle and add your own comment.');
    } catch { if (mounted.current && !owned.signal.aborted) setNotice('The selection could not be verified. Capture it again manually.'); }
    finally { clearTimeout(deadline); if (controller.current === owned) { controller.current = null; if (mounted.current) setBusy(false); } }
  }
  return <section className={styles.scope} style={card} aria-label="Discuss a source passage" aria-busy={busy}>
    <h2 style={h2}>Bring a passage to your Circle</h2>
    <p style={body}>Select a short excerpt inside one text block, then capture its position. Equations, images and tables use a source-block link so nothing is omitted. Your Circle and comment are chosen on the next page.</p>
    <div className={styles.row}><button type="button" style={button} disabled={!frameReady || busy} onClick={() => void select()}>Capture selected passage</button>{frameReady && current && <Link href={passageComposeHref(current)}>Use current block as a source link</Link>}</div>
    <p role="status" style={small}>{notice}</p>
    {selection && <Link href={passageComposeHref(selection)}>Verify selected passage and write a comment</Link>}
  </section>;
}
