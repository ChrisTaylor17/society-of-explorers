// Browser-only Fabric surface double. Actual SourceReader wrapper/controller and
// source HTTP handlers execute; this is not Android/iOS networking or rendering.
import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { boundedReaderSize } from '../native/src/reading/source-reader-size';
import { getSourceReaderEdition, sourceReaderDocumentPath, sourceReaderAnchor } from '../../lib/books/source-reader';
type Props = { bookId: string; editionId: string; blockIndex: number; requestKey: string; active: boolean; textZoomPercent?: number;
  onReaderState(event: { nativeEvent: { requestKey: string; blockIndex: number; phase: string } }): void };
const callbacks = new Map<string, (phase: string, block?: number) => void>(), active = new Set<string>();
let hold = false;
const pending = new Set<string>();
const qa = { available: true, callbacks, active,
  hold(value = true) { hold = value; },
  emit(key: string, phase = 'ready', block?: number) { callbacks.get(key)?.(phase, block); },
  release() { hold = false; for (const key of pending) callbacks.get(key)?.('ready'); pending.clear(); },
  keys: () => [...callbacks.keys()], activeKeys: () => [...active],
};
Object.assign(window, { nativeSourceQa: qa });
export function NativeSourceReaderDouble(props: Props) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const { requestKey, blockIndex, onReaderState } = props;
  useLayoutEffect(() => {
    const emit = (phase: string, block = blockIndex) => onReaderState({ nativeEvent: { requestKey, blockIndex: block, phase } });
    callbacks.set(requestKey, emit); active.add(requestKey); emit('loading');
    return () => { active.delete(requestKey); };
  }, [requestKey, blockIndex, onReaderState]);
  const edition = getSourceReaderEdition(props.bookId, props.editionId), anchor = sourceReaderAnchor(props.bookId, props.editionId, props.blockIndex);
  useEffect(() => {
    // Same-document fragments do not fire iframe load. This explicit surface
    // double observes only its own exact pinned URL after React updates src.
    const key = props.requestKey;
    const timer = setTimeout(() => {
      const doc = iframe.current?.contentDocument, location = iframe.current?.contentWindow?.location;
      if (props.active && edition && anchor && doc?.querySelectorAll('[data-reading-index]').length === edition.blockCount
        && location?.pathname + location?.search === sourceReaderDocumentPath(props.bookId, props.editionId)
        && location?.hash === '#' + encodeURIComponent(anchor)) {
        if (hold) pending.add(key); else callbacks.get(key)?.('ready');
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [props.requestKey, props.active, props.bookId, props.editionId, props.blockIndex, anchor, edition]);
  const applySize = useCallback((document: Document) => {
    // Presentation approximation only: native Android textZoom and iOS pageZoom
    // are compiled/inspected separately, not executed by this iframe double.
    const percent = boundedReaderSize(props.textZoomPercent ?? 100);
    if (Platform.OS === 'ios') document.documentElement.style.setProperty('zoom', String(percent / 100));
    else document.documentElement.style.setProperty('--reader-font-size', `${20 * percent / 100}px`);
  }, [props.textZoomPercent]);
  useLayoutEffect(() => {
    const document = iframe.current?.contentDocument;
    if (props.active && document) applySize(document);
  }, [props.active, applySize]); // Size alone must not reload or navigate the edition.
  if (!props.active || !edition || !anchor) return null;
  return <iframe ref={iframe} title="Complete source edition" sandbox="allow-same-origin" referrerPolicy="no-referrer"
    style={{ border: 0, width: '100%', minHeight: 360, flex: 1 }}
    src={sourceReaderDocumentPath(props.bookId, props.editionId)! + '#' + encodeURIComponent(anchor)}
    onLoad={() => {
      const document = iframe.current?.contentDocument;
      const valid = document?.querySelectorAll('[data-reading-index]').length === edition.blockCount && !!document?.getElementById(anchor);
      if (valid && document) applySize(document);
      if (!valid) callbacks.get(props.requestKey)?.('unavailable');
      else if (hold) pending.add(props.requestKey);
      else callbacks.get(props.requestKey)?.('ready');
    }}/>;
}
