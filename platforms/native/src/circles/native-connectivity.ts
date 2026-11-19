/** Supplied by trusted native application composition, never launch extras or
 * browser globals. This contract does not install or attest an OS signal. */
export type NativeConnectivityState = 'online' | 'offline' | 'unknown';
export type NativeConnectivityPort = {
  snapshot(): NativeConnectivityState;
  subscribe(listener: (state: NativeConnectivityState) => void): () => void;
};
const state = (value: unknown): NativeConnectivityState => value === 'online' || value === 'offline' ? value : 'unknown';

/** Subscribe before sampling. Events observed during registration/sampling take
 * precedence over a stale initial snapshot. No online state is published until
 * both the synchronous subscription disposer and snapshot are validated. */
export function observeNativeConnectivity(port: NativeConnectivityPort | undefined, listener: (value: NativeConnectivityState) => void): () => void {
  let retired = false, registered = false, observed = false, latest: NativeConnectivityState = 'unknown';
  let off = () => {};
  const dispose = () => { if (retired) return; retired = true; registered = false; try { off(); } catch { /* Already retired. */ } };
  if (!port || typeof port.snapshot !== 'function' || typeof port.subscribe !== 'function') {
    listener('unknown'); return dispose;
  }
  try {
    const detach = port.subscribe(value => {
      if (retired) return;
      observed = true; latest = state(value);
      if (registered) listener(latest);
    });
    if (typeof detach !== 'function') throw Error('Connectivity subscription unavailable');
    off = detach;
    const initial = port.snapshot();
    if (initial !== 'online' && initial !== 'offline' && initial !== 'unknown') throw Error('Connectivity snapshot unavailable');
    registered = true;
    listener(observed ? latest : initial);
  } catch {
    dispose(); listener('unknown');
  }
  return dispose;
}
