import { useLayoutEffect, useMemo, useRef } from 'react';
import { Platform, UIManager, type StyleProp, type ViewStyle } from 'react-native';
import NativeSourceReader from './specs/SoeSourceReaderNativeComponent';
import { validSourceReaderSelection, type SourceReaderSelection } from './src/reading/source-reader-policy';

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
  useLayoutEffect(() => {
    const captured = { active, binding }; life.current = captured;
    if (active && (!valid || !available)) onState({ requestKey, phase: 'unavailable', blockIndex });
    return () => { captured.active = false; if (life.current === captured) life.current = null; };
  }, [binding, active, requestKey, blockIndex, onState, valid, available]);
  if (!valid || !available) return null;
  return <NativeSourceReader bookId={bookId} editionId={editionId} blockIndex={blockIndex}
    requestKey={requestKey} active={active} style={style}
    onReaderState={event => {
      const current = life.current, state = event.nativeEvent;
      if (!current?.active || current.binding !== binding || state.requestKey !== requestKey || state.blockIndex !== blockIndex
        || !['loading', 'ready', 'unavailable'].includes(state.phase)) return;
      onState({ requestKey: state.requestKey, blockIndex: state.blockIndex, phase: state.phase as SourceReaderState['phase'] });
    }}/>;
}
