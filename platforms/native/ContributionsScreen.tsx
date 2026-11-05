import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { createMemberContributions } from '../shared/member-contributions';
import { MESSAGE_REPORT_OPTIONS, MESSAGE_WITHDRAWAL_PRIVACY } from '../shared/message-safety';
import { MESSAGE_AI_DISCLOSURE, MESSAGE_AI_POLICY, MESSAGE_AI_POLICY_HREF } from '../shared/message-ai-consent';
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
  const [viewEpoch, setViewEpoch] = useState(0);
  const viewLife = useRef({ mounted: false, enabled: false, epoch: 0 });
  const m = snapshot.connection === connection ? snapshot.model : connection?.session.model();
  useLayoutEffect(() => {
    const life = viewLife.current;
    life.mounted = true; life.enabled = false; setViewEpoch(++life.epoch);
    if (!connection) return () => { life.mounted = false; life.enabled = false; ++life.epoch; };
    const { session } = connection, off = session.subscribe(model => { setViewEpoch(++life.epoch); setSnapshot({ connection, model }); });
    let mounted = true, appActive = false, blurred = false, online = false;
    const sync = () => {
      if (!mounted) return;
      const enabled = appActive && !blurred && online;
      if (life.enabled !== enabled) { life.enabled = enabled; setViewEpoch(++life.epoch); }
      session.activity(appActive && !blurred); session.connectivity(online);
    };
    session.activity(false); session.connectivity(false);
    const change = AppState.addEventListener('change', value => { appActive = value === 'active'; sync(); });
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => { blurred = true; sync(); }) : null;
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => { blurred = false; appActive = AppState.currentState === 'active'; sync(); }) : null;
    appActive = AppState.currentState === 'active'; sync();
    const offConnectivity = observeNativeConnectivity(connection.connectivity, state => { online = state === 'online'; sync(); });
    appActive = AppState.currentState === 'active'; sync(); session.connect();
    return () => { mounted = false; life.mounted = false; life.enabled = false; ++life.epoch; off(); session.disconnect(); offConnectivity(); change.remove(); blur?.remove(); focus?.remove(); };
  }, [connection]);
  const session = connection?.session, safety = m?.safety, state = safety?.state, aiConsent = m?.aiConsent;
  // Every callback belongs to the exact rendered view. A retained withdrawal,
  // checkbox or navigation callback cannot target a newly selected contribution.
  const act = (work: () => void, allowed = true, allowInactive = false) => {
    const life = viewLife.current;
    if (allowed && life.mounted && life.epoch === viewEpoch && (allowInactive || life.enabled)) work();
  };
  const close = () => act(() => { session?.close(); onClose(); }, true, true);
  const back = () => act(() => { session?.close(); onBack(); }, Boolean(m?.canNavigate));
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>SOCIETY OF EXPLORERS · YOUR CONTRIBUTIONS</Text>
    <Text accessibilityRole="header" style={styles.title}>My posted messages</Text>
    <Text style={styles.copy}>Review your own messages across Circles, including after leaving a Circle or when its listing is hidden.</Text>
    <Text accessibilityLiveRegion="polite" style={styles.copy}>{m?.message ?? 'Your posted messages are unavailable. Return to the member account and check again.'}</Text>
    <Action label={m?.busy ? 'Loading my posted messages…' : 'Load my posted messages'} disabled={!m?.canRefresh} onPress={() => act(() => void session?.refresh(), Boolean(m?.canRefresh))}/>
    {!m?.selected ? <View style={styles.list}>
      {m?.items.map(item => <View key={`${item.circleId}:${item.message.id}`} style={styles.card}>
        <Text style={styles.note}>{item.message.created_at}</Text>
        <Text selectable style={styles.copy}>{item.message.content ?? (item.message.visibility === 'withdrawn' ? 'This contribution was withdrawn.' : 'This contribution is restricted by moderation.')}</Text>
        <Action label="Check this contribution" disabled={!m.canSelect} onPress={() => act(() => void session?.select(item.circleId, item.message.id), m.canSelect)}/>
      </View>)}
      {m?.nextCursor ? <Action label="Next page of my messages" disabled={!m.canNext} onPress={() => act(() => void session?.next(), m.canNext)}/> : null}
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
          onPress={() => act(() => session?.confirm(!safety?.confirmed), Boolean(safety?.canConfirm))} style={[styles.button, !safety?.canConfirm && styles.disabled]}>
          <Text style={styles.copy}>{safety?.confirmed ? '☑ ' : '☐ '}I understand withdrawal removes this message from member views and cannot be undone here.</Text>
        </Pressable>
        <Action label="Withdraw my message" disabled={!safety?.canWithdraw} onPress={() => act(() => void session?.withdraw(), Boolean(safety?.canWithdraw))}/>
      </> : null}
      <Action label="Check current message state" disabled={!safety?.canCheck} onPress={() => act(() => void session?.check(), Boolean(safety?.canCheck))}/>
      {safety?.canRetry ? <Action label="Retry exact withdrawal" disabled={!safety.canRetry} onPress={() => act(() => void session?.retry(), safety.canRetry)}/> : null}
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.heading}>AI review permission for this message</Text>
        <Text style={styles.copy}>{MESSAGE_AI_DISCLOSURE.intro}</Text>
        <Text style={styles.copy}>{MESSAGE_AI_DISCLOSURE.provider}</Text>
        <Text style={styles.copy}>{MESSAGE_AI_DISCLOSURE.revocation}</Text>
        <Text style={styles.note}>Policy: {MESSAGE_AI_POLICY}. Earlier messages have no permission unless their author explicitly allows this message. Reporter notes are never sent to the AI provider.</Text>
        <Text selectable style={styles.note}>Public policy: {config.origin}{MESSAGE_AI_POLICY_HREF}</Text>
        {config.aiConsent !== true ? <Text style={styles.copy}>This app connection does not support changing AI review permission. No permission has been granted here. Open the public policy address in your browser, then use My posted messages on the website to check or change a message’s permission.</Text>
          : aiConsent ? <>
            <Text accessibilityLiveRegion="polite" style={styles.copy}>{aiConsent.message}</Text>
            <Action label="Check current AI review permission" disabled={!aiConsent.canCheck} onPress={() => act(() => void session?.checkAiConsent(aiConsent.action), aiConsent.canCheck)}/>
            {aiConsent.state ? <>
              <Text style={styles.copy}>Last checked setting: {aiConsent.state.allowed ? 'allowed' : 'off'}. A read alone does not confirm an earlier decision whose result was unknown.</Text>
              {!aiConsent.state.canEnable ? <Text style={styles.note}>This message cannot currently be enabled for AI review. You can still keep permission off or revoke it.</Text> : null}
              <Pressable accessibilityRole="checkbox" accessibilityLabel={MESSAGE_AI_DISCLOSURE.confirmation}
                accessibilityState={{ checked: aiConsent.confirmed, disabled: !aiConsent.canConfirm }} disabled={!aiConsent.canConfirm}
                onPress={() => act(() => session?.confirmAiConsent(!aiConsent.confirmed, aiConsent.action), aiConsent.canConfirm)}
                style={[styles.button, !aiConsent.canConfirm && styles.disabled]}>
                <Text style={styles.copy}>{aiConsent.confirmed ? '☑ ' : '☐ '}{MESSAGE_AI_DISCLOSURE.confirmation}</Text>
              </Pressable>
              <Action label={aiConsent.state.allowed ? 'Reaffirm permission for this message' : 'Allow AI review for this message'} disabled={!aiConsent.canAllow}
                onPress={() => act(() => void session?.setAiConsent(true, aiConsent.action), aiConsent.canAllow)}/>
              <Action label={aiConsent.state.allowed ? 'Revoke permission for this message' : 'Keep AI review off for this message'} disabled={!aiConsent.canKeepOff}
                onPress={() => act(() => void session?.setAiConsent(false, aiConsent.action), aiConsent.canKeepOff)}/>
            </> : null}
          </> : <Text style={styles.copy}>Check the current author-owned message before checking its AI review permission.</Text>}
        <Text style={styles.note}>{MESSAGE_AI_DISCLOSURE.retirement}</Text>
      </View>
      <Action label="Back to my contributions" disabled={!m?.canBack} onPress={() => act(() => session?.back(), Boolean(m?.canBack))}/>
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
