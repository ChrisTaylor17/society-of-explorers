import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { createSourceReading } from '../shared/source-reading';
import { getReadingEdition, readingEditionLabel, readingSessionLabel } from '../../lib/circles/reading-program';
import { observeNativeConnectivity } from './src/circles/native-connectivity';
import { SourceReader, sourceReaderAvailable } from './SourceReader';
import { SavedReadingTools } from './SavedReadingTools';
import type { CircleReadingScreenProps } from './CircleReadingScreen';

/** All entry points use the same complete source and explicit selected position. */
export function SourceReadingScreen({ config, connectivity, savedReading, savedReadingManaged = false,
  backLabel = 'Back to Circle reading plan', onBack, onClose }: CircleReadingScreenProps) {
  const connection = useMemo(() => {
    try { return { reader: createSourceReading({ owner: config.owner, context: config.context,
      initialBlockIndex: config.initialBlockIndex, available: sourceReaderAvailable(), initialOnline: false }), connectivity }; }
    catch { return null; }
  }, [config, connectivity]);
  const [snapshot, setSnapshot] = useState(() => ({ connection, model: connection?.reader.model() }));
  const [savedSnapshot, setSavedSnapshot] = useState(() => ({ session: savedReading, model: savedReading?.model() }));
  const [details, setDetails] = useState(false);
  const [viewEpoch, setViewEpoch] = useState(0), viewLife = useRef({ mounted: false, enabled: false, epoch: 0 });
  const reader = connection?.reader, m = snapshot.connection === connection ? snapshot.model : reader?.model();
  const saved = savedSnapshot.session === savedReading ? savedSnapshot.model : savedReading?.model();
  useLayoutEffect(() => savedReading?.subscribe(model => setSavedSnapshot({ session: savedReading, model })), [savedReading]);
  useLayoutEffect(() => {
    const life = viewLife.current; life.mounted = true; life.enabled = false; setViewEpoch(++life.epoch); setDetails(false);
    if (!connection) return () => { life.mounted = false; life.enabled = false; ++life.epoch; };
    const { reader } = connection; let phase = reader.model().phase;
    const off = reader.subscribe(model => {
      if (phase !== model.phase || !model.connected || !model.active || !model.online) setViewEpoch(++life.epoch);
      phase = model.phase; setSnapshot({ connection, model });
    });
    let mounted = true, active = false, blurred = false, online = false;
    const sync = () => { if (mounted) {
      const enabled = active && !blurred && online;
      if (life.enabled !== enabled) { life.enabled = enabled; setViewEpoch(++life.epoch); }
      reader.activity(active && !blurred);
    } };
    reader.activity(false); reader.connectivity(false);
    const change = AppState.addEventListener('change', value => { active = value === 'active'; sync(); });
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => { blurred = true; sync(); }) : null;
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => { blurred = false; active = AppState.currentState === 'active'; sync(); }) : null;
    active = AppState.currentState === 'active'; sync();
    const offConnectivity = observeNativeConnectivity(connection.connectivity, value => { if (mounted) { online = value === 'online'; sync(); reader.connectivity(online); } });
    active = AppState.currentState === 'active'; sync(); reader.connect(); reader.load();
    return () => { mounted = false; life.mounted = false; life.enabled = false; ++life.epoch; off(); reader.disconnect();
      offConnectivity(); change.remove(); blur?.remove(); focus?.remove(); };
  }, [connection]);
  const act = (work: () => void, allowInactive = false) => {
    const life = viewLife.current;
    if (life.mounted && life.epoch === viewEpoch && (allowInactive || life.enabled)) work();
  };
  const canMove = !savedReading || Boolean(saved?.canNavigate);
  const move = (work: () => void) => act(() => { if (!savedReading || savedReading.model().canNavigate) work(); });
  const edition = m && getReadingEdition(m.context.bookId, m.context.editionId);
  return <SafeAreaView style={styles.screen}>
    <View style={styles.header}>
      <Text accessibilityRole="header" style={styles.title}>{edition?.sourceTitle ?? 'Complete source edition'}</Text>
      <Text style={styles.note}>{m ? `Selected save position ${m.blockIndex + 1} · Selection ${m.context.from + 1}–${m.context.to + 1}` : 'Reading selection unavailable'}</Text>
      <Text accessibilityLiveRegion="polite" style={styles.note}>{m?.message ?? 'Return to the reading plan and check this selection.'}</Text>
      <View style={styles.row}>
        <Action label="Previous reading position" disabled={!m?.canPrevious || !canMove} onPress={() => move(() => reader?.previous())}/>
        <Action label="Next reading position" disabled={!m?.canNext || !canMove} onPress={() => move(() => reader?.next())}/>
      </View>
      {m?.phase === 'idle' ? <Action label="Load complete source edition" disabled={!m.canLoad || !canMove} onPress={() => move(() => reader?.load())}/> : null}
      {m?.phase === 'unavailable' ? <Action label="Retry complete source edition" disabled={!m.canRetry || !canMove} onPress={() => move(() => reader?.retry())}/> : null}
    </View>
    <View style={styles.document}>
      {m?.requestKey && reader ? <SourceReader bookId={m.context.bookId} editionId={m.context.editionId}
        blockIndex={m.blockIndex} requestKey={m.requestKey} active={m.connected && m.active && m.online}
        onState={reader.receive} style={styles.source}/> : <Text style={styles.empty}>The source view is cleared. Your saved place has not changed.</Text>}
    </View>
    <ScrollView style={[styles.details, !details && styles.hidden]} contentContainerStyle={styles.detailsContent}>
      <Text style={styles.copy}>{m && readingSessionLabel(m.context, m.context)}</Text>
      <Text selectable style={styles.copy}>{m && readingEditionLabel(m.context)}</Text>
      <Text style={styles.note}>The full source retains its illustrations, tables, notes and license. Public domain in the United States according to Project Gutenberg; rights elsewhere have not been assessed.</Text>
      <Text style={styles.note}>Previous and Next select a position within this reading. Scrolling or following footnotes does not change the selected save position. Nothing is saved automatically.</Text>
      {savedReading ? <SavedReadingTools session={savedReading} connectivity={connectivity} manageLifecycle={!savedReadingManaged}
        position={m?.phase === 'ready' ? { bookId: m.context.bookId, editionId: m.context.editionId, blockIndex: m.blockIndex } : null}/> : null}
    </ScrollView>
    <View style={styles.footer}>
      <Action label={details ? 'Hide reading details' : 'Reading details and saved place'} onPress={() => act(() => setDetails(!details), true)}/>
      <Action label={backLabel} disabled={!m?.canNavigate || !canMove}
        onPress={() => act(() => { if (reader?.model().canNavigate && (!savedReading || savedReading.model().canNavigate)) { reader.close(); onBack(); } }, true)}/>
      <Action label="Close member view" onPress={() => act(() => { reader?.close(); onClose(); }, true)}/>
    </View>
  </SafeAreaView>;
}
function Action({ label, disabled = false, onPress }: { label: string; disabled?: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#101d1a' }, header: { padding: 12, gap: 8 },
  title: { color: '#f4f2e5', fontSize: 22, lineHeight: 28 }, copy: { color: '#e9eadf', fontSize: 17, lineHeight: 26 },
  note: { color: '#c0cbbf', fontSize: 14, lineHeight: 20 }, row: { flexDirection: 'row', gap: 8 },
  document: { flex: 1, minHeight: 240, backgroundColor: '#fcfaf4' }, source: { flex: 1 },
  empty: { color: '#183228', fontSize: 17, lineHeight: 25, padding: 24 },
  details: { maxHeight: '35%' }, hidden: { display: 'none' }, detailsContent: { padding: 16, gap: 12 }, footer: { padding: 8, gap: 6 },
  button: { flexShrink: 1, minHeight: 48, justifyContent: 'center', borderWidth: 1, borderColor: '#b1c1b5', borderRadius: 8, padding: 10, backgroundColor: '#294e3c' },
  buttonText: { color: '#e9eadf', fontSize: 15, lineHeight: 20 }, disabled: { opacity: 0.5 } });
