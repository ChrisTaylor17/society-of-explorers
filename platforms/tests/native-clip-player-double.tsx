import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { NativeProps } from '../native/specs/SoeClipPlayerNativeComponent';

type ClipQA = { callbacks: Map<string, (phase: string) => void> };

/** Substitute the OS player and events while decoding the exact bundled bytes. */
export function NativeClipPlayerDouble({ clipId, requestKey, playing, onClipState, style }: NativeProps) {
  const video = useRef<HTMLVideoElement>(null);
  const callback = useRef(onClipState);
  useLayoutEffect(() => { callback.current = onClipState; }, [onClipState]);
  const emit = useCallback((phase: string) => callback.current?.({
    nativeEvent: { requestKey, phase },
  } as Parameters<NonNullable<NativeProps['onClipState']>>[0]), [requestKey]);
  useEffect(() => {
    const qa = (window as Window & { nativeClipQa?: ClipQA }).nativeClipQa;
    // The fixture retains these callbacks to inject a late platform event.
    qa?.callbacks.set(requestKey, emit);
  }, [emit, requestKey]);
  useEffect(() => {
    const element = video.current!;
    let current = true;
    if (playing) void element.play().catch(error => {
      if (current && element.isConnected && error?.name !== 'AbortError') emit('unavailable');
    });
    else element.pause();
    return () => { current = false; element.pause(); };
  }, [emit, playing]);
  return <video ref={video} muted playsInline preload="auto" data-clip-id={clipId} data-request-key={requestKey}
    src={'/native-clip-media/' + clipId + '.mp4'} aria-hidden="true"
    style={{ ...Object.assign({}, ...[style].flat(Infinity).filter(x => x && typeof x === 'object')), objectFit: 'contain' }}
    onPlaying={() => emit('playing')} onPause={() => { if (!video.current?.ended) emit('paused'); }}
    onEnded={() => emit('ended')} onError={() => emit('unavailable')}/>;
}
