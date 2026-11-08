import { useLayoutEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { defaultDiscoveryPageRequest } from '../../lib/circles/discovery-page';
import { formatDay } from '../../lib/circles/schedule';
import { createPublicCircleDirectory, type CircleDirectoryModel, type PublicCircleChoice } from '../shared/circle-directory';
import { prepareInstalledPublicCircles, type PublicCircleDiscoveryConnection } from './src/circles/installed-member';
import { observeNativeConnectivity } from './src/circles/native-connectivity';
import { FellowshipQuestion } from './FellowshipQuestion';
import type { FellowshipTopicId } from '../../lib/fellowship/topics';
import { REEL_QUESTIONS, type ReelDiscussionId } from '../../lib/clips/salon';

type Directory = ReturnType<typeof createPublicCircleDirectory>;
type ViewState = { directory: Directory; model: CircleDirectoryModel };

export function PublicCirclesScreen({ prepare = prepareInstalledPublicCircles, reel, fellowship, inviteId, onBack, onChoose }: {
  prepare?: () => Promise<PublicCircleDiscoveryConnection>; reel?: ReelDiscussionId; fellowship?: FellowshipTopicId; inviteId?: string;
  onBack(): void; onChoose(circle: PublicCircleChoice): void;
}) {
  const [view, setView] = useState<ViewState | null>(null);
  const [failed, setFailed] = useState(false);
  const current = useRef<ViewState | null>(null);
  useLayoutEffect(() => {
    let mounted = true, blurred = false;
    let connection: PublicCircleDiscoveryConnection | undefined, directory: Directory | undefined;
    let offView = () => {}, offConnectivity = () => {};
    const sync = () => { directory?.activity(AppState.currentState === 'active' && !blurred); };
    const change = AppState.addEventListener('change', sync);
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => { blurred = true; sync(); }) : null;
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => { blurred = false; sync(); }) : null;
    void Promise.resolve().then(() => mounted ? prepare() : null).then(ready => {
      if (!ready) return;
      if (!mounted) { ready.close(); return; }
      connection = ready;
      const opened = createPublicCircleDirectory(ready.origin, ready.publicTransport, inviteId);
      directory = opened;
      offView = opened.subscribe(model => {
        const value = { directory: opened, model };
        current.current = value; setView(value);
      });
      sync();
      offConnectivity = observeNativeConnectivity(ready.connectivity, state => opened.connectivity(state === 'online'));
      opened.connect();
    }).catch(() => { if (mounted) { connection?.close(); setFailed(true); } });
    return () => {
      mounted = false; current.current = null;
      offView(); offConnectivity(); directory?.close(); connection?.close();
      change.remove(); blur?.remove(); focus?.remove();
    };
  }, [prepare, inviteId]);

  const model = view?.model;
  const act = (work: (directory: Directory) => void) => {
    if (view && view === current.current && view.directory.model().canSearch) work(view.directory);
  };
  const subject = inviteId ? 'Public salon access' : 'Public Circle search';
  const notice = failed ? `${subject} is unavailable in this build.`
    : !model ? `Preparing ${subject.toLowerCase()}…`
      : !model.active || !model.online ? 'Return to the app with an online connection, then load Circles.'
        : model.phase === 'idle' ? inviteId ? 'Check the public listing for this salon.' : 'Load public listings for online and hybrid salons.' : model.message;
  const listings = inviteId ? model?.invite ? [model.invite] : undefined
    : model?.page?.circles.filter(circle => circle.format === 'online' || circle.format === 'hybrid');
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>SOCIETY OF EXPLORERS</Text>
    <Text accessibilityRole="header" style={styles.title}>{inviteId ? 'Salon invitation' : 'Online Circles'}</Text>
    <Text style={styles.copy}>Find a small weekly salon for Scripture, Great Books and honest conversation.</Text>
    <FellowshipQuestion topic={fellowship}/>
    {reel && <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>Question from the Reel</Text>
      <Text style={styles.copy}>{REEL_QUESTIONS[reel]}</Text>
    </View>}
    <Text accessibilityLiveRegion="polite" style={styles.copy}>{notice}</Text>
    <Action label={inviteId ? 'Check this salon invitation' : 'Load online Circles'} disabled={failed || !model?.canSearch} onPress={() => act(directory => {
      if (inviteId) { void directory.loadInvite(); return; }
      const request = defaultDiscoveryPageRequest();
      void directory.search({ ...request, query: { ...request.query, format: 'online' } });
    })}/>
    {listings?.length === 0 ? <Text style={styles.copy}>This page has no online Circles. Check again when ready.</Text> : null}
    {listings?.map(circle => <View key={circle.id} style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>{circle.title}</Text>
      {circle.description ? <Text style={styles.copy}>{circle.description}</Text> : null}
      <Text style={styles.copy}>{circle.format_label} · {circle.meeting_label} · Hosted by {circle.host_name}</Text>
      {circle.next_meeting && <Text style={styles.copy}>Next meeting · {formatDay(circle.next_meeting)}
        {'spots_left' in circle ? ` · ${circle.spots_left} spaces available` : ''}</Text>}
      <Action label={`Sign in for ${circle.title}`} onPress={() => act(directory => {
        const currentModel = directory.model();
        const row = inviteId ? currentModel.invite : currentModel.page?.circles.find(item => item.id === circle.id && item.format !== 'in_person');
        if (row?.id === circle.id) onChoose({ id: row.id, title: row.title });
      })}/>
    </View>)}
    {model?.page?.page.nextCursor ? <Action label="Next online Circles" disabled={!model.canNextPage} onPress={() => act(directory => { void directory.nextPage(); })}/> : null}
    <Action label={inviteId ? 'Back from salon invitation' : 'Back from online Circles'} onPress={onBack}/>
  </ScrollView></SafeAreaView>;
}

function Action({ label, onPress, disabled = false }: { label: string; onPress(): void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={[styles.button, disabled && styles.disabled]}><Text style={styles.copy}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#101d1a' }, content: { padding: 24, gap: 18 },
  eyebrow: { color: '#e8cb8d', fontSize: 13, letterSpacing: 1.4 }, title: { color: '#f4f2e5', fontSize: 32, lineHeight: 40 },
  copy: { color: '#e9eadf', fontSize: 17, lineHeight: 26 }, heading: { color: '#f4f2e5', fontSize: 21, lineHeight: 28 },
  card: { gap: 12, padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#728577', backgroundColor: '#172b24' },
  button: { backgroundColor: '#294e3c', borderWidth: 1, borderColor: '#b1c1b5', borderRadius: 8, padding: 14, minHeight: 48 },
  disabled: { opacity: 0.5 },
});
