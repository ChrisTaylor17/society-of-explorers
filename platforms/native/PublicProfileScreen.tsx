import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { createPublicProfile, type PublicProfileConfig } from '../shared/public-profile';
import { observeNativeConnectivity, type NativeConnectivityPort } from './src/circles/native-connectivity';

/** Only an explicit current host/author reference opens this anonymous view. */
export function PublicProfileScreen({ config, connectivity, onBack, onClose, backLabel = 'Back to Circle' }: {
  config: PublicProfileConfig; connectivity?: NativeConnectivityPort; onBack(): void; onClose(): void; backLabel?: string;
}) {
  const connection = useMemo(() => { try { return { session: createPublicProfile({ ...config, initialOnline: false }), connectivity }; } catch { return null; } }, [config, connectivity]);
  const [snapshot, setSnapshot] = useState(() => ({ connection, model: connection?.session.model() }));
  const [viewEpoch, setViewEpoch] = useState(0), viewLife = useRef({ mounted: false, enabled: false, epoch: 0 });
  const m = snapshot.connection === connection ? snapshot.model : connection?.session.model(), session = connection?.session;
  useLayoutEffect(() => {
    const life = viewLife.current; life.mounted = true; life.enabled = false; setViewEpoch(++life.epoch);
    if (!connection) return () => { life.mounted = false; life.enabled = false; ++life.epoch; };
    const { session } = connection;
    const off = session.subscribe(model => { life.enabled = model.connected && model.active && model.online; setViewEpoch(++life.epoch); setSnapshot({ connection, model }); });
    let mounted = true, active = false, blurred = false;
    const sync = () => { if (mounted) session.activity(active && !blurred); };
    session.activity(false); session.connectivity(false);
    const change = AppState.addEventListener('change', value => { active = value === 'active'; sync(); });
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => { blurred = true; sync(); }) : null;
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => { blurred = false; active = AppState.currentState === 'active'; sync(); }) : null;
    active = AppState.currentState === 'active'; sync();
    const offConnectivity = observeNativeConnectivity(connection.connectivity, value => { if (mounted) session.connectivity(value === 'online'); });
    active = AppState.currentState === 'active'; sync(); session.connect(); void session.load();
    return () => { mounted = false; life.mounted = false; life.enabled = false; ++life.epoch; off(); session.disconnect(); offConnectivity(); change.remove(); blur?.remove(); focus?.remove(); };
  }, [connection]);
  const act = (work: () => void, allowInactive = false) => { const life = viewLife.current;
    if (life.mounted && life.epoch === viewEpoch && (allowInactive || life.enabled)) work(); };
  const profile = m?.profile;
  const field = (label: string, text: string | null | undefined) => <View style={styles.field}><Text accessibilityRole="header" style={styles.heading}>{label}</Text><Text selectable style={styles.copy}>{text?.trim() ? text : 'Not shared.'}</Text></View>;
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>SOCIETY OF EXPLORERS · PUBLIC PROFILE</Text>
    <Text accessibilityRole="header" style={styles.title}>{profile?.display_name ?? 'Published member profile'}</Text>
    <Text accessibilityLiveRegion="polite" style={styles.copy}>{m?.message ?? 'This public profile connection is unavailable.'}</Text>
    {profile ? <View style={styles.list}>
      {field('About', profile.bio)}{field('Discipline', profile.discipline)}
      {field('Skills', profile.skills.length ? profile.skills.join(' · ') : null)}
      {field('Project', profile.project_description)}{field('Seeking', profile.seeking)}{field('Philosophy', profile.philosophy)}
      <Text style={styles.note}>Only this member’s published details are shown. Opening a profile does not grant Circle membership or start a conversation.</Text>
    </View> : null}
    <Action label={m?.phase === 'ready' ? 'Refresh public profile' : m?.phase === 'unavailable' ? 'Retry public profile' : 'Load public profile'} disabled={!m?.canLoad} onPress={() => act(() => void session?.load())}/>
    <Action label={backLabel} disabled={Boolean(m?.busy)} onPress={() => act(() => { if (!session?.model().busy) { session?.close(); onBack(); } }, true)}/>
    <Action label="Close member view" onPress={() => act(() => { session?.close(); onClose(); }, true)}/>
  </ScrollView></SafeAreaView>;
}
function Action({ label, disabled = false, onPress }: { label: string; disabled?: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{ disabled }} onPress={onPress}
    style={[styles.button, disabled && styles.disabled]}><Text style={styles.copy}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#101d1a' }, content: { padding: 24, gap: 20 },
  eyebrow: { color: '#e8cb8d', fontSize: 13, letterSpacing: 1.4 }, title: { color: '#f4f2e5', fontSize: 32, lineHeight: 40 },
  heading: { color: '#f4f2e5', fontSize: 23, lineHeight: 30 }, copy: { color: '#e9eadf', fontSize: 17, lineHeight: 26 },
  note: { color: '#c0cbbf', fontSize: 15, lineHeight: 23 }, list: { gap: 20 }, field: { gap: 8 },
  button: { backgroundColor: '#294e3c', borderWidth: 1, borderColor: '#b1c1b5', borderRadius: 8, padding: 14, minHeight: 48 }, disabled: { opacity: 0.5 } });
