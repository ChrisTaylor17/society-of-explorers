import { useLayoutEffect, useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getBook } from '../../lib/books/catalog';
import type { ReadingProgressState } from '../../lib/books/reading-progress';
import type { SavedReading } from '../shared/saved-reading';
import type { CircleReadingConfig } from '../shared/circle-reading';
import type { NativeConnectivityPort } from './src/circles/native-connectivity';
import { CircleReadingScreen } from './CircleReadingScreen';
import { SavedReadingAction, SavedReadingReviewCard, savedReadingSummary, savedStyles, useSavedReadingView } from './SavedReadingTools';

export function SavedReadingScreen({ session, config, connectivity, onBack, onClose }: {
  session: SavedReading; config: Pick<CircleReadingConfig, 'origin' | 'owner' | 'passageTransport' | 'timeoutMs'>;
  connectivity?: NativeConnectivityPort; onBack(): void; onClose(): void;
}) {
  const [reading, setReading] = useState<ReadingProgressState | null>(null);
  const { model: m, act, capture } = useSavedReadingView(session, connectivity, true, reading);
  useLayoutEffect(() => session.subscribe(model => { if (!model.connected || !model.active || !model.online || (!model.busy && !model.entries.length)) setReading(null); }), [session]);
  const readingConfig = useMemo(() => reading && reading.bookmark?.status === 'current' ? { ...config,
    context: { bookId: reading.bookId, editionId: reading.edition.editionId, from: 0, to: reading.edition.blockCount - 1 },
    initialBlockIndex: reading.bookmark.blockIndex } : null, [config, reading]);
  const close = () => act(() => { session.disconnect(); onClose(); }, true);
  const open = (bookId: string) => act(() => {
    const current = capture();
    void session.open(bookId).then(state => { if (current() && state) setReading(state); });
  });
  if (readingConfig && m.connected && m.active && m.online) return <CircleReadingScreen config={readingConfig} connectivity={connectivity}
    savedReading={session} savedReadingManaged backLabel="Back to saved reading" onClose={close}
    onBack={() => act(() => { setReading(null); void session.load(); }, true)}/>;
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>SOCIETY OF EXPLORERS · READING</Text>
    <Text accessibilityRole="header" style={styles.title}>Your saved reading</Text>
    <Text style={savedStyles.copy}>Keep one private place per book. Opening a saved place reads the current verified edition independently of Circle membership.</Text>
    <Text accessibilityLiveRegion="polite" style={savedStyles.copy}>{m.message}</Text>
    <SavedReadingAction label="Load my saved reading" disabled={!m.canLoad} onPress={() => act(() => void session.load())}/>
    {m.review ? <SavedReadingReviewCard review={m.review} busy={!m.canConfirm}
      onConfirm={() => act(() => void session.confirm())} onCancel={() => act(() => session.cancel())}/> : m.entries.map(state => <View key={state.bookId} style={savedStyles.card}>
      <Text accessibilityRole="header" style={savedStyles.heading}>{getBook(state.bookId)?.title}</Text>
      <Text style={savedStyles.copy}>{savedReadingSummary(state)}</Text>
      {state.status === 'saved' ? <>
        <SavedReadingAction label={`Open saved place in ${getBook(state.bookId)?.title}`} disabled={!m.canLoad || state.bookmark?.status !== 'current' || !config.passageTransport}
          onPress={() => open(state.bookId)}/>
        <SavedReadingAction label={`Review removing saved place in ${getBook(state.bookId)?.title}`} disabled={!m.canPrepare}
          onPress={() => act(() => void session.prepareRemove(state.bookId))}/>
      </> : null}
      {m.retryBooks.includes(state.bookId) ? <SavedReadingAction label={`Review retry for ${getBook(state.bookId)?.title}`} disabled={!m.canPrepare}
        onPress={() => act(() => session.reviewRetry(state.bookId))}/> : null}
    </View>)}
    {!config.passageTransport ? <Text style={savedStyles.note}>Text reading is unavailable in this connection. You can still check and remove saved places.</Text> : null}
    <Text style={savedStyles.note}>Nothing is saved automatically. Legacy and changed-edition places stay visible without being remapped. Closing the member view discards local recovery for uncertain changes; an already sent request may still finish.</Text>
    <SavedReadingAction label="Back to member account" disabled={!m.canNavigate} onPress={() => act(() => { session.disconnect(); onBack(); }, true)}/>
    <SavedReadingAction label="Close member view" onPress={close}/>
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#101d1a' }, content: { padding: 24, gap: 20 },
  eyebrow: { color: '#e8cb8d', fontSize: 13, letterSpacing: 1.4 }, title: { color: '#f4f2e5', fontSize: 32, lineHeight: 40 } });
