import { useLayoutEffect, useMemo, useState } from 'react';
import { AppState, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CircleScreen } from './CircleScreen';
import { ContributionsScreen } from './ContributionsScreen';
import { createVerifiedSupabaseCircleOwner, type ExistingMemberCircleConfig } from './src/circles/verified-member-session';
import { observeNativeConnectivity, type NativeConnectivityPort } from './src/circles/native-connectivity';
import { createMemberAccountSession } from '../shared/account-session';

/** Uses the app's existing verified account. Member setup is deliberate; this
 * screen does not create an auth client, sign in or choose an account. */
export function MemberCircleScreen({ config, connectivity, onClose }: { config: ExistingMemberCircleConfig; connectivity?: NativeConnectivityPort; onClose(): void }) {
  const connection = useMemo(() => {
    try {
      const { auth, verificationTimeoutMs, ...host } = config;
      const binding = createVerifiedSupabaseCircleOwner(auth, { timeoutMs: verificationTimeoutMs });
      const account = createMemberAccountSession({ owner: binding.owner, origin: host.origin, transport: host.transport,
        timeoutMs: host.timeoutMs, initialOnline: false });
      return { binding, account, host: { ...host, owner: binding.owner }, connectivity };
    } catch { return null; }
  }, [config, connectivity]);
  const [snapshot, setSnapshot] = useState(() => ({ connection, model: connection?.binding.model() }));
  const [accountSnapshot, setAccountSnapshot] = useState(() => ({ connection, model: connection?.account.model() }));
  const [entered, setEntered] = useState<{ connection: typeof connection; destination: 'circle' | 'contributions' } | null>(null);
  const model = snapshot.connection === connection ? snapshot.model : connection?.binding.model();
  const account = accountSnapshot.connection === connection ? accountSnapshot.model : connection?.account.model();
  useLayoutEffect(() => {
    if (!connection) return;
    const binding = connection.binding;
    const off = binding.subscribe(model => { setSnapshot({ connection, model }); if (model.phase !== 'ready') setEntered(null); });
    const offAccount = connection.account.subscribe(model => { setAccountSnapshot({ connection, model }); if (!model.canOpenCircle) setEntered(null); });
    let appActive = false, blurred = false, online = false, mounted = true;
    const sync = () => {
      if (!mounted) return;
      const enabled = appActive && !blurred && online;
      connection.account.activity(enabled); connection.account.connectivity(online); binding.activity(enabled);
      if (!enabled) setEntered(null);
    };
    sync();
    // Install lifecycle fences before any connectivity callback or auth method
    // can synchronously cause a background/blur transition.
    const change = AppState.addEventListener('change', value => { appActive = value === 'active'; sync(); });
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => { blurred = true; sync(); }) : null;
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => { blurred = false; appActive = AppState.currentState === 'active'; sync(); }) : null;
    appActive = AppState.currentState === 'active'; sync();
    const offConnectivity = observeNativeConnectivity(connection.connectivity, state => { if (mounted) { online = state === 'online'; sync(); } });
    appActive = AppState.currentState === 'active'; sync();
    connection.account.connect();
    void binding.start();
    return () => { mounted = false; connection.account.disconnect(); binding.stop(); offConnectivity(); offAccount(); off(); change.remove(); blur?.remove(); focus?.remove(); };
  }, [connection]);
  const close = () => { connection?.account.close(); connection?.binding.stop(); setEntered(null); onClose(); };
  if (connection && entered?.connection === connection && account?.canOpenCircle && model?.phase === 'ready') {
    if (entered.destination === 'contributions') return <ContributionsScreen config={connection.host} connectivity={connection.connectivity}
      onBack={() => setEntered(null)} onClose={close}/>;
    return <CircleScreen config={connection.host} connectivity={connection.connectivity} onClose={close}/>;
  }
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>SOCIETY OF EXPLORERS</Text>
    <Text accessibilityRole="header" style={styles.title}>Your member account</Text>
    <Text style={styles.copy}>Use the account already signed in to this app. Check your member account before opening a Circle or reviewing your contributions.</Text>
    <View accessibilityLiveRegion="polite">
      <Text style={styles.copy}>{model?.phase === 'ready' ? 'Existing sign-in verified. Check your member account to continue.'
        : model?.message ?? 'The existing account connection is unavailable. Return through the signed-in app.'}</Text>
      <Text style={styles.copy}>{account?.message ?? 'No member account has been checked.'}</Text>
    </View>
    <Action label={model?.busy ? 'Checking existing sign-in…' : 'Check existing sign-in'} disabled={!model?.canCheck || account?.busy}
      onPress={() => { setEntered(null); void connection?.binding.check(); }}/>
    <Action label={account?.phase === 'checking' ? 'Checking my member account…' : 'Check my member account'} disabled={!account?.canCheck}
      onPress={() => { setEntered(null); void connection?.account.check(); }}/>
    {account?.canConfirm || account?.confirmed ? <View style={styles.setup}>
      <Text style={styles.copy}>{account.phase === 'unknown'
        ? 'An earlier setup may have completed. Retry only if you want to check or set up this same member record again.'
        : 'Set up a Society of Explorers member record for this signed-in account. This does not join a Circle or publish a profile.'}</Text>
      <Pressable accessibilityRole="checkbox" accessibilityLabel="I want to set up a member record for this signed-in account"
        accessibilityState={{ checked: Boolean(account.confirmed), disabled: !account.canConfirm }} disabled={!account.canConfirm}
        onPress={() => connection?.account.confirm(!account.confirmed)} style={[styles.button, !account.canConfirm && styles.disabled]}>
        <Text style={styles.copy}>{account.confirmed ? '☑ ' : '☐ '}I want to set up a member record for this signed-in account.</Text>
      </Pressable>
      <Action label={account.phase === 'preparing' ? 'Setting up my member account…' : account.phase === 'unknown' ? 'Retry member setup' : 'Set up my member account'} disabled={!account.canPrepare}
        onPress={() => { setEntered(null); void connection?.account.prepare(); }}/>
    </View> : null}
    <Action label="Continue to Circle" disabled={!account?.canOpenCircle || model?.phase !== 'ready'}
      onPress={() => { if (connection?.account.model().canOpenCircle && connection.binding.model().phase === 'ready') setEntered({ connection, destination: 'circle' }); }}/>
    <Action label="View my contributions" disabled={!account?.canOpenCircle || model?.phase !== 'ready'}
      onPress={() => { if (connection?.account.model().canOpenCircle && connection.binding.model().phase === 'ready') setEntered({ connection, destination: 'contributions' }); }}/>
    <Action label="Close member view" onPress={close}/>
  </ScrollView></SafeAreaView>;
}
function Action({ label, disabled = false, onPress }: { label: string; disabled?: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{ disabled }} onPress={onPress}
    style={[styles.button, disabled && styles.disabled]}><Text style={styles.copy}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#101d1a' }, content: { padding: 24, gap: 20 },
  eyebrow: { color: '#e8cb8d', fontSize: 13, letterSpacing: 1.4 }, title: { color: '#f4f2e5', fontSize: 32, lineHeight: 40 },
  copy: { color: '#e9eadf', fontSize: 17, lineHeight: 26 }, setup: { gap: 16 },
  button: { backgroundColor: '#294e3c', borderWidth: 1, borderColor: '#b1c1b5', borderRadius: 8, padding: 14, minHeight: 48 }, disabled: { opacity: 0.5 } });
