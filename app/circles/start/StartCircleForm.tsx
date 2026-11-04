'use client';
import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import { useReviewAccess } from '@/lib/circles/useReviewAccess';
import { parseCircleStart, parseCircleCreateReceipt, parseCircleDetail } from '@/lib/circles/membership';
import { CIRCLE_MAX_MEMBERS, CIRCLE_MIN_MEMBERS, TIMEZONES, VENUE_LABELS, VENUE_TYPES, WEEKDAYS, validateCircleInput, type CircleFormat, type CircleInput } from '@/lib/circles/schedule';
import { body, button, card, fieldLabel, h2, input, primary, small } from '@/lib/circles/ui';
import { matchesReadingEdition, parseReadingProgram, readingStartHref, type ReadingContext, type ReadingProgram } from '@/lib/circles/reading-program';
import type { BookEditionResponse } from '@/lib/books/bookmarks';
import ReadingProgramEditor, { emptyReadingProgramDraft } from '../ReadingProgramEditor';
import ReadingProgramSummary from '../ReadingProgramSummary';
import styles from '../participation.module.css';

const PUBLIC_VENUES = VENUE_TYPES.filter(value => value !== 'online');
const emptyDraft = () => ({ title: '', description: '', format: 'in_person' as CircleFormat, city: '', region: '', venueName: '', venueType: 'library', weekday: '2', time: '19:00', timezone: 'America/New_York', startDate: '', maxMembers: '8', onlineUrl: '' });
type PreparedCircle = CircleInput & { readingProgram?: ReadingProgram };
type CreateRequest = PreparedCircle & { requestId: string };
type Eligibility = NonNullable<ReturnType<typeof parseCircleStart>>;

export default function StartCircleForm({ initialContext = null, invalidContext = false }: { initialContext?: ReadingContext | null; invalidContext?: boolean } = {}) {
  const [draft, setDraft] = useState(emptyDraft);
  const [agreed, setAgreed] = useState(false);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [preview, setPreview] = useState<PreparedCircle | null>(null);
  const [previewEdition, setPreviewEdition] = useState<BookEditionResponse | null>(null);
  const [programDraft, setProgramDraft] = useState(emptyReadingProgramDraft);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<CreateRequest | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [notice, setNotice] = useState('Check hosting access before entering your Circle details. No Circle is created by this check.');
  const sending = useRef(false);
  const focusPreview = useCallback((element: HTMLHeadingElement | null) => element?.focus({ preventScroll: true }), []);
  const clearDraft = useCallback(() => { setDraft(emptyDraft()); setAgreed(false); setPreview(null); setPreviewEdition(null); setProgramDraft(emptyReadingProgramDraft()); setEditorEpoch(value => value + 1); setConfirmed(false); }, []);
  const retire = useCallback(() => { clearDraft(); setEligibility(null); setPending(null); setCreated(null); sending.current = false; setNotice('Private details, draft and retry request cleared. Check hosting access to continue. A request already sent may still have created a Circle; check My Circles before listing another.'); }, [clearDraft]);
  const { active, busy, perform } = useReviewAccess(retire);
  const disabled = !active || busy;
  const edit = (key: keyof typeof draft, value: string) => { setDraft(previous => ({ ...previous, [key]: value, ...(key === 'format' && value === 'in_person' ? { onlineUrl: '' } : {}) })); setConfirmed(false); };
  function unavailable(status?: number) {
    setEligibility(null); setPreview(null); setPreviewEdition(null); setPending(null); setConfirmed(false);
    if (status === 401 || status === 403) clearDraft();
    setNotice(status === 401 ? 'Sign in or create a free account, then check hosting access again.' : status === 403 ? 'Hosting is not available for this account.' : status === 429 ? 'Hosting requests are temporarily limited. Wait before checking access again.' : status === 409 ? 'This request changed. Check My Circles before starting another Circle.' : 'Hosting access could not be confirmed. No empty hosting history or saved Circle is being assumed.');
  }
  function check(prepared: PreparedCircle | null = null, verifiedEdition: BookEditionResponse | null = null) {
    if (disabled || sending.current) return;
    setEligibility(null); setPreview(null); setPreviewEdition(null); setPending(null); setCreated(null); setConfirmed(false); setNotice('Checking current hosting access…');
    void perform('/api/circles/start', { method: 'GET' }, ({ status, body: value }) => {
      const current = status === 200 ? parseCircleStart(value) : null;
      if (!current) return unavailable(status);
      setEligibility(current);
      if (!current.canCreate) { setNotice(`Hosting is currently unavailable. You host ${current.activeHosted} active Circles; the limit is ${current.maxActiveHosted}. Review My Circles before listing another.`); return; }
      setPreview(prepared); setPreviewEdition(verifiedEdition); setNotice(prepared ? 'Current hosting access checked. Review these details before confirming your listing.' : 'Hosting access checked. Enter your details, then review the listing before creating it.');
    }, () => unavailable());
  }
  function review(event: React.FormEvent) {
    event.preventDefault(); if (disabled || pending || created) return;
    if (!agreed) { setNotice('Agree to the community norms before reviewing your listing.'); return; }
    const maxMembers = Number(draft.maxMembers);
    if (!Number.isInteger(maxMembers) || maxMembers < CIRCLE_MIN_MEMBERS || maxMembers > CIRCLE_MAX_MEMBERS) { setNotice(`Choose a Circle size between ${CIRCLE_MIN_MEMBERS} and ${CIRCLE_MAX_MEMBERS}.`); return; }
    const parsed = validateCircleInput({ ...draft, weekday: Number(draft.weekday), maxMembers });
    if (!parsed.ok) { setNotice(parsed.error); return; }
    const program = programDraft.custom ? parseReadingProgram(programDraft.program) : null;
    if (programDraft.custom && (!program || !programDraft.metadata || !matchesReadingEdition(programDraft.metadata, program))) { setNotice('Load and verify a pinned edition, then choose valid weekly reading ranges before reviewing this Circle.'); return; }
    check({ ...parsed.value, ...(program ? { readingProgram: program } : {}) }, program ? programDraft.metadata : null);
  }
  function send(request: CreateRequest) {
    if (disabled || sending.current) return;
    sending.current = true; setPending(null); setEligibility(null); clearDraft(); setNotice('Creating your Circle…');
    void perform('/api/circles', { method: 'POST', body: JSON.stringify(request) }, ({ status, body: value }) => {
      sending.current = false;
      const receipt = status === 200 || status === 201 ? parseCircleCreateReceipt(value) : null;
      if (receipt && receipt.requestId === request.requestId) {
        setCreated(receipt.circleId); setNotice('Circle creation confirmed. Checking current Circle state…');
        void perform(`/api/circles/${receipt.circleId}`, { method: 'GET' }, ({ status: readStatus, body: readBody }) => {
          const current = readStatus === 200 ? parseCircleDetail(readBody, receipt.circleId) : null;
          setNotice(current && current.revision >= receipt.state.revision ? 'Circle creation confirmed and current state checked. Open your Circle to review its latest details.' : 'Circle creation was confirmed, but current access could not be checked. Open your Circle or My Circles before making another change.');
        }, () => setNotice('Circle creation was confirmed, but current access could not be checked. Open your Circle or My Circles before making another change.'));
      } else if ([400, 401, 403, 409, 413, 429].includes(status)) unavailable(status);
      else { setPending(request); setNotice('The creation reply could not be confirmed. A Circle may have been created. Retry this exact request manually, or check My Circles before starting another.'); }
    }, sent => { sending.current = false; setPending(request); setNotice(sent ? 'The creation reply was lost. A Circle may have been created. Retry this exact request manually, or check My Circles before starting another.' : 'The creation request was not sent. You can retry this exact request manually.'); });
  }
  const returnPath = initialContext ? readingStartHref(initialContext) : '/circles/start';
  const encodedReturn = initialContext ? encodeURIComponent(returnPath) : returnPath;
  return <div className={styles.scope}>
    <p role="status" aria-live="polite" style={{ ...body, marginBottom: '1rem' }}>{notice}</p>
    <p style={{ ...small, marginBottom: '1rem' }}><Link href={`/login?next=${encodedReturn}`}>Sign in</Link> · <Link href={`/login?mode=signup&next=${encodedReturn}`}>Create a free account</Link> · <Link href="/circles/mine">My Circles</Link></p>
    {invalidContext && <p style={small}>The supplied book or reading selection could not be verified. It has not been used in this form. Choose a verified reading plan after checking hosting access.</p>}
    {initialContext && <p style={small}>A public reader selection is available. After checking hosting access, explicitly choose it and verify the source edition before using it in the Circle.</p>}
    <div className={styles.row} style={{ marginBottom: '1rem' }}>
      <button type="button" style={button} disabled={disabled || !!pending || !!created} onClick={() => check()}>Check hosting access</button>
      {pending && <button type="button" style={button} disabled={disabled} onClick={() => send(pending)}>Retry exact Circle creation</button>}
      {created && <Link href={`/circles/${created}`} style={primary}>Open my Circle</Link>}
    </div>
    {preview && <section aria-label="Review your Circle listing" className={styles.stack} style={card}>
      <h2 style={{ ...h2, margin: 0 }} ref={focusPreview} tabIndex={-1}>Review your Circle listing</h2>
      <p style={body}><strong>{preview.title}</strong></p>
      <p style={body}>{preview.format === 'online' ? 'Online' : `${preview.venueName}, ${preview.city}${preview.region ? `, ${preview.region}` : ''}`}. {WEEKDAYS[preview.weekday]}s at {preview.time} ({preview.timezone}). Starts {preview.startDate}. Up to {preview.maxMembers} members.</p>
      {preview.description && <p style={{ ...body, whiteSpace: 'pre-wrap' }}>{preview.description}</p>}
      {preview.onlineUrl && <p style={{ ...small, overflowWrap: 'anywhere' }}>Private video link, shared only with eligible members: {preview.onlineUrl}</p>}
      {preview.readingProgram ? <>
        <ReadingProgramSummary program={preview.readingProgram} proposal />
        {previewEdition && <p style={small}>{previewEdition.edition.attribution} <a href={previewEdition.edition.sourceCatalogUrl}>Source edition</a> · <a href={previewEdition.edition.licenseUrl}>Source license</a></p>}
      </> : <p style={small}>Reading plan: the existing twelve-week starter path.</p>}
      <p style={small}>The listing is public. Your account becomes the host and first member. Hosting remains attached to your account if you later leave; completion closes new joins and RSVPs without deleting posted messages.</p>
      <label className={styles.check}><input type="checkbox" checked={confirmed} disabled={disabled} onChange={event => setConfirmed(event.target.checked)} />I checked the public listing, private video link and community norms, and want to create this free Circle.</label>
      <div className={styles.row}><button type="button" style={primary} disabled={disabled || !confirmed} onClick={() => send({ ...preview, requestId: crypto.randomUUID() })}>Confirm and list my Circle</button><button type="button" style={button} disabled={disabled} onClick={() => { setPreview(null); setConfirmed(false); }}>Edit Circle details</button></div>
    </section>}
    {eligibility?.canCreate && !preview && !created && <form onSubmit={review} style={card} noValidate>
      <fieldset disabled={disabled} className={styles.stack} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
        <legend style={h2}>Your Circle details</legend>
        <ReadingProgramEditor key={editorEpoch} value={programDraft} context={initialContext} disabled={disabled} onChange={value => { setProgramDraft(value); setConfirmed(false); }} />
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
        <label className={styles.check}><input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} /><span>I will meet only in public places, keep the Circle free, and follow the <Link href="/circles/norms">community norms</Link>.</span></label>
        <div className={styles.row}><button type="submit" style={primary}>Review my Circle listing</button><button type="button" style={button} onClick={clearDraft}>Clear Circle draft</button></div>
      </fieldset>
    </form>}
  </div>;
}
function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) { return <div><label htmlFor={id} style={fieldLabel}>{label}</label>{children}</div>; }
