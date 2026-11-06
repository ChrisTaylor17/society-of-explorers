import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { CircleHosting } from '../shared/circle-hosting';
import type { CircleReadingConfig } from '../shared/circle-reading';
import { getReadingWork, READING_EDITIONS, parseReadingProgram, readingEditionLabel, readingSessionLabel, type ReadingContext } from '../../lib/circles/reading-program';
import { PHILEMON_READING, PHILEMON_RIGHTS } from '../../lib/root-kernel/philemon-edition';
import { CIRCLE_FORMATS, FORMAT_LABELS, VENUE_TYPES, VENUE_LABELS, WEEKDAYS, TIMEZONES, firstMeeting, formatDay, type CircleInput } from '../../lib/circles/schedule';
import { observeNativeConnectivity, type NativeConnectivityPort } from './src/circles/native-connectivity';
import { CircleCommunityNorms } from './CircleCommunityNorms';
import { CircleReadingScreen } from './CircleReadingScreen';

const emptyDraft = (onlinePreset = false) => ({ title: '', description: '', format: onlinePreset ? 'online' : 'in_person', city: '', region: '', venueName: '', venueType: 'library',
  weekday: '2', time: '19:00', timezone: 'America/New_York', startDate: '', maxMembers: '8', onlineUrl: '' });
type Draft = ReturnType<typeof emptyDraft>;
type Range = { from: string; to: string };

/** The parent retains only the owned controller. Unsent fields are cleared on
 * retirement; a sent, unresolved request survives privately for exact retry. */
export function CircleHostingScreen({ session, config, connectivity, philemonPreset = false, onBack, onMyCircles, onClose }: {
  session: CircleHosting; config: Omit<CircleReadingConfig, 'context'>; connectivity?: NativeConnectivityPort; philemonPreset?: boolean;
  onBack(): void; onMyCircles(): void; onClose(): void;
}) {
  const [snapshot, setSnapshot] = useState(() => ({ session, model: session.model() }));
  const defaultBook = philemonPreset ? PHILEMON_READING.bookId : READING_EDITIONS[0].bookId;
  const [draft, setDraft] = useState(() => emptyDraft(philemonPreset)), [norms, setNorms] = useState(false);
  const [custom, setCustom] = useState(philemonPreset), [bookId, setBookId] = useState(defaultBook);
  const [ranges, setRanges] = useState<Range[]>([]), [rangeNotice, setRangeNotice] = useState('');
  const [headings, setHeadings] = useState(false), [reading, setReading] = useState<ReadingContext | null>(null);
  const [viewEpoch, setViewEpoch] = useState(0), viewLife = useRef({ mounted: false, enabled: false, epoch: 0 });
  const m = snapshot.session === session ? snapshot.model : session.model();
  const edition = m.edition?.bookId === bookId ? m.edition : null;
  const readingConfig = useMemo(() => reading ? { ...config, context: reading } : null, [config, reading]);
  const clearDraft = useCallback(() => { setDraft(emptyDraft(philemonPreset)); setNorms(false); setCustom(philemonPreset); setBookId(defaultBook);
    setRanges([]); setRangeNotice(''); setHeadings(false); setReading(null); }, [defaultBook, philemonPreset]);
  useLayoutEffect(() => {
    const life = viewLife.current; life.mounted = true; life.enabled = false; setViewEpoch(++life.epoch);
    let signature = '', loadedEdition: string | null = null;
    const off = session.subscribe(model => {
      const enabled = model.connected && model.active && model.online;
      const next = JSON.stringify([model.phase, model.review, model.confirmed, model.created, model.edition?.bookId]);
      if (signature !== next || life.enabled !== enabled || !enabled) setViewEpoch(++life.epoch);
      signature = next; life.enabled = enabled; setSnapshot({ session, model });
      if (!enabled || model.phase === 'idle' || model.phase === 'closed' || model.phase === 'unavailable') { clearDraft(); loadedEdition = null; }
      if (model.phase === 'loading-edition' && !model.edition) loadedEdition = null;
      if (enabled && model.edition && loadedEdition !== model.edition.edition.editionId) {
        loadedEdition = model.edition.edition.editionId;
        setRanges([{ from: '1', to: String(model.edition.edition.blockCount) }]);
      }
    });
    let mounted = true, active = false, blurred = false;
    const sync = () => { if (mounted) session.activity(active && !blurred); };
    session.activity(false); session.connectivity(false);
    const change = AppState.addEventListener('change', value => { active = value === 'active'; sync(); });
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => { blurred = true; sync(); }) : null;
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => { blurred = false; active = AppState.currentState === 'active'; sync(); }) : null;
    active = AppState.currentState === 'active'; sync();
    const offConnectivity = observeNativeConnectivity(connectivity, value => { if (mounted) session.connectivity(value === 'online'); });
    active = AppState.currentState === 'active'; sync(); session.connect();
    return () => { mounted = false; life.mounted = false; life.enabled = false; ++life.epoch;
      off(); session.disconnect(); offConnectivity(); change.remove(); blur?.remove(); focus?.remove(); };
  }, [session, connectivity, clearDraft]);
  // A callback from an earlier form render cannot review an older listing or
  // open a reading range after the member has changed that local intent.
  useLayoutEffect(() => { setViewEpoch(++viewLife.current.epoch); }, [reading, draft, norms, custom, bookId, ranges]);
  const act = (work: () => void, allowInactive = false) => {
    const life = viewLife.current;
    if (life.mounted && life.epoch === viewEpoch && (allowInactive || life.enabled)) work();
  };
  const close = () => act(() => { session.close(); clearDraft(); onClose(); }, true);
  const setField = (key: keyof Draft, value: string) => act(() => { if (session.model().canEdit) setDraft(current => ({ ...current, [key]: value })); });
  const rangeProgram = () => edition && ranges.length > 0 && ranges.every(r => /^[1-9]\d{0,5}$/.test(r.from) && /^[1-9]\d{0,5}$/.test(r.to))
    ? parseReadingProgram({ version: 1, bookId, editionId: edition.edition.editionId,
      sessions: ranges.map(r => ({ from: Number(r.from) - 1, to: Number(r.to) - 1 })) }) : null;
  const prepare = () => act(() => {
    if (!session.model().canReview) return;
    if (!/^([3-9]|1[0-2])$/.test(draft.maxMembers)) { setRangeNotice('Choose a whole group size from 3 to 12, including you.'); return; }
    const program = custom ? rangeProgram() : null;
    if (custom && !program) { setRangeNotice('Load the chosen edition, then enter 1–12 weekly ranges within its reading positions. Each end must follow or equal its start.'); return; }
    setRangeNotice(''); void session.review({ ...draft, weekday: Number(draft.weekday), maxMembers: Number(draft.maxMembers),
      ...(program ? { readingProgram: program } : {}) }, norms);
  });
  const preview = (index: number) => act(() => {
    if (!session.model().canEdit || !config.passageTransport) return;
    const program = rangeProgram(), range = program?.sessions[index];
    if (!program || !range) { setRangeNotice('Check the reading positions before opening this selection.'); return; }
    setReading({ bookId: program.bookId, editionId: program.editionId, ...range });
  });
  if (readingConfig && m.connected && m.active && m.online && m.canEdit) return <CircleReadingScreen config={readingConfig} connectivity={connectivity}
    backLabel="Back to Circle draft" onBack={() => act(() => setReading(null), true)} onClose={close}/>;
  const field = (key: keyof Draft, label: string, maxLength: number, multiline = false) =>
    <Field label={label} value={draft[key]} maxLength={maxLength} multiline={multiline} editable={m.canEdit} onChange={value => setField(key, value)}/>;
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.eyebrow}>SOCIETY OF EXPLORERS · HOSTING</Text>
    <Text accessibilityRole="header" style={styles.title}>Start a Circle</Text>
    <Text style={styles.copy}>Host a free weekly reading group of 3–12 people. Your title, description, public meeting place, schedule, reading plan and host display name will be listed for others to discover.</Text>
    <Text accessibilityLiveRegion="polite" style={styles.copy}>{m.message}</Text>
    <Action label="Check hosting access" disabled={!m.canCheck} onPress={() => act(() => void session.check())}/>
    {m.eligibility && !m.created ? <Text style={styles.note}>Active Circles at your last hosting check: {m.eligibility.activeHosted} of {m.eligibility.maxActiveHosted}. A separate daily creation limit also applies.</Text> : null}
    {m.phase === 'editing' && m.eligibility?.canCreate ? <View style={styles.list}>
      {field('title', 'Circle name', 120)}
      {field('description', 'Description (optional)', 600, true)}
      <Text accessibilityRole="header" style={styles.heading}>Where you meet</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Meeting format" style={styles.list}>
        {CIRCLE_FORMATS.map(value => <Choice key={value} label={FORMAT_LABELS[value]} checked={draft.format === value} disabled={!m.canEdit} onPress={() => setField('format', value)}/>)}
      </View>
      {field('city', draft.format === 'online' ? 'City (optional)' : 'City', 80)}{field('region', 'State or region (optional)', 40)}
      {draft.format !== 'online' ? <>
        <View accessibilityRole="radiogroup" accessibilityLabel="Public venue type" style={styles.list}>
          {VENUE_TYPES.filter(value => value !== 'online').map(value => <Choice key={value} label={VENUE_LABELS[value]} checked={draft.venueType === value} disabled={!m.canEdit} onPress={() => setField('venueType', value)}/>)}
        </View>
        {field('venueName', 'Public venue name', 120)}
        <Text style={styles.note}>Choose a public meeting place. Do not list a home address. Check the venue’s access and booking arrangements before inviting members.</Text>
      </> : null}
      {draft.format !== 'in_person' ? <>{field('onlineUrl', 'Private meeting link (HTTPS)', 300)}
        <Text style={styles.note}>This link is shared with Circle members, not the public listing. Keep meeting links and passwords out of the public description.</Text></> : null}
      <Text accessibilityRole="header" style={styles.heading}>Weekly schedule</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Meeting weekday" style={styles.list}>
        {WEEKDAYS.map((day, index) => <Choice key={day} label={day} checked={draft.weekday === String(index)} disabled={!m.canEdit} onPress={() => setField('weekday', String(index))}/>)}
      </View>
      {field('time', 'Meeting time (24-hour HH:MM)', 5)}
      <View accessibilityRole="radiogroup" accessibilityLabel="Meeting time zone" style={styles.list}>
        {Object.entries(TIMEZONES).map(([value, label]) => <Choice key={value} label={`${label} · ${value}`} checked={draft.timezone === value} disabled={!m.canEdit} onPress={() => setField('timezone', value)}/>)}
      </View>
      {field('startDate', 'Start on or after (YYYY-MM-DD)', 10)}
      <Text style={styles.note}>Choose today or a date within 180 days in the meeting time zone. The first meeting falls on the selected weekday on or after this date; review its exact date before listing.</Text>
      {field('maxMembers', 'Group size, including you (3–12)', 2)}
      <Text accessibilityRole="header" style={styles.heading}>Agreed reading</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Reading plan" style={styles.list}>
        <Choice label="Starter 12-week reading path" checked={!custom} disabled={!m.canEdit} onPress={() => act(() => { if (session.model().canEdit) setCustom(false); })}/>
        <Choice label="Choose a book and weekly selections" checked={custom} disabled={!m.canEdit} onPress={() => act(() => { if (session.model().canEdit) setCustom(true); })}/>
      </View>
      {!custom ? <Text style={styles.note}>Use the shared 12-week starter path. Members can see each current selection in the Circle.</Text> : <>
        <View accessibilityRole="radiogroup" accessibilityLabel="Source book" style={styles.list}>
          {READING_EDITIONS.map(book => <Choice key={book.bookId} label={getReadingWork(book.bookId)?.title ?? book.sourceTitle} checked={bookId === book.bookId} disabled={!m.canEdit}
            onPress={() => act(() => { if (session.model().canEdit) { setBookId(book.bookId); setRanges([]); setHeadings(false); setRangeNotice(''); } })}/>)}
        </View>
        <Action label="Load source edition" disabled={!m.canLoadEdition} onPress={() => act(() => void session.loadEdition(bookId))}/>
        {edition ? <View style={styles.card}>
          <Text style={styles.copy}>{readingEditionLabel({ bookId, editionId: edition.edition.editionId })}</Text>
          <Text style={styles.note}>{edition.edition.attribution}</Text>
          {edition.edition.editors.length ? <Text style={styles.note}>Editors: {edition.edition.editors.join(', ')}</Text> : null}
          {edition.edition.illustrators.length ? <Text style={styles.note}>Illustrators: {edition.edition.illustrators.join(', ')}</Text> : null}
          <Text style={styles.note}>Reading positions 1–{edition.edition.blockCount}. Select 1–12 weekly ranges, including any opening pages you want to read.</Text>
          <Text selectable style={styles.note}>Source: {edition.edition.sourceCatalogUrl}</Text>
          <Text selectable style={styles.note}>License: {edition.edition.licenseUrl}</Text>
          <Text style={styles.note}>{edition.edition.licenseNotice}</Text>
          {edition.edition.editionNotes.map((note, index) => <Text key={index} style={styles.note}>{note}</Text>)}
          {edition.bookId !== PHILEMON_READING.bookId ? <Text style={styles.note}>Public domain in the United States according to Project Gutenberg. Rights outside the US have not been assessed; check local rules before use.</Text> : null}
          <Action label={headings ? 'Hide source headings' : 'Show source headings'} disabled={!m.canEdit} onPress={() => act(() => setHeadings(!headings))}/>
          {headings ? edition.edition.contents.map(heading => <Text key={heading.id} style={styles.note}>{heading.label} · {heading.readingIndex === null ? 'No text position' : `position ${heading.readingIndex + 1}`}</Text>) : null}
          {ranges.map((range, index) => <View key={index} style={styles.card}>
            <Text accessibilityRole="header" style={styles.heading}>Week {index + 1}</Text>
            <Field label={`Week ${index + 1} first reading position`} value={range.from} maxLength={6} editable={m.canEdit}
              onChange={value => act(() => { if (session.model().canEdit) setRanges(rows => rows.map((row, i) => i === index ? { ...row, from: value } : row)); })}/>
            <Field label={`Week ${index + 1} last reading position`} value={range.to} maxLength={6} editable={m.canEdit}
              onChange={value => act(() => { if (session.model().canEdit) setRanges(rows => rows.map((row, i) => i === index ? { ...row, to: value } : row)); })}/>
            {config.passageTransport ? <Action label={`Read week ${index + 1} selection`} disabled={!m.canEdit} onPress={() => preview(index)}/> : null}
            <Action label={`Remove week ${index + 1}`} disabled={!m.canEdit || ranges.length < 2} onPress={() => act(() => { if (session.model().canEdit) setRanges(rows => rows.filter((_, i) => i !== index)); })}/>
          </View>)}
          <Action label="Add another reading week" disabled={!m.canEdit || ranges.length >= 12} onPress={() => act(() => {
            if (session.model().canEdit) setRanges(rows => rows.length < 12 ? [...rows, { ...(rows[rows.length - 1] ?? { from: '1', to: String(edition.edition.blockCount) }) }] : rows);
          })}/>
        </View> : null}
      </>}
      {rangeNotice ? <Text accessibilityLiveRegion="polite" style={styles.copy}>{rangeNotice}</Text> : null}
      <CircleCommunityNorms/>
      <Text style={styles.copy}>Hosting is voluntary and free. Welcome different views, share facilitation, and keep members’ personal details and meeting links private. Leaving a Circle does not transfer your hosting responsibility.</Text>
      <Check label="I agree to the community norms and to host this free Circle" checked={norms} disabled={!m.canEdit} onPress={() => act(() => { if (session.model().canEdit) setNorms(!norms); })}/>
      <Action label="Review Circle listing" disabled={!m.canReview || !norms} onPress={prepare}/>
    </View> : null}
    {m.phase === 'review' && m.review ? <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>{m.retryReview ? 'Review the original Circle request' : 'Review your Circle listing'}</Text>
      <ListingReview input={m.review}/>
      <CircleCommunityNorms/>
      <Text style={styles.copy}>Creating this Circle lists the public details above and joins you as its host. It is free to join. The private meeting link is for members. Hosting responsibility stays with you if you later leave.</Text>
      <Check label="Create this free Circle with my account" checked={m.confirmed} disabled={m.busy} onPress={() => act(() => session.confirm(!m.confirmed))}/>
      <Action label={m.retryReview ? 'Confirm exact Circle creation retry' : 'Confirm and list Circle'} disabled={!m.canConfirm} onPress={() => act(() => void session.create())}/>
      <Action label="Cancel Circle review" disabled={!m.canCancel} onPress={() => act(() => session.cancel())}/>
    </View> : null}
    {m.phase === 'unknown' ? <Action label="Review exact Circle creation retry" disabled={!m.canRetry} onPress={() => act(() => void session.reviewRetry())}/> : null}
    {m.created ? <View style={styles.card}>
      <Text style={styles.copy}>{m.created.current ? 'Your Circle was created and your current hosting access is verified.' : 'Your creation receipt is confirmed. Current hosting access still needs to be checked.'}</Text>
      <Action label="Check created Circle" disabled={!m.canCheckCreated} onPress={() => act(() => void session.checkCreated())}/>
      <Action label="View my Circles" disabled={!m.canNavigate} onPress={() => act(() => { if (session.model().canNavigate) onMyCircles(); })}/>
      <Action label="New Circle draft" disabled={!m.canStartAnother} onPress={() => act(() => { if (session.model().canStartAnother) { session.startAnother(); clearDraft(); } })}/>
    </View> : null}
    <Action label="Return to member account" disabled={!m.canNavigate} onPress={() => act(() => { if (session.model().canNavigate) onBack(); }, true)}/>
    <Text style={styles.note}>Closing the member view discards local retry information. A creation request already sent may still finish; check My Circles before creating another.</Text>
    <Action label="Close member view" onPress={close}/>
  </ScrollView></SafeAreaView>;
}

function ListingReview({ input }: { input: CircleInput }) {
  const first = firstMeeting(input.startDate, input.weekday), program = input.readingProgram;
  return <View style={styles.list}>
    <Text style={styles.copy}>{input.title}</Text>
    {input.description ? <Text style={styles.copy}>{input.description}</Text> : null}
    <Text style={styles.copy}>{FORMAT_LABELS[input.format]} · {VENUE_LABELS[input.venueType]}</Text>
    {input.venueName ? <Text style={styles.copy}>{input.venueName}</Text> : null}
    {input.city || input.region ? <Text style={styles.copy}>{[input.city, input.region].filter(Boolean).join(', ')}</Text> : null}
    <Text style={styles.copy}>{WEEKDAYS[input.weekday]} at {input.time} ({input.timezone}) · Up to {input.maxMembers} members</Text>
    <Text style={styles.copy}>First meeting: {formatDay(first)}, {first.slice(0, 4)} ({first})</Text>
    {input.onlineUrl ? <Text selectable style={styles.copy}>Private meeting link: {input.onlineUrl}</Text> : null}
    {program ? <>
      <Text style={styles.copy}>{readingEditionLabel(program)}</Text>
      {program.sessions.map((range, index) => <Text key={index} style={styles.note}>Week {index + 1}: {readingSessionLabel(program, range)} · positions {range.from + 1}–{range.to + 1}</Text>)}
      <Text style={styles.note}>{program.bookId === PHILEMON_READING.bookId ? PHILEMON_RIGHTS
        : 'Project Gutenberg edition. Public domain in the US; rights elsewhere are not assessed.'}</Text>
    </> : <Text style={styles.copy}>Shared 12-week starter reading path</Text>}
  </View>;
}
function Field({ label, value, editable, maxLength, multiline = false, onChange }: { label: string; value: string; editable: boolean; maxLength: number; multiline?: boolean; onChange(value: string): void }) {
  return <View style={styles.list}><Text style={styles.copy}>{label}</Text><TextInput accessibilityLabel={label} value={value} editable={editable} multiline={multiline}
    onChangeText={onChange} maxLength={maxLength} autoCorrect={false} autoComplete="off" autoCapitalize="none" style={[styles.input, !editable && styles.disabled]}/></View>;
}
function Action({ label, disabled = false, onPress }: { label: string; disabled?: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{ disabled }} onPress={onPress}
    style={[styles.button, disabled && styles.disabled]}><Text style={styles.copy}>{label}</Text></Pressable>;
}
function Choice({ label, checked, disabled, onPress }: { label: string; checked: boolean; disabled: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked, disabled }} disabled={disabled} onPress={onPress}
    style={[styles.button, disabled && styles.disabled]}><Text style={styles.copy}>{checked ? '● ' : '○ '}{label}</Text></Pressable>;
}
function Check({ label, checked, disabled, onPress }: { label: string; checked: boolean; disabled: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked, disabled }} disabled={disabled} onPress={onPress}
    style={[styles.button, disabled && styles.disabled]}><Text style={styles.copy}>{checked ? '☑ ' : '☐ '}{label}</Text></Pressable>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#101d1a' }, content: { padding: 24, gap: 20 },
  eyebrow: { color: '#e8cb8d', fontSize: 13, letterSpacing: 1.4 }, title: { color: '#f4f2e5', fontSize: 32, lineHeight: 40 },
  heading: { color: '#f4f2e5', fontSize: 23, lineHeight: 30 }, copy: { color: '#e9eadf', fontSize: 17, lineHeight: 26 },
  note: { color: '#c0cbbf', fontSize: 15, lineHeight: 23 }, list: { gap: 16 }, card: { padding: 16, gap: 16, borderWidth: 1, borderColor: '#536d61', borderRadius: 8 },
  input: { color: '#f4f2e5', backgroundColor: '#182e26', borderWidth: 1, borderColor: '#b1c1b5', borderRadius: 8, padding: 14, minHeight: 48, fontSize: 17 },
  button: { backgroundColor: '#294e3c', borderWidth: 1, borderColor: '#b1c1b5', borderRadius: 8, padding: 14, minHeight: 48 }, disabled: { opacity: 0.5 } });
