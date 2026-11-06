import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { createMemberBlocks } from '../shared/member-blocks';
import { observeNativeConnectivity, type NativeConnectivityPort } from './src/circles/native-connectivity';

export function BlockedMembersScreen({ config, memberId, connectivity, onBack, onClose }: {
  config: Parameters<typeof createMemberBlocks>[0]; memberId: string;
  connectivity?: NativeConnectivityPort; onBack(): void; onClose(): void;
}) {
  const controller = useMemo(() => {
    try { return createMemberBlocks({ ...config, memberId, initialOnline: false }); }
    catch { return null; }
  }, [config, memberId]);
  const [snapshot, setSnapshot] = useState(() => ({ owner: controller, model: controller?.model(), epoch: 0 }));
  const lifetime = useRef({ mounted: false, epoch: 0 });
  const m = snapshot.owner === controller ? snapshot.model : controller?.model();

  useLayoutEffect(() => {
    const life = lifetime.current;
    life.mounted = true; life.epoch++;
    if (!controller) return () => { life.mounted = false; life.epoch++; };
    controller.activity(false); controller.connectivity(false);
    const off = controller.subscribe(model => setSnapshot({ owner: controller, model, epoch: ++life.epoch }));
    let mounted = true, foreground = false, blurred = false;
    const sync = () => { if (mounted) controller.activity(foreground && !blurred); };
    const activity = AppState.addEventListener('change', state => { foreground = state === 'active'; sync(); });
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => { blurred = true; sync(); }) : null;
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => {
      blurred = false; foreground = AppState.currentState === 'active'; sync();
    }) : null;
    foreground = AppState.currentState === 'active';
    sync();
    const network = observeNativeConnectivity(connectivity, state => { if (mounted) controller.connectivity(state === 'online'); });
    controller.connect();
    return () => {
      mounted = false; life.mounted = false; life.epoch++;
      off(); controller.disconnect(); network(); activity.remove(); blur?.remove(); focus?.remove();
    };
  }, [controller, connectivity]);

  function act(work: () => void) {
    const life = lifetime.current;
    if (life.mounted && snapshot.owner === controller && snapshot.epoch === life.epoch) work();
  }
  const review = m?.review;
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>SOCIETY OF EXPLORERS · MEMBER SAFETY</Text>
    <Text accessibilityRole="header" style={styles.title}>Blocked members</Text>
    <Text style={styles.copy}>Your blocks apply to Circle discussions and direct messages. Only you can remove a block you set.</Text>
    <Text accessibilityLiveRegion="polite" style={styles.copy}>{m?.message ?? 'Blocked members are unavailable. Return to your member account and check again.'}</Text>
    <Action label="Load blocked members" disabled={!m?.canLoad} onPress={() => act(() => void controller?.load())}/>
    {review ? <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>Review unblock</Text>
      <Text style={styles.copy}>{review.label} · {new Date(review.changedAt).toLocaleString()}</Text>
      <Text style={styles.copy}>Removing your block restores contact if this member has no active block on you.</Text>
      <Action label="Unblock this member" disabled={!m?.canUnblock} onPress={() => act(() => void controller?.unblock())}/>
      <Action label="Cancel unblock review" onPress={() => act(() => controller?.cancelReview())}/>
    </View> : <>
      {m?.page?.items.map(item => <View key={item.blockId} style={styles.card}>
        <Text style={styles.copy}>{item.label} · {new Date(item.changedAt).toLocaleString()}</Text>
        <Action label="Review unblock" accessibilityLabel={'Review unblock for ' + item.label}
          disabled={!m.canReview} onPress={() => act(() => controller?.review(item.blockId, item.revision))}/>
      </View>)}
      {m?.page?.nextCursor ? <Action label="Next blocked members" disabled={!m.canNext} onPress={() => act(() => void controller?.next())}/> : null}
    </>}
    {m?.canRetry ? <Action label="Retry exact unblock" onPress={() => act(() => void controller?.retry())}/> : null}
    <Text style={styles.note}>Leaving clears this view. A request already sent can still complete.</Text>
    <Action label="Back to member account" onPress={() => { controller?.close(); onBack(); }}/>
    <Action label="Close member view" onPress={() => { controller?.close(); onClose(); }}/>
  </ScrollView></SafeAreaView>;
}

function Action({ label, accessibilityLabel, onPress, disabled = false }: {
  label: string; accessibilityLabel?: string; onPress(): void; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled]}>
    <Text style={styles.copy}>{label}</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#101d1a' }, content: { padding: 24, gap: 16 },
  eyebrow: { color: '#e4c478', fontSize: 12, letterSpacing: 1.2 }, title: { color: '#fbf3df', fontSize: 32 },
  heading: { color: '#fbf3df', fontSize: 23 }, copy: { color: '#fbf3df', fontSize: 16, lineHeight: 23 },
  note: { color: '#d2c6ae', fontSize: 14, lineHeight: 21 },
  button: { minHeight: 48, borderWidth: 1, borderColor: '#bb9b60', backgroundColor: '#182925', padding: 12, justifyContent: 'center' },
  card: { borderWidth: 1, borderColor: '#6b715e', padding: 14, gap: 12 }, disabled: { opacity: 0.55 },
});
