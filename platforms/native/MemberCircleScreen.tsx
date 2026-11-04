import { useLayoutEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { CircleScreen } from './CircleScreen';
import { createVerifiedSupabaseCircleOwner, type ExistingMemberCircleConfig } from './src/circles/verified-member-session';

/** Application-owned existing auth client and native transport are injected.
 * This component never constructs a client, signs in or provisions a member. */
export function MemberCircleScreen({ config, onClose }: { config: ExistingMemberCircleConfig; onClose(): void }) {
  const connection = useMemo(() => {
    try {
      const { auth, verificationTimeoutMs, ...host } = config;
      const binding = createVerifiedSupabaseCircleOwner(auth, { timeoutMs: verificationTimeoutMs });
      return { binding, host: { ...host, owner: binding.owner } };
    } catch { return null; }
  }, [config]);
  const [snapshot, setSnapshot] = useState(() => ({ connection, model: connection?.binding.model() }));
  const model = snapshot.connection === connection ? snapshot.model : connection?.binding.model();
  useLayoutEffect(() => {
    if (!connection) return;
    const binding = connection.binding, off = binding.subscribe(model => setSnapshot({ connection, model }));
    binding.activity(AppState.currentState === 'active'); void binding.start();
    const change = AppState.addEventListener('change', value => binding.activity(value === 'active'));
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => binding.activity(false)) : null;
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => binding.activity(AppState.currentState === 'active')) : null;
    return () => { binding.stop(); off(); change.remove(); blur?.remove(); focus?.remove(); };
  }, [connection]);
  return <CircleScreen config={connection?.host} memberSession={model && connection ? { model, onCheck: () => { void connection.binding.check(); } } : undefined}
    onClose={() => { connection?.binding.stop(); onClose(); }}/>;
}
