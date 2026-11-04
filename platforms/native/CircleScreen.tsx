import { useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { MemberSessionModel } from './src/circles/verified-member-session';
import { createCircleHost, type CircleHostConfig } from './src/circles/host';
import type { ThreadMessage } from '../../lib/circles/thread';
import { observeNativeConnectivity, type NativeConnectivityPort, type NativeConnectivityState } from './src/circles/native-connectivity';

export function CircleScreen({ config, connectivity, onClose, memberSession }: { config?: CircleHostConfig; connectivity?: NativeConnectivityPort; onClose(): void; memberSession?: { model: MemberSessionModel; onCheck(): void } }) {
  const connection = useMemo(() => { try { return config ? { host: createCircleHost({ ...config, initialOnline: false }), connectivity } : null; } catch { return null; } }, [config, connectivity]);
  const host = connection?.host;
  const [network, setNetwork] = useState<NativeConnectivityState>('unknown');
  const [snapshot, setSnapshot] = useState(() => ({ host, model: host?.model() }));
  const m = snapshot.host === host ? snapshot.model : host?.model();
  useLayoutEffect(() => {
    if (!connection) return;
    const { host, connectivity } = connection;
    const off = host.subscribe(model => setSnapshot({ host, model }));
    let mounted = true, appActive = false, blurred = false;
    const syncActivity = () => { if (mounted) host.activity(appActive && !blurred); };
    host.activity(false); host.connectivity(false);
    const change = AppState.addEventListener('change', value => { appActive = value === 'active'; syncActivity(); });
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => { blurred = true; syncActivity(); }) : null;
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => { blurred = false; appActive = AppState.currentState === 'active'; syncActivity(); }) : null;
    appActive = AppState.currentState === 'active'; syncActivity();
    const offConnectivity = observeNativeConnectivity(connectivity, state => { if (mounted) { host.connectivity(state === 'online'); setNetwork(state); } });
    appActive = AppState.currentState === 'active'; syncActivity();
    host.connect();
    void host.refresh();
    return () => { mounted = false; host.disconnect(); offConnectivity(); off(); change.remove(); blur?.remove(); focus?.remove(); };
  }, [connection]);
  const p = m?.participation, read = p?.read, write = m?.threadWrite, archive = m?.archive;
  const archivePage = archive?.page;
  const rootMessage = archivePage?.kind === 'thread' ? archivePage.root : null;
  const savedMessage = write?.receipt?.message;
  const focusedMessage = archivePage?.kind === 'thread' && archivePage.focus.id !== archivePage.root.id && !archivePage.items.some(item => item.id === archivePage.focus.id) ? archivePage.focus : null;
  const navigate = Boolean(write?.canNavigate);
  const refresh = Boolean(m?.connected && m.active && m.online && navigate && !read?.busy && !write?.busy && !archive?.busy);
  const leave = () => { host?.disconnect(); onClose(); };
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.eyebrow}>SOCIETY OF EXPLORERS · CIRCLES</Text>
    <Text accessibilityRole="header" style={styles.title}>{read?.conversation?.title ?? 'A conversation worth having.'}</Text>
    <Text style={styles.copy}>Read, reflect and share with your circle. Only a current member session can open the conversation.</Text>
    <Text accessibilityLiveRegion="polite" style={styles.note}>{network === 'online' ? 'Network available. Check the member session and refresh Circle access.' : network === 'offline' ? 'Offline. Private Circle views and drafts are cleared.' : 'Network availability is unknown. Private Circle access stays closed.'}</Text>
    {memberSession ? <View>
      <Text accessibilityRole="header" style={styles.heading}>Member session</Text>
      <Text accessibilityLiveRegion="polite" style={styles.copy}>{memberSession.model.message}</Text>
      <Action label={memberSession.model.busy ? 'Checking member session…' : 'Check member session'} disabled={!memberSession.model.canCheck} onPress={memberSession.onCheck}/>
    </View> : null}
    <Action label="Close circle" onPress={leave}/>
    <View accessibilityLiveRegion="polite" accessibilityRole="summary" style={styles.status}>
      <Text style={styles.copy}>{m?.status ?? 'Member sign-in and the secure Circle connection are not connected in this build.'}</Text>
      {read && !archive?.open ? <Text style={styles.copy}>{read.message}</Text> : null}
    </View>
    {read?.busy ? <ActivityIndicator accessibilityLabel="Checking current circle access" color="#e8cb8d"/> : null}
    <Action label="Refresh circle access" disabled={!refresh} onPress={() => void host?.refresh()}/>
    <Action label="Open complete discussion archive" disabled={!refresh} onPress={() => void host?.openArchive()}/>
    {archive?.open ? <View>
      <Text accessibilityRole="header" style={styles.heading}>Discussion archive</Text>
      <Text accessibilityLiveRegion="polite" style={styles.copy}>{archive.message}</Text>
      {archive.busy ? <ActivityIndicator accessibilityLabel="Loading discussion page" color="#e8cb8d"/> : null}
      {archive.page ? <>
        {archive.page.kind === 'thread' ? <>
          <Text accessibilityRole="header" style={styles.heading}>Thread</Text>
          {rootMessage ? <ArchiveMessage message={rootMessage} disabled={!navigate || archive.busy} replyDisabled={!write?.canStart}
            onOpen={() => void host?.archiveThread(rootMessage.id)} onReply={() => host?.threadStart(rootMessage.id)}/> : null}
          {focusedMessage ? <ArchiveMessage message={focusedMessage} disabled={!navigate || archive.busy} replyDisabled={!write?.canStart}
            onOpen={() => void host?.archiveThread(focusedMessage.id)} onReply={() => host?.threadStart(focusedMessage.id)}/> : null}
        </> : null}
        {archive.page.items.map(message => <ArchiveMessage key={message.id} message={message} disabled={!navigate || archive.busy} replyDisabled={!write?.canStart}
          onOpen={() => void host?.archiveThread(message.id)} onReply={() => host?.threadStart(message.id)}/>)}
        {archive.page.items.length === 0 ? <Text style={styles.copy}>{archive.page.kind === 'thread' ? 'No replies in this page.' : 'No messages in this page.'}</Text> : null}
        {archive.page.nextCursor ? <Action label={archive.page.kind === 'thread' ? 'Next replies' : 'Older messages'} disabled={archive.busy || !navigate} onPress={() => void host?.archiveNext()}/> : null}
      </> : null}
      <Text style={styles.note}>Reply only to a visible message after reviewing its current server preview. Reporting or withdrawing a contribution still uses the member web app.</Text>
    </View> : null}
    {!archive?.open && read?.conversation ? <View>
      <Text accessibilityRole="header" style={styles.heading}>Circle conversation</Text>
      <Text style={styles.note}>Latest 100 messages. A later read cannot prove that an earlier post was never sent.</Text>
      {read.conversation.messages.length === 0 ? <Text style={styles.copy}>No messages in this view yet.</Text> : null}
      {read.conversation.messages.map(message => <View key={message.id} style={styles.message}>
        <Text style={styles.author}>{message.member_name}{message.is_mine ? ' · You' : ''}</Text>
        <Text style={styles.note}>{message.created_at}</Text><Text selectable style={styles.copy}>{message.content}</Text>
      </View>)}
    </View> : null}
    {write ? <View>
      <Text accessibilityRole="header" style={styles.heading}>Your discussion message</Text>
      <Text accessibilityLiveRegion="polite" style={styles.copy}>{write.message}</Text>
      <Action label="Start a new discussion message" disabled={!write.canStart || Boolean(archive?.busy)} onPress={() => host?.threadStart(null)}/>
      {write.phase === 'editing' || write.phase === 'previewing' ? <>
        <Text style={styles.note}>{write.target ? 'Replying to the selected message. Your reply includes a stable link; its author and words are not copied into your message.' : 'Share your own thoughts with this Circle. Nothing posts until you review and confirm.'}</Text>
        <Text nativeID="circle-message-label" style={styles.copy}>Your discussion comment</Text>
        <TextInput accessibilityLabel="Your discussion comment" accessibilityLabelledBy="circle-message-label"
          accessibilityHint="Plain text. Prepare and review the complete message before choosing Post."
          value={write.draft} onChangeText={value => host?.threadEdit(value)} editable={write.canEdit}
          multiline maxLength={write.commentLimit} autoCorrect={false} autoComplete="off" textContentType="none"
          style={[styles.input, !write.canEdit && styles.disabled]}/>
        <Text style={styles.note}>{write.draft.length} of {write.commentLimit} comment characters. Full message limit: 2,000.</Text>
        <Action label={write.phase === 'previewing' ? 'Preparing discussion preview…' : 'Prepare discussion preview'} disabled={!write.canReview} onPress={() => void host?.threadReview()}/>
      </> : null}
      {write.phase === 'review' && write.preview ? <>
        <Text accessibilityRole="header" style={styles.heading}>Review discussion message</Text>
        {write.preview.parent ? <View style={styles.message}>
          <Text style={styles.note}>Current reply parent, checked for this preview:</Text>
          <Text selectable style={styles.copy}>{write.preview.parent.message.content}</Text>
        </View> : null}
        <Text style={styles.note}>This is the complete message that will be posted:</Text>
        <Text selectable style={styles.copy}>{write.preview.content}</Text>
        <Pressable accessibilityRole="checkbox" accessibilityLabel="I reviewed this exact message and target, and want to post it to this Circle"
          accessibilityState={{ checked: write.confirmed, disabled: !write.active || write.busy }} disabled={!write.active || write.busy}
          onPress={() => host?.threadConfirm(!write.confirmed)} style={[styles.button, (!write.active || write.busy) && styles.disabled]}>
          <Text style={styles.buttonText}>{write.confirmed ? '✓ ' : '□ '}I reviewed this exact message and target, and want to post it to this Circle.</Text>
        </Pressable>
        <Action label="Post reviewed discussion message" disabled={!write.canPost} onPress={() => void host?.threadPost()}/>
        <Action label="Edit discussion comment" disabled={write.busy} onPress={() => host?.threadEditReview()}/>
      </> : null}
      {write.phase === 'unknown' ? <>
        <Text style={styles.note}>The message may already have been saved. Keep this screen open to preserve the exact request. Checking a missing receipt does not prove that an earlier attempt will not complete. Nothing is retried automatically.</Text>
        <Action label="Check discussion posting receipt" disabled={!write.canCheck} onPress={() => void host?.threadLookup()}/>
        <Action label="Retry exact reviewed discussion post" disabled={!write.canRetry} onPress={() => void host?.threadRetry()}/>
      </> : null}
      {write.phase === 'confirmed' && savedMessage ? <>
        <Text style={styles.copy}>{savedMessage.visibility === 'visible' ? 'The message was saved. Open its current thread to read it and any replies.' : `The saved message is currently ${savedMessage.visibility}. Its earlier body is not displayed.`}</Text>
        <Action label="Open saved discussion message" disabled={!navigate || Boolean(archive?.busy)} onPress={() => void host?.archiveThread(savedMessage.id)}/>
      </> : null}
      {write.canCancel ? <Action label="Cancel discussion draft" onPress={() => host?.threadCancel()}/> : null}
    </View> : null}
    <Text style={styles.note}>Drafts stay in memory and clear when the view, account or activity ends. Closing does not erase stored messages or cancel a post already sent.</Text>
  </ScrollView></SafeAreaView>;
}
function ArchiveMessage({ message, onOpen, onReply, disabled, replyDisabled }: { message: ThreadMessage; onOpen(): void; onReply(): void; disabled: boolean; replyDisabled: boolean }) {
  return <View style={styles.message}>
    <Text style={styles.author}>{message.member_name}{message.is_mine ? ' · You' : ''}</Text>
    {message.created_at ? <Text style={styles.note}>{message.created_at}</Text> : null}
    <Text selectable style={styles.copy}>{message.content ?? (message.visibility === 'withdrawn' ? 'This contribution was withdrawn.' : message.visibility === 'hidden' ? 'This contribution is restricted by moderation.' : 'This contribution is unavailable.')}</Text>
    <Action label="Open thread" disabled={disabled} onPress={onOpen}/>
    {message.visibility === 'visible' && message.content !== null ? <Action label="Reply to this message" disabled={disabled || replyDisabled} onPress={onReply}/> : null}
  </View>;
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
