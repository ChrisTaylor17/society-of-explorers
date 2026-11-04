import { useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { MemberSessionModel } from '../src/circles/verified-member-session';
import { createCircleHost, type CircleHostConfig } from '../src/circles/host';

export function CircleScreen({ config, onClose, memberSession }: { config?: CircleHostConfig; onClose(): void; memberSession?: { model: MemberSessionModel; onCheck(): void } }) {
  const host = useMemo(() => { try { return config ? createCircleHost(config) : null; } catch { return null; } }, [config]);
  const [snapshot, setSnapshot] = useState(() => ({ host, model: host?.model() }));
  const m = snapshot.host === host ? snapshot.model : host?.model();
  useLayoutEffect(() => {
    if (!host) return;
    const off = host.subscribe(model => setSnapshot({ host, model }));
    host.connect(); host.activity(AppState.currentState === 'active');
    void host.refresh();
    const change = AppState.addEventListener('change', value => host.activity(value === 'active'));
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => host.activity(false)) : null;
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => host.activity(AppState.currentState === 'active')) : null;
    return () => { host.disconnect(); off(); change.remove(); blur?.remove(); focus?.remove(); };
  }, [host]);
  const p = m?.participation, read = p?.read, write = p?.write;
  const refresh = Boolean(m?.connected && m.active && m.online && !read?.busy && !write?.busy);
  const leave = () => { host?.disconnect(); onClose(); };
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.eyebrow}>SOCIETY OF EXPLORERS · CIRCLES</Text>
    <Text accessibilityRole="header" style={styles.title}>{read?.conversation?.title ?? 'A conversation worth having.'}</Text>
    <Text style={styles.copy}>Read, reflect and share with your circle. Only a current member session can open the conversation.</Text>
    {memberSession ? <View>
      <Text accessibilityRole="header" style={styles.heading}>Member session</Text>
      <Text accessibilityLiveRegion="polite" style={styles.copy}>{memberSession.model.message}</Text>
      <Action label={memberSession.model.busy ? 'Checking member session…' : 'Check member session'} disabled={!memberSession.model.canCheck} onPress={memberSession.onCheck}/>
    </View> : null}
    <Action label="Close circle" onPress={leave}/>
    <View accessibilityLiveRegion="polite" accessibilityRole="summary" style={styles.status}>
      <Text style={styles.copy}>{m?.status ?? 'Circle access is not connected in this build. Return to the demo or use the member web app.'}</Text>
      {read ? <Text style={styles.copy}>{read.message}</Text> : null}
    </View>
    {read?.busy ? <ActivityIndicator accessibilityLabel="Checking current circle access" color="#e8cb8d"/> : null}
    <Action label="Refresh circle access" disabled={!refresh} onPress={() => void host?.refresh()}/>
    {read?.conversation ? <View>
      <Text accessibilityRole="header" style={styles.heading}>Circle conversation</Text>
      <Text style={styles.note}>Latest 100 messages. A later read cannot prove that an earlier post was never sent.</Text>
      {read.conversation.messages.length === 0 ? <Text style={styles.copy}>No messages in this view yet.</Text> : null}
      {read.conversation.messages.map(message => <View key={message.id} style={styles.message}>
        <Text style={styles.author}>{message.member_name}{message.is_mine ? ' · You' : ''}</Text>
        <Text style={styles.note}>{message.created_at}</Text><Text selectable style={styles.copy}>{message.content}</Text>
      </View>)}
    </View> : null}
    {write ? <View>
      <Text accessibilityRole="header" style={styles.heading}>Your message</Text>
      <Text nativeID="circle-message-label" style={styles.copy}>Message to this circle</Text>
      <TextInput accessibilityLabel="Message to this circle" accessibilityLabelledBy="circle-message-label"
        accessibilityHint="Plain text, up to 2000 characters. Posting requires a separate button press."
        value={write.draft} onChangeText={value => host?.edit(value)} editable={write.canEdit}
        multiline maxLength={2000} autoCorrect={false} autoComplete="off" textContentType="none"
        style={[styles.input, !write.canEdit && styles.disabled]}/>
      <Text style={styles.note}>{write.remaining} characters remaining</Text>
      <Text accessibilityLiveRegion="polite" style={styles.copy}>{write.message}</Text>
      <Action label={write.busy ? 'Posting to circle…' : 'Post to circle'} disabled={!write.canSend} onPress={() => void host?.post()}/>
      <Action label="Clear draft" disabled={!write.canEdit || !write.draft} onPress={() => host?.clearDraft()}/>
      {write.phase === 'unknown' ? <Text style={styles.note}>Nothing is resent automatically. Refresh and review the conversation; a request already sent may still complete.</Text> : null}
      {write.canStartNew ? <Action label="I reviewed the conversation; start a new blank message" onPress={() => host?.startNewAfterReview()}/> : null}
    </View> : null}
    <Text style={styles.note}>Drafts stay in memory and clear when the view, account or activity ends. Closing does not erase stored messages or cancel a post already sent.</Text>
  </ScrollView></SafeAreaView>;
}
function Action({ label, disabled = false, onPress }: { label: string; disabled?: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={[styles.button, disabled && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#101d1a' }, content: { padding: 24, gap: 16 },
  eyebrow: { color: '#e8cb8d', fontSize: 12, letterSpacing: 1.4 }, title: { color: '#f4f2e5', fontSize: 34, lineHeight: 40 },
  heading: { color: '#f4f2e5', fontSize: 24, marginTop: 20 }, copy: { color: '#e9eadf', fontSize: 17, lineHeight: 26 },
  note: { color: '#b1c1b5', fontSize: 14, lineHeight: 22 }, author: { color: '#e8cb8d', fontSize: 17 },
  status: { paddingVertical: 16, gap: 8 }, message: { borderTopColor: '#647967', borderTopWidth: 1, paddingVertical: 18, gap: 8 },
  input: { color: '#f4f2e5', backgroundColor: '#172923', borderWidth: 1, borderColor: '#b1c1b5', borderRadius: 8, padding: 14, minHeight: 140, textAlignVertical: 'top', fontSize: 17 },
  button: { backgroundColor: '#294e3c', borderWidth: 1, borderColor: '#b1c1b5', borderRadius: 8, padding: 14, minHeight: 48, justifyContent: 'center', marginVertical: 5 },
  buttonText: { color: '#f4f2e5', fontSize: 17 }, disabled: { opacity: 0.5 },
});
