import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, UIManager, View, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from 'react-native';
import NativeSourceReader, { type ReaderState } from './specs/SoeSourceReaderNativeComponent';
import { validSourceReaderSelection, type SourceReaderSelection } from './src/reading/source-reader-policy';
import { boundedReaderSize, DEFAULT_READER_SIZE, MAX_READER_SIZE, MIN_READER_SIZE, READER_SIZE_STEP } from './src/reading/source-reader-size';

export type SourceReaderState = { requestKey: string; phase: 'loading' | 'ready' | 'unavailable'; blockIndex: number };
export function sourceReaderAvailable(): boolean {
  try { return (Platform.OS === 'android' || Platform.OS === 'ios') && !!UIManager.getViewManagerConfig('SoeSourceReader'); }
  catch { return false; }
}
export type SourceReaderProps = SourceReaderSelection & {
  active: boolean; style?: StyleProp<ViewStyle>; onState: (state: SourceReaderState) => void;
};
/** A native renderer, not a browser URL or an HTML bridge. The parent owns the
 * account/selection lifetime; native also retires on platform pause and detach. */
export function SourceReader(props: SourceReaderProps) {
  const { active, requestKey, bookId, editionId, blockIndex, onState, style } = props;
  const life = useRef<{ active: boolean; binding: object } | null>(null);
  const binding = useMemo(() => ({ active, requestKey, bookId, editionId, blockIndex, onState }), [active, requestKey, bookId, editionId, blockIndex, onState]);
  const valid = validSourceReaderSelection(props), available = sourceReaderAvailable();
  const sizeScope = useMemo(() => ({ active, bookId, editionId, valid, available }), [active, bookId, editionId, valid, available]);
  const [sizing, setSizing] = useState(() => ({ scope: sizeScope, percent: DEFAULT_READER_SIZE }));
  const percent = sizing.scope === sizeScope ? sizing.percent : DEFAULT_READER_SIZE;
  useLayoutEffect(() => {
    const captured = { active, binding }; life.current = captured;
    if (active && (!valid || !available)) onState({ requestKey, phase: 'unavailable', blockIndex });
    return () => { captured.active = false; if (life.current === captured) life.current = null; };
  }, [binding, active, requestKey, blockIndex, onState, valid, available]);
  const onReaderState = useCallback((event: NativeSyntheticEvent<ReaderState>) => {
    const current = life.current, state = event.nativeEvent;
    if (!current?.active || current.binding !== binding || state.requestKey !== requestKey || state.blockIndex !== blockIndex
      || !['loading', 'ready', 'unavailable'].includes(state.phase)) return;
    onState({ requestKey: state.requestKey, blockIndex: state.blockIndex, phase: state.phase as SourceReaderState['phase'] });
  }, [binding, requestKey, blockIndex, onState]);
  const changeSize = (delta: number | null) => {
    const current = () => valid && available && life.current?.active && life.current.binding === binding;
    if (!current()) return;
    setSizing(previous => current() ? { scope: sizeScope, percent: delta === null ? DEFAULT_READER_SIZE
      : boundedReaderSize((previous.scope === sizeScope ? previous.percent : DEFAULT_READER_SIZE) + delta) } : previous);
  };
  if (!valid || !available) return null;
  const pageScale = Platform.OS === 'ios', kind = pageScale ? 'page' : 'text';
  return <View style={[styles.reader, style]}>
    <View style={styles.controls}>
      <Text accessibilityLiveRegion="polite" style={styles.label}>Book {kind}: {percent}%</Text>
      <View style={styles.row}>
        <SizeButton label={`Decrease book ${kind} size`} disabled={!active || percent <= MIN_READER_SIZE} onPress={() => changeSize(-READER_SIZE_STEP)}>{`Smaller ${kind}`}</SizeButton>
        <SizeButton label={`Increase book ${kind} size`} disabled={!active || percent >= MAX_READER_SIZE} onPress={() => changeSize(READER_SIZE_STEP)}>{`Larger ${kind}`}</SizeButton>
        <SizeButton label={`Reset book ${kind} size to 100 percent`} disabled={!active || percent === DEFAULT_READER_SIZE} onPress={() => changeSize(null)}>Default size</SizeButton>
      </View>
      {pageScale ? <Text style={styles.note}>Page size also scales illustrations and tables.</Text> : null}
    </View>
    <NativeSourceReader bookId={bookId} editionId={editionId} blockIndex={blockIndex}
      requestKey={requestKey} active={active} textZoomPercent={percent} style={styles.document} onReaderState={onReaderState}/>
  </View>;
}
function SizeButton({ label, disabled, onPress, children }: { label: string; disabled: boolean; onPress(): void; children: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={styles.buttonText}>{children}</Text></Pressable>;
}
const styles = StyleSheet.create({ reader: { flex: 1 }, document: { flex: 1, minHeight: 160 },
  controls: { padding: 8, gap: 6, backgroundColor: '#fcfaf4' }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  label: { color: '#183228', fontSize: 16, lineHeight: 22 }, note: { color: '#364f42', fontSize: 14, lineHeight: 20 },
  button: { minHeight: 48, justifyContent: 'center', padding: 10, borderWidth: 1, borderColor: '#64796b', borderRadius: 8 },
  buttonText: { color: '#183228', fontSize: 15, lineHeight: 20 }, disabled: { opacity: 0.5 } });
