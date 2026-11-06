import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createCircleDirectory, type CircleDirectoryConfig, type CircleDirectoryModel, type PublicCircleChoice } from '../shared/circle-directory';
import { parseDiscoveryPageRequest } from '../../lib/circles/discovery-page';
import { readingEditionLabel, readingSessionLabel, starterReadingContext, type ReadingContext } from '../../lib/circles/reading-program';
import { formatDay } from '../../lib/circles/schedule';
import type { CirclePublicSummary } from '../../lib/circles/membership';
import { observeNativeConnectivity, type NativeConnectivityPort } from './src/circles/native-connectivity';
import { CircleScreen } from './CircleScreen';
import { getScriptureReading, getScriptureStudy } from '../../lib/root-kernel/scripture-studies';
import { PublicProfileScreen } from './PublicProfileScreen';
import { CircleCommunityNorms } from './CircleCommunityNorms';
import { sourceReaderAvailable } from './SourceReader';
import { CircleReadingScreen } from './CircleReadingScreen';
import type { SavedReading } from '../shared/saved-reading';
import { safePrivateMeetingUrl } from './src/circles/discussion-reader';
import { REEL_QUESTIONS, type ReelDiscussionId } from '../../lib/clips/salon';

function meetingHref(model: CircleDirectoryModel | undefined) {
  return model?.phase === 'ready' && model.canRefresh && model.detail?.viewer.is_member && !model.detail.circle.hidden
    ? safePrivateMeetingUrl(model.detail.online_url) : null;
}

export function CircleDirectoryScreen({ config, connectivity, initialMode = 'discover', initialOnlineFilter = false, initialCircle, reel, savedReading, onBack, onClose }: {
  config: CircleDirectoryConfig; connectivity?: NativeConnectivityPort; initialMode?: 'discover' | 'mine'; initialOnlineFilter?: boolean;
  initialCircle?: PublicCircleChoice; reel?: ReelDiscussionId; savedReading?: SavedReading; onBack(): void; onClose(): void;
}) {
  const previewCircleId = initialCircle?.id;
  const connection = useMemo(() => {
    try { return { session: createCircleDirectory({ ...config, initialOnline: false, previewCircleId }), config, connectivity }; }
    catch { return null; }
  }, [config, connectivity, previewCircleId]);
  const previewAttempt = useRef<NonNullable<typeof connection> | null>(null);
  const [snapshot, setSnapshot] = useState(() => ({ connection, model: connection?.session.model() }));
  const [mode, setMode] = useState(initialMode);
  const [q, setQ] = useState(''), [city, setCity] = useState('');
  const [format, setFormat] = useState(initialOnlineFilter ? 'online' : ''), [open, setOpen] = useState(false), [sort, setSort] = useState('next');
  const [filterError, setFilterError] = useState('');
  const [discussion, setDiscussion] = useState<{ connection: NonNullable<typeof connection>; circleId: string } | null>(null);
  const [reading, setReading] = useState<{ connection: NonNullable<typeof connection>; context: ReadingContext } | null>(null);
  const [publicProfile, setPublicProfile] = useState<{ connection: NonNullable<typeof connection>; circleId: string; memberId: string } | null>(null);
  const [readingNotice, setReadingNotice] = useState('');
  const [meetingNotice, setMeetingNotice] = useState('');
  const readingLifetime = useRef({ generation: 0 });
  const [viewEpoch, setViewEpoch] = useState(0), viewLife = useRef({ mounted: false, enabled: false, epoch: 0 });
  const m = snapshot.connection === connection ? snapshot.model : connection?.session.model(), session = connection?.session;
  const discussionConfig = useMemo(() => discussion ? { ...discussion.connection.config, circleId: discussion.circleId } : null, [discussion]);
  const readingConfig = useMemo(() => reading ? { ...reading.connection.config, context: reading.context } : null, [reading]);
  const publicProfileConfig = useMemo(() => publicProfile ? { ...publicProfile.connection.config, memberId: publicProfile.memberId } : null, [publicProfile]);
  useLayoutEffect(() => {
    const life = viewLife.current; life.mounted = true; life.enabled = false; setViewEpoch(++life.epoch);
    if (!connection) return () => { life.mounted = false; life.enabled = false; ++life.epoch; };
    const lifetime = readingLifetime.current;
    const { session } = connection;
    let signature = '';
    const off = session.subscribe(model => {
      const enabled = model.active && model.online;
      const next = JSON.stringify([model.phase, model.selected, model.intent, model.attendanceReview]);
      if (signature !== next || life.enabled !== enabled || !enabled) setViewEpoch(++life.epoch);
      signature = next; life.enabled = enabled;
      // Loading a fresh selected detail retains its selection. Retirement,
      // background/offline or an account change must also cancel a pending
      // Read intent even when this directory stays mounted independently.
      if (!model.connected || !model.active || !model.online || !model.selected) { lifetime.generation++; setMeetingNotice(''); }
      setSnapshot({ connection, model });
      if (!model.canOpenDiscussion) setDiscussion(null);
      if (!model.detail || !model.connected || !model.active || !model.online) { setReading(null); setPublicProfile(null); }
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
    if (previewCircleId) queueMicrotask(() => {
      if (!mounted || previewAttempt.current === connection) return;
      previewAttempt.current = connection;
      if (session.model().canSelect) void session.select(previewCircleId);
    });
    return () => { mounted = false; life.mounted = false; life.enabled = false; ++life.epoch; lifetime.generation++; session.disconnect(); offConnectivity(); off(); change.remove(); blur?.remove(); focus?.remove(); };
  }, [connection, previewCircleId]);
  useLayoutEffect(() => { setViewEpoch(++viewLife.current.epoch); }, [reading, discussion, publicProfile]);
  const act = (work: () => void, allowInactive = false) => {
    const life = viewLife.current;
    if (life.mounted && life.epoch === viewEpoch && (allowInactive || life.enabled)) { readingLifetime.current.generation++; work(); }
  };
  const close = () => act(() => { session?.close(); setDiscussion(null); setReading(null); setPublicProfile(null); onClose(); }, true);
  const back = () => act(() => { if (session?.model().canNavigate) { session.close(); onBack(); } }, true);
  const search = () => act(() => {
    const params = new URLSearchParams({ q, city, format, open: open ? '1' : '0', sort });
    const request = parseDiscoveryPageRequest(params);
    if (!request.ok) { setFilterError('Check the search words and city, then try again.'); return; }
    setFilterError(''); void session?.search(request.value);
  });
  const openMeeting = async () => {
    const before = session?.model(), owner = config.owner.scope();
    if (!session || !owner || !before?.selected || !meetingHref(before)) return;
    const attempt = ++readingLifetime.current.generation;
    const stillCurrent = () => attempt === readingLifetime.current.generation && config.owner.scope() === owner;
    setMeetingNotice('');
    await session.refresh();
    if (!stillCurrent()) return;
    const fresh = session.model(), link = fresh.selected === before.selected ? meetingHref(fresh) : null;
    if (!link) { setMeetingNotice('The meeting link is unavailable for your current Circle access.'); return; }
    try {
      const { Linking } = await import('react-native');
      if (!stillCurrent() || meetingHref(session.model()) !== link) return;
      await Linking.openURL(link);
    }
    catch { if (stillCurrent()) setMeetingNotice('The meeting could not open on this device.'); }
  };
  const openReading = async (context: ReadingContext, sessionIndex: number | null) => {
    const before = session?.model(), owner = config.owner.scope();
    if (!connection || !session || (!config.passageTransport && !getScriptureReading(context)) || !owner || before?.phase !== 'ready' || !before.detail || !before.canNavigate) return;
    const attempt = ++readingLifetime.current.generation, circleId = before.selected;
    setReadingNotice('');
    await session.refresh();
    if (attempt !== readingLifetime.current.generation || config.owner.scope() !== owner) return;
    const current = session.model(), fresh = current.detail?.circle;
    if (!fresh || current.selected !== circleId || current.phase !== 'ready' || !current.connected || !current.active || !current.online) return;
    const program = fresh.reading_program, range = sessionIndex === null ? null : program?.sessions[sessionIndex];
    const verified = sessionIndex === null && !program ? starterReadingContext(fresh.week)
      : program && range ? { bookId: program.bookId, editionId: program.editionId, ...range } : null;
    if (!verified || verified.bookId !== context.bookId || verified.editionId !== context.editionId || verified.from !== context.from || verified.to !== context.to) {
      setReadingNotice('The reading plan changed. Review the current selection before opening it.'); return;
    }
    setReading({ connection, context: { ...verified } });
  };
  const openHostProfile = async (memberId: string) => {
    const before = session?.model(), owner = config.owner.scope();
    if (!connection || !session || !config.publicProfileTransport || !owner || before?.phase !== 'ready' || !before.canNavigate
      || before.detail?.circle.hidden || before.detail?.circle.publicProfileId !== memberId) return;
    const attempt = ++readingLifetime.current.generation, circleId = before.selected;
    setReadingNotice(''); await session.refresh();
    if (attempt !== readingLifetime.current.generation || config.owner.scope() !== owner) return;
    const current = session.model();
    if (current.selected !== circleId || !circleId || current.phase !== 'ready' || !current.connected || !current.active || !current.online || !current.canNavigate) return;
    if (!current.detail || current.detail.circle.hidden || current.detail.circle.publicProfileId !== memberId) {
      setReadingNotice('This host profile reference changed. Review the current Circle before choosing a profile.'); return;
    }
    setPublicProfile({ connection, circleId, memberId });
  };
  if (publicProfile && publicProfile.connection === connection && publicProfileConfig && m?.selected === publicProfile.circleId
    && m.detail?.circle.publicProfileId === publicProfile.memberId && !m.detail.circle.hidden && m.connected && m.active && m.online) {
    return <PublicProfileScreen config={publicProfileConfig} connectivity={connectivity} onClose={close}
      onBack={() => act(() => { setPublicProfile(null); void session?.refresh(); }, true)}/>;
  }
  if (reading && reading.connection === connection && readingConfig && m?.detail && m.connected && m.active && m.online) {
    return <CircleReadingScreen config={readingConfig} connectivity={connectivity} savedReading={savedReading} onClose={close}
      onBack={() => act(() => { setReading(null); void session?.refresh(); }, true)}/>;
  }
  if (discussion && discussion.connection === connection && m?.canOpenDiscussion && discussionConfig) {
    return <CircleScreen config={discussionConfig} connectivity={connectivity} reel={reel} onClose={close}
      onBack={() => act(() => { setDiscussion(null); void session?.refresh(); }, true)}/>;
  }
  const detail = m?.detail, circle = detail?.circle, management = m?.management;
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.eyebrow}>SOCIETY OF EXPLORERS · CIRCLES</Text>
    <Text accessibilityRole="header" style={styles.title}>{m?.selected ? circle?.title ?? management?.circle.title ?? 'Your Circle' : mode === 'mine' ? 'My Circles' : 'Discover Circles'}</Text>
    <Text accessibilityLiveRegion="polite" style={styles.copy}>{m?.message ?? 'The Circle connection is unavailable. Return to your member account and check again.'}</Text>
    {reel && <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>Question from the Reel</Text>
      <Text style={styles.copy}>{REEL_QUESTIONS[reel]}</Text>
    </View>}
    {!m?.selected ? <>
      {initialCircle ? <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.heading}>{initialCircle.title}</Text>
        <Action label="Check selected Circle access" disabled={!m?.canSelect} onPress={() => act(() => void session?.select(initialCircle.id))}/>
      </View> : null}
      <View accessibilityRole="radiogroup" accessibilityLabel="Circle list" style={styles.list}>
        <Choice label="Discover Circles" checked={mode === 'discover'} disabled={!m?.canNavigate} onPress={() => act(() => setMode('discover'))}/>
        <Choice label="My Circles" checked={mode === 'mine'} disabled={!m?.canNavigate} onPress={() => act(() => setMode('mine'))}/>
      </View>
      {mode === 'discover' ? <>
        <Text style={styles.copy}>Find a small group to read and discuss with. Search results are public; opening a Circle checks your current membership.</Text>
        <Field label="Search words" value={q} maxLength={160} editable={Boolean(m?.canSearch)} onChange={value => act(() => setQ(value))}/>
        <Field label="City" value={city} maxLength={80} editable={Boolean(m?.canSearch)} onChange={value => act(() => setCity(value))}/>
        <Text accessibilityRole="header" style={styles.heading}>Meeting format</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Meeting format" style={styles.list}>
          {[['', 'Any format'], ['in_person', 'In person'], ['online', 'Online']].map(([value, label]) =>
            <Choice key={value} label={label} checked={format === value} disabled={!m?.canSearch} onPress={() => act(() => setFormat(value))}/>)}
        </View>
        <Pressable accessibilityRole="checkbox" accessibilityLabel="Only Circles with space" accessibilityState={{ checked: open, disabled: !m?.canSearch }}
          disabled={!m?.canSearch} onPress={() => act(() => setOpen(!open))} style={[styles.button, !m?.canSearch && styles.disabled]}>
          <Text style={styles.copy}>{open ? '☑ ' : '☐ '}Only Circles with space</Text>
        </Pressable>
        <View accessibilityRole="radiogroup" accessibilityLabel="Sort Circles" style={styles.list}>
          <Choice label="Next meeting first" checked={sort === 'next'} disabled={!m?.canSearch} onPress={() => act(() => setSort('next'))}/>
          <Choice label="Title A–Z" checked={sort === 'title'} disabled={!m?.canSearch} onPress={() => act(() => setSort('title'))}/>
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
            <Action label={`View Circle: ${item.title}`} disabled={!m.canSelect} onPress={() => act(() => void session?.select(item.id))}/>
          </View>)}
          {m.page.page.nextCursor ? <Action label="Next Circles" disabled={!m.canNextPage} onPress={() => act(() => void session?.nextPage())}/> : null}
        </View> : null}
        <Action label="Restart Circle search" disabled={!m?.canFirstPage} onPress={() => act(() => void session?.firstPage())}/>
      </> : <>
        <Text style={styles.copy}>Find Circles you joined or host, including groups no longer listed publicly. Membership controls remain available when a listing cannot be shown.</Text>
        <Action label="Load my Circles" disabled={!m?.canMine} onPress={() => act(() => void session?.mine())}/>
        {m?.mine ? <View style={styles.list}>
          {m.mine.items.length === 0 ? <Text style={styles.copy}>No Circles returned on this page. Discover a Circle to get started.</Text> : null}
          {m.mine.items.map(item => <View key={item.circle.id} style={styles.card}>
            <Text accessibilityRole="header" style={styles.heading}>{item.circle.title ?? 'Circle membership'}</Text>
            <Text style={styles.note}>{item.circle.hidden ? 'Listing hidden. You can still review your membership.' : item.kind === 'management' ? 'Listing unavailable. Membership controls are available.' : item.ended ? 'This Circle has ended.' : item.circle.meeting_label}</Text>
            <Action label={`View Circle: ${item.circle.title ?? 'Circle membership'}`} disabled={!m.canSelect} onPress={() => act(() => void session?.select(item.circle.id))}/>
          </View>)}
          {m.mine.nextCursor ? <Action label="Next page of my Circles" disabled={!m.canMine} onPress={() => act(() => void session?.mine(m.mine!.nextCursor!))}/> : null}
        </View> : null}
      </>}
    </> : <>
      {circle ? <View style={styles.list}>
        {circle.description ? <Text style={styles.copy}>{circle.description}</Text> : null}
        <Text style={styles.copy}>{circle.meeting_label} · {circle.venue_label}</Text>
        <Text style={styles.note}>{circle.member_count} members · {circle.spots_left} spaces available · Hosted by {circle.host_name}</Text>
        {!circle.hidden && circle.publicProfileId && config.publicProfileTransport ? <Action label="View host public profile"
          disabled={m?.phase !== 'ready' || !m?.canNavigate} onPress={() => act(() => void openHostProfile(circle.publicProfileId!))}/> : null}
        {circle.hidden ? <Text style={styles.copy}>This listing is hidden. Discussion access is closed.</Text> : null}
        {detail?.ended ? <Text style={styles.copy}>This Circle has ended.</Text> : null}
        <Text style={styles.copy}>{detail?.viewer.is_member ? 'You are a member of this Circle.' : 'You have not joined this Circle.'}</Text>
        {meetingHref(m) ? <Action label="Open online meeting" onPress={() => act(() => void openMeeting())}/> : null}
        {meetingNotice ? <Text accessibilityLiveRegion="polite" style={styles.copy}>{meetingNotice}</Text> : null}
        {m?.phase === 'review' && m.intent === 'rsvp' ? null : <>
        <Text accessibilityRole="header" style={styles.heading}>Next meetings</Text>
        {detail?.meetings.map(meeting => <View key={meeting.date} style={styles.card}>
          <Text style={styles.copy}>{formatDay(meeting.date)} · {circle.time} ({circle.timezone})</Text>
          <Text style={styles.note}>{meeting.going} going · {meeting.my_status === 'going' ? 'You are going.' : meeting.my_status === 'not_going' ? 'You are not going.' : 'You have not responded.'}</Text>
          {detail.capabilities.canRsvp && config.attendanceTransport && config.memberId ? <>
            <Action label={`Review Going on ${formatDay(meeting.date)}`} disabled={!m.canPrepareAttendance}
              onPress={() => act(() => void session?.prepareAttendance(meeting.date, 'going'))}/>
            <Action label={`Review Not going on ${formatDay(meeting.date)}`} disabled={!m.canPrepareAttendance}
              onPress={() => act(() => void session?.prepareAttendance(meeting.date, 'not_going'))}/>
          </> : null}
        </View>)}
        {detail?.capabilities.canRsvp && (!config.attendanceTransport || !config.memberId) ? <Text style={styles.note}>Attendance changes are unavailable in this connection.</Text> : null}
        {readingNotice ? <Text accessibilityLiveRegion="polite" style={styles.copy}>{readingNotice}</Text> : null}
        <AgreedReading circle={circle} available={Boolean(config.passageTransport)} disabled={m?.phase !== 'ready' || !m?.canNavigate}
          onRead={(context, index) => act(() => void openReading(context, index))}/>
        </>}
      </View> : management ? <Text style={styles.copy}>The full listing is unavailable. You can check your membership and leave this Circle here. Current hosts can also review completing it when that control is available.</Text> : null}
      <Action label="Check current Circle" disabled={!m?.canRefresh} onPress={() => act(() => void session?.refresh())}/>
      {m?.phase === 'review' ? <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.heading}>{m.intent === 'join' ? 'Review joining this Circle' : m.intent === 'rsvp' ? 'Review your attendance response' : m.intent === 'complete' ? 'Review completing this Circle' : 'Review leaving this Circle'}</Text>
        {m.intent === 'rsvp' && m.attendanceReview ? <AttendanceReview date={m.attendanceReview.date} status={m.attendanceReview.status} previousStatus={m.attendanceReview.previousStatus} circleTitle={m.attendanceReview.circleTitle} time={m.attendanceReview.time} timezone={m.attendanceReview.timezone}/> : <Text style={styles.copy}>{m.intent === 'join' ? 'Join this free Circle with your current member account and share your member display name with the group. Read the community norms below before joining. Its members will be able to see your contributions when you post.' : m.intent === 'complete' ? 'Complete this Circle as its host. This permanently closes new joins and attendance responses. Existing members keep their discussion access and can still leave. Posted messages remain. Completion does not transfer hosting, join you to the Circle or reopen it later.' : 'Leave this Circle, remove your current RSVPs and end your member discussion access. Your posted messages remain; you can review or withdraw your own messages from My posted messages. If you are the host, you keep hosting responsibility. Completing the Circle is a separate host action.'}</Text>}
        {m.intent === 'join' ? <CircleCommunityNorms/> : null}
        <Action label={m.intent === 'join' ? 'Confirm join' : m.intent === 'rsvp' ? 'Confirm attendance response' : m.intent === 'complete' ? 'Confirm Circle completion' : 'Confirm leave'} disabled={!m.canConfirm} onPress={() => act(() => void session?.confirm())}/>
        <Action label={m.intent === 'rsvp' ? 'Cancel attendance change' : m.intent === 'complete' ? 'Cancel Circle completion' : 'Cancel membership change'} disabled={!m.canCancel} onPress={() => act(() => session?.cancel())}/>
      </View> : m?.phase === 'unknown' ? <View style={styles.card}>
        {m.attendanceReview ? <AttendanceReview date={m.attendanceReview.date} status={m.attendanceReview.status} previousStatus={m.attendanceReview.previousStatus} circleTitle={m.attendanceReview.circleTitle} time={m.attendanceReview.time} timezone={m.attendanceReview.timezone}/> : null}
        <Text style={styles.copy}>This participation change may already have completed. Retry only the same request. Closing clears its local retry details, and a request already sent may still finish.</Text>
        <Action label="Retry exact participation request" disabled={!m.canConfirm} onPress={() => act(() => void session?.confirm())}/>
      </View> : <>
        {m?.canPrepareJoin ? <Action label="Review joining this Circle" onPress={() => act(() => void session?.prepare('join'))}/> : null}
        {m?.canPrepareLeave ? <Action label="Review leaving this Circle" onPress={() => act(() => void session?.prepare('leave'))}/> : null}
        {m?.canPrepareComplete ? <Action label="Review completing this Circle" onPress={() => act(() => void session?.prepare('complete'))}/> : null}
      </>}
      <Action label="Open discussion" disabled={!m?.canOpenDiscussion} onPress={() => act(() => {
        const current = session?.model();
        if (connection && current?.canOpenDiscussion && current.selected) setDiscussion({ connection, circleId: current.selected });
      })}/>
      <Action label={mode === 'mine' ? 'Back to my Circles' : 'Back to discovery'} disabled={!m?.canBack} onPress={() => act(() => session?.back())}/>
    </>}
    <Action label="Return to member account" disabled={!m?.canNavigate} onPress={back}/>
    <Action label="Close member view" onPress={close}/>
  </ScrollView></SafeAreaView>;
}

function AttendanceReview({ date, status, previousStatus, circleTitle, time, timezone }: {
  date: string; status: 'going' | 'not_going'; previousStatus: 'going' | 'not_going' | null; circleTitle: string; time: string; timezone: string;
}) {
  return <View style={styles.list}>
    <Text style={styles.copy}>{circleTitle}</Text>
    <Text style={styles.copy}>{formatDay(date)}, {date.slice(0, 4)} · {time} ({timezone})</Text>
    <Text style={styles.copy}>{status === 'going' ? 'Mark yourself Going.' : 'Mark yourself Not going.'}</Text>
    <Text style={styles.note}>Previously checked response: {previousStatus === 'going' ? 'Going' : previousStatus === 'not_going' ? 'Not going' : 'No response'}.</Text>
    <Text style={styles.copy}>This response is shared with your Circle. Not going records that you do not plan to attend this meeting and keeps you in the Circle.</Text>
  </View>;
}

function AgreedReading({ circle, available, disabled, onRead }: {
  circle: CirclePublicSummary; available: boolean; disabled: boolean; onRead(context: ReadingContext, sessionIndex: number | null): void;
}) {
  const program = circle.reading_program, starter = program ? null : starterReadingContext(circle.week);
  const scripture = getScriptureStudy(program?.bookId);
  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.heading}>Agreed reading</Text>
    {program ? <>
      <Text style={styles.copy}>{readingEditionLabel(program)}</Text>
      {program.sessions.map((session, index) => <View key={index} style={styles.list}>
        <Text style={styles.note}>Meeting {index + 1}{circle.week === index + 1 ? ' · Current selection' : ''}: {readingSessionLabel(program, session)}</Text>
        {available || scripture ? <Action label={`Read meeting ${index + 1} selection`} disabled={disabled}
          onPress={() => onRead({ bookId: program.bookId, editionId: program.editionId, ...session }, index)}/> : null}
      </View>)}
    </> : circle.reading ? <>
      <Text style={styles.copy}>{circle.reading.title} · {circle.reading.author}</Text>
      <Text style={styles.note}>{circle.reading.selection}</Text>
      {starter ? <><Text style={styles.note}>{readingEditionLabel(starter)}</Text><Text style={styles.note}>{readingSessionLabel(starter, starter)}</Text>
        {available ? <Action label="Read current selection" disabled={disabled} onPress={() => onRead(starter, null)}/> : null}</> : null}
    </> : <Text style={styles.copy}>No current reading selection.</Text>}
    <Text style={styles.note}>{scripture ? `Open the ${scripture.extent.toLowerCase()} and questions for your salon.`
      : available ? sourceReaderAvailable()
      ? 'Open a selection in the complete source edition, including illustrations, tables and notes. Your saved place changes only after you review and confirm a save.'
      : 'Open a selection to read its verified text. Tables and nontext content are identified in place; the native reader does not reproduce the complete source layout.'
      : 'The reading schedule is shown here. Reading text is unavailable in this connection.'}</Text>
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
