'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { parseCircleReadingEditionResponse, type CircleReadingEditionResponse, getReadingWork, getReadingEdition, matchesReadingEdition, parseReadingProgram, READING_EDITIONS, READING_PROGRAM_MAX_SESSIONS, readingReaderHref, readingSessionLabel, type ReadingContext, type ReadingProgram } from '@/lib/circles/reading-program';
import { isPhilemonReading, PHILEMON_RIGHTS, PHILEMON_WORK } from '@/lib/root-kernel/philemon-edition';
import { body, button, card, fieldLabel, h2, input, small } from '@/lib/circles/ui';
import styles from './reading-program.module.css';

export type ReadingProgramDraft = { custom: boolean; program: ReadingProgram | null; metadata: CircleReadingEditionResponse | null };
export const emptyReadingProgramDraft = (custom = false): ReadingProgramDraft => ({ custom, program: null, metadata: null });
type Row = { from: string; to: string };
const rowsFor = (program: ReadingProgram): Row[] => program.sessions.map(session => ({ from: String(session.from + 1), to: String(session.to + 1) }));

export default function ReadingProgramEditor({ value, context = null, disabled, onChange }: { value: ReadingProgramDraft; context?: ReadingContext | null; disabled: boolean; onChange: (value: ReadingProgramDraft) => void }) {
  const [selectedBook, setSelectedBook] = useState(value.program?.bookId || context?.bookId || READING_EDITIONS[0].bookId);
  const [rows, setRows] = useState<Row[]>(value.program ? rowsFor(value.program) : []);
  const [hint, setHint] = useState<ReadingContext | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('Choose the starter path or verify a pinned source edition before planning weekly readings.');
  const access = useRef({ mounted: false, generation: 0, controller: null as AbortController | null });
  useEffect(() => {
    const lifetime = access.current; lifetime.mounted = true;
    return () => { lifetime.mounted = false; lifetime.generation++; lifetime.controller?.abort(); };
  }, []);
  const metadata = value.metadata?.bookId === selectedBook ? value.metadata : null;
  const pinned = getReadingEdition(selectedBook);
  const boundaries = metadata ? [...new Set([0, ...metadata.edition.contents.flatMap(heading => heading.readingIndex === null ? [] : [heading.readingIndex]), metadata.edition.blockCount])].sort((a, b) => a - b) : [];
  const headingAt = (index: number) => metadata?.edition.contents.find(heading => heading.readingIndex === index)?.label;
  function retireRead() { access.current.generation++; access.current.controller?.abort(); setBusy(false); }
  function choose(custom: boolean, bookId = selectedBook) {
    retireRead(); setSelectedBook(bookId); setRows([]); setHint(null); onChange({ custom, program: null, metadata: null });
    setNotice(custom ? 'Load the selected source edition to verify its reading positions and credits.' : 'The Circle will use the existing twelve-week starter path.');
  }
  function useContext() {
    if (!context || disabled) return;
    choose(true, context.bookId); setHint(context); setNotice('Reader selection chosen as the first weekly reading. Load the pinned edition to verify it before use.');
  }
  function publish(nextRows: Row[], current: CircleReadingEditionResponse) {
    setRows(nextRows);
    const validNumbers = nextRows.every(row => /^[1-9]\d*$/.test(row.from) && /^[1-9]\d*$/.test(row.to));
    const program = validNumbers ? parseReadingProgram({ version: 1, bookId: current.bookId, editionId: current.edition.editionId, sessions: nextRows.map(row => ({ from: Number(row.from) - 1, to: Number(row.to) - 1 })) }) : null;
    onChange({ custom: true, program, metadata: current });
    setNotice(program ? 'Weekly reading positions checked for this exact edition. Review each range before creating the Circle.' : 'Each weekly range needs a valid beginning and end, in order, within this edition.');
  }
  async function load() {
    if (disabled || busy || !pinned) return;
    retireRead(); const lifetime = access.current, generation = ++lifetime.generation, controller = new AbortController(); lifetime.controller = controller;
    const current = () => lifetime.mounted && lifetime.generation === generation;
    const previous = value.program?.bookId === selectedBook ? value.program : null;
    onChange({ custom: true, program: null, metadata: null }); setBusy(true); setNotice('Verifying source edition metadata…');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        fetch(`/api/great-books/text/${encodeURIComponent(selectedBook)}`, { method: 'GET', cache: 'no-store', redirect: 'error', credentials: 'omit', signal: controller.signal }).then(async reply => { if (!reply.ok) throw new Error('Edition unavailable'); return reply.json(); }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Edition verification timed out')); }, 15_000); }),
      ]);
      if (!current()) return;
      const verified = parseCircleReadingEditionResponse(response);
      if (!verified || !matchesReadingEdition(verified, pinned)) throw new Error('Pinned edition changed');
      const selected = hint && hint.bookId === selectedBook && hint.editionId === verified.edition.editionId
        ? parseReadingProgram({ version: 1, bookId: hint.bookId, editionId: hint.editionId, sessions: [{ from: hint.from, to: hint.to }] })
        : previous;
      const program = selected || parseReadingProgram({ version: 1, bookId: selectedBook, editionId: verified.edition.editionId, sessions: [{ from: 0, to: verified.edition.blockCount - 1 }] });
      if (!program) throw new Error('Reading selection unavailable');
      publish(rowsFor(program), verified);
    } catch {
      if (current()) { onChange({ custom: true, program: null, metadata: null }); setRows([]); setNotice('The selected edition could not be verified, or it has changed. Retry the metadata check; no reading plan has been accepted.'); }
    } finally { if (timer) clearTimeout(timer); if (current()) { lifetime.controller = null; setBusy(false); } }
  }
  function edit(index: number, key: keyof Row, next: string) { if (metadata) publish(rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: next } : row), metadata); }
  return <section className={`${styles.scope} ${styles.stack}`} aria-labelledby="reading-plan-heading">
    <h2 id="reading-plan-heading" style={{ ...h2, marginTop: '.5rem' }}>Agreed reading plan</h2>
    <label htmlFor="circle-reading-plan" style={fieldLabel}>Reading plan</label>
    <select id="circle-reading-plan" style={input} value={value.custom ? 'book' : 'starter'} disabled={disabled || busy} onChange={event => choose(event.target.value === 'book')}><option value="starter">Existing twelve-week starter path</option><option value="book">Choose a pinned book edition and weekly readings</option></select>
    {context && !isPhilemonReading(context) && <button type="button" style={button} disabled={disabled || busy} onClick={useContext}>Use the reader selection as the first reading</button>}
    <p role="status" aria-live="polite" style={small}>{notice}</p>
    {value.custom && <>
      <label htmlFor="circle-reading-book" style={fieldLabel}>Book and pinned source edition</label>
      <select id="circle-reading-book" style={input} value={selectedBook} disabled={disabled || busy} onChange={event => choose(true, event.target.value)}>{READING_EDITIONS.map(edition => <option key={edition.bookId} value={edition.bookId}>{getReadingWork(edition.bookId)?.title} — {getReadingWork(edition.bookId)?.author}</option>)}</select>
      <button type="button" style={button} disabled={disabled || busy} onClick={() => void load()}>{busy ? 'Verifying edition…' : 'Load and verify selected edition'}</button>
      {metadata && <>
        <p style={body}>{metadata.edition.attribution}</p>
        <p style={small}>{metadata.bookId === PHILEMON_WORK.id ? PHILEMON_RIGHTS : 'US public-domain assessment by Project Gutenberg. Rights outside the US have not been assessed; check local law.'}{' '}
          <a href={metadata.edition.sourceCatalogUrl}>Edition source and credits</a>.</p>
        <p style={small}>Choose 1 to 12 weekly readings. Selections may omit parts of the edition or revisit earlier readings. Reading positions are stable places in this edition, not invented chapters. The plan cannot be changed after the Circle is created.</p>
        <ol className={styles.list}>{rows.map((row, index) => <li key={index} style={card} className={styles.stack}>
          <h3 style={fieldLabel}>Week {index + 1}</h3>
          <div className={styles.columns}>
            <div><label htmlFor={`reading-${index}-start-heading`} style={fieldLabel}>Begin at a source heading</label><select id={`reading-${index}-start-heading`} style={input} disabled={disabled} value={boundaries.slice(0, -1).includes(Number(row.from) - 1) ? Number(row.from) - 1 : ''} onChange={event => { if (event.target.value !== '') edit(index, 'from', String(Number(event.target.value) + 1)); }}><option value="">Custom reading position</option>{boundaries.slice(0, -1).map(boundary => <option key={boundary} value={boundary}>{boundary === 0 ? 'Opening pages' : headingAt(boundary) || `Reading position ${boundary + 1}`}</option>)}</select></div>
            <div><label htmlFor={`reading-${index}-end-heading`} style={fieldLabel}>Read through to a boundary</label><select id={`reading-${index}-end-heading`} style={input} disabled={disabled} value={boundaries.slice(1).includes(Number(row.to)) ? Number(row.to) : ''} onChange={event => { if (event.target.value !== '') edit(index, 'to', event.target.value); }}><option value="">Custom reading position</option>{boundaries.slice(1).map(boundary => <option key={boundary} value={boundary}>{boundary === metadata.edition.blockCount ? 'End of edition' : `Before ${headingAt(boundary) || `reading position ${boundary + 1}`}`}</option>)}</select></div>
          </div>
          <div className={styles.columns}><div><label htmlFor={`reading-${index}-from`} style={fieldLabel}>Week {index + 1} begins at reading position</label><input id={`reading-${index}-from`} type="number" min={1} max={metadata.edition.blockCount} style={input} disabled={disabled} value={row.from} onChange={event => edit(index, 'from', event.target.value)} /></div><div><label htmlFor={`reading-${index}-to`} style={fieldLabel}>Week {index + 1} ends at reading position</label><input id={`reading-${index}-to`} type="number" min={1} max={metadata.edition.blockCount} style={input} disabled={disabled} value={row.to} onChange={event => edit(index, 'to', event.target.value)} /></div></div>
          {value.program?.sessions[index] && <p style={small}><Link href={readingReaderHref(value.program, value.program.sessions[index])}>Check this reading: {readingSessionLabel(value.program, value.program.sessions[index])}</Link></p>}
          <button type="button" style={button} disabled={disabled || rows.length <= 1} aria-label={`Remove week ${index + 1} reading`} onClick={() => publish(rows.filter((_row, rowIndex) => rowIndex !== index), metadata)}>Remove weekly reading</button>
        </li>)}</ol>
        <button type="button" style={button} disabled={disabled || rows.length >= READING_PROGRAM_MAX_SESSIONS} onClick={() => {
          const previous = rows.at(-1);
          if (previous) publish([...rows, { ...previous }], metadata);
        }}>Add weekly reading</button>
        <p style={small}>Adding a week repeats the previous range so you can deliberately revisit it or choose new boundaries.</p>
      </>}
    </>}
  </section>;
}
