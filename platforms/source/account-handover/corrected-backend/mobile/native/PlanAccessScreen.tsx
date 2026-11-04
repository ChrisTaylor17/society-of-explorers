import { useEffect } from 'react';
import { ActivityIndicator, BackHandler, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Participation, ParticipationModel } from '../src/shared/participation.ts';
type Props = {
    model: ParticipationModel;
    controller: Participation;
    onClose: () => void;
};
export function PlanAccessScreen({ model: m, controller: c, onClose }: Props) {
    useEffect(() => { const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (m.confirmation)
        c.cancel();
    else
        onClose(); return true; }); return () => sub.remove(); }, [c, m.confirmation, onClose]);
    return <SafeAreaView style={styles.screen}><ScrollView accessibilityElementsHidden={Boolean(m.confirmation)} importantForAccessibility={m.confirmation ? 'no-hide-descendants' : 'auto'} contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>SOCIETY OF EXPLORERS · LOCAL DEMO</Text>
    <Text accessibilityRole="header" style={styles.title}>Your plan membership</Text>
    <Text accessibilityLiveRegion="polite" style={styles.status}>{m.message}</Text>
    {m.busy ? <ActivityIndicator accessibilityLabel="Checking plan membership" color="#295d48"/> : null}
    <View style={styles.card}><Text style={styles.label}>Current membership</Text><Text style={styles.value}>{m.membership?.status ?? 'Not currently verified'}</Text>
      <Text style={styles.copy}>Leaving ends this exact participation, future contact access and discussion participation. It does not erase stored posts, review history or copies someone already saw.</Text>
      {m.membership?.status === 'host' ? <Text style={styles.copy}>Host departure is not supported by this local flow.</Text> : null}
      <Button label="Refresh current membership" disabled={m.busy || !m.active} onPress={() => void c.refresh()}/>
      <Button label={m.membership?.status === 'invited' ? 'Review request withdrawal' : 'Review leaving this participation'} disabled={!m.canPrepare} onPress={() => void c.prepare()}/>
    </View>
    {m.pending ? <View style={styles.card}><Text accessibilityRole="header" style={styles.label}>Withdrawal outcome unconfirmed</Text><Text style={styles.copy}>Closing this screen cannot cancel a request already sent. Only the original participation/key/hash is retained in this local session; no request is resent automatically.</Text>
      <Button label="Check original withdrawal receipt" disabled={m.busy || !m.active} onPress={() => void c.check()}/>
      {m.canRetry ? <Button label="Retry the same withdrawal" disabled={m.busy} onPress={() => void c.retry()}/> : null}
      {m.pending.absent ? <Button label="Dismiss this absent attempt" disabled={m.busy} onPress={() => c.dismissAbsent()}/> : null}
    </View> : null}
    {m.receipt ? <View style={styles.card}><Text style={styles.label}>Historical receipt: {m.receipt.outcome}</Text><Text style={styles.copy}>Version {m.receipt.version}. This records the original outcome; current membership is checked separately.</Text></View> : null}
    <Button label="Back to plan" onPress={onClose}/>
  </ScrollView>
    <Modal visible={Boolean(m.confirmation)} transparent animationType="none" onRequestClose={() => c.cancel()}>
      <View style={styles.overlay}><ScrollView accessibilityViewIsModal style={styles.modalScroll} contentContainerStyle={styles.dialog}>
        <Text accessibilityRole="header" style={styles.title}>{m.confirmation?.status === 'invited' ? 'Withdraw this request?' : 'Leave this participation?'}</Text>
        <Text style={styles.copy}>This applies only to the participation just checked. You will need a new request and fresh acceptance to rejoin. Stored history and previously seen copies remain.</Text>
        <Button label="Keep this participation" onPress={() => c.cancel()}/>
        <Button label={m.confirmation?.status === 'invited' ? 'Confirm request withdrawal' : 'Confirm leaving this participation'} disabled={!m.canConfirm} onPress={() => void c.confirm()}/>
      </ScrollView></View>
    </Modal>
  </SafeAreaView>;
}
function Button({ label, disabled = false, onPress }: {
    label: string;
    disabled?: boolean;
    onPress: () => void;
}) { return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#f4f1e8' }, content: { padding: 20, paddingBottom: 44, maxWidth: 680, width: '100%', alignSelf: 'center' }, eyebrow: { fontSize: 12, fontWeight: '700', color: '#295d48', letterSpacing: 1 }, title: { fontSize: 27, fontWeight: '700', color: '#18382c', marginVertical: 12 }, status: { fontSize: 16, lineHeight: 24, color: '#875526', marginVertical: 12 }, label: { fontSize: 18, fontWeight: '700', color: '#18382c' }, value: { fontSize: 22, color: '#18382c', marginVertical: 8 }, copy: { fontSize: 16, lineHeight: 24, color: '#253e32', marginVertical: 10 }, card: { padding: 18, borderRadius: 14, backgroundColor: '#fffdf7', marginVertical: 12 }, button: { minHeight: 48, padding: 14, backgroundColor: '#295d48', borderRadius: 10, justifyContent: 'center', marginTop: 10 }, buttonText: { fontSize: 16, fontWeight: '600', color: '#fffdf7', textAlign: 'center' }, disabled: { opacity: .45 }, overlay: { flex: 1, backgroundColor: '#0009', justifyContent: 'center', padding: 20 }, modalScroll: { maxHeight: '90%', maxWidth: 600, width: '100%', alignSelf: 'center', flexGrow: 0 }, dialog: { backgroundColor: '#fffdf7', padding: 22, borderRadius: 18 } });
