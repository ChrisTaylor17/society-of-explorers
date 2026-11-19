'use client';
import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import { useCircleHosting } from '@/lib/circles/useCircleHosting';
import { CIRCLE_MAX_MEMBERS, CIRCLE_MIN_MEMBERS, TIMEZONES, VENUE_LABELS, VENUE_TYPES, WEEKDAYS, validateCircleInput, type CircleFormat } from '@/lib/circles/schedule';
import { body, button, card, fieldLabel, h2, input, primary, small } from '@/lib/circles/ui';
import { matchesReadingEdition, parseReadingProgram, readingStartHref, type ReadingContext } from '@/lib/circles/reading-program';
import { getScriptureReading } from '@/lib/root-kernel/scripture-studies';
import ReadingProgramEditor, { emptyReadingProgramDraft } from '../ReadingProgramEditor';
import ReadingProgramSummary from '../ReadingProgramSummary';
import styles from '../participation.module.css';

const PUBLIC_VENUES = VENUE_TYPES.filter(value => value !== 'online');
const emptyDraft = (format: CircleFormat) => ({ title: '', description: '', admissionMode: 'open', format, city: '', region: '', venueName: '', venueType: 'library', weekday: '2', time: '19:00', timezone: 'America/New_York', startDate: '', maxMembers: '8', onlineUrl: '' });
export default function StartCircleForm({ initialContext = null, invalidContext = false, onlinePreset = false }: { initialContext?: ReadingContext | null; invalidContext?: boolean; onlinePreset?: boolean } = {}) {
  const defaultFormat = onlinePreset ? 'online' : 'in_person';
  const [draft, setDraft] = useState(() => emptyDraft(defaultFormat));
  const [agreed, setAgreed] = useState(false);
  const scripture = getScriptureReading(initialContext);
  const scripturePreset = Boolean(scripture);
  const [programDraft, setProgramDraft] = useState(() => emptyReadingProgramDraft(scripturePreset));
  const [editorEpoch, setEditorEpoch] = useState(0);
  const draftGeneration = useRef(0), generation = draftGeneration.current;
  const focusPreview = useCallback((element: HTMLHeadingElement | null) => element?.focus({ preventScroll: true }), []);
  const clearDraft = useCallback(() => { draftGeneration.current++; setDraft(emptyDraft(defaultFormat)); setAgreed(false); setProgramDraft(emptyReadingProgramDraft(scripturePreset)); setEditorEpoch(value => value + 1); }, [defaultFormat, scripturePreset]);
  const hosting = useCircleHosting(clearDraft);
  const { active, busy, preview, edition: previewEdition, confirmed, created, notice } = hosting;
  const disabled = !active || busy;
  const editDraft = (work: () => void) => { if (draftGeneration.current === generation) hosting.guardEdit(() => { draftGeneration.current++; work(); }); };
  const edit = (key: keyof typeof draft, value: string) => editDraft(() => setDraft(previous => ({ ...previous, [key]: value, ...(key === 'format' && value === 'in_person' ? { onlineUrl: '' } : {}) })));
  function review(event: React.FormEvent) {
    event.preventDefault();
    if (draftGeneration.current !== generation) return;
    hosting.guardEdit(() => {
      if (!agreed) { hosting.invalid('Agree to the community norms before reviewing your listing.'); return; }
      const maxMembers = Number(draft.maxMembers);
      if (!Number.isInteger(maxMembers) || maxMembers < CIRCLE_MIN_MEMBERS || maxMembers > CIRCLE_MAX_MEMBERS) { hosting.invalid(`Choose a Circle size between ${CIRCLE_MIN_MEMBERS} and ${CIRCLE_MAX_MEMBERS}.`); return; }
      const {admissionMode,...listing}=draft;
      const parsed = validateCircleInput({ ...listing, ...(admissionMode==='host_approval'?{admissionMode}:{}), weekday: Number(draft.weekday), maxMembers });
      if (!parsed.ok) { hosting.invalid(parsed.error); return; }
      const program = programDraft.custom ? parseReadingProgram(programDraft.program) : null;
      if (programDraft.custom && (!program || !programDraft.metadata || !matchesReadingEdition(programDraft.metadata, program))) { hosting.invalid('Load and verify a pinned edition, then choose valid weekly reading ranges before reviewing this Circle.'); return; }
      hosting.review({ ...parsed.value, ...(program ? { readingProgram: program } : {}) }, program ? programDraft.metadata : null);
    });
  }
  const basePath = initialContext ? readingStartHref(initialContext) : '/circles/start';
  const returnPath = onlinePreset ? basePath + (initialContext ? '&' : '?') + 'format=online' : basePath;
  const encodedReturn = initialContext || onlinePreset ? encodeURIComponent(returnPath) : returnPath;
  return <div className={styles.scope}>
    <p role="status" aria-live="polite" style={{ ...body, marginBottom: '1rem' }}>{notice}</p>
    <p style={{ ...small, marginBottom: '1rem' }}>{hosting.phase === 'review' || busy ? <span>Close this hosting view before changing sign-in.</span> : <><Link href={`/login?next=${encodedReturn}`}>Sign in</Link> · <Link href={`/login?mode=signup&next=${encodedReturn}`}>Create a free account</Link></>} · {hosting.phase === 'review' || busy ? <span>My Circles (close this hosting view before leaving)</span> : <Link href="/circles/mine">My Circles</Link>}</p>
    {hosting.recovery && !hosting.storageBlocked && <p style={small}>A sent creation reference is kept for this account in this tab session. You can leave for My Circles and return to check it. Private listing details are not saved. Clearing browser storage, closing the tab or using another device can lose that reference.</p>}
    {invalidContext && <p style={small}>The supplied book or reading selection could not be verified. It has not been used in this form. Choose a verified reading plan after checking hosting access.</p>}
    {initialContext && <p style={small}>{scripture
      ? `The ${scripture.shortTitle} study is selected for your first meeting. Check hosting access and verify the edition before listing.`
      : 'A public reader selection is available. After checking hosting access, explicitly choose it and verify the source edition before using it in the Circle.'}</p>}
    <div className={styles.row} style={{ marginBottom: '1rem' }}>
      <button type="button" style={button} disabled={disabled || hosting.phase === 'review' || !!created} onClick={hosting.load}>Check hosting access</button>
      {hosting.canCheckReceipt && <button type="button" style={button} disabled={disabled} onClick={hosting.checkReceipt}>Check earlier creation result</button>}
      {hosting.canRetry && <button type="button" style={button} disabled={disabled} onClick={hosting.retryRequest}>Review exact Circle creation retry</button>}
      <button type="button" style={button} disabled={disabled} onClick={hosting.close}>Close hosting view</button>
      {created && <Link href={`/circles/${created}`} style={primary}>Open my Circle</Link>}
    </div>
    {preview && <section aria-label="Review your Circle listing" className={styles.stack} style={card}>
      <h2 style={{ ...h2, margin: 0 }} ref={focusPreview} tabIndex={-1}>Review your Circle listing</h2>
      <p style={body}><strong>{preview.title}</strong></p>
      <p style={body}>{preview.format === 'online' ? 'Online' : `${preview.venueName}, ${preview.city}${preview.region ? `, ${preview.region}` : ''}`}. {WEEKDAYS[preview.weekday]}s at {preview.time} ({preview.timezone}). First meeting {firstMeeting(preview.startDate, preview.weekday)}; first week starts {preview.startDate}. Up to {preview.maxMembers} members.</p>
      <p style={body}>{preview.admissionMode==='host_approval'?'Only people you approve can join. The listing stays public; video-room entry remains the host’s responsibility.':'Members may join through the regular open-joining controls.'}</p>
      {preview.description && <p style={{ ...body, whiteSpace: 'pre-wrap' }}>{preview.description}</p>}
      {preview.onlineUrl && <p style={{ ...small, overflowWrap: 'anywhere' }}>Private video link, shared only with eligible members: {preview.onlineUrl}</p>}
      {preview.readingProgram ? <>
        <ReadingProgramSummary program={preview.readingProgram} proposal />
        {previewEdition && <p style={small}>{previewEdition.edition.attribution} <a href={previewEdition.edition.sourceCatalogUrl} target="_blank" rel="noreferrer">Source edition</a> · <a href={previewEdition.edition.licenseUrl} target="_blank" rel="noreferrer">Source license</a></p>}
      </> : <p style={small}>Reading plan: the existing twelve-week starter path.</p>}
      <p style={small}>The listing is public. Your account becomes the host and first member. Hosting remains attached to your account if you later leave; completion closes new joins and RSVPs without deleting posted messages.</p>
      <label className={styles.check}><input type="checkbox" checked={confirmed} disabled={disabled} onChange={event => hosting.check(event.target.checked)} />I checked the public listing, private video link and community norms, and want to create this free Circle.</label>
      <div className={styles.row}><button type="button" style={primary} disabled={disabled || !confirmed} onClick={hosting.confirm}>{hosting.retry ? 'Confirm exact Circle creation retry' : 'Confirm and list my Circle'}</button><button type="button" style={button} disabled={disabled} onClick={hosting.cancel}>{hosting.retry ? 'Cancel creation retry review' : 'Edit Circle details'}</button></div>
    </section>}
    {hosting.phase === 'editing' && hosting.access?.canCreate && <form onSubmit={review} style={card} noValidate>
      <fieldset disabled={disabled} className={styles.stack} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
        <legend style={h2}>Your Circle details</legend>
        <Field id="circle-admission-mode" label="Who can join"><select id="circle-admission-mode" value={draft.admissionMode} onChange={event=>edit('admissionMode',event.target.value)} style={input}><option value="open">Open joining</option><option value="host_approval">Host approval required</option></select></Field>
        <p style={small}>The salon name, description and schedule remain public. Host approval controls membership. Video-room entry must be managed separately by the host.</p>
        <ReadingProgramEditor key={editorEpoch} value={programDraft} context={initialContext} disabled={disabled} onChange={value => hosting.guardEdit(() => { draftGeneration.current++; setProgramDraft(value); })} />
        <Field id="circle-title" label="Circle name"><input id="circle-title" required minLength={4} maxLength={120} value={draft.title} onChange={event => edit('title', event.target.value)} style={input} autoComplete="off" /></Field>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend style={fieldLabel}>Where do you meet?</legend><div className={styles.row}>{([['in_person', 'In person'], ['online', 'Online'], ['hybrid', 'Both']] as const).map(([value, name]) => <label className={styles.check} key={value}><input type="radio" name="circle-format" value={value} checked={draft.format === value} onChange={() => edit('format', value)} />{name}</label>)}</div></fieldset>
        {draft.format !== 'online' && <>
          <Field id="circle-venue-type" label="Type of public place"><select id="circle-venue-type" value={draft.venueType} onChange={event => edit('venueType', event.target.value)} style={input}>{PUBLIC_VENUES.map(value => <option key={value} value={value}>{VENUE_LABELS[value]}</option>)}</select></Field>
          <Field id="circle-venue" label="Venue name"><input id="circle-venue" maxLength={120} required value={draft.venueName} onChange={event => edit('venueName', event.target.value)} style={input} /></Field><p style={small}>Public places only. Private homes cannot be listed.</p>
        </>}
        <div className={styles.columns}><Field id="circle-city" label={draft.format === 'online' ? 'City (optional)' : 'City'}><input id="circle-city" maxLength={80} value={draft.city} onChange={event => edit('city', event.target.value)} style={input} /></Field><Field id="circle-region" label="State or region (optional)"><input id="circle-region" maxLength={40} value={draft.region} onChange={event => edit('region', event.target.value)} style={input} /></Field></div>
        {draft.format !== 'in_person' && <Field id="circle-online" label="Private video link (https)"><input id="circle-online" type="url" inputMode="url" required maxLength={300} value={draft.onlineUrl} onChange={event => edit('onlineUrl', event.target.value)} style={input} aria-describedby="circle-online-help" /><p id="circle-online-help" style={small}>Only eligible members can see this link. Entering or reviewing it does not open the meeting.</p></Field>}
        <div className={styles.columns}><Field id="circle-weekday" label="Day"><select id="circle-weekday" value={draft.weekday} onChange={event => edit('weekday', event.target.value)} style={input}>{WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></Field><Field id="circle-time" label="Time"><input id="circle-time" type="time" value={draft.time} onChange={event => edit('time', event.target.value)} required style={input} /></Field><Field id="circle-timezone" label="Time zone"><select id="circle-timezone" value={draft.timezone} onChange={event => edit('timezone', event.target.value)} style={input}>{Object.entries(TIMEZONES).map(([zone, name]) => <option key={zone} value={zone}>{name}</option>)}</select></Field></div>
        <div className={styles.columns}><Field id="circle-start" label="First week starts"><input id="circle-start" type="date" value={draft.startDate} onChange={event => edit('startDate', event.target.value)} required style={input} /></Field><Field id="circle-size" label={`Size (${CIRCLE_MIN_MEMBERS}–${CIRCLE_MAX_MEMBERS})`}><input id="circle-size" type="number" min={CIRCLE_MIN_MEMBERS} max={CIRCLE_MAX_MEMBERS} value={draft.maxMembers} onChange={event => edit('maxMembers', event.target.value)} style={input} /></Field></div>
        <Field id="circle-description" label="A note for newcomers (optional)"><textarea id="circle-description" maxLength={600} rows={3} value={draft.description} onChange={event => edit('description', event.target.value)} style={{ ...input, resize: 'vertical' }} /></Field>
        <label className={styles.check}><input type="checkbox" checked={agreed} onChange={event => editDraft(() => setAgreed(event.target.checked))} /><span>I will use a public venue for in-person meetings, keep online links private, keep the Circle free, and follow the <Link href="/circles/norms">community norms</Link>.</span></label>
        <div className={styles.row}><button type="submit" style={primary}>Review my Circle listing</button><button type="button" style={button} onClick={hosting.clearDraft}>Clear Circle draft</button></div>
      </fieldset>
    </form>}
  </div>;
}
function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) { return <div><label htmlFor={id} style={fieldLabel}>{label}</label>{children}</div>; }

function firstMeeting(start: string, weekday: number) { const date = new Date(`${start}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + (weekday - date.getUTCDay() + 7) % 7); return date.toISOString().slice(0, 10); }
