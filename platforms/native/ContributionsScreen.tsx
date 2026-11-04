import { useLayoutEffect, useMemo, useState } from 'react';
import { AppState, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { createMemberContributions } from '../shared/member-contributions';
import { MESSAGE_REPORT_OPTIONS, MESSAGE_WITHDRAWAL_PRIVACY } from '../shared/message-safety';
import { observeNativeConnectivity, type NativeConnectivityPort } from './src/circles/native-connectivity';

/** Author access is separate from Circle membership. The account parent owns
 * identity; this screen starts no request until the member explicitly loads. */
export function ContributionsScreen({ config, connectivity, onBack, onClose }: {
  config: Parameters<typeof createMemberContributions>[0]; connectivity?: NativeConnectivityPort; onBack(): void; onClose(): void;
}) {
  const connection = useMemo(() => {
    try { return { session: createMemberContributions({ ...config, initialOnline: false }), connectivity }; }
    catch { return null; }
  }, [config, connectivity]);
  const [snapshot, setSnapshot] = useState(() => ({ connection, model: connection?.session.model() }));
  const m = snapshot.connection === connection ? snapshot.model : connection?.session.model();
  useLayoutEffect(() => {
    if (!connection) return;
    const { session } = connection, off = session.subscribe(model => setSnapshot({ connection, model }));
    let mounted = true, appActive = false, blurred = false;
    const sync = () => { if (mounted) session.activity(appActive && !blurred); };
    session.activity(false); session.connectivity(false);
    const change = AppState.addEventListener('change', value => { appActive = value === 'active'; sync(); });
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => { blurred = true; sync(); }) : null;
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => { blurred = false; appActive = AppState.currentState === 'active'; sync(); }) : null;
    appActive = AppState.currentState === 'active'; sync();
    const offConnectivity = observeNativeConnectivity(connection.connectivity, state => { if (mounted) session.connectivity(state === 'online'); });
    appActive = AppState.currentState === 'active'; sync(); session.connect();
    return () => { mounted = false; session.disconnect(); offConnectivity(); off(); change.remove(); blur?.remove(); focus?.remove(); };
  }, [connection]);
  const session = connection?.session, safety = m?.safety, state = safety?.state;
  const close = () => { session?.close(); onClose(); };
  const back = () => { if (session?.model().canNavigate) { session.close(); onBack(); } };
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>SOCIETY OF EXPLORERS · YOUR CONTRIBUTIONS</Text>
    <Text accessibilityRole="header" style={styles.title}>My posted messages</Text>
    <Text style={styles.copy}>Review your own messages across Circles, including after leaving a Circle or when its listing is hidden.</Text>
    <Text accessibilityLiveRegion="polite" style={styles.copy}>{m?.message ?? 'Your posted messages are unavailable. Return to the member account and check again.'}</Text>
    <Action label={m?.busy ? 'Loading my posted messages…' : 'Load my posted messages'} disabled={!m?.canRefresh} onPress={() => void session?.refresh()}/>
    {!m?.selected ? <View style={styles.list}>
      {m?.items.map(item => <View key={`${item.circleId}:${item.message.id}`} style={styles.card}>
        <Text style={styles.note}>{item.message.created_at}</Text>
        <Text selectable style={styles.copy}>{item.message.content ?? (item.message.visibility === 'withdrawn' ? 'This contribution was withdrawn.' : 'This contribution is restricted by moderation.')}</Text>
        <Action label="Check this contribution" disabled={!m.canSelect} onPress={() => void session?.select(item.circleId, item.message.id)}/>
      </View>)}
      {m?.nextCursor ? <Action label="Next page of my messages" disabled={!m.canNext} onPress={() => void session?.next()}/> : null}
    </View> : <View style={styles.list}>
      <Text accessibilityRole="header" style={styles.heading}>Current contribution</Text>
      <Text accessibilityLiveRegion="polite" style={styles.copy}>{safety?.message ?? 'Checking your contribution…'}</Text>
      {state ? <View style={styles.card}>
        <Text style={styles.note}>{state.message.created_at}</Text>
        <Text selectable style={styles.copy}>{state.message.content ?? (state.message.visibility === 'withdrawn' ? 'This contribution was withdrawn.' : 'This contribution is restricted by moderation.')}</Text>
        {state.explanations.map(explanation => <View key={explanation.id} style={styles.explanation}>
          <Text style={styles.note}>{explanation.action === 'hide' ? 'Hidden' : 'Moderator restriction lifted'} · {MESSAGE_REPORT_OPTIONS.find(option => option.value === explanation.reason)?.label
            ?? ({ no_violation: 'No violation found', insufficient_evidence: 'Insufficient evidence', resolved: 'Concern resolved' } as Record<string, string>)[explanation.reason] ?? explanation.reason}</Text>
          <Text style={styles.copy}>{explanation.summary}</Text>
        </View>)}
      </View> : null}
      <Text style={styles.note}>{MESSAGE_WITHDRAWAL_PRIVACY}</Text>
      {state?.canWithdraw ? <>
        <Pressable accessibilityRole="checkbox" accessibilityLabel="I understand withdrawal removes this message from member views and cannot be undone here"
          accessibilityState={{ checked: Boolean(safety?.confirmed), disabled: !safety?.canConfirm }} disabled={!safety?.canConfirm}
          onPress={() => session?.confirm(!safety?.confirmed)} style={[styles.button, !safety?.canConfirm && styles.disabled]}>
          <Text style={styles.copy}>{safety?.confirmed ? '☑ ' : '☐ '}I understand withdrawal removes this message from member views and cannot be undone here.</Text>
        </Pressable>
        <Action label="Withdraw my message" disabled={!safety?.canWithdraw} onPress={() => void session?.withdraw()}/>
      </> : null}
      <Action label="Check current message state" disabled={!safety?.canCheck} onPress={() => void session?.check()}/>
      {safety?.canRetry ? <Action label="Retry exact withdrawal" disabled={!safety.canRetry} onPress={() => void session?.retry()}/> : null}
      <Action label="Back to my contributions" disabled={!m?.canBack} onPress={() => session?.back()}/>
    </View>}
    <Action label="Return to member account" disabled={!m?.canNavigate} onPress={back}/>
    <Action label="Close member view" onPress={close}/>
  </ScrollView></SafeAreaView>;
}
function Action({ label, disabled = false, onPress }: { label: string; disabled?: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{ disabled }} onPress={onPress}
    style={[styles.button, disabled && styles.disabled]}><Text style={styles.copy}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#101d1a' }, content: { padding: 24, gap: 20 },
  eyebrow: { color: '#e8cb8d', fontSize: 13, letterSpacing: 1.4 }, title: { color: '#f4f2e5', fontSize: 32, lineHeight: 40 },
  heading: { color: '#f4f2e5', fontSize: 23, lineHeight: 30 }, copy: { color: '#e9eadf', fontSize: 17, lineHeight: 26 },
  note: { color: '#c0cbbf', fontSize: 15, lineHeight: 23 }, list: { gap: 20 }, card: { padding: 16, gap: 16, borderWidth: 1, borderColor: '#536d61', borderRadius: 8 },
  explanation: { gap: 8 }, button: { backgroundColor: '#294e3c', borderWidth: 1, borderColor: '#b1c1b5', borderRadius: 8, padding: 14, minHeight: 48 }, disabled: { opacity: 0.5 } });
