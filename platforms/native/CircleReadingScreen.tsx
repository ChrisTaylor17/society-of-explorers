import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { createCircleReading, type CircleReadingConfig } from '../shared/circle-reading';
import { readingSessionLabel } from '../../lib/circles/reading-program';
import { observeNativeConnectivity, type NativeConnectivityPort } from './src/circles/native-connectivity';
import type { SavedReading } from '../shared/saved-reading';
import { SavedReadingTools } from './SavedReadingTools';
import { sourceReaderAvailable } from './SourceReader';
import { SourceReadingScreen } from './SourceReadingScreen';
import { ScriptureStudyScreen } from './PhilemonStudyScreen';
import { getScriptureReading } from '../../lib/root-kernel/scripture-studies';

/** Mounted only by an explicit selection from freshly checked Circle detail. */
export type CircleReadingScreenProps = {
  config: CircleReadingConfig; connectivity?: NativeConnectivityPort; savedReading?: SavedReading; savedReadingManaged?: boolean;
  backLabel?: string; onBack(): void; onClose(): void; onDiscussStudy?(): void;
};
export function CircleReadingScreen(props: CircleReadingScreenProps) {
  const scripture = getScriptureReading(props.config.context);
  if (scripture) {
    return <ScriptureStudyScreen study={scripture} onBack={props.onBack} onClose={props.onClose} onDiscuss={props.onDiscussStudy} backLabel={props.backLabel ?? 'Back to Circle reading plan'}/>;
  }
  return sourceReaderAvailable() ? <SourceReadingScreen {...props}/> : <PassageReadingScreen {...props}/>;
}
function PassageReadingScreen({ config, connectivity, savedReading, savedReadingManaged = false, backLabel = 'Back to Circle reading plan', onBack, onClose }: CircleReadingScreenProps) {
  const connection = useMemo(() => {
    try { return { reader: createCircleReading({ ...config, initialOnline: false }), connectivity }; }
    catch { return null; }
  }, [config, connectivity]);
  const [snapshot, setSnapshot] = useState(() => ({ connection, model: connection?.reader.model() }));
  const [savedSnapshot, setSavedSnapshot] = useState(() => ({ session: savedReading, model: savedReading?.model() }));
  const [viewEpoch, setViewEpoch] = useState(0), viewLife = useRef({ mounted: false, enabled: false, epoch: 0 });
  const m = snapshot.connection === connection ? snapshot.model : connection?.reader.model(), reader = connection?.reader;
  const saved = savedSnapshot.session === savedReading ? savedSnapshot.model : savedReading?.model();
  useLayoutEffect(() => savedReading?.subscribe(model => setSavedSnapshot({ session: savedReading, model })), [savedReading]);
  useLayoutEffect(() => {
    const life = viewLife.current; life.mounted = true; life.enabled = false; setViewEpoch(++life.epoch);
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
    active = AppState.currentState === 'active'; sync(); reader.connect();
    void reader.load();
    return () => { mounted = false; life.mounted = false; life.enabled = false; ++life.epoch; off(); reader.disconnect(); offConnectivity(); change.remove(); blur?.remove(); focus?.remove(); };
  }, [connection]);
  const act = (work: () => void, allowInactive = false) => {
    const life = viewLife.current;
    if (life.mounted && life.epoch === viewEpoch && (allowInactive || life.enabled)) work();
  };
  const passage = m?.passage, edition = passage?.metadata.edition;
  const canMove = !savedReading || Boolean(saved?.canNavigate);
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>SOCIETY OF EXPLORERS · READING</Text>
    <Text accessibilityRole="header" style={styles.title}>{passage?.metadata.title ?? 'Agreed reading'}</Text>
    <Text style={styles.copy}>{m ? readingSessionLabel(m.context, m.context) : 'Reading selection unavailable'}</Text>
    <Text accessibilityLiveRegion="polite" style={styles.copy}>{m?.message ?? 'This reading selection could not be opened. Return to the Circle and check its reading plan.'}</Text>
    {m ? <Text style={styles.note}>Reading position {m.blockIndex + 1} · Selection {m.context.from + 1}–{m.context.to + 1}</Text> : null}
    {passage?.blockText ? <Text selectable accessibilityLabel="Reading text" style={styles.reading}>{passage.blockText}</Text> : null}
    {passage?.reason ? <View style={styles.notice}>
      <Text accessibilityRole="header" style={styles.heading}>{passage.reason === 'table' ? 'Table in the source edition' : passage.reason === 'non_text' ? 'Image or other nontext content' : 'No readable text at this position'}</Text>
      <Text style={styles.copy}>{passage.reason === 'table' ? 'This table is not displayed in the native text reader. The complete web edition retains its layout.'
        : passage.reason === 'non_text' ? 'This part of the source is not displayed in the native text reader. The complete web edition retains its images and other content.'
        : 'This source position contains no text in the verified reading index.'} Choose Previous or Next to move deliberately within this selection.</Text>
    </View> : null}
    <Action label="Previous reading position" disabled={!m?.canPrevious || !canMove} onPress={() => act(() => { if (!savedReading || savedReading.model().canNavigate) void reader?.previous(); })}/>
    <Action label="Next reading position" disabled={!m?.canNext || !canMove} onPress={() => act(() => { if (!savedReading || savedReading.model().canNavigate) void reader?.next(); })}/>
    {m?.phase === 'unavailable' ? <Action label="Retry this reading position" disabled={!m.canRetry || !canMove} onPress={() => act(() => { if (!savedReading || savedReading.model().canNavigate) void reader?.retry(); })}/> : null}
    {m?.phase === 'idle' ? <Action label="Load reading selection" disabled={!m.canLoad || !canMove} onPress={() => act(() => { if (!savedReading || savedReading.model().canNavigate) void reader?.load(); })}/> : null}
    {savedReading ? <SavedReadingTools session={savedReading} connectivity={connectivity} manageLifecycle={!savedReadingManaged}
      position={passage ? { bookId: passage.reference.bookId, editionId: passage.reference.editionId, blockIndex: passage.reference.blockIndex } : null}/> : null}
    {edition ? <View style={styles.notice}>
      <Text accessibilityRole="header" style={styles.heading}>Source edition and credits</Text>
      <Text selectable style={styles.copy}>{edition.attribution}</Text>
      <Text selectable style={styles.note}>{edition.sourceCatalogUrl}</Text>
      <Text style={styles.note}>Public domain in the United States, according to Project Gutenberg. Rights outside the United States have not been assessed.</Text>
      <Text selectable style={styles.note}>{edition.licenseNotice}</Text>
      <Text selectable style={styles.note}>{edition.licenseUrl}</Text>
      {edition.editionNotes.map(note => <Text key={note} style={styles.note}>{note}</Text>)}
    </View> : null}
    <Text style={styles.note}>This reader shows verified text one source position at a time. Tables and nontext content are identified in place. {savedReading ? 'Your place changes only after an explicit reviewed save.' : 'Your reading position is not saved in this connection.'}</Text>
    <Action label={backLabel} disabled={!m?.canNavigate || !canMove} onPress={() => act(() => { if (reader?.model().canNavigate && (!savedReading || savedReading.model().canNavigate)) { reader.close(); onBack(); } }, true)}/>
    <Action label="Close member view" onPress={() => act(() => { reader?.close(); onClose(); }, true)}/>
  </ScrollView></SafeAreaView>;
}
function Action({ label, disabled = false, onPress }: { label: string; disabled?: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{ disabled }} onPress={onPress}
    style={[styles.button, disabled && styles.disabled]}><Text style={styles.copy}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#101d1a' }, content: { padding: 24, gap: 20 },
  eyebrow: { color: '#e8cb8d', fontSize: 13, letterSpacing: 1.4 }, title: { color: '#f4f2e5', fontSize: 32, lineHeight: 40 },
  heading: { color: '#f4f2e5', fontSize: 23, lineHeight: 30 }, copy: { color: '#e9eadf', fontSize: 17, lineHeight: 26 },
  reading: { color: '#f4f2e5', fontSize: 20, lineHeight: 32 }, note: { color: '#c0cbbf', fontSize: 15, lineHeight: 23 },
  notice: { gap: 16, padding: 16, borderWidth: 1, borderColor: '#536d61', borderRadius: 8 },
  button: { backgroundColor: '#294e3c', borderWidth: 1, borderColor: '#b1c1b5', borderRadius: 8, padding: 14, minHeight: 48 }, disabled: { opacity: 0.5 } });
