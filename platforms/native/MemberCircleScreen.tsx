import { useLayoutEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { CircleScreen } from './CircleScreen';
import { createVerifiedSupabaseCircleOwner, type ExistingMemberCircleConfig } from './src/circles/verified-member-session';
import { observeNativeConnectivity, type NativeConnectivityPort } from './src/circles/native-connectivity';

/** Application-owned existing auth client and native transport are injected.
 * This component never constructs a client, signs in or provisions a member. */
export function MemberCircleScreen({ config, connectivity, onClose }: { config: ExistingMemberCircleConfig; connectivity?: NativeConnectivityPort; onClose(): void }) {
  const connection = useMemo(() => {
    try {
      const { auth, verificationTimeoutMs, ...host } = config;
      const binding = createVerifiedSupabaseCircleOwner(auth, { timeoutMs: verificationTimeoutMs });
      return { binding, host: { ...host, owner: binding.owner }, connectivity };
    } catch { return null; }
  }, [config, connectivity]);
  const [snapshot, setSnapshot] = useState(() => ({ connection, model: connection?.binding.model() }));
  const model = snapshot.connection === connection ? snapshot.model : connection?.binding.model();
  useLayoutEffect(() => {
    if (!connection) return;
    const binding = connection.binding, off = binding.subscribe(model => setSnapshot({ connection, model }));
    let appActive = false, blurred = false, online = false, mounted = true;
    const sync = () => { if (mounted) binding.activity(appActive && !blurred && online); };
    sync();
    // Install lifecycle fences before any connectivity callback or auth method
    // can synchronously cause a background/blur transition.
    const change = AppState.addEventListener('change', value => { appActive = value === 'active'; sync(); });
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => { blurred = true; sync(); }) : null;
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => { blurred = false; appActive = AppState.currentState === 'active'; sync(); }) : null;
    appActive = AppState.currentState === 'active'; sync();
    const offConnectivity = observeNativeConnectivity(connection.connectivity, state => { if (mounted) { online = state === 'online'; sync(); } });
    appActive = AppState.currentState === 'active'; sync();
    void binding.start();
    return () => { mounted = false; binding.stop(); offConnectivity(); off(); change.remove(); blur?.remove(); focus?.remove(); };
  }, [connection]);
  return <CircleScreen config={connection?.host} connectivity={connection?.connectivity} memberSession={model && connection ? { model, onCheck: () => { void connection.binding.check(); } } : undefined}
    onClose={() => { connection?.binding.stop(); onClose(); }}/>;
}
