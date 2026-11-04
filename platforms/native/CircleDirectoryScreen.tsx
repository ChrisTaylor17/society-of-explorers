import { useLayoutEffect, useMemo, useState } from 'react';
import { AppState, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createCircleDirectory, type CircleDirectoryConfig } from '../shared/circle-directory';
import { parseDiscoveryPageRequest } from '../../lib/circles/discovery-page';
import { readingEditionLabel, readingSessionLabel, starterReadingContext } from '../../lib/circles/reading-program';
import type { CirclePublicSummary } from '../../lib/circles/membership';
import { observeNativeConnectivity, type NativeConnectivityPort } from './src/circles/native-connectivity';
import { CircleScreen } from './CircleScreen';

export function CircleDirectoryScreen({ config, connectivity, initialMode = 'discover', onBack, onClose }: {
  config: CircleDirectoryConfig; connectivity?: NativeConnectivityPort; initialMode?: 'discover' | 'mine'; onBack(): void; onClose(): void;
}) {
  const connection = useMemo(() => {
    try { return { session: createCircleDirectory({ ...config, initialOnline: false }), config, connectivity }; }
    catch { return null; }
  }, [config, connectivity]);
  const [snapshot, setSnapshot] = useState(() => ({ connection, model: connection?.session.model() }));
  const [mode, setMode] = useState(initialMode);
  const [q, setQ] = useState(''), [city, setCity] = useState('');
  const [format, setFormat] = useState(''), [open, setOpen] = useState(false), [sort, setSort] = useState('next');
  const [filterError, setFilterError] = useState('');
  const [discussion, setDiscussion] = useState<{ connection: NonNullable<typeof connection>; circleId: string } | null>(null);
  const m = snapshot.connection === connection ? snapshot.model : connection?.session.model(), session = connection?.session;
  const discussionConfig = useMemo(() => discussion ? { ...discussion.connection.config, circleId: discussion.circleId } : null, [discussion]);
  useLayoutEffect(() => {
    if (!connection) return;
    const { session } = connection;
    const off = session.subscribe(model => {
      setSnapshot({ connection, model });
      if (!model.canOpenDiscussion) setDiscussion(null);
    });
    let mounted = true, active = false, blurred = false;
    const sync = () => { if (mounted) session.activity(active && !blurred); };
    session.activity(false); session.connectivity(false);
    const change = AppState.addEventListener('change', value => { active = value === 'active'; sync(); });
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => { blurred = true; sync(); }) : null;
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => { blurred = false; active = AppState.currentState === 'active'; sync(); }) : null;
    active = AppState.currentState === 'active'; sync();
    const offConnectivity = observeNativeConnectivity(connection.connectivity, value => { if (mounted) session.connectivity(value === 'online'); });
    active = AppState.currentState === 'active'; sync(); session.connect();
    return () => { mounted = false; session.disconnect(); offConnectivity(); off(); change.remove(); blur?.remove(); focus?.remove(); };
  }, [connection]);
  const close = () => { session?.close(); setDiscussion(null); onClose(); };
  const back = () => { if (session?.model().canNavigate) { session.close(); onBack(); } };
  const search = () => {
    const params = new URLSearchParams({ q, city, format, open: open ? '1' : '0', sort });
    const request = parseDiscoveryPageRequest(params);
    if (!request.ok) { setFilterError('Check the search words and city, then try again.'); return; }
    setFilterError(''); void session?.search(request.value);
  };
  if (discussion && discussion.connection === connection && m?.canOpenDiscussion && discussionConfig) {
    return <CircleScreen config={discussionConfig} connectivity={connectivity} onClose={close}
      onBack={() => { setDiscussion(null); void session?.refresh(); }}/>;
  }
  const detail = m?.detail, circle = detail?.circle, management = m?.management;
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.eyebrow}>SOCIETY OF EXPLORERS · CIRCLES</Text>
    <Text accessibilityRole="header" style={styles.title}>{m?.selected ? circle?.title ?? management?.circle.title ?? 'Your Circle' : mode === 'mine' ? 'My Circles' : 'Discover Circles'}</Text>
    <Text accessibilityLiveRegion="polite" style={styles.copy}>{m?.message ?? 'The Circle connection is unavailable. Return to your member account and check again.'}</Text>
    {!m?.selected ? <>
      <View accessibilityRole="radiogroup" accessibilityLabel="Circle list" style={styles.list}>
        <Choice label="Discover Circles" checked={mode === 'discover'} disabled={!m?.canNavigate} onPress={() => setMode('discover')}/>
        <Choice label="My Circles" checked={mode === 'mine'} disabled={!m?.canNavigate} onPress={() => setMode('mine')}/>
      </View>
      {mode === 'discover' ? <>
        <Text style={styles.copy}>Find a small group to read and discuss with. Search results are public; opening a Circle checks your current membership.</Text>
        <Field label="Search words" value={q} maxLength={160} editable={Boolean(m?.canSearch)} onChange={setQ}/>
        <Field label="City" value={city} maxLength={80} editable={Boolean(m?.canSearch)} onChange={setCity}/>
        <Text accessibilityRole="header" style={styles.heading}>Meeting format</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Meeting format" style={styles.list}>
          {[['', 'Any format'], ['in_person', 'In person'], ['online', 'Online']].map(([value, label]) =>
            <Choice key={value} label={label} checked={format === value} disabled={!m?.canSearch} onPress={() => setFormat(value)}/>)}
        </View>
        <Pressable accessibilityRole="checkbox" accessibilityLabel="Only Circles with space" accessibilityState={{ checked: open, disabled: !m?.canSearch }}
          disabled={!m?.canSearch} onPress={() => setOpen(!open)} style={[styles.button, !m?.canSearch && styles.disabled]}>
          <Text style={styles.copy}>{open ? '☑ ' : '☐ '}Only Circles with space</Text>
        </Pressable>
        <View accessibilityRole="radiogroup" accessibilityLabel="Sort Circles" style={styles.list}>
          <Choice label="Next meeting first" checked={sort === 'next'} disabled={!m?.canSearch} onPress={() => setSort('next')}/>
          <Choice label="Title A–Z" checked={sort === 'title'} disabled={!m?.canSearch} onPress={() => setSort('title')}/>
        </View>
        {filterError ? <Text accessibilityLiveRegion="polite" style={styles.copy}>{filterError}</Text> : null}
        <Action label="Search Circles" disabled={!m?.canSearch} onPress={search}/>
        {m?.page ? <View style={styles.list}>
          <Text style={styles.note}>One page of results. Change the filters and choose Search Circles to start a new search.</Text>
          {m.page.circles.length === 0 ? <Text style={styles.copy}>No Circles returned on this page. Try fewer words or another city.</Text> : null}
          {m.page.circles.map(item => <View key={item.id} style={styles.card}>
            <Text accessibilityRole="header" style={styles.heading}>{item.title}</Text>
            {item.description ? <Text style={styles.copy}>{item.description}</Text> : null}
            <Text style={styles.note}>{item.meeting_label} · {item.venue_label}</Text>
            <Text style={styles.note}>{item.spots_left} spaces available · Hosted by {item.host_name}</Text>
            <Action label={`View Circle: ${item.title}`} disabled={!m.canSelect} onPress={() => void session?.select(item.id)}/>
          </View>)}
          {m.page.page.nextCursor ? <Action label="Next Circles" disabled={!m.canNextPage} onPress={() => void session?.nextPage()}/> : null}
        </View> : null}
        <Action label="Restart Circle search" disabled={!m?.canFirstPage} onPress={() => void session?.firstPage()}/>
      </> : <>
        <Text style={styles.copy}>Find Circles you joined or host, including groups no longer listed publicly. Membership controls remain available when a listing cannot be shown.</Text>
        <Action label="Load my Circles" disabled={!m?.canMine} onPress={() => void session?.mine()}/>
        {m?.mine ? <View style={styles.list}>
          {m.mine.items.length === 0 ? <Text style={styles.copy}>No Circles returned on this page. Discover a Circle to get started.</Text> : null}
          {m.mine.items.map(item => <View key={item.circle.id} style={styles.card}>
            <Text accessibilityRole="header" style={styles.heading}>{item.circle.title ?? 'Circle membership'}</Text>
            <Text style={styles.note}>{item.circle.hidden ? 'Listing hidden. You can still review your membership.' : item.kind === 'management' ? 'Listing unavailable. Membership controls are available.' : item.ended ? 'This Circle has ended.' : item.circle.meeting_label}</Text>
            <Action label={`View Circle: ${item.circle.title ?? 'Circle membership'}`} disabled={!m.canSelect} onPress={() => void session?.select(item.circle.id)}/>
          </View>)}
          {m.mine.nextCursor ? <Action label="Next page of my Circles" disabled={!m.canMine} onPress={() => void session?.mine(m.mine!.nextCursor!)}/> : null}
        </View> : null}
      </>}
    </> : <>
      {circle ? <View style={styles.list}>
        {circle.description ? <Text style={styles.copy}>{circle.description}</Text> : null}
        <Text style={styles.copy}>{circle.meeting_label} · {circle.venue_label}</Text>
        <Text style={styles.note}>{circle.member_count} members · {circle.spots_left} spaces available · Hosted by {circle.host_name}</Text>
        {circle.hidden ? <Text style={styles.copy}>This listing is hidden. Discussion access is closed.</Text> : null}
        {detail?.ended ? <Text style={styles.copy}>This Circle has ended.</Text> : null}
        <Text style={styles.copy}>{detail?.viewer.is_member ? 'You are a member of this Circle.' : 'You have not joined this Circle.'}</Text>
        {detail?.meetings.map(meeting => <Text key={meeting.date} style={styles.note}>Meeting {meeting.date} · {meeting.going} attending{meeting.my_status === 'going' ? ' · You are attending' : ''}</Text>)}
        <AgreedReading circle={circle}/>
      </View> : management ? <Text style={styles.copy}>The full listing is unavailable. You can check your membership and leave this Circle here.</Text> : null}
      <Action label="Check current Circle" disabled={!m?.canRefresh} onPress={() => void session?.refresh()}/>
      {m?.phase === 'review' ? <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.heading}>{m.intent === 'join' ? 'Review joining this Circle' : 'Review leaving this Circle'}</Text>
        <Text style={styles.copy}>{m.intent === 'join' ? 'Join this free Circle with your current member account and share your member display name with the group. Read the community norms below before joining. Its members will be able to see your contributions when you post.' : 'Leave this Circle, remove your current RSVPs and end your member discussion access. Your posted messages remain; you can review or withdraw your own messages from My posted messages. If you are the host, you keep hosting responsibility. Completing a hosted Circle is available on the website.'}</Text>
        {m.intent === 'join' ? <CommunityNorms/> : null}
        <Action label={m.intent === 'join' ? 'Confirm join' : 'Confirm leave'} disabled={!m.canConfirm} onPress={() => void session?.confirm()}/>
        <Action label="Cancel membership change" disabled={!m.canCancel} onPress={() => session?.cancel()}/>
      </View> : m?.phase === 'unknown' ? <View style={styles.card}>
        <Text style={styles.copy}>This membership change may already have completed. Retry only the same request. Closing clears its local retry details, and a request already sent may still finish.</Text>
        <Action label="Retry exact participation request" disabled={!m.canConfirm} onPress={() => void session?.confirm()}/>
      </View> : <>
        {m?.canPrepareJoin ? <Action label="Review joining this Circle" onPress={() => void session?.prepare('join')}/> : null}
        {m?.canPrepareLeave ? <Action label="Review leaving this Circle" onPress={() => void session?.prepare('leave')}/> : null}
      </>}
      <Action label="Open discussion" disabled={!m?.canOpenDiscussion} onPress={() => {
        const current = session?.model();
        if (connection && current?.canOpenDiscussion && current.selected) setDiscussion({ connection, circleId: current.selected });
      }}/>
      <Action label={mode === 'mine' ? 'Back to my Circles' : 'Back to discovery'} disabled={!m?.canBack} onPress={() => session?.back()}/>
    </>}
    <Action label="Return to member account" disabled={!m?.canNavigate} onPress={back}/>
    <Action label="Close member view" onPress={close}/>
  </ScrollView></SafeAreaView>;
}

// Same conduct and meeting-safety expectations as app/circles/norms/page.tsx.
// Kept local so joining does not need an external browser or another request.
function CommunityNorms() {
  const norms = [
    ['Read charitably', 'State the strongest version of a view before you criticise it, especially one you dislike.'],
    ['Everyone speaks before anyone speaks twice', 'The host keeps an eye on this. Quiet people are not a problem to be fixed, but the room should make space for them.'],
    ['Disagree with ideas, not people', 'No insults, no name-calling, no labels in place of arguments. Questions are better than verdicts.'],
    ['Stay with the text', 'Bring the conversation back to the reading. Current events are welcome when they shed light on it.'],
    ['What is said in the circle stays in the circle', 'Do not quote other members by name outside the meeting, and never record without everyone’s clear agreement.'],
    ['No selling, recruiting or campaigning', 'Circles are not a platform for products, causes, parties or congregations, including Society of Explorers memberships.'],
  ];
  const safety = [
    'Meet only in public places: libraries, cafés, community centers, campus rooms. Circles cannot list a private home, and hosts should not invite members to one.',
    'First names are enough. You never have to share your surname, address, workplace or phone number.',
    'Online circles share their video link only with members who have joined, never on the public listing.',
    'Circles are for adults (18+). If you want to run a circle for teenagers, do it through a school or library that has its own safeguarding rules.',
    'Leave at any time, for any reason, without explaining.',
    'If anyone is in immediate danger, call 911 (or your local emergency number) first.',
  ];
  return <View style={styles.list}>
    <Text accessibilityRole="header" style={styles.heading}>Community norms and safety</Text>
    <Text style={styles.copy}>Society of Explorers has Christian and conservative roots and welcomes people of every faith, background and political view. You do not have to share those beliefs to belong. The same conduct standards apply to everyone; moderation considers behavior and evidence, not agreement with a political or religious position.</Text>
    {norms.map(([title, description]) => <View key={title} style={styles.list}><Text style={styles.copy}>{title}</Text><Text style={styles.note}>{description}</Text></View>)}
    {safety.map(item => <Text key={item} style={styles.note}>{item}</Text>)}
    <Text style={styles.note}>Society of Explorers lists circles but does not run, supervise or vet them, and hosts are volunteers, not staff. Use the same judgement you would for any meeting with people you do not know yet.</Text>
  </View>;
}

function AgreedReading({ circle }: { circle: CirclePublicSummary }) {
  const program = circle.reading_program, starter = program ? null : starterReadingContext(circle.week);
  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.heading}>Agreed reading</Text>
    {program ? <>
      <Text style={styles.copy}>{readingEditionLabel(program)}</Text>
      {program.sessions.map((session, index) => <Text key={index} style={styles.note}>Meeting {index + 1}{circle.week === index + 1 ? ' · Current selection' : ''}: {readingSessionLabel(program, session)}</Text>)}
    </> : circle.reading ? <>
      <Text style={styles.copy}>{circle.reading.title} · {circle.reading.author}</Text>
      <Text style={styles.note}>{circle.reading.selection}</Text>
      {starter ? <><Text style={styles.note}>{readingEditionLabel(starter)}</Text><Text style={styles.note}>{readingSessionLabel(starter, starter)}</Text></> : null}
    </> : <Text style={styles.copy}>No current reading selection.</Text>}
    <Text style={styles.note}>The reading schedule is shown here. Reading the full text in this app is not yet available.</Text>
  </View>;
}
function Field({ label, value, editable, maxLength, onChange }: { label: string; value: string; editable: boolean; maxLength: number; onChange(value: string): void }) {
  return <View style={styles.list}><Text style={styles.copy}>{label}</Text><TextInput accessibilityLabel={label} value={value} editable={editable}
    onChangeText={onChange} maxLength={maxLength} autoCorrect={false} autoComplete="off" style={[styles.input, !editable && styles.disabled]}/></View>;
}
function Action({ label, disabled = false, onPress }: { label: string; disabled?: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{ disabled }} onPress={onPress}
    style={[styles.button, disabled && styles.disabled]}><Text style={styles.copy}>{label}</Text></Pressable>;
}
function Choice({ label, checked, disabled, onPress }: { label: string; checked: boolean; disabled: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked, disabled }} disabled={disabled} onPress={onPress}
    style={[styles.button, disabled && styles.disabled]}><Text style={styles.copy}>{checked ? '● ' : '○ '}{label}</Text></Pressable>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#101d1a' }, content: { padding: 24, gap: 20 },
  eyebrow: { color: '#e8cb8d', fontSize: 13, letterSpacing: 1.4 }, title: { color: '#f4f2e5', fontSize: 32, lineHeight: 40 },
  heading: { color: '#f4f2e5', fontSize: 23, lineHeight: 30 }, copy: { color: '#e9eadf', fontSize: 17, lineHeight: 26 },
  note: { color: '#c0cbbf', fontSize: 15, lineHeight: 23 }, list: { gap: 16 }, card: { padding: 16, gap: 16, borderWidth: 1, borderColor: '#536d61', borderRadius: 8 },
  input: { color: '#f4f2e5', backgroundColor: '#182e26', borderWidth: 1, borderColor: '#b1c1b5', borderRadius: 8, padding: 14, minHeight: 48, fontSize: 17 },
  button: { backgroundColor: '#294e3c', borderWidth: 1, borderColor: '#b1c1b5', borderRadius: 8, padding: 14, minHeight: 48 }, disabled: { opacity: 0.5 } });
